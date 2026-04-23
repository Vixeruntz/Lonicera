# Security Specification

## Core invariants

1. 客户端不能直接写缓存。公开 API 只接受 `{ videoUrl, providerId, modelId, apiKey? }`，并使用严格 schema 校验。
2. 客户端不能指定任意模型目标地址。所有 provider 都是固定预设，方舟 endpoint 固定为 `https://ark.cn-beijing.volces.com/api/coding/v3`，并受 allowlist 与私网/localhost 屏蔽约束。
3. 文章缓存只能由服务端生成后的规范化 `Article` 写入。
4. 当视频源能力缺失时，系统必须显式报错，不能静默回退到“基于标题和常识生成”。
5. 当前仅支持 YouTube；Bilibili 不再暴露在能力接口、UI 或服务端适配器中。

## Request governance

- `/api/capabilities` 与 `/api/articles` 分别独立限流
- 所有外部请求和模型生成都带超时
- 日志采用结构化 JSON 输出，包含 requestId
- `providerId` / `modelId` 组合受白名单校验：
  - `gemini` -> `gemini-3-pro-preview` / `gemini-3-flash-preview`
  - `ark-coding-plan` -> `ark-code-latest`

## Cache model

- 缓存键：`sha256({ version, providerId, modelId, canonicalUrl })`
- 存储介质：服务端文件缓存 `.cache/articles.json`
- TTL：默认 24 小时，可通过 `CACHE_TTL_HOURS` 配置
- 去重：同一缓存键的并发生成会复用同一个 in-flight promise
