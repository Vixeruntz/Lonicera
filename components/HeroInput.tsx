import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, Youtube } from 'lucide-react';

import { AppCapabilities, LoadingState, ProviderCapability, ProviderModelOption } from '../types';

interface HeroInputProps {
  onAnalyze: (url: string) => void;
  loadingState: LoadingState;
  capabilities: AppCapabilities | null;
  selectedProvider: ProviderCapability | null;
  selectedModel: ProviderModelOption | null;
  capabilitiesError?: string;
}

const DEMO_LINKS = [
  { label: '马斯克专访 (AI 未来)', url: 'https://www.youtube.com/watch?v=zbj3D0rNq2s' },
  { label: 'Steve Jobs 斯坦福演讲', url: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc' },
];

function safeParseUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

export const HeroInput: React.FC<HeroInputProps> = ({
  onAnalyze,
  loadingState,
  capabilities,
  selectedProvider,
  selectedModel,
  capabilitiesError,
}) => {
  const [url, setUrl] = useState('');
  const [isValidUrl, setIsValidUrl] = useState<boolean | null>(null);

  const enabledSources = useMemo(
    () => capabilities?.sources.filter((source) => source.enabled) ?? [],
    [capabilities]
  );

  useEffect(() => {
    if (!url) {
      setIsValidUrl(null);
      return;
    }
    setIsValidUrl(Boolean(safeParseUrl(url.trim())));
  }, [url]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = safeParseUrl(url.trim());
    if (!parsed || !selectedProvider || !selectedModel) return;
    onAnalyze(parsed.toString());
  };

  const isLoading = loadingState !== LoadingState.IDLE;
  const canSubmit = !isLoading && Boolean(selectedProvider) && Boolean(selectedModel) && isValidUrl === true;

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] max-w-4xl mx-auto px-6 text-center animate-fade-in-up">
      <div className="mb-12">
        <h1 className="font-serif text-5xl md:text-7xl text-ink font-medium tracking-tight mb-6">
          把 YouTube 视频整理成一篇
          <span className="italic text-amber-700/90 font-serif">可信的长文</span>
        </h1>
        <p className="text-lg md:text-xl text-stone-500 max-w-2xl mx-auto font-light leading-relaxed">
          现在所有生成都经过服务端校验、字幕抽取、模型白名单选择和缓存治理；前端只负责发起请求与展示结果。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-2xl relative group mb-10">
        <div className="relative flex items-center">
          <input
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData('text').trim();
              const parsed = safeParseUrl(pasted);
              if (parsed) {
                event.preventDefault();
                setUrl(parsed.toString());
              }
            }}
            placeholder="Paste a YouTube link..."
            disabled={isLoading}
            className="w-full bg-transparent border-b border-stone-300 py-4 pl-4 pr-16 text-xl font-sans text-ink placeholder:text-stone-300 focus:outline-none focus:border-ink transition-all placeholder:font-light"
          />

          <div className="absolute right-14">
            {isValidUrl === true && <CheckCircle2 className="w-5 h-5 text-emerald-600/80 animate-fade-in" />}
            {isValidUrl === false && <CircleAlert className="w-5 h-5 text-amber-600/90 animate-fade-in" />}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
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

      <div className="w-full max-w-3xl grid gap-6 text-left">
        <div className="rounded-2xl border border-stone-200/70 bg-white/40 backdrop-blur-sm p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.22em] text-stone-400 font-semibold mb-3">Backend Capabilities</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {enabledSources.map((source) => (
              <span
                key={source.id}
                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-700"
              >
                {source.label}
              </span>
            ))}
          </div>

          <div className="text-sm text-stone-500 leading-relaxed space-y-2">
            <p>
              当前模型:
              <span className="ml-2 font-medium text-ink">
                {selectedProvider && selectedModel
                  ? `${selectedProvider.label} (${selectedModel.label})`
                  : '无可用模型'}
              </span>
            </p>
            <p>当前仅支持 YouTube 链接；不再展示或尝试 Bilibili 路径。</p>
            {capabilitiesError && <p className="text-rose-600">{capabilitiesError}</p>}
            {!capabilitiesError && !selectedProvider && (
              <p className="text-amber-700">服务端没有可用 provider 描述时，前端不会尝试在浏览器里直接生成内容。</p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center opacity-80 hover:opacity-100 transition-opacity">
          <p className="text-xs uppercase tracking-widest text-stone-400 font-semibold mb-4">Quick Try</p>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {DEMO_LINKS.map((demo) => (
              <button
                key={demo.url}
                onClick={() => {
                  setUrl(demo.url);
                }}
                className="flex items-center space-x-2 px-4 py-2 rounded-full border border-stone-200 bg-white/50 hover:bg-stone-100 hover:border-stone-300 transition-all text-sm font-sans text-stone-600 shadow-sm"
              >
                <Youtube className="w-4 h-4 text-red-600/80" />
                <span>{demo.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
