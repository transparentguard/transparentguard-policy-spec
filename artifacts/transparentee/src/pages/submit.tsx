import React, { useRef, useState, useEffect } from 'react';
import { useLocation } from 'wouter';

// Extend window for webkit speech recognition
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export default function SubmitScreen() {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [problemText, setProblemText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Clean up recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      setUploadedFiles(prev => [...prev, ...files]);
    }
    // reset so same files can be re-selected if needed
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSpeak = () => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setSpeechError('speech recognition not supported in this browser');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    setSpeechError('');
    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = problemText;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += (finalTranscript ? ' ' : '') + result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setProblemText(finalTranscript + (interim ? ' ' + interim : ''));
    };

    recognition.onend = () => {
      setIsListening(false);
      setProblemText(finalTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      if (event.error !== 'aborted') {
        setSpeechError(`mic error: ${event.error}`);
      }
    };

    recognition.onstart = () => setIsListening(true);
    recognition.start();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocation('/session/demo');
  };

  const fileLabel = (count: number) => {
    if (count === 1) return '1 file attached';
    return `${count} files attached`;
  };

  return (
    <div className="min-h-[100dvh] w-full max-w-[600px] mx-auto px-[24px] py-12 flex flex-col justify-center">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full mt-12 mb-24">

        {/* Upload + Speak row */}
        <div className="grid grid-cols-2 border border-border rounded-[4px] overflow-hidden" style={{ height: '96px' }}>

          {/* Upload */}
          <div
            className="border-r border-border flex flex-col items-center justify-center cursor-pointer hover:bg-foreground/5 transition-colors gap-1"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadedFiles.length === 0 ? (
              <span className="text-[13px] opacity-70">upload //</span>
            ) : (
              <>
                <span className="text-[13px]">{fileLabel(uploadedFiles.length)}</span>
                <span
                  className="text-[11px] opacity-40 hover:opacity-70 transition-opacity"
                  onClick={e => { e.stopPropagation(); setUploadedFiles([]); }}
                >
                  clear
                </span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Speak */}
          <button
            type="button"
            onClick={handleSpeak}
            className="flex flex-col items-center justify-center hover:bg-foreground/5 transition-colors gap-1"
          >
            {isListening ? (
              <>
                <span className="text-[13px]">listening...</span>
                <span className="text-[11px] opacity-40">tap to stop</span>
              </>
            ) : (
              <span className="text-[13px] opacity-70">speak //</span>
            )}
          </button>
        </div>

        {/* Speech error */}
        {speechError && (
          <span className="text-[12px] opacity-50 -mt-3">{speechError}</span>
        )}

        {/* File list */}
        {uploadedFiles.length > 0 && (
          <div className="flex flex-col gap-1 -mt-3">
            {uploadedFiles.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-[12px] opacity-60">
                <span className="truncate max-w-[480px]">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="ml-4 opacity-40 hover:opacity-80 transition-opacity flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main input */}
        <textarea
          value={problemText}
          onChange={e => setProblemText(e.target.value)}
          placeholder="describe your problem. paste equations, describe circuits, or just type what you're stuck on..."
          className="w-full bg-transparent border border-border rounded-[4px] p-5 h-40 resize-none outline-none placeholder:text-foreground/40 text-[14px] hover:bg-foreground/5 transition-colors focus:bg-foreground/5"
        />

        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-black text-white px-6 py-2.5 text-[14px] font-bold hover:bg-black/80 transition-colors rounded-[2px]"
          >
            solve &rarr;
          </button>
        </div>
      </form>
    </div>
  );
}
