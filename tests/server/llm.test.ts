import assert from 'node:assert/strict';
import test from 'node:test';

import { LlmProviderRegistry } from '../../server/adapters/llm';
import { AppError } from '../../server/errors';

const noopLogger = {
  info() {},
  warn() {},
  error() {},
};

test('LlmProviderRegistry exposes fixed provider capabilities', () => {
  const registry = new LlmProviderRegistry({
    defaultApiKeys: {},
    logger: noopLogger,
  });

  const capabilities = registry.getCapabilities();
  assert.deepEqual(
    capabilities.map((provider) => provider.id),
    ['gemini', 'ark-coding-plan']
  );
  assert.deepEqual(
    capabilities.find((provider) => provider.id === 'gemini')?.models.map((model) => model.id),
    ['gemini-3-pro-preview', 'gemini-3-flash-preview']
  );
  assert.deepEqual(
    capabilities.find((provider) => provider.id === 'ark-coding-plan')?.models.map((model) => model.id),
    ['ark-code-latest']
  );
});

test('LlmProviderRegistry rejects unsupported model selections before remote calls', async () => {
  const registry = new LlmProviderRegistry({
    defaultApiKeys: {},
    logger: noopLogger,
  });

  await assert.rejects(
    () =>
      registry.generateArticle(
        {
          providerId: 'ark-coding-plan',
          modelId: 'gemini-3-pro-preview',
          apiKey: 'test-key',
        },
        {
          canonicalUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
          sourceLabel: 'YouTube',
          transcript: '测试字幕'.repeat(80),
        },
        1000
      ),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === 'invalid_model' &&
      error.message.includes('不支持模型')
  );
});

test('missing api keys fail early before provider calls', async () => {
  const registry = new LlmProviderRegistry({
    defaultApiKeys: {
      gemini: '',
      'ark-coding-plan': '',
    },
    logger: noopLogger,
  });

  await assert.rejects(
    () =>
      registry.generateArticle(
        {
          providerId: 'gemini',
          modelId: 'gemini-3-pro-preview',
        },
        {
          canonicalUrl: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
          sourceLabel: 'YouTube',
          transcript: '测试字幕'.repeat(80),
        },
        1000
      ),
    (error: unknown) => error instanceof AppError && error.code === 'missing_api_key'
  );
});
