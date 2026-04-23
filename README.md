# 视频炼金术：深度阅读

一个把视频字幕整理为中文长文的服务端优先应用。当前版本不再在浏览器里直接调用模型，也不再接受客户端提交任意缓存内容或任意 Base URL。

## 架构

请求路径已经收敛为单一服务端管线：

`URL -> 服务端校验 -> transcript / metadata 抽取 -> LLM 生成 -> schema 校验 -> 服务端缓存 -> 前端只读展示`

当前能力：

- 视频源：YouTube 已启用；Bilibili 适配器已接入路由层，但默认禁用，未启用时会显式报错
- 模型：由服务端环境变量配置，前端只能选择后端已启用的 provider
- 缓存：服务端文件缓存，默认写入 `.cache/articles.json`，带 TTL 和去重键

## 本地运行

前置依赖：Node.js 22+

1. 安装依赖
   `npm install`
2. 至少配置一个服务端 provider
   `GEMINI_API_KEY=...`
3. 可选配置
   `GEMINI_MODEL=gemini-2.5-pro`
   `OPENAI_COMPAT_API_KEY=...`
   `OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1`
   `OPENAI_COMPAT_MODEL=openai/gpt-4.1-mini`
   `OPENAI_COMPAT_ALLOWED_HOSTS=openrouter.ai,api.openai.com`
   `CACHE_TTL_HOURS=24`
   `ENABLE_BILIBILI=false`
4. 启动应用
   `npm run dev`

## 质量门

- 单元测试：`npm run test:unit`
- E2E：`npm run test:e2e`
  说明：E2E 会先 build，再启动生产模式服务器并执行 Playwright；需要运行环境允许绑定本地端口
- 构建：`npm run build`

CI 已在 `.github/workflows/ci.yml` 中配置。
