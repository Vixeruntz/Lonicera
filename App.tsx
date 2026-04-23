import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';

import { ArticleReader } from './components/ArticleReader';
import { HeroInput } from './components/HeroInput';
import { ProcessingState } from './components/ProcessingState';
import { SettingsModal } from './components/SettingsModal';
import {
  AnalyzeArticleResponse,
  AppCapabilities,
  ArticleData,
  LoadingState,
  ProviderCapability,
  ProviderId,
  ProviderModelOption,
  SelectedModelByProvider,
  StoredProviderApiKeys,
} from './types';

const SELECTED_PROVIDER_STORAGE_KEY = 'selected_provider_id';
const SELECTED_MODEL_STORAGE_KEY = 'selected_model_by_provider';
const PROVIDER_KEYS_STORAGE_KEY = 'provider_api_keys';

const PROGRESS_STAGES: Array<{ delayMs: number; state: LoadingState }> = [
  { delayMs: 0, state: LoadingState.SEARCHING },
  { delayMs: 400, state: LoadingState.ANALYZING },
  { delayMs: 1200, state: LoadingState.OUTLINING },
  { delayMs: 2400, state: LoadingState.DRAFTING },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readJsonFromStorage(storageKey: string) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseApiKeys(storageKey: string, capabilities: AppCapabilities): StoredProviderApiKeys {
  const parsed = readJsonFromStorage(storageKey);
  if (!isRecord(parsed)) {
    return {};
  }

  const result: StoredProviderApiKeys = {};
  for (const provider of capabilities.providers) {
    const candidate = parsed[provider.id];
    if (typeof candidate === 'string' && candidate.trim()) {
      result[provider.id] = candidate;
    }
  }
  return result;
}

function parseSelectedModels(storageKey: string, capabilities: AppCapabilities): SelectedModelByProvider {
  const parsed = readJsonFromStorage(storageKey);
  const saved = isRecord(parsed) ? parsed : {};

  const result: SelectedModelByProvider = {};
  for (const provider of capabilities.providers) {
    const candidate = saved[provider.id];
    const selectedModel =
      typeof candidate === 'string' &&
      provider.models.some((model) => model.id === candidate)
        ? candidate
        : provider.defaultModelId;
    result[provider.id] = selectedModel;
  }
  return result;
}

function getResolvedProvider(
  capabilities: AppCapabilities | null,
  selectedProviderId: ProviderId | '',
  providerOverride?: string
) {
  if (!capabilities) {
    return null;
  }

  if (providerOverride) {
    const fromOverride = capabilities.providers.find((provider) => provider.id === providerOverride);
    if (fromOverride) {
      return fromOverride;
    }
  }

  if (selectedProviderId) {
    const fromSelection = capabilities.providers.find((provider) => provider.id === selectedProviderId);
    if (fromSelection) {
      return fromSelection;
    }
  }

  if (capabilities.defaultProviderId) {
    const fromDefault = capabilities.providers.find(
      (provider) => provider.id === capabilities.defaultProviderId
    );
    if (fromDefault) {
      return fromDefault;
    }
  }

  return capabilities.providers[0] ?? null;
}

function getSelectedModelOption(
  provider: ProviderCapability | null,
  selectedModelByProvider: SelectedModelByProvider
): ProviderModelOption | null {
  if (!provider) {
    return null;
  }

  const selectedModelId = selectedModelByProvider[provider.id] ?? provider.defaultModelId;
  return provider.models.find((model) => model.id === selectedModelId) ?? provider.models[0] ?? null;
}

function persistSelectedProviderId(providerId: ProviderId) {
  localStorage.setItem(SELECTED_PROVIDER_STORAGE_KEY, providerId);
}

function persistSelectedModels(nextModels: SelectedModelByProvider) {
  localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, JSON.stringify(nextModels));
}

function persistProviderApiKeys(nextApiKeys: StoredProviderApiKeys) {
  localStorage.setItem(PROVIDER_KEYS_STORAGE_KEY, JSON.stringify(nextApiKeys));
}

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

