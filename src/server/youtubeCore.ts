import type {
  PlatformId,
  ReferenceVideo,
  TrendBadge,
  TrendingVideo,
  VideoOrientation,
  ExtractedKeywords,
} from '../types';

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { high?: { url: string }; medium?: { url: string } };
  };
}

interface YouTubeVideoItem {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { high?: { url: string } };
    publishedAt?: string;
  };
  statistics: { viewCount: string };
}

interface VideoWithPublished extends ReferenceVideo {
  publishedAt?: string;
}

export interface SearchOptions {
  orientation?: VideoOrientation;
  maxResults?: number;
}

export interface YoutubeApiCheckResult {
  valid: boolean;
  message: string;
  sampleResultCount?: number;
}

async function fetchYouTubeSearch(
  apiKey: string,
  query: string,
  maxResults: number,
  extra: Record<string, string> = {},
): Promise<YouTubeSearchItem[]> {
  const searchParams = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    order: 'viewCount',
    maxResults: String(maxResults),
    key: apiKey,
    ...extra,
  });

  const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ??
        'YouTube 검색 API 호출에 실패했습니다.',
    );
  }

  const searchData = (await searchRes.json()) as { items?: YouTubeSearchItem[] };
  return searchData.items ?? [];
}

async function fetchVideoDetails(apiKey: string, videoIds: string[]): Promise<ReferenceVideo[]> {
  const full = await fetchVideoDetailsFull(apiKey, videoIds);
  return full.map(({ publishedAt: _p, ...video }) => video);
}

async function fetchVideoDetailsFull(apiKey: string, videoIds: string[]): Promise<VideoWithPublished[]> {
  if (videoIds.length === 0) return [];

  const statsParams = new URLSearchParams({
    part: 'statistics,snippet',
    id: videoIds.join(','),
    key: apiKey,
  });

  const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${statsParams}`);
  if (!statsRes.ok) throw new Error('YouTube 영상 통계 조회에 실패했습니다.');

  const statsData = (await statsRes.json()) as { items: YouTubeVideoItem[] };

  return statsData.items
    .map((item) => ({
      videoId: item.id,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      viewCount: parseInt(item.statistics.viewCount, 10) || 0,
      thumbnailUrl:
        item.snippet.thumbnails.high?.url ??
        `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
      publishedAt: item.snippet.publishedAt,
    }))
    .sort((a, b) => b.viewCount - a.viewCount);
}

const PLATFORM_QUERY: Record<PlatformId, (base: string, orientation: VideoOrientation) => string> = {
  youtube: (base, orientation) =>
    orientation === 'portrait' ? `${base} #shorts`.trim() : base,
  instagram: (base) => `${base} instagram reels`.trim(),
  tiktok: (base) => `${base} tiktok viral`.trim(),
};

export function buildPlatformSearchQuery(
  platform: PlatformId,
  baseQuery: string,
  orientation: VideoOrientation,
): string {
  return PLATFORM_QUERY[platform](baseQuery, orientation);
}

export async function searchTopVideos(
  apiKey: string,
  query: string,
  options: SearchOptions = {},
): Promise<ReferenceVideo[]> {
  const { orientation = 'landscape', maxResults = 5 } = options;

  const attempts: Record<string, string>[] = [];
  if (orientation === 'portrait') {
    attempts.push({ videoDuration: 'short' });
    attempts.push({});
  } else if (orientation === 'landscape') {
    attempts.push({ videoDuration: 'medium' });
    attempts.push({});
  } else {
    attempts.push({});
  }

  let items: YouTubeSearchItem[] = [];
  for (const extra of attempts) {
    items = await fetchYouTubeSearch(apiKey, query, maxResults, extra);
    if (items.length > 0) break;
  }

  const videoIds = items.map((i) => i.id.videoId).filter(Boolean);
  return fetchVideoDetails(apiKey, videoIds);
}

export async function searchPlatformReferences(
  apiKey: string,
  baseQuery: string,
  orientation: VideoOrientation,
  platform: PlatformId,
  maxResults = 3,
): Promise<{ references: ReferenceVideo[]; searchQuery: string }> {
  const searchQuery = buildPlatformSearchQuery(platform, baseQuery, orientation);
  const references = await searchTopVideos(apiKey, searchQuery, {
    orientation: platform === 'youtube' ? orientation : 'portrait',
    maxResults,
  });
  return { references, searchQuery };
}

