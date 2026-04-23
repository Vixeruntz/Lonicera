import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';

import httpMocks from 'node-mocks-http';

import { createApp, PipelineService } from '../../server.ts';
import { createLogger } from '../../server/logger';

function createFakePipeline(): PipelineService {
  return {
    getCapabilities() {
      return {
        sources: [
          { id: 'youtube', label: 'YouTube', enabled: true },
        ],
        providers: [
          {
            id: 'gemini',
            label: 'Google Gemini',
            kind: 'gemini',
            defaultModelId: 'gemini-3-pro-preview',
            models: [
              { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
              { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
            ],
            enabled: true,
          },
          {
            id: 'ark-coding-plan',
            label: '火山方舟 Coding Plan',
            kind: 'openai-compatible',
            defaultModelId: 'ark-code-latest',
            models: [{ id: 'ark-code-latest', label: 'ark-code-latest' }],
            enabled: true,
          },
        ],
        defaultProviderId: 'gemini',
        cacheTtlHours: 24,
      };
    },
    async generateArticle({ videoUrl, providerId, modelId }) {
      return {
        article: {
          title: '测试文章',
          subtitle: '副标题',
          author: '测试作者',
          tags: ['测试'],
          content: '## 第一章\n\n' + '内容'.repeat(120),
          estimatedReadingTime: 3,
          sourceUrl: videoUrl,
        },
        meta: {
          sourceId: 'youtube',
          providerId: providerId ?? 'gemini',
          providerLabel: providerId === 'ark-coding-plan' ? '火山方舟 Coding Plan' : 'Google Gemini',
          modelId,
          cacheKey: 'cache-key',
          cached: false,
          createdAt: Date.now(),
          expiresAt: Date.now() + 1000,
          canonicalUrl: videoUrl,
        },
      };
    },
  };
}

async function performRequest(
  app: ReturnType<typeof createApp>,
  options: {
    method: 'GET' | 'POST';
    url: string;
    body?: unknown;
  }
) {
  const request = httpMocks.createRequest({
    method: options.method,
    url: options.url,
    body: options.body,
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
  });

  const response = httpMocks.createResponse({
    eventEmitter: EventEmitter,
  });

  await new Promise<void>((resolve, reject) => {
    response.on('end', resolve);
    response.on('error', reject);
    app.handle(request, response);
  });

  return {
    status: response.statusCode,
    body: response._isJSON() ? response._getJSONData() : response._getData(),
  };
}

test('GET /api/capabilities returns backend-managed capabilities', async () => {
  const app = createApp({
    pipeline: createFakePipeline(),
    logger: createLogger(),
  });

  const response = await performRequest(app, {
    method: 'GET',
    url: '/api/capabilities',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.defaultProviderId, 'gemini');
  assert.equal(response.body.sources[0].id, 'youtube');
  assert.equal(response.body.providers[0].models.length, 2);
});

test('POST /api/articles rejects unexpected client-controlled cache payloads', async () => {
  let wasCalled = false;
  const pipeline = createFakePipeline();
  const app = createApp({
    pipeline: {
      ...pipeline,
      async generateArticle(input) {
        wasCalled = true;
        return pipeline.generateArticle(input);
      },
    },
    logger: createLogger(),
  });

  const response = await performRequest(app, {
    method: 'POST',
    url: '/api/articles',
    body: {
      videoUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
      providerId: 'gemini',
      modelId: 'gemini-3-pro-preview',
      cacheData: {
        title: 'malicious overwrite',
      },
    },
  });

  assert.equal(response.status, 400);
  assert.equal(wasCalled, false);
});

test('POST /api/articles rejects missing or invalid model selection', async () => {
  const app = createApp({
    pipeline: createFakePipeline(),
    logger: createLogger(),
  });

  const missingModelResponse = await performRequest(app, {
    method: 'POST',
    url: '/api/articles',
    body: {
      videoUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
      providerId: 'gemini',
    },
  });

  const invalidModelResponse = await performRequest(app, {
    method: 'POST',
    url: '/api/articles',
    body: {
      videoUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
      providerId: 'ark-coding-plan',
      modelId: 'gemini-3-pro-preview',
    },
  });

  assert.equal(missingModelResponse.status, 400);
  assert.equal(invalidModelResponse.status, 400);
});

test('POST /api/cache is no longer a public write surface', async () => {
  const app = createApp({
    pipeline: createFakePipeline(),
    logger: createLogger(),
  });

  const response = await performRequest(app, {
    method: 'POST',
    url: '/api/cache',
    body: {
      cacheData: { title: 'unexpected' },
    },
  });

  assert.equal(response.status, 404);
});
