# Gemini / AI Studio Handoff

## What changed

This repo was refactored to move article generation behind a server-managed pipeline.

Before:

- the browser could construct Gemini/OpenAI clients directly
- the client could submit arbitrary cache payloads
- the backend exposed an open relay style `/api/ai/chat`
- share links did not reproduce the current article
- Bilibili links silently degraded into low-trust generation

Now:

- public generation entrypoint is `POST /api/articles`
- capability discovery is `GET /api/capabilities`
- provider configuration is server-side only
- request payloads are schema-validated with `zod`
- remote provider base URLs are allowlisted and blocked from private/local targets
- cache writes are server-generated only
- share links persist `video` and `provider` in the URL

## Important files

- `server.ts`
  Express entrypoint, rate limits, request logging, validation, API routes.
- `server-main.ts`
  Process entrypoint used by `npm run dev` and `npm start`.
- `server/services/article-pipeline.ts`
  Main pipeline: source extraction -> provider generation -> schema validation -> cache -> response.
- `server/adapters/video.ts`
  `VideoSourceAdapter` layer. YouTube is enabled; Bilibili is recognized but disabled by default.
- `server/adapters/llm.ts`
  `LLMProviderAdapter` layer for Gemini and server-managed OpenAI-compatible providers.
- `server/services/cache-store.ts`
  File-backed server cache at `.cache/articles.json`.
- `App.tsx`
  Frontend now only consumes backend capabilities and `/api/articles`.
- `components/SettingsModal.tsx`
  Provider selector for server-enabled providers only.
- `tests/server/*`
  Unit coverage for URL parsing, HTTP validation, cache protection, and pipeline de-duplication.
- `tests/e2e/share-link.spec.ts`
  Share-link roundtrip coverage.

## Runtime config

At least one provider must be configured server-side.

Primary variables:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` optional, defaults to `gemini-2.5-pro`
- `OPENAI_COMPAT_API_KEY`
- `OPENAI_COMPAT_BASE_URL`
- `OPENAI_COMPAT_MODEL`
- `OPENAI_COMPAT_ALLOWED_HOSTS`
- `CACHE_TTL_HOURS`
- `ENABLE_BILIBILI`

## Commands

- `npm run dev`
- `npm run test:unit`
- `npm run build`
- `npm run test:e2e`

## Validation status at handoff

The current published changes were validated with:

- `npm run test:unit`
- `npm run build`
- `npm run test:e2e`

## Known limitation

Bilibili is not yet implemented end-to-end. The adapter is explicit and will fail clearly instead of silently falling back to title-only generation.

## Recommended next task

If continuing from here, the highest-value next step is:

1. implement real Bilibili transcript and metadata extraction
2. keep the explicit capability toggle
3. add source-specific tests similar to the YouTube path
