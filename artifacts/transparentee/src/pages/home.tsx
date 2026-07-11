import React, { useRef, useState, useEffect } from 'react';

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

type Phase = 'submit' | 'sliding' | 'session';

interface Card { id: string; text: string; }
interface Message { role: 'user' | 'assistant'; content: string; }

export default function HomePage() {
  // ── submit state ──────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [problemText, setProblemText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ── phase ─────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('submit');

  // ── session state ─────────────────────────────────────────────
  const [problem, setProblem] = useState('');
  const [title, setTitle] = useState('');
  const [cards, setCards] = useState<Card[]>([]);
  const [callIndex, setCallIndex] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [userInput, setUserInput] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [sessionError, setSessionError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => { recognitionRef.current?.abort(); };
  }, []);

  // ── file handling ─────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setUploadedFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };
  const removeFile = (i: number) => setUploadedFiles(prev => prev.filter((_, j) => j !== i));
  const fileLabel = (n: number) => n === 1 ? '1 file attached' : `${n} files attached`;

  // ── speech ────────────────────────────────────────────────────
  const handleSpeak = () => {
    const API = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!API) { setSpeechError('speech recognition not supported in this browser'); return; }
    if (isListening) { recognitionRef.current?.stop(); return; }
    setSpeechError('');
    const rec = new API();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let final = problemText;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += (final ? ' ' : '') + e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setProblemText(final + (interim ? ' ' + interim : ''));
    };
    rec.onend = () => { setIsListening(false); setProblemText(final); };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      if (e.error !== 'aborted') setSpeechError(`mic error: ${e.error}`);
    };
    rec.onstart = () => setIsListening(true);
    rec.start();
  };

  // ── submit ────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = problemText.trim().length > 0;
    const hasFiles = uploadedFiles.length > 0;
    if (!hasText && !hasFiles) return;
    setExtractError('');
    let extractedText = '';
    if (hasFiles) {
      setExtracting(true);
      try {
        const fd = new FormData();
        uploadedFiles.forEach(f => fd.append('files', f));
        const res = await fetch('/api/extract', { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`extraction failed (${res.status})`);
        const data = await res.json() as { text: string };
        extractedText = data.text ?? '';
      } catch (err) {
        setExtractError(err instanceof Error ? err.message : 'could not read files');
        setExtracting(false);
        return;
      }
      setExtracting(false);
    }
    const combined = [extractedText, problemText.trim()].filter(Boolean).join('\n\n');
    const ttl = problemText.trim() || uploadedFiles.map(f => f.name).join(', ');
    setProblem(combined);
    setTitle(ttl);

    // slide the form up, then start streaming
    setPhase('sliding');
    setTimeout(() => {
      setPhase('session');
      fetchCard(combined, [], 0);
    }, 620);
  };

  // ── AI fetch ──────────────────────────────────────────────────
  const fetchCard = async (prob: string, hist: Message[], idx: number) => {
    setStreaming(true);
    setStreamingText('');
    setSessionError('');
    try {
      const res = await fetch('/api/ai/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem: prob, history: hist, callIndex: idx }),
      });
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.done) break;
            if (p.error) throw new Error(p.error);
            if (p.delta) { full += p.delta; setStreamingText(full); }
          } catch { /* skip */ }
        }
      }
      setCards(prev => [...prev, { id: Date.now().toString(), text: full }]);
      setHistory(prev => [...prev, { role: 'assistant', content: full }]);
      setCallIndex(idx + 1);
      setStreamingText('');
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setStreaming(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const handleContinue = () => {
    const newHist: Message[] = [...history];
    if (userInput.trim()) newHist.push({ role: 'user', content: userInput.trim() });
    setHistory(newHist);
    setUserInput('');
    fetchCard(problem, newHist, callIndex);
  };

  // ── render ────────────────────────────────────────────────────
  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col items-center">

      {/* Desktop logo */}
      <div className="hidden md:flex flex-col gap-[2px] fixed top-8 left-10 z-20">
        <span className="text-[20px] font-bold tracking-tight">[tee]</span>
        <span className="text-[13px] font-normal opacity-90 leading-snug">transparent electrical<br />engineering</span>
      </div>

      {/* ── SUBMIT FORM ──────────────────────────────────────── */}
      <div
        className="w-full flex flex-col items-center justify-center"
        style={{
          minHeight: '100dvh',
          transition: 'opacity 500ms ease, transform 620ms ease',
          opacity: phase === 'submit' ? 1 : 0,
          transform: phase === 'submit' ? 'translateY(0px)' : 'translateY(-48px)',
          pointerEvents: phase === 'submit' ? 'auto' : 'none',
          position: phase === 'session' ? 'absolute' : 'relative',
          visibility: phase === 'session' ? 'hidden' : 'visible',
        }}
      >
        <div className="w-full max-w-[600px] px-[24px] py-12">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full mt-12 mb-24">

            {/* Mobile logo */}
            <div className="md:hidden flex flex-col gap-[2px]">
              <span className="text-[20px] font-bold tracking-tight">[tee]</span>
              <span className="text-[13px] font-normal opacity-90 leading-snug">transparent electrical<br />engineering</span>
            </div>

            {/* Upload + Speak */}
            <div className="grid grid-cols-2 border border-border rounded-[4px] overflow-hidden" style={{ height: '96px' }}>
              <div
                className="border-r border-border flex flex-col items-center justify-center cursor-pointer hover:bg-foreground/5 transition-colors gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadedFiles.length === 0 ? (
                  <span className="text-[13px] opacity-90">upload //</span>
                ) : (
                  <>
                    <span className="text-[13px]">{fileLabel(uploadedFiles.length)}</span>
                    <span className="text-[11px] opacity-40 hover:opacity-70 transition-opacity" onClick={e => { e.stopPropagation(); setUploadedFiles([]); }}>clear</span>
                  </>
                )}
                <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
              </div>
              <button type="button" onClick={handleSpeak} className="flex flex-col items-center justify-center hover:bg-foreground/5 transition-colors gap-1">
                {isListening
                  ? <><span className="text-[13px]">listening...</span><span className="text-[11px] opacity-40">tap to stop</span></>
                  : <span className="text-[13px] opacity-70">speak //</span>}
              </button>
            </div>

            {speechError && <span className="text-[12px] opacity-50 -mt-3">{speechError}</span>}

            {/* File list + tooltip */}
            {uploadedFiles.length > 0 && (
              <div className="flex flex-col gap-3 -mt-2">
                <div className="flex flex-col gap-1">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-[12px] opacity-60">
                      <span className="truncate max-w-[480px]">{f.name}</span>
                      <button type="button" onClick={() => removeFile(i)} className="ml-4 opacity-40 hover:opacity-80 transition-opacity flex-shrink-0">✕</button>
                    </div>
                  ))}
                </div>
                <div className="border border-border rounded-[4px] px-4 py-3 text-[12px] leading-relaxed opacity-80">
                  file attached. use the box below to add any context that might help. note what you are solving for, any known values, or where you are stuck.
                </div>
              </div>
            )}

            {/* Main textarea */}
            <textarea
              value={problemText}
              onChange={e => setProblemText(e.target.value)}
              placeholder={uploadedFiles.length > 0
                ? 'add context. note any known values, what you are solving for, or where you are stuck...'
                : 'describe your problem. paste equations, describe circuits, or just type what you are stuck on...'}
              className="w-full bg-transparent border border-border rounded-[4px] p-5 h-40 resize-none outline-none placeholder:text-foreground/40 text-[14px] hover:bg-foreground/5 transition-colors focus:bg-foreground/5"
            />

            {extractError && <p className="text-[12px] opacity-60 -mt-2">{extractError}</p>}

            <div className="flex justify-end">
              <button type="submit" disabled={extracting} className="bg-black text-white px-6 py-2.5 text-[14px] font-bold hover:bg-black/80 transition-colors rounded-[2px] disabled:opacity-50">
                {extracting ? 'reading files...' : 'solve \u2192'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── SESSION ──────────────────────────────────────────── */}
      <div
        className="w-full max-w-[600px] px-[24px] flex flex-col"
        style={{
          minHeight: '100dvh',
          transition: 'opacity 450ms ease',
          transitionDelay: phase === 'session' ? '180ms' : '0ms',
          opacity: phase === 'session' ? 1 : 0,
          pointerEvents: phase === 'session' ? 'auto' : 'none',
        }}
      >
        {/* Sticky header */}
        <div className="sticky top-0 bg-background pt-8 pb-4 border-b border-border z-10">
          <p className="text-[11px] opacity-70 mb-1">problem</p>
          <p className="text-[14px] font-bold">{title}</p>
        </div>

        <div className="py-8 flex flex-col gap-6">
          {cards.map((card, idx) => {
            const isLast = idx === cards.length - 1 && !streaming;
            return (
              <div
                key={card.id}
                className={`border border-border rounded-[4px] p-6 flex flex-col gap-4 transition-opacity duration-500 ${
                  isLast ? 'opacity-100' : 'opacity-30 pointer-events-none'
                }`}
              >
                <p className="text-[14px] leading-[1.7] font-medium whitespace-pre-wrap">{card.text}</p>
                {isLast && (
                  <div className="flex flex-col gap-3 mt-2">
                    <textarea
                      value={userInput}
                      onChange={e => setUserInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleContinue(); }}
                      placeholder="your response..."
                      className="w-full bg-transparent border border-border rounded-[4px] p-4 min-h-[80px] resize-none outline-none placeholder:text-foreground/40 text-[14px]"
                    />
                    <div className="flex justify-end">
                      <button onClick={handleContinue} className="bg-black text-white px-5 py-2 text-[13px] font-bold hover:bg-black/80 transition-colors rounded-[2px]">
                        continue &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Streaming card */}
          {streaming && (
            <div className="border border-border rounded-[4px] p-6">
              <p className="text-[14px] leading-[1.7] font-medium whitespace-pre-wrap">
                {streamingText || <span className="opacity-30">thinking...</span>}
              </p>
            </div>
          )}

          {sessionError && (
            <p className="text-[13px] opacity-50">
              {sessionError}{' '}
              <button onClick={() => fetchCard(problem, history, callIndex)} className="underline">retry</button>
            </p>
          )}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
