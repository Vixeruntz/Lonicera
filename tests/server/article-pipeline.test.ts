import assert from 'node:assert/strict';
import test from 'node:test';

import { ArticlePipeline } from '../../server/services/article-pipeline';
import { InMemoryArticleCacheStore } from '../../server/services/cache-store';

const noopLogger = {
  info() {},
  warn() {},
  error() {},
};

test('ArticlePipeline deduplicates concurrent work and serves cached results afterwards', async () => {
  let providerCalls = 0;

  const pipeline = new ArticlePipeline({
    cacheStore: new InMemoryArticleCacheStore(),
    cacheTtlHours: 24,
    videoSources: {
      getCapabilities() {
        return [{ id: 'youtube', label: 'YouTube', enabled: true }];
      },
      async extractFromUrl() {
        return {
          sourceId: 'youtube' as const,
          canonicalUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
          displayUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
          transcript: '这是一段足够长的测试字幕。'.repeat(40),
          title: '测试标题',
          author: '测试作者',
        };
      },
    },
    providers: {
      getCapabilities() {
        return [
          {
            id: 'gemini',
            label: 'Gemini',
            kind: 'gemini' as const,
            model: 'gemini-test',
            enabled: true,
          },
        ];
      },
      getDefaultProviderId() {
        return 'gemini';
      },
      async generateArticle() {
        providerCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          title: '测试文章',
          subtitle: '副标题',
          author: '测试作者',
          tags: ['测试'],
          content: '## 第一章\n\n' + '内容'.repeat(140),
          providerId: 'gemini',
          providerLabel: 'Gemini',
          modelId: 'gemini-test',
        };
      },
    },
    logger: noopLogger,
    articleGenerationTimeoutMs: 5000,
  });

  const [first, second] = await Promise.all([
    pipeline.generateArticle({
      videoUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
      requestId: 'request-1',
    }),
    pipeline.generateArticle({
      videoUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
      requestId: 'request-2',
    }),
  ]);

  assert.equal(providerCalls, 1);
  assert.equal(first.meta.cached, false);
  assert.equal(second.meta.cached, false);

  const third = await pipeline.generateArticle({
    videoUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
    requestId: 'request-3',
  });

  assert.equal(providerCalls, 1);
  assert.equal(third.meta.cached, true);
  assert.equal(third.article.title, '测试文章');
});
