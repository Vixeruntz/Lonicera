import React, { useState, useEffect } from 'react';
import { LoadingState } from '../types';
import { ArrowRight, Link as LinkIcon, Youtube, Sparkles, CheckCircle2 } from 'lucide-react';

interface HeroInputProps {
  onAnalyze: (url: string) => void;
  loadingState: LoadingState;
}

const DEMO_LINKS = [
  { label: '马斯克专访 (AI 未来)', url: 'https://www.youtube.com/watch?v=zbj3D0rNq2s' },
  { label: 'Steve Jobs 斯坦福演讲', url: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc' }
];

export const HeroInput: React.FC<HeroInputProps> = ({ onAnalyze, loadingState }) => {
  const [url, setUrl] = useState('');
  const [isValidType, setIsValidType] = useState<boolean | null>(null);

  useEffect(() => {
    if (!url) {
      setIsValidType(null);
      return;
    }
    const isYt = /(?:youtube\.com|youtu\.be)/i.test(url);
    const isBili = /(?:bilibili\.com|b23\.tv)/i.test(url);
    setIsValidType(isYt || isBili);
  }, [url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      const urlMatch = url.match(/(https?:\/\/[^\s]+)/);
      const finalUrl = urlMatch ? urlMatch[0] : url.trim();
      onAnalyze(finalUrl);
    }
  };

  const isLoading = loadingState !== LoadingState.IDLE;

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] max-w-4xl mx-auto px-6 text-center animate-fade-in-up">
      <div className="mb-12">
        <h1 className="font-serif text-5xl md:text-7xl text-ink font-medium tracking-tight mb-6">
          提炼视频的 <span className="italic text-amber-700/90 font-serif">深度</span>
        </h1>
        <p className="text-lg md:text-xl text-stone-500 max-w-2xl mx-auto font-light leading-relaxed">
          贴入一段视频链接，我们将撰写一篇深度长文。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-2xl relative group mb-10">
        <div className="relative flex items-center">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text');
                  const urlMatch = pasted.match(/(https?:\/\/[^\s]+)/);
                  if (urlMatch && /(?:youtube\.com|youtu\.be|bilibili\.com|b23\.tv)/i.test(urlMatch[0])) {
                      e.preventDefault();
                      setUrl(urlMatch[0]);
                  }
              }}
              placeholder="Paste a Youtube or Bilibili link..."
              disabled={isLoading}
              className="w-full bg-transparent border-b border-stone-300 py-4 pl-4 pr-16 text-xl font-sans text-ink placeholder:text-stone-300 focus:outline-none focus:border-ink transition-all placeholder:font-light"
            />
            
            {/* Real-time validation indicator */}
            <div className="absolute right-14">
                {isValidType === true && <CheckCircle2 className="w-5 h-5 text-emerald-600/80 animate-fade-in" />}
            </div>

            <button
              type="submit"
              disabled={isLoading || !url}
              className="absolute right-2 p-2 text-stone-400 hover:text-ink disabled:opacity-30 disabled:hover:text-stone-400 transition-colors"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-stone-300 border-t-ink rounded-full animate-spin" />
              ) : (
                <ArrowRight className="h-6 w-6" />
              )}
            </button>
        </div>
      </form>

      <div className="flex flex-col items-center opacity-80 hover:opacity-100 transition-opacity">
        <p className="text-xs uppercase tracking-widest text-stone-400 font-semibold mb-4">Try a masterpiece</p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
            {DEMO_LINKS.map((demo, i) => (
                <button
                    key={i}
                    onClick={() => { setUrl(demo.url); }}
                    className="flex items-center space-x-2 px-4 py-2 rounded-full border border-stone-200 bg-white/50 hover:bg-stone-100 hover:border-stone-300 transition-all text-sm font-sans text-stone-600 shadow-sm"
                >
                    <Youtube className="w-4 h-4 text-red-600/80" />
                    <span>{demo.label}</span>
                </button>
            ))}
        </div>
      </div>
    </div>
  );
};