import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Sun } from 'lucide-react';

import { HeroInput } from './components/HeroInput';
import { ArticleReader } from './components/ArticleReader';
import { ProcessingState } from './components/ProcessingState';
import { SettingsModal } from './components/SettingsModal';
import {
  AnalyzeArticleResponse,
  AppCapabilities,
  LoadingState,
  ArticleData,
  ProviderCapability,
} from './types';

const PROGRESS_STAGES: Array<{ delayMs: number; state: LoadingState }> = [
  { delayMs: 0, state: LoadingState.SEARCHING },
  { delayMs: 400, state: LoadingState.ANALYZING },
  { delayMs: 1200, state: LoadingState.OUTLINING },
  { delayMs: 2400, state: LoadingState.DRAFTING },
];

async function parseApiError(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    if (payload?.error) {
      return String(payload.error);
    }
  }
  return `请求失败 (${response.status} ${response.statusText})`;
}

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function updateShareableUrl(videoUrl?: string, providerId?: string) {
  const nextUrl = new URL(window.location.href);

  if (videoUrl) {
    nextUrl.searchParams.set('video', videoUrl);
  } else {
    nextUrl.searchParams.delete('video');
  }

  if (providerId) {
    nextUrl.searchParams.set('provider', providerId);
  } else {
    nextUrl.searchParams.delete('provider');
  }

  window.history.replaceState({}, '', nextUrl);
}