export async function searchReferenceByTitle(
  apiKey: string,
  title: string,
  channelTitle: string,
  options: SearchOptions = {},
): Promise<ReferenceVideo | null> {
  const query = `${channelTitle} ${title}`.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const results = await searchTopVideos(apiKey, query, { ...options, maxResults: 3 });
  return results[0] ?? null;
}

export async function resolveEstimatedReference(
  apiKey: string,
  video: ReferenceVideo,
  orientation: VideoOrientation,
): Promise<ReferenceVideo> {
  if (!video.videoId.startsWith('estimated-')) return video;

  try {
    const match = await searchReferenceByTitle(apiKey, video.title, video.channelTitle, {
      orientation,
      maxResults: 3,
    });
    if (match) return match;
  } catch {
    /* keep estimated */
  }

  return video;
}

function buildTrendingQueries(keywords: ExtractedKeywords): string[] {
  const base =
    keywords.videoFormat === 'portrait'
      ? `${keywords.searchQuery} #shorts`.trim()
      : keywords.searchQuery;

  const queries = [
    base,
    [...keywords.primary.slice(0, 3), keywords.niche].filter(Boolean).join(' '),
    `${keywords.niche} ${keywords.contentType}`.trim(),
  ];

  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, 3);
}

function recencyMultiplier(publishedAt?: string): number {
  if (!publishedAt) return 1;
  const days = (Date.now() - new Date(publishedAt).getTime()) / 86400000;
  if (days < 30) return 2;
  if (days < 90) return 1.35;
  return 1;
}

export async function searchTrendingRelatedVideos(
  apiKey: string,
  keywords: ExtractedKeywords,
  maxResults = 5,
): Promise<TrendingVideo[]> {
  const orientation = keywords.videoFormat;
  const queries = buildTrendingQueries(keywords);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const publishedAfter = `${threeMonthsAgo.toISOString().slice(0, 10)}T00:00:00Z`;

  const pool = new Map<string, TrendingVideo & { score: number }>();

  const upsert = (
    videos: VideoWithPublished[],
    query: string,
    badge: TrendBadge,
    boost: number,
  ) => {
    for (const video of videos) {
      const score = Math.log10(video.viewCount + 1) * recencyMultiplier(video.publishedAt) * boost;
      const existing = pool.get(video.videoId);
      const candidate: TrendingVideo & { score: number } = {
        videoId: video.videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        viewCount: video.viewCount,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt,
        trendBadge: badge,
        matchedQuery: query,
        score,
      };
      if (!existing || candidate.score > existing.score) {
        pool.set(video.videoId, candidate);
      }
    }
  };

  for (const query of queries) {
    try {
      const popular = await searchTopVideos(apiKey, query, { orientation, maxResults: 6 });
      const details = await fetchVideoDetailsFull(
        apiKey,
        popular.map((v) => v.videoId),
      );
      upsert(details, query, 'popular', 1);
    } catch {
      /* try next query */
    }
  }

  try {
    const baseQuery = queries[0];
    const extra: Record<string, string> = {
      order: 'date',
      publishedAfter,
    };
    if (orientation === 'portrait') extra.videoDuration = 'short';

    const recentItems = await fetchYouTubeSearch(apiKey, baseQuery, 8, extra);
    const recentIds = recentItems.map((i) => i.id.videoId).filter(Boolean);
    const recent = await fetchVideoDetailsFull(apiKey, recentIds);
    upsert(recent, baseQuery, 'rising', 1.6);
  } catch {
    /* skip recent search */
  }

  const sorted = [...pool.values()].sort((a, b) => b.score - a.score).slice(0, maxResults);
  if (sorted.length > 0) sorted[0].trendBadge = 'hot';

  return sorted.map(({ score: _score, ...video }) => video);
}

export async function checkYoutubeApiConnection(apiKey: string): Promise<YoutubeApiCheckResult> {
  try {
    const items = await fetchYouTubeSearch(apiKey, 'viral shorts', 3);
    if (items.length === 0) {
      return {
        valid: true,
        message: 'API 키는 유효하지만 검색 결과가 비어 있습니다.',
        sampleResultCount: 0,
      };
    }
    return {
      valid: true,
      message: `YouTube API 연결 정상 (샘플 검색 ${items.length}건)`,
      sampleResultCount: items.length,
    };
  } catch (err) {
    return {
      valid: false,
      message: err instanceof Error ? err.message : 'YouTube API 연결에 실패했습니다.',
    };
  }
}

export async function fetchThumbnailAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return Buffer.from(bytes).toString('base64');
  } catch {
    return null;
  }
}
