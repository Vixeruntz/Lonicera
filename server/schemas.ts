import { z } from 'zod';

import { GEMINI_MODEL_IDS, PROVIDER_IDS, PROVIDER_MODEL_IDS, VIDEO_SOURCE_IDS } from '../types';

const providerIdSchema = z.enum(PROVIDER_IDS);
const modelIdSchema = z.enum(PROVIDER_MODEL_IDS);

export const analyzeArticleRequestSchema = z
  .object({
    videoUrl: z.string().trim().min(1).max(500),
    providerId: providerIdSchema,
    modelId: modelIdSchema,
    apiKey: z.string().trim().min(1).max(2048).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.providerId === 'gemini' && !GEMINI_MODEL_IDS.includes(value.modelId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gemini provider does not support the requested modelId.',
        path: ['modelId'],
      });
    }

    if (value.providerId === 'ark-coding-plan' && value.modelId !== 'ark-code-latest') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ark Coding Plan only supports ark-code-latest.',
        path: ['modelId'],
      });
    }
  });

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
  sourceId: z.enum(VIDEO_SOURCE_IDS),
  providerId: providerIdSchema,
  providerLabel: z.string().min(1),
  modelId: modelIdSchema,
  createdAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export type AnalyzeArticleRequest = z.infer<typeof analyzeArticleRequestSchema>;
export type GeneratedArticle = z.infer<typeof generatedArticleSchema>;
export type ArticleRecord = z.infer<typeof articleRecordSchema>;
