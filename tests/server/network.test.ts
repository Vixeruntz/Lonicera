import assert from 'node:assert/strict';
import test from 'node:test';

import { extractBilibiliVideoId, extractYouTubeVideoId } from '../../server/adapters/video';
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

test('extractBilibiliVideoId handles BV and av identifiers', () => {
  assert.equal(
    extractBilibiliVideoId(new URL('https://www.bilibili.com/video/BV1xx411c7mD/')),
    'BV1xx411c7mD'
  );
  assert.equal(
    extractBilibiliVideoId(new URL('https://www.bilibili.com/video/av170001')),
    'av170001'
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
