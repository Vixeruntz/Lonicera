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
- provider configuration is fixed to preset providers and model allowlists
- request payloads are schema-validated with `zod`
- remote provider base URLs are not client-configurable; Ark Coding Plan is pinned to `https://ark.cn-beijing.volces.com/api/coding/v3`
- cache writes are server-generated only
- share links persist `video` and `provider` in the URL
- Bilibili support was removed; only YouTube remains

## Important files

- `server.ts`
  Express entrypoint, rate limits, request logging, validation, API routes.
- `server-main.ts`
  Process entrypoint used by `npm run dev` and `npm start`.
- `server/services/article-pipeline.ts`
  Main pipeline: source extraction -> provider generation -> schema validation -> cache -> response.
- `server/adapters/video.ts`
  `VideoSourceAdapter` layer. Only YouTube is supported.
- `server/adapters/llm.ts`
  `LLMProviderAdapter` layer for Google Gemini and fixed Volcengine Ark Coding Plan.
- `server/services/cache-store.ts`
  File-backed server cache at `.cache/articles.json`.
- `App.tsx`
  Frontend now only consumes backend capabilities and `/api/articles`, while persisting local provider keys/model choices.
- `components/SettingsModal.tsx`
  Fixed provider preset UI for Gemini + Ark Coding Plan, local API keys, and Gemini model selection.
- `tests/server/*`
  Unit coverage for URL parsing, HTTP validation, cache protection, and pipeline de-duplication.
- `tests/e2e/share-link.spec.ts`
  Share-link roundtrip coverage.

## Runtime config

Server defaults are optional because users can provide API keys locally in the browser.

Primary variables:

- `GEMINI_API_KEY`
- `ARK_CODING_PLAN_API_KEY`
- `CACHE_TTL_HOURS`

Fixed provider/model matrix:

- `gemini`
  - `gemini-3-pro-preview`
  - `gemini-3-flash-preview`
- `ark-coding-plan`
  - `ark-code-latest`

## Continue-from-here checklist

If Gemini / AI Studio continues from this branch, the fastest onboarding order is:

1. read `types.ts`
   confirm the fixed provider IDs, model IDs, and capability shapes first
2. read `server/schemas.ts`
   this defines the public request contract and the provider/model allowlist rules
3. read `server/adapters/llm.ts`
   this is the source of truth for provider presets, request-level API keys, and fixed Ark endpoint behavior
4. read `server/services/article-pipeline.ts`
   this shows cache-key composition and the end-to-end generation pipeline
5. read `App.tsx` and `components/SettingsModal.tsx`
   this is where localStorage persistence and the Gemini model switcher live
6. run `npm run test:unit && npm run build && npm run test:e2e`
   use these as the minimum regression gate before any follow-up change

## Guardrails for follow-up work

- Do not reintroduce arbitrary `baseUrl` or free-form model input from the browser.
- Do not re-add Bilibili as a hidden fallback path; if it returns, it should come back as a fully implemented source with explicit capability exposure.
- Keep `providerId + modelId + canonicalUrl` as part of the cache identity unless there is a deliberate cache migration.
- Keep API keys out of URLs, logs, cache records, and share links.

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

Share links intentionally omit `modelId` and `apiKey`. Reproducing the exact Gemini model therefore depends on the receiving browser's saved local model preference.

## Recommended next task

If continuing from here, the highest-value next step is:

1. add provider-specific UX hints for quota / timeout / latency tradeoffs
2. consider encrypting locally stored API keys or moving them to browser session storage
3. reduce the large frontend bundle by code-splitting markdown/export dependencies
