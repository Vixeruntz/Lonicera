import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, X } from 'lucide-react';

import { AppCapabilities } from '../types';

interface SettingsModalProps {
  capabilities: AppCapabilities | null;
  selectedProviderId: string;
  onSave: (providerId: string) => void;
  isReading?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  capabilities,
  selectedProviderId,
  onSave,
  isReading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localProviderId, setLocalProviderId] = useState(selectedProviderId);

  useEffect(() => {
    setLocalProviderId(selectedProviderId);
  }, [selectedProviderId]);

  const handleSave = () => {
    if (!localProviderId) return;
    onSave(localProviderId);
    setIsOpen(false);
  };

  return (
    <>
      {!isReading && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-6 right-20 z-50 p-2 rounded-full border border-stone-200/50 bg-paper/50 backdrop-blur-sm text-stone-500 hover:text-ink transition-all shadow-sm print:hidden"
          title="Server Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/20 backdrop-blur-sm animate-fade-in">
          <div className="bg-paper w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-stone-200/50 animate-fade-in-up">
            <div className="flex justify-between items-center p-6 border-b border-stone-100">
              <h2 className="text-xl font-serif text-ink tracking-tight">服务端能力配置</h2>
              <button onClick={() => setIsOpen(false)} className="text-stone-400 hover:text-ink transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">可用模型</label>
                <select
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  onChange={(event) => setLocalProviderId(event.target.value)}
                  value={localProviderId}
                  disabled={!capabilities?.providers.length}
                >
                  {(capabilities?.providers ?? []).map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label} · {provider.model}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-stone-500">
                  API Key、Base URL 和模型白名单都由服务端托管。前端只允许选择后端已经启用的 provider。
                </p>
              </div>

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
                保存选择
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
