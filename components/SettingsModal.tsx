import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, X } from 'lucide-react';

import {
  AppCapabilities,
  ARK_CODING_PLAN_BASE_URL,
  ProviderId,
  ProviderModelId,
  SelectedModelByProvider,
  StoredProviderApiKeys,
} from '../types';

interface SettingsModalProps {
  capabilities: AppCapabilities | null;
  selectedProviderId: ProviderId | '';
  selectedModelByProvider: SelectedModelByProvider;
  providerApiKeys: StoredProviderApiKeys;
  onSave: (settings: {
    providerId: ProviderId;
    selectedModels: SelectedModelByProvider;
    apiKeys: StoredProviderApiKeys;
  }) => void;
  isReading?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  capabilities,
  selectedProviderId,
  selectedModelByProvider,
  providerApiKeys,
  onSave,
  isReading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localProviderId, setLocalProviderId] = useState<ProviderId | ''>(selectedProviderId);
  const [localSelectedModels, setLocalSelectedModels] = useState<SelectedModelByProvider>(
    selectedModelByProvider
  );
  const [localApiKeys, setLocalApiKeys] = useState<StoredProviderApiKeys>(providerApiKeys);

  useEffect(() => {
    setLocalProviderId(selectedProviderId);
  }, [selectedProviderId]);

  useEffect(() => {
    setLocalSelectedModels(selectedModelByProvider);
  }, [selectedModelByProvider]);

  useEffect(() => {
    setLocalApiKeys(providerApiKeys);
  }, [providerApiKeys]);

  const handleSave = () => {
    if (!localProviderId) return;
    onSave({
      providerId: localProviderId,
      selectedModels: localSelectedModels,
      apiKeys: localApiKeys,
    });
    setIsOpen(false);
  };

  return (
    <>
      {!isReading && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-6 right-20 z-50 p-2 rounded-full border border-stone-200/50 bg-paper/50 backdrop-blur-sm text-stone-500 hover:text-ink transition-all shadow-sm print:hidden"
          title="Provider Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/20 backdrop-blur-sm animate-fade-in">
          <div className="bg-paper w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-stone-200/50 animate-fade-in-up">
            <div className="flex justify-between items-center p-6 border-b border-stone-100">
              <div>
                <h2 className="text-xl font-serif text-ink tracking-tight">Provider 预设</h2>
                <p className="mt-1 text-sm text-stone-500">
                  仅支持服务端声明的固定 provider 和模型白名单，不接受任意 Base URL。
                </p>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-stone-400 hover:text-ink transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {(capabilities?.providers ?? []).map((provider) => {
                const localModelId = localSelectedModels[provider.id] ?? provider.defaultModelId;
                const hasMultipleModels = provider.models.length > 1;
                const isSelected = localProviderId === provider.id;

                return (
                  <section
                    key={provider.id}
                    className={`rounded-2xl border p-5 transition-colors ${
                      isSelected
                        ? 'border-ink/20 bg-stone-50 shadow-sm'
                        : 'border-stone-200 bg-white/80'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setLocalProviderId(provider.id)}
                      className="w-full flex items-start justify-between gap-4 text-left"
                    >
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-stone-400 font-semibold">
                          {isSelected ? 'Selected Provider' : 'Available Provider'}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-ink">{provider.label}</h3>
                        {provider.description && (
                          <p className="mt-2 text-sm text-stone-500 leading-relaxed">{provider.description}</p>
                        )}
                      </div>
                      <span
                        className={`mt-1 inline-flex min-w-20 justify-center rounded-full px-3 py-1 text-xs font-semibold ${
                          isSelected
                            ? 'bg-ink text-paper'
                            : 'border border-stone-200 bg-white text-stone-500'
                        }`}
                      >
                        {isSelected ? '当前使用' : '点击选择'}
                      </span>
                    </button>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-stone-700">模型</label>
                        {hasMultipleModels ? (
                          <select
                            className="w-full bg-white border border-stone-200 rounded-lg px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                            value={localModelId}
                            onChange={(event) =>
                              setLocalSelectedModels((current) => ({
                                ...current,
                                [provider.id]: event.target.value as ProviderModelId,
                              }))
                            }
                          >
                            {provider.models.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-ink">
                            {provider.models[0]?.label ?? provider.defaultModelId}
                          </div>
                        )}
                        <p className="text-xs text-stone-500">
                          {(provider.models.find((model) => model.id === localModelId) ?? provider.models[0])
                            ?.description ?? '仅允许选择受控模型白名单。'}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-stone-700">API Key</label>
                        <input
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          value={localApiKeys[provider.id] ?? ''}
                          onChange={(event) =>
                            setLocalApiKeys((current) => ({
                              ...current,
                              [provider.id]: event.target.value,
                            }))
                          }
                          placeholder={`Paste your ${provider.label} API Key`}
                          className="w-full bg-white border border-stone-200 rounded-lg px-4 py-2 text-sm text-ink placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-ink/20"
                        />
                        <p className="text-xs text-stone-500">
                          仅保存在当前浏览器的 `localStorage`，不会写进分享链接或服务端缓存。
                        </p>
                      </div>
                    </div>

                    {provider.id === 'ark-coding-plan' && (
                      <div className="mt-4 space-y-2">
                        <label className="block text-sm font-medium text-stone-700">固定 Endpoint</label>
                        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-600 break-all">
                          {ARK_CODING_PLAN_BASE_URL}
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}

              <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
                <h3 className="text-sm font-semibold text-ink mb-3">平台能力</h3>
                <div className="space-y-2 text-sm text-stone-600">
                  {(capabilities?.sources ?? []).map((source) => (
                    <div key={source.id} className="flex items-start justify-between gap-3">
                      <span className="font-medium text-ink">{source.label}</span>
                      <span className={source.enabled ? 'text-emerald-700' : 'text-stone-500'}>
                        {source.enabled ? 'Enabled' : source.reason ?? 'Disabled'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-stone-100 bg-stone-50 flex justify-end gap-3">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-200/50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!localProviderId}
                className="px-6 py-2 rounded-lg text-sm font-medium bg-ink text-paper hover:bg-ink/90 transition-colors shadow-sm disabled:opacity-50"
              >
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
