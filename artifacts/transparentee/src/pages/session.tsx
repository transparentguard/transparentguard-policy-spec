import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

interface Card {
  id: string;
  text: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function SessionScreen() {
  const [, setLocation] = useLocation();
  const [problem, setProblem] = useState('');
  const [context, setContext] = useState('');
  const [cards, setCards] = useState<Card[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [userInput, setUserInput] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('tee_problem');
    if (!stored) {
      setLocation('/');
      return;
    }
    const parsed = JSON.parse(stored);
    const prob = parsed.problem ?? '';
    const ctx = parsed.context ?? '';
    setProblem(prob);
    setContext(ctx);
    setReady(true);
    fetchCard(prob, ctx, []);
  }, []);

  const fetchCard = async (prob: string, ctx: string, hist: Message[]) => {
    setStreaming(true);
    setStreamingText('');
    setError('');

    try {
      const res = await fetch('/api/ai/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem: prob, context: ctx, history: hist }),
      });

      if (!res.ok) throw new Error(`request failed (${res.status})`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.done) break;
            if (payload.error) throw new Error(payload.error);
            if (payload.delta) {
              full += payload.delta;
              setStreamingText(full);
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      const newCard: Card = { id: Date.now().toString(), text: full };
      setCards(prev => [...prev, newCard]);
      setHistory(prev => [...prev, { role: 'assistant', content: full }]);
      setStreamingText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setStreaming(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const handleContinue = () => {
    const newHist: Message[] = [...history];
    if (userInput.trim()) {
      newHist.push({ role: 'user', content: userInput.trim() });
      setHistory(newHist);
    }
    setUserInput('');
    fetchCard(problem, context, newHist);
  };

  if (!ready) {
    return (
      <div className="min-h-[100dvh] w-full max-w-[600px] mx-auto px-[24px] flex items-center justify-center">
        <p className="text-[14px] opacity-60">loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full max-w-[600px] mx-auto px-[24px] flex flex-col">

      {/* Sticky problem header */}
      <div className="sticky top-0 bg-background pt-8 pb-4 border-b border-border z-10">
        <p className="text-[11px] opacity-70 mb-1">problem</p>
        <p className="text-[14px] font-bold">{problem}</p>
      </div>

      <div className="py-8 flex flex-col gap-6">

        {/* Completed cards — dimmed */}
        {cards.map((card, idx) => {
          const isLast = idx === cards.length - 1 && !streaming;
          return (
            <div
              key={card.id}
              className={`border border-border p-6 flex flex-col gap-4 transition-opacity duration-500 rounded-[4px] ${
                isLast ? 'opacity-100' : 'opacity-30 pointer-events-none'
              }`}
            >
              <p className="text-[14px] leading-[1.7] font-medium whitespace-pre-wrap">{card.text}</p>

              {isLast && (
                <div className="flex flex-col gap-3 mt-2">
                  <textarea
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleContinue();
                    }}
                    placeholder="your response..."
                    className="w-full bg-transparent border border-border rounded-[4px] p-4 min-h-[80px] resize-none outline-none placeholder:text-foreground/40 text-[14px]"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleContinue}
                      className="bg-black text-white px-5 py-2 text-[13px] font-bold hover:bg-black/80 transition-colors rounded-[2px]"
                    >
                      continue &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Live streaming card */}
        {streaming && (
          <div className="border border-border rounded-[4px] p-6">
            <p className="text-[14px] leading-[1.7] font-medium whitespace-pre-wrap">
              {streamingText || <span className="opacity-30">thinking...</span>}
            </p>
          </div>
        )}

        {error && (
          <p className="text-[13px] opacity-50">{error} — <button onClick={() => fetchCard(problem, context, history)} className="underline">retry</button></p>
        )}

      </div>

      <div ref={bottomRef} />
    </div>
  );
}
