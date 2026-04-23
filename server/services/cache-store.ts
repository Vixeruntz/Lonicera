import fs from 'fs';
import path from 'path';

import { ArticleRecord, articleRecordSchema } from '../schemas';
import { StructuredLogger } from '../logger';

export interface ArticleCacheStore {
  get(cacheKey: string): Promise<ArticleRecord | null>;
  set(record: ArticleRecord): Promise<void>;
}

export class InMemoryArticleCacheStore implements ArticleCacheStore {
  private readonly records = new Map<string, ArticleRecord>();

  async get(cacheKey: string) {
    return this.records.get(cacheKey) ?? null;
  }

  async set(record: ArticleRecord) {
    this.records.set(record.cacheKey, record);
  }
}

export class FileArticleCacheStore implements ArticleCacheStore {
  private readonly records = new Map<string, ArticleRecord>();
  private readonly cacheFilePath: string;

  constructor(
    private readonly logger: StructuredLogger,
    cacheFilePath = path.join(process.cwd(), '.cache', 'articles.json')
  ) {
    this.cacheFilePath = cacheFilePath;
    this.loadFromDisk();
  }

  async get(cacheKey: string) {
    return this.records.get(cacheKey) ?? null;
  }

  async set(record: ArticleRecord) {
    this.records.set(record.cacheKey, record);
    await this.flushToDisk();
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        return;
      }

      const raw = fs.readFileSync(this.cacheFilePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [cacheKey, value] of Object.entries(parsed)) {
        this.records.set(cacheKey, articleRecordSchema.parse(value));
      }
    } catch (error) {
      this.logger.warn('cache.file.read_failed', {
        cacheFilePath: this.cacheFilePath,
        message: error instanceof Error ? error.message : String(error),
      });
      this.records.clear();
    }
  }

  private async flushToDisk() {
    try {
      const cacheDir = path.dirname(this.cacheFilePath);
      await fs.promises.mkdir(cacheDir, { recursive: true });

      const payload = JSON.stringify(Object.fromEntries(this.records), null, 2);
      const tempFilePath = `${this.cacheFilePath}.tmp`;
      await fs.promises.writeFile(tempFilePath, payload, 'utf8');
      await fs.promises.rename(tempFilePath, this.cacheFilePath);
    } catch (error) {
      this.logger.warn('cache.file.write_failed', {
        cacheFilePath: this.cacheFilePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
