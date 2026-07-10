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
        
        <div className="grid grid-cols-3 border border-border rounded-[4px] overflow-hidden" style={{height: '96px'}}>
          <div className="border-r border-border flex items-center justify-center cursor-pointer hover:bg-foreground/5 transition-colors">
            <span className="text-[13px] opacity-70">upload //</span>
          </div>
          <div className="border-r border-border relative flex items-center justify-center hover:bg-foreground/5 transition-colors">
            <textarea
              placeholder="type //"
              className="absolute inset-0 w-full h-full bg-transparent outline-none resize-none text-[13px] text-center flex items-center justify-center"
              style={{paddingTop: '38px', paddingLeft: '8px', paddingRight: '8px'}}
            />
          </div>
          <button type="button" className="flex items-center justify-center hover:bg-foreground/5 transition-colors">
            <span className="text-[13px] opacity-70">speak //</span>
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
