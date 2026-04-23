import crypto from 'crypto';

import { AnalyzeArticleResponse, ArticleData, ProviderId, ProviderModelId } from '../../types';
import { ArticleGenerationRequest, LlmProviderService } from '../adapters/llm';
import { VideoSourceService } from '../adapters/video';
import { StructuredLogger } from '../logger';
import { ArticleRecord } from '../schemas';
import { ArticleCacheStore } from './cache-store';

function estimateReadingTime(content: string) {
  return Math.max(1, Math.ceil(content.length / 450));
}

function buildCacheKey(providerId: ProviderId, modelId: ProviderModelId, canonicalUrl: string) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ version: 4, providerId, modelId, canonicalUrl }))
    .digest('hex');
}

function isFresh(record: ArticleRecord) {
  return record.expiresAt > Date.now();
}

export class ArticlePipeline {
  private readonly inflightGenerations = new Map<string, Promise<AnalyzeArticleResponse>>();

  constructor(
    private readonly dependencies: {
      cacheStore: ArticleCacheStore;
      cacheTtlHours: number;
      videoSources: VideoSourceService;
      providers: LlmProviderService;
      logger: StructuredLogger;
      articleGenerationTimeoutMs: number;
    }
  ) {}

  getCapabilities() {
    return {
      sources: this.dependencies.videoSources.getCapabilities(),
      providers: this.dependencies.providers.getCapabilities(),
      defaultProviderId: this.dependencies.providers.getDefaultProviderId(),
      cacheTtlHours: this.dependencies.cacheTtlHours,
    };
  }

  async generateArticle(input: {
    videoUrl: string;
    providerId: ProviderId;
    modelId: ProviderModelId;
    apiKey?: string;
    requestId: string;
  }) {
    const extractedVideo = await this.dependencies.videoSources.extractFromUrl(input.videoUrl);
    const generationRequest: ArticleGenerationRequest = {
      providerId: input.providerId,
      modelId: input.modelId,
      apiKey: input.apiKey,
    };
    const cacheKey = buildCacheKey(
      generationRequest.providerId,
      generationRequest.modelId,
      extractedVideo.canonicalUrl
    );
    const cachedRecord = await this.dependencies.cacheStore.get(cacheKey);
    if (cachedRecord && isFresh(cachedRecord)) {
      this.dependencies.logger.info('article.cache.hit', {
        requestId: input.requestId,
        cacheKey,
        providerId: generationRequest.providerId,
        modelId: generationRequest.modelId,
      });
      return this.toResponse(cachedRecord, true);
    }

    const inflight = this.inflightGenerations.get(cacheKey);
    if (inflight) {
      this.dependencies.logger.info('article.cache.deduplicated', {
        requestId: input.requestId,
        cacheKey,
        providerId: generationRequest.providerId,
        modelId: generationRequest.modelId,
      });
      return inflight;
    }

    const generationPromise = this.generateAndCache({
      requestId: input.requestId,
      generationRequest,
      cacheKey,
      extractedVideo,
    }).finally(() => {
      this.inflightGenerations.delete(cacheKey);
    });

    this.inflightGenerations.set(cacheKey, generationPromise);
    return generationPromise;
  }

  private async generateAndCache(input: {
    requestId: string;
    generationRequest: ArticleGenerationRequest;
    cacheKey: string;
    extractedVideo: Awaited<ReturnType<VideoSourceService['extractFromUrl']>>;
  }) {
    const generated = await this.dependencies.providers.generateArticle(
      input.generationRequest,
      {
        canonicalUrl: input.extractedVideo.canonicalUrl,
        sourceLabel: 'YouTube',
        sourceTitle: input.extractedVideo.title,
        sourceAuthor: input.extractedVideo.author,
        transcript: input.extractedVideo.transcript,
      },
      this.dependencies.articleGenerationTimeoutMs
    );

    const now = Date.now();
    const record: ArticleRecord = {
      title: generated.title,
      subtitle: generated.subtitle,
      author: generated.author,
      tags: generated.tags,
      content: generated.content,
      coverImageUrl: generated.coverImageUrl,
      sourceUrl: input.extractedVideo.canonicalUrl,
      estimatedReadingTime: estimateReadingTime(generated.content),
      cacheKey: input.cacheKey,
      sourceId: input.extractedVideo.sourceId,
      providerId: generated.providerId,
      providerLabel: generated.providerLabel,
      modelId: generated.modelId,
      createdAt: now,
      expiresAt: now + this.dependencies.cacheTtlHours * 60 * 60 * 1000,
    };

    await this.dependencies.cacheStore.set(record);
    this.dependencies.logger.info('article.generated', {
      requestId: input.requestId,
      cacheKey: input.cacheKey,
      providerId: generated.providerId,
      modelId: generated.modelId,
      sourceId: input.extractedVideo.sourceId,
    });
    return this.toResponse(record, false);
  }

  private toResponse(record: ArticleRecord, cached: boolean): AnalyzeArticleResponse {
    const article: ArticleData = {
      title: record.title,
      subtitle: record.subtitle,
      author: record.author,
      tags: record.tags,
      content: record.content,
      coverImageUrl: record.coverImageUrl,
      estimatedReadingTime: record.estimatedReadingTime,
      sourceUrl: record.sourceUrl,
    };

    return {
      article,
      meta: {
        sourceId: record.sourceId,
        providerId: record.providerId,
        providerLabel: record.providerLabel,
        modelId: record.modelId,
        cacheKey: record.cacheKey,
        cached,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        canonicalUrl: record.sourceUrl,
      },
    };
  }
}
