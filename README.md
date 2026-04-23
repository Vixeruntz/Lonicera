# 视频炼金术：深度阅读

一个把视频字幕整理为中文长文的服务端优先应用。当前版本不再在浏览器里直接调用模型，也不再接受客户端提交任意缓存内容或任意 Base URL。

## 架构

请求路径已经收敛为单一服务端管线：

`URL -> 服务端校验 -> transcript / metadata 抽取 -> LLM 生成 -> schema 校验 -> 服务端缓存 -> 前端只读展示`

当前能力：

- 视频源：仅支持 YouTube
- 模型：固定 provider 预设，前端只能在受控模型白名单中选择
  - Google Gemini: `gemini-3-pro-preview` / `gemini-3-flash-preview`
  - 火山方舟 Coding Plan: `ark-code-latest`（固定 endpoint `https://ark.cn-beijing.volces.com/api/coding/v3`）
- 缓存：服务端文件缓存，默认写入 `.cache/articles.json`，带 TTL 和去重键

## 本地运行

前置依赖：Node.js 22+

1. 安装依赖
   `npm install`
2. 可选配置服务端默认 API Key
   `GEMINI_API_KEY=...`
   `ARK_CODING_PLAN_API_KEY=...`
3. 可选配置
   `CACHE_TTL_HOURS=24`
4. 启动应用
   `npm run dev`

说明：

- 用户也可以在浏览器设置面板里分别为 Gemini / 方舟填写本地 API Key
- 分享链接只保留 `video` 与 `provider`，不会暴露 `modelId` 或 `apiKey`

## 质量门

- 单元测试：`npm run test:unit`
- E2E：`npm run test:e2e`
  说明：E2E 会先 build，再启动生产模式服务器并执行 Playwright；需要运行环境允许绑定本地端口
- 构建：`npm run build`

CI 已在 `.github/workflows/ci.yml` 中配置。
