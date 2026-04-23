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

export type VideoSourceId = 'youtube' | 'bilibili';
export type ProviderKind = 'gemini' | 'openai-compatible';

export interface SourceCapability {
  id: VideoSourceId;
  label: string;
  enabled: boolean;
  reason?: string;
}

export interface ProviderCapability {
  id: string;
  label: string;
  kind: ProviderKind;
  model: string;
  enabled: boolean;
  description?: string;
}

export interface AppCapabilities {
  sources: SourceCapability[];
  providers: ProviderCapability[];
  defaultProviderId: string | null;
  cacheTtlHours: number;
}

export interface ArticleResponseMeta {
  sourceId: VideoSourceId;
  providerId: string;
  providerLabel: string;
  modelId: string;
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
