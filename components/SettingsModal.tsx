import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, X } from 'lucide-react';
import { AISettings } from '../types';

interface SettingsModalProps {
  settings: AISettings;
  onSave: (settings: AISettings) => void;
  isReading?: boolean; // If true, we hide the static floating button and only show modal if triggered
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onSave, isReading = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<AISettings>(settings);
  const [selectedUiProvider, setSelectedUiProvider] = useState<string>('gemini');

  // Sync when prop changes
  useEffect(() => {
    setLocalSettings(settings);
    if (settings.provider === 'gemini') {
        setSelectedUiProvider('gemini');
    } else {
        if (settings.baseUrl?.includes('coding/v3')) setSelectedUiProvider('volcengine-codingplan');
        else if (settings.baseUrl?.includes('volces')) setSelectedUiProvider('volcengine');
        else if (settings.baseUrl?.includes('openrouter')) setSelectedUiProvider('openrouter');
        else setSelectedUiProvider('xiaomi');
    }
  }, [settings]);

  const providers = [
    { id: 'gemini', label: 'Google Gemini (默认配置)' },
    { id: 'volcengine-codingplan', label: '火山引擎 Coding Plan' },
    { id: 'volcengine', label: '火山引擎 (豆包通用大模型)' },
    { id: 'openrouter', label: 'OpenRouter' },
    { id: 'xiaomi', label: 'Xiaomi / Custom OpenAI' },
  ];

  const handleProviderChange = (id: string) => {
    setSelectedUiProvider(id);
    let newSettings = { ...localSettings, provider: id === 'gemini' ? 'gemini' : 'openai' } as AISettings;
    
    // Auto-fill common base URLs to help users
    if (id === 'volcengine-codingplan') {
      newSettings.baseUrl = 'https://ark.cn-beijing.volces.com/api/coding/v3';
      newSettings.modelName = 'ark-code-latest'; // Usually raw model name for coding plan
    } else if (id === 'volcengine') {
      newSettings.baseUrl = 'https://ark.cn-beijing.volces.com/api/v3';
      newSettings.modelName = 'ep-xxxxxxxxx-xxxxx'; // Placeholder
    } else if (id === 'openrouter') {
      newSettings.baseUrl = 'https://openrouter.ai/api/v1';
      newSettings.modelName = 'anthropic/claude-3-opus';
    } else if (id === 'xiaomi') {
      newSettings.baseUrl = 'https://api.moonshot.cn/v1'; // Defaulting to moonshot or let user change
      newSettings.modelName = 'moonshot-v1-128k';
    }
    setLocalSettings(newSettings);
  };

  const handleSave = () => {
    onSave(localSettings);
    setIsOpen(false);
  };

  return (
    <>
      {!isReading && (
          <button
            onClick={() => setIsOpen(true)}
            className="fixed top-6 right-20 z-50 p-2 rounded-full border border-stone-200/50 bg-paper/50 backdrop-blur-sm text-stone-500 hover:text-ink transition-all shadow-sm print:hidden"
            title="API Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/20 backdrop-blur-sm animate-fade-in">
          <div className="bg-paper w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-stone-200/50 animate-fade-in-up">
            <div className="flex justify-between items-center p-6 border-b border-stone-100">
              <h2 className="text-xl font-serif text-ink tracking-tight">API 模型配置</h2>
              <button onClick={() => setIsOpen(false)} className="text-stone-400 hover:text-ink transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">模型提供商</label>
                <select 
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  onChange={(e) => handleProviderChange(e.target.value)}
                  value={selectedUiProvider}
                >
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-stone-500">提示：默认使用全局 Gemini 服务。如需使用火山引擎或 OpenRouter 等服务，请选择对应的配置项并在下方填写 OpenAI 兼容格式的信息。</p>
              </div>

              {localSettings.provider === 'openai' && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">API Key</label>
                    <input 
                      type="password" 
                      value={localSettings.apiKey}
                      onChange={(e) => setLocalSettings({...localSettings, apiKey: e.target.value})}
                      placeholder="sk-..."
                      className="w-full bg-transparent border border-stone-200 rounded-lg px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-stone-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">Base URL</label>
                    <input 
                      type="text" 
                      value={localSettings.baseUrl}
                      onChange={(e) => setLocalSettings({...localSettings, baseUrl: e.target.value})}
                      placeholder="https://api.openai.com/v1"
                      className="w-full bg-transparent border border-stone-200 rounded-lg px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-stone-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">模型名称 (Model Name)</label>
                    <input 
                      type="text" 
                      value={localSettings.modelName}
                      onChange={(e) => setLocalSettings({...localSettings, modelName: e.target.value})}
                      placeholder="gpt-4o-mini, ep-..., moonshot-v1"
                      className="w-full bg-transparent border border-stone-200 rounded-lg px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 placeholder:text-stone-300 font-mono"
                    />
                    {selectedUiProvider === 'volcengine' && (
                        <p className="mt-1 text-xs text-rose-500 font-medium">注意：火山引擎 (豆包通用模型) 请务必填写以 `ep-` 开头的「接入点 ID」。</p>
                    )}
                    {selectedUiProvider === 'volcengine-codingplan' && (
                        <p className="mt-1 text-xs text-emerald-600 font-medium">注意：在 Coding Plan 下，模型名一般直接填写 `ark-code-latest` 即可。</p>
                    )}
                  </div>
                </div>
              )}
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
                className="px-6 py-2 rounded-lg text-sm font-medium bg-ink text-paper hover:bg-ink/90 transition-colors shadow-sm"
              >
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
