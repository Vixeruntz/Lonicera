export enum LoadingState {
  IDLE = 'IDLE',
  SEARCHING = 'SEARCHING',
  ANALYZING = 'ANALYZING',
  OUTLINING = 'OUTLINING',
  DRAFTING = 'DRAFTING',
  STREAMING = 'STREAMING', // New state for realtime typing
  POLISHING = 'POLISHING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface ArticleData {
  title: string;
  subtitle: string;
  author: string; // The original video creator or an AI persona
  content: string; // HTML or Markdown string
  estimatedReadingTime: number;
  tags: string[];
  coverImagePrompts?: string;
  coverImageUrl?: string;
  sourceUrl: string;
}

export interface ProcessingLog {
  stage: LoadingState;
  message: string;
}

export interface AISettings {
  provider: 'gemini' | 'openai';
  apiKey: string;
  baseUrl: string;
  modelName: string;
}