function updateShareableUrl(videoUrl?: string, providerId?: ProviderId) {
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
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId | ''>('');
  const [selectedModelByProvider, setSelectedModelByProvider] = useState<SelectedModelByProvider>({});
  const [providerApiKeys, setProviderApiKeys] = useState<StoredProviderApiKeys>({});

  const progressTimerIds = useRef<number[]>([]);
  const requestAbortController = useRef<AbortController | null>(null);
  const didConsumeDeepLink = useRef(false);

  const selectedProvider = useMemo(
    () => getResolvedProvider(capabilities, selectedProviderId),
    [capabilities, selectedProviderId]
  );

  const selectedModel = useMemo(
    () => getSelectedModelOption(selectedProvider, selectedModelByProvider),
    [selectedModelByProvider, selectedProvider]
  );

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
        const savedProviderId = localStorage.getItem(SELECTED_PROVIDER_STORAGE_KEY);
        const preferredProvider =
          getResolvedProvider(payload, '', savedProviderId ?? undefined)?.id ??
          payload.defaultProviderId ??
          payload.providers[0]?.id ??
          '';

        const nextSelectedModels = parseSelectedModels(SELECTED_MODEL_STORAGE_KEY, payload);
        const nextApiKeys = parseApiKeys(PROVIDER_KEYS_STORAGE_KEY, payload);

        setCapabilities(payload);
        setCapabilitiesError('');
        setSelectedProviderId(preferredProvider);
        setSelectedModelByProvider(nextSelectedModels);
        setProviderApiKeys(nextApiKeys);
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
      const provider = getResolvedProvider(capabilities, selectedProviderId, providerOverride);
      if (!provider) {
        setErrorMsg('服务端当前没有可用的模型配置。');
        setLoadingState(LoadingState.ERROR);
        return;
      }

      const model = getSelectedModelOption(provider, selectedModelByProvider);
      if (!model) {
        setErrorMsg('当前 provider 没有可用模型。');
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
            providerId: provider.id,
            modelId: model.id,
            apiKey: providerApiKeys[provider.id]?.trim() || undefined,
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
        persistSelectedProviderId(payload.meta.providerId);
        setSelectedModelByProvider((current) => {
          const next = {
            ...current,
            [payload.meta.providerId]: payload.meta.modelId,
          };
          persistSelectedModels(next);
          return next;
        });
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
    [capabilities, clearPendingProgress, providerApiKeys, selectedModelByProvider, selectedProviderId, startProgress]
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

    const deepLinkedProvider = params.get('provider') ?? undefined;
    didConsumeDeepLink.current = true;
    handleAnalyze(deepLinkedVideo, deepLinkedProvider);
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

  const handleSaveSettings = (settings: {
    providerId: ProviderId;
    selectedModels: SelectedModelByProvider;
    apiKeys: StoredProviderApiKeys;
  }) => {
    setSelectedProviderId(settings.providerId);
    setSelectedModelByProvider(settings.selectedModels);
    setProviderApiKeys(settings.apiKeys);
    persistSelectedProviderId(settings.providerId);
    persistSelectedModels(settings.selectedModels);
    persistProviderApiKeys(settings.apiKeys);
  };

  const isReading = !!article && loadingState !== LoadingState.ERROR;

  return (
    <div className="min-h-screen bg-paper text-ink transition-colors duration-500 overflow-x-hidden selection:bg-accent/20 selection:text-ink">
      <SettingsModal
        capabilities={capabilities}
        selectedProviderId={selectedProviderId}
        selectedModelByProvider={selectedModelByProvider}
        providerApiKeys={providerApiKeys}
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
              selectedModel={selectedModel}
              capabilitiesError={capabilitiesError}
            />
            <footer className="fixed bottom-6 left-0 right-0 text-center text-xs text-stone-400 font-sans tracking-wide px-6">
              {selectedProvider && selectedModel
                ? `${selectedProvider.label} · ${selectedModel.label}`
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
