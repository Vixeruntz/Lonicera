export enum LoadingState {
  IDLE = 'IDLE',
  SEARCHING = 'SEARCHING',
  ANALYZING = 'ANALYZING',
  OUTLINING = 'OUTLINING',
  DRAFTING = 'DRAFTING',
  STREAMING = 'STREAMING',
  POLISHING = 'POLISHING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface ArticleData {
  title: string;
  subtitle: string;
  author: string;
  content: string;
  estimatedReadingTime: number;
  tags: string[];
  coverImageUrl?: string;
  sourceUrl: string;
}

export interface ProcessingLog {
  stage: LoadingState;
  message: string;
}

export const VIDEO_SOURCE_IDS = ['youtube'] as const;
export type VideoSourceId = (typeof VIDEO_SOURCE_IDS)[number];

export const PROVIDER_IDS = ['gemini', 'ark-coding-plan'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export type ProviderKind = 'gemini' | 'openai-compatible';

export const GEMINI_MODEL_IDS = ['gemini-3-pro-preview', 'gemini-3-flash-preview'] as const;
export const ARK_CODING_PLAN_MODEL_ID = 'ark-code-latest' as const;
export const PROVIDER_MODEL_IDS = [...GEMINI_MODEL_IDS, ARK_CODING_PLAN_MODEL_ID] as const;
export type ProviderModelId = (typeof PROVIDER_MODEL_IDS)[number];

export const ARK_CODING_PLAN_BASE_URL = 'https://ark.cn-beijing.volces.com/api/coding/v3';

export interface SourceCapability {
  id: VideoSourceId;
  label: string;
  enabled: boolean;
  reason?: string;
}

export interface ProviderModelOption {
  id: ProviderModelId;
  label: string;
  description?: string;
}

export interface ProviderCapability {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  defaultModelId: ProviderModelId;
  models: ProviderModelOption[];
  enabled: boolean;
  description?: string;
}

export interface AppCapabilities {
  sources: SourceCapability[];
  providers: ProviderCapability[];
  defaultProviderId: ProviderId | null;
  cacheTtlHours: number;
}

export interface ArticleResponseMeta {
  sourceId: VideoSourceId;
  providerId: ProviderId;
  providerLabel: string;
  modelId: ProviderModelId;
  cacheKey: string;
  cached: boolean;
  createdAt: number;
  expiresAt: number;
  canonicalUrl: string;
}

export interface AnalyzeArticleResponse {
  article: ArticleData;
  meta: ArticleResponseMeta;
}

export type SelectedModelByProvider = Partial<Record<ProviderId, ProviderModelId>>;
export type StoredProviderApiKeys = Partial<Record<ProviderId, string>>;
