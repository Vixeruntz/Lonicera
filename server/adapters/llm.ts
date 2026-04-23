import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

import { ProviderCapability } from '../../types';
import { AppError } from '../errors';
import { StructuredLogger } from '../logger';
import { GeneratedArticle, generatedArticleSchema } from '../schemas';
import { withTimeout } from '../utils/timeout';

export interface ArticleGenerationInput {
  canonicalUrl: string;
  sourceLabel: string;
  sourceTitle?: string;
  sourceAuthor?: string;
  transcript: string;
}

export interface GeneratedArticleResult extends GeneratedArticle {
  modelId: string;
  providerId: string;
  providerLabel: string;
}

export interface LlmProviderService {
  getCapabilities(): ProviderCapability[];
  getDefaultProviderId(): string | null;
  generateArticle(
    providerId: string | undefined,
    input: ArticleGenerationInput,
    timeoutMs: number
  ): Promise<GeneratedArticleResult>;
}

interface LlmProviderAdapter {
  readonly capability: ProviderCapability;
  generateArticle(input: ArticleGenerationInput): Promise<GeneratedArticleResult>;
}

const JSON_SHAPE = `{
  "title": "文章标题",
  "subtitle": "文章副标题",
  "author": "作者署名",
  "tags": ["标签1", "标签2"],
  "content": "Markdown 正文，必须包含多个以 ## 开头的章节标题"
}`;

function buildPrompt(input: ArticleGenerationInput) {
  return [
    `Source platform: ${input.sourceLabel}`,
    `Video URL: ${input.canonicalUrl}`,
    input.sourceTitle ? `Video title: ${input.sourceTitle}` : null,
    input.sourceAuthor ? `Video author: ${input.sourceAuthor}` : null,
    '',
    'Transcript:',
    input.transcript,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSystemInstruction() {
  return [
    '你是一位谨慎的中文长文编辑，负责把视频字幕改写成一篇忠于原始内容的深度文章。',
    '硬性规则：',
    '1. 只能使用提供的字幕和元数据，不能补写未被字幕支持的事实。',
    '2. 如果信息存在模糊处，请明确写出“不确定”或“字幕未交代”，不要脑补。',
    '3. 输出必须是 JSON，且严格符合给定结构。',
    '4. content 必须是 Markdown，正文使用自然段和 3-5 个以 ## 开头的章节标题。',
    '5. 不要输出代码块、解释性前后缀或道歉文本。',
    `输出 JSON 结构：${JSON_SHAPE}`,
  ].join('\n');
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  const direct = trimmed.match(/\{[\s\S]*\}/);
  if (!direct) {
    throw new AppError(502, 'invalid_model_response', '模型没有返回可解析的 JSON 对象。');
  }
  return direct[0];
}

function normalizeGeneratedArticle(
  parsed: GeneratedArticle,
  provider: ProviderCapability
): GeneratedArticleResult {
  const tags = parsed.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 6);
  return {
    ...parsed,
    subtitle: parsed.subtitle.trim(),
    tags: tags.length > 0 ? tags : ['深度阅读'],
    content: parsed.content.trim(),
    modelId: provider.model,
    providerId: provider.id,
    providerLabel: provider.label,
  };
}

class GeminiProviderAdapter implements LlmProviderAdapter {
  public readonly capability: ProviderCapability;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, model: string) {
    this.capability = {
      id: 'gemini',
      label: 'Gemini',
      kind: 'gemini',
      model,
      enabled: true,
      description: 'Server-managed Gemini provider',
    };
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateArticle(input: ArticleGenerationInput): Promise<GeneratedArticleResult> {
    const response = await this.client.models.generateContent({
      model: this.capability.model,
      contents: buildPrompt(input),
      config: {
        systemInstruction: buildSystemInstruction(),
        responseMimeType: 'application/json',
        temperature: 0.4,
      },
    });

    const raw = response.text?.trim();
    if (!raw) {
      throw new AppError(502, 'invalid_model_response', 'Gemini 未返回正文。');
    }

    const parsed = generatedArticleSchema.parse(JSON.parse(extractJsonObject(raw)));
    return normalizeGeneratedArticle(parsed, this.capability);
  }
}

class OpenAiCompatibleProviderAdapter implements LlmProviderAdapter {
  public readonly capability: ProviderCapability;
  private readonly client: OpenAI;

  constructor(config: { id: string; label: string; description: string; apiKey: string; baseUrl: string; model: string }) {
    this.capability = {
      id: config.id,
      label: config.label,
      kind: 'openai-compatible',
      model: config.model,
      enabled: true,
      description: config.description,
    };
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async generateArticle(input: ArticleGenerationInput): Promise<GeneratedArticleResult> {
    const response = await this.client.chat.completions.create({
      model: this.capability.model,
      messages: [
        { role: 'system', content: buildSystemInstruction() },
        { role: 'user', content: buildPrompt(input) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new AppError(502, 'invalid_model_response', 'OpenAI-compatible provider 未返回正文。');
    }

    const parsed = generatedArticleSchema.parse(JSON.parse(extractJsonObject(raw)));
    return normalizeGeneratedArticle(parsed, this.capability);
  }
}

export class LlmProviderRegistry implements LlmProviderService {
  private readonly providers = new Map<string, LlmProviderAdapter>();

  constructor(
    config: {
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
      requestTimeoutMs: number;
      logger: StructuredLogger;
    }
  ) {
    if (config.geminiApiKey) {
      this.providers.set('gemini', new GeminiProviderAdapter(config.geminiApiKey, config.geminiModel));
    } else {
      config.logger.warn('provider.gemini.disabled', { reason: 'GEMINI_API_KEY is not configured' });
    }

    if (config.openAiCompat) {
      this.providers.set(
        config.openAiCompat.id,
        new OpenAiCompatibleProviderAdapter(config.openAiCompat)
      );
    }
  }

  getCapabilities() {
    return Array.from(this.providers.values()).map((provider) => provider.capability);
  }

  getDefaultProviderId() {
    return this.getCapabilities()[0]?.id ?? null;
  }

  async generateArticle(providerId: string | undefined, input: ArticleGenerationInput, timeoutMs: number) {
    const provider = providerId
      ? this.providers.get(providerId)
      : this.providers.values().next().value;

    if (!provider) {
      throw new AppError(503, 'provider_unavailable', '服务器未配置任何可用的文章生成模型。');
    }

    return withTimeout(provider.generateArticle(input), timeoutMs, `${provider.capability.label} article generation`);
  }
}
