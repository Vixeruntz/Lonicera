import { expect, test } from '@playwright/test';

const capabilitiesPayload = {
  sources: [{ id: 'youtube', label: 'YouTube', enabled: true }],
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

test('settings persist provider/model/apiKey choices and share link reproduces the current article state', async ({
  page,
  context,
}) => {
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

    expect(payload.providerId).toBe('gemini');
    expect(payload.modelId).toBe('gemini-3-flash-preview');
    expect(payload.apiKey).toBe('gemini-local-key');
    expect(payload.baseUrl).toBeUndefined();
    expect(payload.messages).toBeUndefined();

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
          providerId: 'gemini',
          providerLabel: 'Google Gemini',
          modelId: 'gemini-3-flash-preview',
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

  await page.getByTitle('Provider Settings').click();
  await page.getByRole('button', { name: /火山方舟 Coding Plan/ }).click();
  await expect(page.getByText('https://ark.cn-beijing.volces.com/api/coding/v3')).toBeVisible();
  await page.getByPlaceholder('Paste your 火山方舟 Coding Plan API Key').fill('ark-local-key');

  const geminiSection = page.locator('section').filter({ hasText: 'Google Gemini' });
  await geminiSection.getByRole('button', { name: /Google Gemini/ }).click();
  await geminiSection.getByRole('combobox').selectOption('gemini-3-flash-preview');
  await page.getByPlaceholder('Paste your Google Gemini API Key').fill('gemini-local-key');
  await page.getByRole('button', { name: '保存设置' }).click();

  await expect.poll(async () => {
    const state = await page.evaluate(() => ({
      selectedProviderId: localStorage.getItem('selected_provider_id'),
      selectedModelByProvider: JSON.parse(localStorage.getItem('selected_model_by_provider') || '{}'),
      providerApiKeys: JSON.parse(localStorage.getItem('provider_api_keys') || '{}'),
    }));
    return state;
  }).toEqual({
    selectedProviderId: 'gemini',
    selectedModelByProvider: {
      gemini: 'gemini-3-flash-preview',
      'ark-coding-plan': 'ark-code-latest',
    },
    providerApiKeys: {
      'ark-coding-plan': 'ark-local-key',
      gemini: 'gemini-local-key',
    },
  });

  await page.getByPlaceholder('Paste a YouTube link...').fill('https://www.youtube.com/watch?v=UF8uR6Z6KLc');
  const articleResponsePromise = page.waitForResponse('**/api/articles');
  await page.locator('form button[type="submit"]').click();
  await articleResponsePromise;

  await expect(page.getByRole('heading', { name: '链接复现测试' })).toBeVisible();

  await page.getByRole('button', { name: /share/i }).click();
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());

  expect(sharedUrl).toContain('video=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DUF8uR6Z6KLc');
  expect(sharedUrl).toContain('provider=gemini');
  expect(sharedUrl).not.toContain('modelId=');
  expect(sharedUrl).not.toContain('apiKey=');

  await page.goto(sharedUrl);
  await expect(page.getByRole('heading', { name: '链接复现测试' })).toBeVisible();
});
