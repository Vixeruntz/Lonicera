import { z } from 'zod';

export const analyzeArticleRequestSchema = z
  .object({
    videoUrl: z.string().trim().min(1).max(500),
    providerId: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const generatedArticleSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().trim().max(240).default(''),
    author: z.string().trim().min(1).max(120),
    tags: z.array(z.string().trim().min(1).max(32)).min(1).max(6).default(['深度阅读']),
    content: z.string().trim().min(200).max(60000),
    coverImageUrl: z.string().url().optional(),
  })
  .strict();

export const articleRecordSchema = generatedArticleSchema.extend({
  sourceUrl: z.string().url(),
  estimatedReadingTime: z.number().int().positive(),
  cacheKey: z.string().min(1),
  sourceId: z.enum(['youtube', 'bilibili']),
  providerId: z.string().min(1),
  providerLabel: z.string().min(1),
  modelId: z.string().min(1),
  createdAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export type AnalyzeArticleRequest = z.infer<typeof analyzeArticleRequestSchema>;
export type GeneratedArticle = z.infer<typeof generatedArticleSchema>;
export type ArticleRecord = z.infer<typeof articleRecordSchema>;
