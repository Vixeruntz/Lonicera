import { expect, test } from '@playwright/test';

const capabilitiesPayload = {
  sources: [
    { id: 'youtube', label: 'YouTube', enabled: true },
    { id: 'bilibili', label: 'Bilibili', enabled: false, reason: 'disabled in e2e' },
  ],
  providers: [
    {
      id: 'gemini',
      label: 'Gemini',
      kind: 'gemini',
      model: 'gemini-test',
      enabled: true,
    },
  ],
  defaultProviderId: 'gemini',
  cacheTtlHours: 24,
};

test('share link reproduces the current article state', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.route('**/api/capabilities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(capabilitiesPayload),
    });
  });

  await page.route('**/api/articles', async (route) => {
    const request = route.request();
    const payload = JSON.parse(request.postData() ?? '{}');
    const canonicalUrl = payload.videoUrl ?? 'https://www.youtube.com/watch?v=UF8uR6Z6KLc';

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        article: {
          title: '链接复现测试',
          subtitle: '分享链接应能回到同一篇文章',
          author: '测试作者',
          tags: ['测试'],
          content: '## 第一章\n\n这是一段用于 E2E 验证的正文。'.repeat(20),
          estimatedReadingTime: 4,
          sourceUrl: canonicalUrl,
        },
        meta: {
          sourceId: 'youtube',
          providerId: payload.providerId ?? 'gemini',
          providerLabel: 'Gemini',
          modelId: 'gemini-test',
          cacheKey: 'e2e-cache',
          cached: false,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
          canonicalUrl,
        },
      }),
    });
  });

  await page.goto('/');
  await page.getByPlaceholder('Paste a supported video link...').fill('https://www.youtube.com/watch?v=UF8uR6Z6KLc');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: '链接复现测试' })).toBeVisible();

  await page.getByRole('button', { name: /share/i }).click();
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());

  expect(sharedUrl).toContain('video=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DUF8uR6Z6KLc');
  expect(sharedUrl).toContain('provider=gemini');

  await page.goto(sharedUrl);
  await expect(page.getByRole('heading', { name: '链接复现测试' })).toBeVisible();
});
