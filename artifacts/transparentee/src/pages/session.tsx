import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';

interface CardData {
  id: string;
  text: string;
  equation?: string;
  citation?: string;
  needsResponse: boolean;
}

const mockCards: CardData[] = [
  {
    id: "1",
    text: "let's look at the node between the 4ω resistor and the 12v source. what do we know about kirchhoff's current law at this specific point?",
    citation: "nilsson & riedel, ch. 4",
    needsResponse: true,
  },
  {
    id: "2",
    text: "exactly. the sum of currents leaving the node must equal zero. let's write out the equation for this node.",
    equation: "(v_1 - 12)/4 + v_1/8 + (v_1 - v_2)/2 = 0",
    needsResponse: false,
  },
  {
    id: "3",
    text: "now consider the second essential node. how would you express the current flowing towards the reference node?",
    needsResponse: true,
  }
];

export default function SessionScreen() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [responses, setResponses] = useState<Record<string, string>>({});
  
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 100);
    return () => clearTimeout(t);
  }, []);

  const handleContinue = () => {
    if (currentIndex < mockCards.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 50);
    } else {
      setSessionComplete(true);
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] w-full max-w-[600px] mx-auto px-[24px] flex items-center justify-center">
        <p className="text-[14px]">analyzing problem...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full max-w-[600px] mx-auto px-[24px] flex flex-col">
      <div className="sticky top-0 bg-background pt-8 pb-4 border-b border-border z-10">
        <p className="text-[12px] opacity-80 mb-1">problem</p>
        <p className="text-[14px] font-bold truncate">find the thevenin equivalent circuit with respect to terminals a,b</p>
      </div>
      
      <div className="py-8 flex flex-col gap-6">
        {mockCards.slice(0, currentIndex + 1).map((card, idx) => {
          const isCurrent = idx === currentIndex && !sessionComplete;
          return (
            <div 
              key={card.id} 
              className={`border border-border p-6 transition-opacity duration-500 flex flex-col gap-4 ${isCurrent ? 'opacity-100' : 'opacity-45 pointer-events-none'}`}
            >
              <p className="text-[14px] leading-[1.6] font-medium">{card.text}</p>
              
              {card.equation && (
                <div className="bg-transparent border border-border p-4 text-[13px] font-mono mt-1 whitespace-pre-wrap">
                  {card.equation}
                </div>
              )}
              
              {card.citation && (
                <p className="text-[11px] opacity-80 mt-1">{card.citation}</p>
              )}
              
              {card.needsResponse && isCurrent && (
                <div className="flex flex-col gap-4 mt-2">
                  <textarea 
                    value={responses[card.id] || ''}
                    onChange={(e) => setResponses({...responses, [card.id]: e.target.value})}
                    placeholder="your response..."
                    className="w-full bg-transparent border border-border p-4 min-h-[100px] resize-none outline-none placeholder:text-foreground/40 text-[14px] pointer-events-auto transition-colors focus:border-foreground/40"
                  />
                  <div className="flex justify-end">
                    <button 
                      onClick={handleContinue}
                      className="bg-black text-white px-5 py-2 text-[13px] font-bold hover:bg-black/80 transition-colors pointer-events-auto"
                    >
                      continue &rarr;
                    </button>
                  </div>
                </div>
              )}
              
              {!card.needsResponse && isCurrent && (
                <div className="flex justify-end mt-2">
                  <button 
                    onClick={handleContinue}
                    className="bg-black text-white px-5 py-2 text-[13px] font-bold hover:bg-black/80 transition-colors pointer-events-auto"
                  >
                    continue &rarr;
                  </button>
                </div>
              )}
            </div>
          );
        })}
        
        {sessionComplete && (
          <div className="border border-border p-6 flex flex-col gap-6 animate-in fade-in duration-500">
            <p className="text-[14px] leading-[1.6]">session complete. review your notes below.</p>
            <button 
              onClick={() => setLocation('/')}
              className="text-left text-[14px] opacity-80 hover:opacity-100 transition-opacity flex items-center font-bold"
            >
              start new problem &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
