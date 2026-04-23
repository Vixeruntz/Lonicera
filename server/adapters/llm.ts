import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

import {
  ARK_CODING_PLAN_BASE_URL,
  ARK_CODING_PLAN_MODEL_ID,
  GEMINI_MODEL_IDS,
  ProviderCapability,
  ProviderId,
  ProviderModelId,
  ProviderModelOption,
} from '../../types';
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

export interface ArticleGenerationRequest {
  providerId: ProviderId;
  modelId: ProviderModelId;
  apiKey?: string;
}

export interface GeneratedArticleResult extends GeneratedArticle {
  modelId: ProviderModelId;
  providerId: ProviderId;
  providerLabel: string;
}

export interface LlmProviderService {
  getCapabilities(): ProviderCapability[];
  getDefaultProviderId(): ProviderId | null;
  generateArticle(
    request: ArticleGenerationRequest,
    input: ArticleGenerationInput,
    timeoutMs: number
  ): Promise<GeneratedArticleResult>;
}

interface ProviderInvocation {
  modelId: ProviderModelId;
  apiKey?: string;
}

interface LlmProviderAdapter {
  readonly capability: ProviderCapability;
  generateArticle(request: ProviderInvocation, input: ArticleGenerationInput): Promise<GeneratedArticleResult>;
}

const JSON_SHAPE = `{
  "title": "文章标题",
  "subtitle": "文章副标题",
  "author": "作者署名",
  "tags": ["标签1", "标签2"],
  "content": "Markdown 正文，必须包含多个以 ## 开头的章节标题"
}`;

const GEMINI_MODELS: ProviderModelOption[] = [
  {
    id: 'gemini-3-pro-preview',
    label: 'Gemini 3 Pro',
    description: '更强的推理与长文写作质量，适合高保真整理。',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    description: '更快的响应速度，适合更轻量的整理任务。',
  },
];

const ARK_MODELS: ProviderModelOption[] = [
  {
    id: 'ark-code-latest',
    label: 'ark-code-latest',
    description: '固定接入火山方舟 Coding Plan。',
  },
];

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
  provider: ProviderCapability,
  model: ProviderModelOption
): GeneratedArticleResult {
  const tags = parsed.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 6);
  return {
    ...parsed,
    subtitle: parsed.subtitle.trim(),
    tags: tags.length > 0 ? tags : ['深度阅读'],
    content: parsed.content.trim(),
    modelId: model.id,
    providerId: provider.id,
    providerLabel: provider.label,
  };
}

abstract class BaseProviderAdapter implements LlmProviderAdapter {
  constructor(
    public readonly capability: ProviderCapability,
    private readonly defaultApiKey?: string
  ) {}

  protected resolveModel(modelId: ProviderModelId) {
    const match = this.capability.models.find((candidate) => candidate.id === modelId);
    if (!match) {
      throw new AppError(
        400,
        'invalid_model',
        `${this.capability.label} 不支持模型 ${modelId}。`
      );
    }
    return match;
  }

  protected resolveApiKey(requestApiKey?: string) {
    const apiKey = requestApiKey?.trim() || this.defaultApiKey;
    if (!apiKey) {
      throw new AppError(
        400,
        'missing_api_key',
        `${this.capability.label} 缺少 API Key。请在设置中填写，或在服务端环境变量中配置默认密钥。`
      );
    }
    return apiKey;
  }

  abstract generateArticle(request: ProviderInvocation, input: ArticleGenerationInput): Promise<GeneratedArticleResult>;
}

class GeminiProviderAdapter extends BaseProviderAdapter {
  constructor(defaultApiKey?: string) {
    super(
      {
        id: 'gemini',
        label: 'Google Gemini',
        kind: 'gemini',
        defaultModelId: 'gemini-3-pro-preview',
        models: GEMINI_MODELS,
        enabled: true,
        description: 'Google Gemini 官方预设，只允许选择受控模型白名单。',
      },
      defaultApiKey
    );
  }

  async generateArticle(request: ProviderInvocation, input: ArticleGenerationInput): Promise<GeneratedArticleResult> {
    const model = this.resolveModel(request.modelId);
    const apiKey = this.resolveApiKey(request.apiKey);
    const client = new GoogleGenAI({ apiKey });

    const response = await client.models.generateContent({
      model: model.id,
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
    return normalizeGeneratedArticle(parsed, this.capability, model);
  }
}

class ArkCodingPlanProviderAdapter extends BaseProviderAdapter {
  constructor(defaultApiKey?: string) {
    super(
      {
        id: 'ark-coding-plan',
        label: '火山方舟 Coding Plan',
        kind: 'openai-compatible',
        defaultModelId: ARK_CODING_PLAN_MODEL_ID,
        models: ARK_MODELS,
        enabled: true,
        description: `固定接入 ${ARK_CODING_PLAN_BASE_URL}，不接受任意 Base URL。`,
      },
      defaultApiKey
    );
  }

  async generateArticle(request: ProviderInvocation, input: ArticleGenerationInput): Promise<GeneratedArticleResult> {
    const model = this.resolveModel(request.modelId);
    const apiKey = this.resolveApiKey(request.apiKey);
    const client = new OpenAI({
      apiKey,
      baseURL: ARK_CODING_PLAN_BASE_URL,
    });

    const response = await client.chat.completions.create({
      model: model.id,
      messages: [
        { role: 'system', content: buildSystemInstruction() },
        { role: 'user', content: buildPrompt(input) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new AppError(502, 'invalid_model_response', '方舟 Coding Plan 未返回正文。');
    }

    const parsed = generatedArticleSchema.parse(JSON.parse(extractJsonObject(raw)));
    return normalizeGeneratedArticle(parsed, this.capability, model);
  }
}

export class LlmProviderRegistry implements LlmProviderService {
  private readonly providers = new Map<ProviderId, LlmProviderAdapter>();

  constructor(config: { defaultApiKeys?: Partial<Record<ProviderId, string>>; logger: StructuredLogger }) {
    this.providers.set('gemini', new GeminiProviderAdapter(config.defaultApiKeys?.gemini));
    this.providers.set(
      'ark-coding-plan',
      new ArkCodingPlanProviderAdapter(config.defaultApiKeys?.['ark-coding-plan'])
    );

    config.logger.info('provider.registry.initialized', {
      providerIds: Array.from(this.providers.keys()),
      geminiModels: GEMINI_MODEL_IDS,
      arkModel: ARK_CODING_PLAN_MODEL_ID,
    });
  }

  getCapabilities() {
    return Array.from(this.providers.values()).map((provider) => provider.capability);
  }

  getDefaultProviderId() {
    return this.getCapabilities()[0]?.id ?? null;
  }

  async generateArticle(request: ArticleGenerationRequest, input: ArticleGenerationInput, timeoutMs: number) {
    const provider = this.providers.get(request.providerId);
    if (!provider) {
      throw new AppError(400, 'invalid_provider', `未知 provider: ${request.providerId}`);
    }

    return withTimeout(
      provider.generateArticle(
        {
          modelId: request.modelId,
          apiKey: request.apiKey,
        },
        input
      ),
      timeoutMs,
      `${provider.capability.label} article generation`
    );
  }
}
