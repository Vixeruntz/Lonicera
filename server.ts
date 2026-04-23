import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Server } from 'http';
import path from 'path';
import { ZodError } from 'zod';

import { LlmProviderRegistry } from './server/adapters/llm';
import { VideoSourceRegistry } from './server/adapters/video';
import { AppConfig, loadAppConfig } from './server/config';
import { AppError, isAppError } from './server/errors';
import { createLogger, StructuredLogger } from './server/logger';
import { analyzeArticleRequestSchema } from './server/schemas';
import { ArticlePipeline } from './server/services/article-pipeline';
import { FileArticleCacheStore } from './server/services/cache-store';
import { AnalyzeArticleResponse, AppCapabilities, ProviderId, ProviderModelId } from './types';

export interface PipelineService {
  getCapabilities(): AppCapabilities;
  generateArticle(input: {
    videoUrl: string;
    providerId: ProviderId;
    modelId: ProviderModelId;
    apiKey?: string;
    requestId: string;
  }): Promise<AnalyzeArticleResponse>;
}

interface AppServices {
  pipeline: PipelineService;
  logger: StructuredLogger;
}

function createRateLimiter(max: number, windowMs: number, message: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: message,
      code: 'rate_limited',
    },
  });
}

export function buildDefaultServices(config?: AppConfig, logger?: StructuredLogger): AppServices {
  const resolvedLogger = logger ?? createLogger();
  const resolvedConfig = config ?? loadAppConfig(resolvedLogger);

  const cacheStore = new FileArticleCacheStore(resolvedLogger);

  const pipeline = new ArticlePipeline({
    cacheStore,
    cacheTtlHours: resolvedConfig.cacheTtlHours,
    videoSources: new VideoSourceRegistry({
      timeoutMs: resolvedConfig.externalRequestTimeoutMs,
      logger: resolvedLogger,
    }),
    providers: new LlmProviderRegistry({
      defaultApiKeys: {
        gemini: resolvedConfig.geminiApiKey,
        'ark-coding-plan': resolvedConfig.arkCodingPlanApiKey,
      },
      logger: resolvedLogger,
    }),
    logger: resolvedLogger,
    articleGenerationTimeoutMs: resolvedConfig.articleGenerationTimeoutMs,
  });

  return {
    pipeline,
    logger: resolvedLogger,
  };
}

export function createApp(services: AppServices = buildDefaultServices()) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    res.locals.requestId = requestId;

    services.logger.info('http.request.started', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    res.on('finish', () => {
      services.logger.info('http.request.completed', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get(
    '/api/capabilities',
    createRateLimiter(120, 60 * 60 * 1000, 'Capabilities requests are temporarily rate limited'),
    (_req, res) => {
      res.json(services.pipeline.getCapabilities());
    }
  );

  app.post(
    '/api/articles',
    createRateLimiter(20, 60 * 60 * 1000, 'Article generation is temporarily rate limited'),
    async (req, res, next) => {
      try {
        const parsed = analyzeArticleRequestSchema.parse(req.body);
        const payload = await services.pipeline.generateArticle({
          videoUrl: parsed.videoUrl,
          providerId: parsed.providerId,
          modelId: parsed.modelId,
          apiKey: parsed.apiKey,
          requestId: res.locals.requestId,
        });
        res.json(payload);
      } catch (error) {
        next(error);
      }
    }
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({
      code: 'not_found',
      error: '未找到对应的 API 路由。',
    });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const requestId = res.locals.requestId;

    if (error instanceof ZodError) {
      services.logger.warn('http.request.validation_failed', {
        requestId,
        issues: error.issues,
      });
      res.status(400).json({
        code: 'invalid_request',
        error: '请求参数格式不正确。',
        details: error.flatten(),
      });
      return;
    }

    if (isAppError(error)) {
      services.logger[error.statusCode >= 500 ? 'error' : 'warn']('http.request.failed', {
        requestId,
        code: error.code,
        statusCode: error.statusCode,
        message: error.message,
        details: error.details,
      });
      res.status(error.statusCode).json({
        code: error.code,
        error: error.expose ? error.message : '服务器内部错误。',
      });
      return;
    }

    services.logger.error('http.request.unhandled', {
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      code: 'internal_error',
      error: '服务器内部错误。',
    });
  });

  return app;
}

async function attachFrontend(app: ReturnType<typeof createApp>) {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    return;
  }

  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

export async function startServer() {
  const logger = createLogger();
  const config = loadAppConfig(logger);
  const services = buildDefaultServices(config, logger);
  const app = createApp(services);

  await attachFrontend(app);

  const server = app.listen(config.port, '0.0.0.0', () => {
    services.logger.info('server.started', {
      port: config.port,
      environment: process.env.NODE_ENV ?? 'development',
    });
  });

  return server as Server;
}
