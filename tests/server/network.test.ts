import assert from 'node:assert/strict';
import test from 'node:test';

import { VideoSourceRegistry, extractYouTubeVideoId } from '../../server/adapters/video';
import { AppError } from '../../server/errors';
import { assertSafeRemoteUrl } from '../../server/utils/network';

test('extractYouTubeVideoId handles common YouTube URL shapes', () => {
  assert.equal(
    extractYouTubeVideoId(new URL('https://www.youtube.com/watch?v=UF8uR6Z6KLc')),
    'UF8uR6Z6KLc'
  );
  assert.equal(
    extractYouTubeVideoId(new URL('https://youtu.be/zbj3D0rNq2s?t=10')),
    'zbj3D0rNq2s'
  );
  assert.equal(
    extractYouTubeVideoId(new URL('https://www.youtube.com/shorts/UF8uR6Z6KLc')),
    'UF8uR6Z6KLc'
  );
});

test('VideoSourceRegistry rejects bilibili URLs explicitly', async () => {
  const registry = new VideoSourceRegistry({
    timeoutMs: 2000,
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });

  await assert.rejects(
    () => registry.extractFromUrl('https://www.bilibili.com/video/BV1xx411c7mD/'),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === 'unsupported_video_url' &&
      error.message.includes('YouTube')
  );
});

test('assertSafeRemoteUrl accepts allowlisted public hosts', () => {
  const url = assertSafeRemoteUrl('https://openrouter.ai/api/v1', ['openrouter.ai']);
  assert.equal(url.hostname, 'openrouter.ai');
});

test('assertSafeRemoteUrl rejects localhost and private IPs', () => {
  assert.throws(
    () => assertSafeRemoteUrl('https://localhost:3000/v1', ['localhost']),
    /private or local/i
  );
  assert.throws(
    () => assertSafeRemoteUrl('https://192.168.0.10/v1', ['192.168.0.10']),
    /private or local/i
  );
});
