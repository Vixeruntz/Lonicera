import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

import { SourceCapability, VideoSourceId } from '../../types';
import { AppError } from '../errors';
import { StructuredLogger } from '../logger';
import { parseHttpUrl } from '../utils/network';
import { withTimeout } from '../utils/timeout';

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];
const BILIBILI_HOSTS = ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'b23.tv'];

export interface ExtractedVideo {
  sourceId: VideoSourceId;
  canonicalUrl: string;
  displayUrl: string;
  transcript: string;
  title?: string;
  author?: string;
}

export interface VideoSourceService {
  getCapabilities(): SourceCapability[];
  extractFromUrl(input: string): Promise<ExtractedVideo>;
}

interface VideoAdapter {
  readonly capability: SourceCapability;
  matches(url: URL): boolean;
  extract(url: URL): Promise<ExtractedVideo>;
}

function hostMatches(hostname: string, candidates: string[]) {
  const normalized = hostname.toLowerCase();
  return candidates.some((candidate) => normalized === candidate || normalized.endsWith(`.${candidate}`));
}

export function extractYouTubeVideoId(url: URL) {
  if (url.hostname === 'youtu.be') {
    const path = url.pathname.split('/').filter(Boolean)[0];
    return path?.slice(0, 11) ?? null;
  }

  const directQueryId = url.searchParams.get('v');
  if (directQueryId && directQueryId.length >= 11) {
    return directQueryId.slice(0, 11);
  }

  const pathMatch = url.pathname.match(/\/(?:embed|shorts|live|v)\/([^/?#]+)/i);
  return pathMatch?.[1]?.slice(0, 11) ?? null;
}

export function extractBilibiliVideoId(url: URL) {
  const pathSegments = url.pathname.split('/').filter(Boolean);
  return pathSegments.find((segment) => /^bv[0-9a-z]+$/i.test(segment) || /^av\d+$/i.test(segment)) ?? null;
}

async function fetchJson(url: string, timeoutMs: number) {
  const response = await withTimeout(fetch(url), timeoutMs, 'Remote metadata request');
  if (!response.ok) {
    throw new AppError(502, 'metadata_fetch_failed', `Failed to fetch metadata (${response.status})`);
  }
  return response.json();
}

class YoutubeVideoAdapter implements VideoAdapter {
  public readonly capability: SourceCapability = {
    id: 'youtube',
    label: 'YouTube',
    enabled: true,
  };

  constructor(
    private readonly timeoutMs: number,
    private readonly logger: StructuredLogger
  ) {}

  matches(url: URL) {
    return hostMatches(url.hostname, YOUTUBE_HOSTS);
  }

  async extract(url: URL): Promise<ExtractedVideo> {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      throw new AppError(400, 'unsupported_video_url', '无法从该 YouTube 链接中提取视频 ID');
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const transcriptData = await withTimeout(
      YoutubeTranscript.fetchTranscript(videoId),
      this.timeoutMs,
      'YouTube transcript fetch'
    ).catch((error) => {
      throw new AppError(422, 'transcript_unavailable', '暂时无法获取该 YouTube 视频字幕，请稍后重试或更换视频。', {
        cause: error,
      });
    });

    const transcript = transcriptData.map((entry) => entry.text).join(' ').replace(/\s+/g, ' ').trim();
    if (transcript.length < 120) {
      throw new AppError(422, 'transcript_unavailable', '提取到的字幕内容过短，无法可靠生成文章。');
    }

    let title: string | undefined;
    let author: string | undefined;
    try {
      const metadata = await fetchJson(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
        this.timeoutMs
      );
      title = typeof metadata.title === 'string' ? metadata.title : undefined;
      author = typeof metadata.author_name === 'string' ? metadata.author_name : undefined;
    } catch (error) {
      this.logger.warn('video.youtube.metadata_failed', {
        canonicalUrl,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      sourceId: 'youtube',
      canonicalUrl,
      displayUrl: canonicalUrl,
      transcript: transcript.slice(0, 32000),
      title,
      author,
    };
  }
}

class BilibiliVideoAdapter implements VideoAdapter {
  public readonly capability: SourceCapability;

  constructor(enabled: boolean) {
    this.capability = {
      id: 'bilibili',
      label: 'Bilibili',
      enabled,
      reason: enabled ? undefined : '后端暂未配置 Bilibili 字幕提取能力，当前不会回退到“世界知识”生成。',
    };
  }

  matches(url: URL) {
    return hostMatches(url.hostname, BILIBILI_HOSTS);
  }

  async extract(url: URL): Promise<ExtractedVideo> {
    const videoId = extractBilibiliVideoId(url) ?? 'unresolved';
    if (!this.capability.enabled) {
      throw new AppError(422, 'unsupported_source', this.capability.reason ?? 'Bilibili 当前不可用。');
    }

    throw new AppError(
      501,
      'unsupported_source',
      `Bilibili 适配器已识别视频 ${videoId}，但字幕抓取尚未实现。请先使用 YouTube 链接。`
    );
  }
}

export class VideoSourceRegistry implements VideoSourceService {
  private readonly adapters: VideoAdapter[];

  constructor(options: { enableBilibili: boolean; timeoutMs: number; logger: StructuredLogger }) {
    this.adapters = [
      new YoutubeVideoAdapter(options.timeoutMs, options.logger),
      new BilibiliVideoAdapter(options.enableBilibili),
    ];
  }

  getCapabilities() {
    return this.adapters.map((adapter) => adapter.capability);
  }

  async extractFromUrl(input: string) {
    const url = parseHttpUrl(input, 'videoUrl');
    const adapter = this.adapters.find((candidate) => candidate.matches(url));
    if (!adapter) {
      throw new AppError(400, 'unsupported_video_url', '目前仅支持后端已声明的平台链接。');
    }
    return adapter.extract(url);
  }
}
