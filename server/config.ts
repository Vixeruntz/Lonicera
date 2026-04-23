import { ARK_CODING_PLAN_BASE_URL } from '../types';
import { StructuredLogger } from './logger';
import { assertSafeRemoteUrl } from './utils/network';

const ARK_ALLOWED_HOSTS = ['ark.cn-beijing.volces.com'];

function readPositiveNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readStringEnv(name: string) {
  const raw = process.env[name]?.trim();
  return raw ? raw : undefined;
}

export interface AppConfig {
  port: number;
  cacheTtlHours: number;
  externalRequestTimeoutMs: number;
  articleGenerationTimeoutMs: number;
  geminiApiKey?: string;
  arkCodingPlanApiKey?: string;
}

export function loadAppConfig(_logger: StructuredLogger): AppConfig {
  assertSafeRemoteUrl(ARK_CODING_PLAN_BASE_URL, ARK_ALLOWED_HOSTS, 'ARK_CODING_PLAN_BASE_URL');

  return {
    port: readPositiveNumberEnv('PORT', 3000),
    cacheTtlHours: readPositiveNumberEnv('CACHE_TTL_HOURS', 24),
    externalRequestTimeoutMs: readPositiveNumberEnv('HTTP_TIMEOUT_MS', 10000),
    articleGenerationTimeoutMs: readPositiveNumberEnv('ARTICLE_REQUEST_TIMEOUT_MS', 45000),
    geminiApiKey: readStringEnv('GEMINI_API_KEY'),
    arkCodingPlanApiKey: readStringEnv('ARK_CODING_PLAN_API_KEY'),
  };
}
