import React from 'react';
import { useLocation } from 'wouter';

export default function SubmitScreen() {
  const [, setLocation] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocation('/session/demo');
  };

  return (
    <div className="min-h-[100dvh] w-full max-w-[600px] mx-auto px-[24px] py-12 flex flex-col justify-center">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full mt-12 mb-24">
        
        <div className="grid grid-cols-3 gap-0 border border-border rounded-[4px] overflow-hidden">
          <div className="border-r border-border p-4 h-24 flex items-center justify-center cursor-pointer hover:bg-foreground/5 transition-colors group">
            <span className="text-[14px] group-hover:opacity-100 opacity-70 text-center">upload //</span>
          </div>
          <textarea 
            placeholder="type //"
            className="border-r border-border px-4 pt-[34px] h-24 bg-transparent outline-none resize-none placeholder:text-foreground/70 hover:bg-foreground/5 transition-colors text-[14px] focus:bg-foreground/5 focus:placeholder:opacity-40 text-center placeholder:text-center"
          />
          <button type="button" className="p-4 h-24 flex items-center justify-center hover:bg-foreground/5 transition-colors group">
            <span className="text-[14px] group-hover:opacity-100 opacity-70 text-center">speak //</span>
          </button>
        </div>

        <textarea 
          placeholder="add context — assumptions, what you're stuck on..."
          className="w-full bg-transparent border border-border rounded-[4px] p-5 h-32 resize-none outline-none placeholder:text-foreground/40 text-[14px] hover:bg-foreground/5 transition-colors focus:bg-foreground/5"
        />

        <div className="flex justify-end">
          <button 
            type="submit" 
            className="bg-black text-white px-6 py-2.5 text-[14px] font-bold hover:bg-black/80 transition-colors"
          >
            solve &rarr;
          </button>
        </div>
      </form>
    </div>
  );
}
