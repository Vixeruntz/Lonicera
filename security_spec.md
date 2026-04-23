# Security Specification

## Core invariants

1. 客户端不能直接写缓存。公开 API 只接受 `{ videoUrl, providerId? }`，并使用严格 schema 校验。
2. 客户端不能指定任意模型目标地址。所有 provider 都由服务端配置，并受 host allowlist 与私网/localhost 屏蔽约束。
3. 文章缓存只能由服务端生成后的规范化 `Article` 写入。
4. 当视频源能力缺失时，系统必须显式报错，不能静默回退到“基于标题和常识生成”。

## Request governance

- `/api/capabilities` 与 `/api/articles` 分别独立限流
- 所有外部请求和模型生成都带超时
- 日志采用结构化 JSON 输出，包含 requestId

## Cache model

- 缓存键：`sha256({ version, providerId, canonicalUrl })`
- 存储介质：服务端文件缓存 `.cache/articles.json`
- TTL：默认 24 小时，可通过 `CACHE_TTL_HOURS` 配置
- 去重：同一缓存键的并发生成会复用同一个 in-flight promise