export default function App() {
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [capabilities, setCapabilities] = useState<AppCapabilities | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');

  const progressTimerIds = useRef<number[]>([]);
  const requestAbortController = useRef<AbortController | null>(null);
  const didConsumeDeepLink = useRef(false);

  const selectedProvider = useMemo<ProviderCapability | null>(() => {
    if (!capabilities) return null;
    return capabilities.providers.find((provider) => provider.id === selectedProviderId) ?? null;
  }, [capabilities, selectedProviderId]);

  const clearPendingProgress = useCallback(() => {
    for (const timerId of progressTimerIds.current) {
      window.clearTimeout(timerId);
    }
    progressTimerIds.current = [];
  }, []);

  const startProgress = useCallback(() => {
    clearPendingProgress();
    progressTimerIds.current = PROGRESS_STAGES.map(({ delayMs, state }) =>
      window.setTimeout(() => {
        setLoadingState(state);
      }, delayMs)
    );
  }, [clearPendingProgress]);

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    const prefersDark =
      storedTheme === 'dark' ||
      (!storedTheme &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    setIsDarkMode(prefersDark);
    applyTheme(prefersDark);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCapabilities() {
      try {
        const response = await fetch('/api/capabilities', { signal: controller.signal });
        if (!response.ok) {
          throw new Error(await parseApiError(response));
        }

        const payload = (await response.json()) as AppCapabilities;
        setCapabilities(payload);
        setCapabilitiesError('');

        const savedProviderId = localStorage.getItem('selected_provider_id');
        const preferredProvider =
          (savedProviderId &&
            payload.providers.some((provider) => provider.id === savedProviderId) &&
            savedProviderId) ||
          payload.defaultProviderId ||
          payload.providers[0]?.id ||
          '';
        setSelectedProviderId(preferredProvider);
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : '无法加载服务端能力配置。';
        setCapabilitiesError(message);
      }
    }

    loadCapabilities();

    return () => {
      controller.abort();
    };
  }, []);

  const handleAnalyze = useCallback(
    async (videoUrl: string, providerOverride?: string) => {
      const providerId = providerOverride || selectedProviderId || capabilities?.defaultProviderId || '';
      if (!providerId) {
        setErrorMsg('服务端当前没有可用的模型配置。');
        setLoadingState(LoadingState.ERROR);
        return;
      }

      requestAbortController.current?.abort();
      const controller = new AbortController();
      requestAbortController.current = controller;

      setArticle(null);
      setErrorMsg('');
      startProgress();

      try {
        const response = await fetch('/api/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl,
            providerId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await parseApiError(response));
        }

        const payload = (await response.json()) as AnalyzeArticleResponse;
        clearPendingProgress();
        setArticle(payload.article);
        setLoadingState(LoadingState.COMPLETED);
        setSelectedProviderId(payload.meta.providerId);
        localStorage.setItem('selected_provider_id', payload.meta.providerId);
        updateShareableUrl(payload.meta.canonicalUrl, payload.meta.providerId);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        clearPendingProgress();
        setErrorMsg(error instanceof Error ? error.message : '未知系统异常');
        setLoadingState(LoadingState.ERROR);
      }
    },
    [capabilities?.defaultProviderId, clearPendingProgress, selectedProviderId, startProgress]
  );

  useEffect(() => {
    if (!capabilities || !selectedProviderId || didConsumeDeepLink.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const deepLinkedVideo = params.get('video');
    if (!deepLinkedVideo) {
      return;
    }

    const deepLinkedProvider = params.get('provider');
    didConsumeDeepLink.current = true;
    handleAnalyze(deepLinkedVideo, deepLinkedProvider || selectedProviderId);
  }, [capabilities, handleAnalyze, selectedProviderId]);

  useEffect(() => {
    return () => {
      requestAbortController.current?.abort();
      clearPendingProgress();
    };
  }, [clearPendingProgress]);

  const toggleDarkMode = () => {
    const nextValue = !isDarkMode;
    setIsDarkMode(nextValue);
    applyTheme(nextValue);
  };

  const handleBack = () => {
    requestAbortController.current?.abort();
    clearPendingProgress();
    setLoadingState(LoadingState.IDLE);
    setArticle(null);
    setErrorMsg('');
    updateShareableUrl();
  };

  const handleSaveSettings = (providerId: string) => {
    setSelectedProviderId(providerId);
    localStorage.setItem('selected_provider_id', providerId);
  };

  const isReading = !!article && loadingState !== LoadingState.ERROR;

  return (
    <div className="min-h-screen bg-paper text-ink transition-colors duration-500 overflow-x-hidden selection:bg-accent/20 selection:text-ink">
      <SettingsModal
        capabilities={capabilities}
        selectedProviderId={selectedProviderId}
        onSave={handleSaveSettings}
        isReading={isReading}
      />

      {!isReading && (
        <button
          onClick={toggleDarkMode}
          className="fixed top-6 right-6 z-50 p-2 rounded-full border border-stone-200/50 bg-paper/50 backdrop-blur-sm text-stone-500 hover:text-ink transition-all shadow-sm print:hidden"
          title="Toggle Theme"
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      )}

      <AnimatePresence mode="wait">
        {loadingState === LoadingState.IDLE && (
          <motion.div
            key="hero"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
          >
            <HeroInput
              onAnalyze={handleAnalyze}
              loadingState={loadingState}
              capabilities={capabilities}
              selectedProvider={selectedProvider}
              capabilitiesError={capabilitiesError}
            />
            <footer className="fixed bottom-6 left-0 right-0 text-center text-xs text-stone-400 font-sans tracking-wide px-6">
              {selectedProvider
                ? `${selectedProvider.label} · ${selectedProvider.model}`
                : '等待服务端能力配置'}
            </footer>
          </motion.div>
        )}

        {loadingState !== LoadingState.IDLE && (!article || loadingState === LoadingState.ERROR) && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className={`w-full absolute inset-0 flex items-center justify-center z-50 ${
              loadingState === LoadingState.ERROR ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            <ProcessingState state={loadingState} errorMessage={errorMsg} />
          </motion.div>
        )}

        {!!article && loadingState !== LoadingState.ERROR && (
          <motion.div
            key="reader"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="w-full relative z-10"
          >
            <ArticleReader
              data={article}
              onBack={handleBack}
              isStreaming={false}
              isPolishing={false}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
