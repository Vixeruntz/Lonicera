import { StructuredLogger } from './logger';
import { assertSafeRemoteUrl } from './utils/network';

const DEFAULT_ALLOWED_LLM_HOSTS = [
  'api.openai.com',
  'openrouter.ai',
  'ark.cn-beijing.volces.com',
  'api.moonshot.cn',
];

function readPositiveNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBooleanEnv(name: string, fallback = false) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function readStringEnv(name: string) {
  const raw = process.env[name]?.trim();
  return raw ? raw : undefined;
}

function readCsvEnv(name: string, fallback: string[]) {
  const raw = readStringEnv(name);
  if (!raw) return fallback;
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export interface AppConfig {
  port: number;
  cacheTtlHours: number;
  externalRequestTimeoutMs: number;
  articleGenerationTimeoutMs: number;
  geminiApiKey?: string;
  geminiModel: string;
  openAiCompat?: {
    id: string;
    label: string;
    description: string;
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  enableBilibili: boolean;
}

export function loadAppConfig(logger: StructuredLogger): AppConfig {
  const openAiCompatBaseUrl = readStringEnv('OPENAI_COMPAT_BASE_URL');
  const openAiCompatApiKey = readStringEnv('OPENAI_COMPAT_API_KEY');
  const openAiCompatModel = readStringEnv('OPENAI_COMPAT_MODEL');
  const openAiCompatLabel = readStringEnv('OPENAI_COMPAT_LABEL');
  const allowedHosts = readCsvEnv('OPENAI_COMPAT_ALLOWED_HOSTS', DEFAULT_ALLOWED_LLM_HOSTS);

  if (openAiCompatBaseUrl) {
    assertSafeRemoteUrl(openAiCompatBaseUrl, allowedHosts, 'OPENAI_COMPAT_BASE_URL');
  }

  return {
    port: readPositiveNumberEnv('PORT', 3000),
    cacheTtlHours: readPositiveNumberEnv('CACHE_TTL_HOURS', 24),
    externalRequestTimeoutMs: readPositiveNumberEnv('HTTP_TIMEOUT_MS', 10000),
    articleGenerationTimeoutMs: readPositiveNumberEnv('ARTICLE_REQUEST_TIMEOUT_MS', 45000),
    geminiApiKey: readStringEnv('GEMINI_API_KEY'),
    geminiModel: readStringEnv('GEMINI_MODEL') ?? 'gemini-2.5-pro',
    openAiCompat:
      openAiCompatBaseUrl && openAiCompatApiKey && openAiCompatModel
        ? {
            id: 'openai-compatible',
            label: openAiCompatLabel ?? 'OpenAI Compatible',
            description: `Server-managed provider via ${new URL(openAiCompatBaseUrl).hostname}`,
            apiKey: openAiCompatApiKey,
            baseUrl: openAiCompatBaseUrl,
            model: openAiCompatModel,
          }
        : undefined,
    enableBilibili: readBooleanEnv('ENABLE_BILIBILI', false),
  };
}
