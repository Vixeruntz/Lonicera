import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeArticleRequestSchema } from '../../server/schemas';

test('analyzeArticleRequestSchema accepts fixed provider and model selections', () => {
  const parsed = analyzeArticleRequestSchema.parse({
    videoUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
    providerId: 'gemini',
    modelId: 'gemini-3-pro-preview',
    apiKey: 'test-key',
  });

  assert.equal(parsed.providerId, 'gemini');
  assert.equal(parsed.modelId, 'gemini-3-pro-preview');
});

test('analyzeArticleRequestSchema rejects arbitrary baseUrl/model/cache payloads', () => {
  assert.throws(
    () =>
      analyzeArticleRequestSchema.parse({
        videoUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
        providerId: 'gemini',
        modelId: 'gemini-3-pro-preview',
        baseUrl: 'https://localhost:3000/v1',
      }),
    /unrecognized_keys/i
  );

  assert.throws(
    () =>
      analyzeArticleRequestSchema.parse({
        videoUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
        providerId: 'gemini',
        modelId: 'ark-code-latest',
        cacheData: { injected: true },
      }),
    /Gemini provider does not support/i
  );
});
