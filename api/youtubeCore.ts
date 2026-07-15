export type PlatformId = 'youtube' | 'instagram' | 'tiktok';
export type VideoOrientation = 'portrait' | 'landscape' | 'square';
export type TrendBadge = 'hot' | 'rising' | 'popular';

export interface ReferenceVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  thumbnailUrl: string;
  watchUrl?: string;
}

export interface ExtractedKeywords {
  primary: string[];
  secondary: string[];
  niche: string;
  contentType: string;
  searchQuery: string;
  videoFormat: VideoOrientation;
}

export interface TrendingVideo extends ReferenceVideo {
  publishedAt?: string;
  trendBadge: TrendBadge;
  matchedQuery: string;
}

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
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
  return full.map(({ publishedAt: _p, ...video }) => enrichReferenceVideo(video));
}

function enrichReferenceVideo(video: ReferenceVideo): ReferenceVideo {
  if (video.videoId.startsWith('estimated-')) return video;
  return {
    ...video,
    thumbnailUrl: video.thumbnailUrl || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
    watchUrl: video.watchUrl ?? `https://www.youtube.com/watch?v=${video.videoId}`,
  };
}

function normalizeTitle(value: string): string {
  return value
    .replace(/#\S+/g, '')
    .replace(/[^\w\uAC00-\uD7A3\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function scoreTitleMatch(
  candidateTitle: string,
  targetTitle: string,
  targetChannel?: string,
  candidateChannel?: string,
): number {
  const normTarget = normalizeTitle(targetTitle);
  const normCandidate = normalizeTitle(candidateTitle);
  if (!normTarget || !normCandidate) return 0;

  let score = 0;
  if (normCandidate === normTarget) score = 100;
  else if (normCandidate.includes(normTarget) || normTarget.includes(normCandidate)) score = 82;
  else {
    const words = normTarget.split(' ').filter((w) => w.length > 1);
    const matched = words.filter((w) => normCandidate.includes(w)).length;
    score = (matched / Math.max(words.length, 1)) * 70;
  }

  if (targetChannel && candidateChannel) {
    const nc = normalizeTitle(candidateChannel);
    const nt = normalizeTitle(targetChannel);
    if (nc.includes(nt) || nt.includes(nc)) score += 12;
  }

  return score;
}

function findBestTitleMatch(
  candidates: ReferenceVideo[],
  targetTitle: string,
  targetChannel?: string,
): ReferenceVideo | null {
  let best: ReferenceVideo | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scoreTitleMatch(candidate.title, targetTitle, targetChannel, candidate.channelTitle);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= 38 ? best : null;
}

function parseEstimatedPlatform(videoId: string): PlatformId | undefined {
  const match = videoId.match(/^estimated-(youtube|instagram|tiktok)-/);
  return match?.[1] as PlatformId | undefined;
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
        item.snippet.thumbnails.high?.url ?? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
      publishedAt: item.snippet.publishedAt,
    }))
    .sort((a, b) => b.viewCount - a.viewCount);
}

const PLATFORM_QUERY: Record<PlatformId, (base: string, orientation: VideoOrientation) => string> = {
  youtube: (base, orientation) => (orientation === 'portrait' ? `${base} #shorts`.trim() : base),
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
  const attempts: Record<string, string>[] =
    orientation === 'portrait'
      ? [{ videoDuration: 'short' }, {}]
      : orientation === 'landscape'
        ? [{ videoDuration: 'medium' }, {}]
        : [{}];

  let items: YouTubeSearchItem[] = [];
  for (const extra of attempts) {
    items = await fetchYouTubeSearch(apiKey, query, maxResults, extra);
    if (items.length > 0) break;
  }

  return fetchVideoDetails(
    apiKey,
    items.map((i) => i.id.videoId).filter(Boolean),
  );
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
  const queries = [
    `${channelTitle} ${title}`.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim(),
    title.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim(),
    title.split(/[?!,:]/)[0]?.trim() ?? title,
  ].filter(Boolean);

  const pool: ReferenceVideo[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const results = await searchTopVideos(apiKey, query.slice(0, 100), { ...options, maxResults: 5 });
    for (const result of results) {
      if (seen.has(result.videoId)) continue;
      seen.add(result.videoId);
      pool.push(result);
    }
    const match = findBestTitleMatch(pool, title, channelTitle);
    if (match) return match;
  }

  return findBestTitleMatch(pool, title, channelTitle);
}

export async function resolveEstimatedReference(
  apiKey: string,
  video: ReferenceVideo,
  orientation: VideoOrientation,
  platform?: PlatformId,
  fallbackQuery?: string,
): Promise<ReferenceVideo> {
  if (!video.videoId.startsWith('estimated-')) {
    return enrichReferenceVideo(video);
  }

  const inferredPlatform = platform ?? parseEstimatedPlatform(video.videoId) ?? 'youtube';
  const searchOrientation = inferredPlatform === 'youtube' ? orientation : 'portrait';
  const title = video.title.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
  const channel = video.channelTitle.trim();

  const queryCandidates = [
    `${channel} ${title}`.trim(),
    title,
    title.split(/[?!,:]/)[0]?.trim() ?? title,
    title.split(' ').slice(0, 6).join(' ').trim(),
  ].filter(Boolean);

  const seenIds = new Set<string>();
  const pool: ReferenceVideo[] = [];

  const collect = (results: ReferenceVideo[]) => {
    for (const result of results) {
      if (seenIds.has(result.videoId)) continue;
      seenIds.add(result.videoId);
      pool.push(result);
    }
  };

  try {
    for (const query of queryCandidates) {
      collect(await searchTopVideos(apiKey, query.slice(0, 100), {
        orientation: searchOrientation,
        maxResults: 5,
      }));
    }

    if (inferredPlatform !== 'youtube') {
      const { references } = await searchPlatformReferences(
        apiKey,
        `${title} ${channel}`.trim(),
        searchOrientation,
        inferredPlatform,
        5,
      );
      collect(references);
    }

    const match = findBestTitleMatch(pool, video.title, video.channelTitle);
    if (match) return enrichReferenceVideo(match);

    const nicheQuery = fallbackQuery?.trim();
    if (nicheQuery) {
      const { references } = await searchPlatformReferences(
        apiKey,
        nicheQuery,
        searchOrientation,
        inferredPlatform,
        5,
      );
      if (references[0]) return enrichReferenceVideo(references[0]);

      collect(await searchTopVideos(apiKey, nicheQuery.slice(0, 100), {
        orientation: searchOrientation,
        maxResults: 5,
      }));
      if (pool.length > 0) {
        return enrichReferenceVideo(pool.sort((a, b) => b.viewCount - a.viewCount)[0]!);
      }
    }

    if (pool.length > 0) {
      return enrichReferenceVideo(pool.sort((a, b) => b.viewCount - a.viewCount)[0]!);
    }
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
      if (!existing || candidate.score > existing.score) pool.set(video.videoId, candidate);
    }
  };

  for (const query of queries) {
    try {
      const popular = await searchTopVideos(apiKey, query, { orientation, maxResults: 6 });
      const details = await fetchVideoDetailsFull(apiKey, popular.map((v) => v.videoId));
      upsert(details, query, 'popular', 1);
    } catch {
      /* try next */
    }
  }

  try {
    const baseQuery = queries[0]!;
    const extra: Record<string, string> = { order: 'date', publishedAfter };
    if (orientation === 'portrait') extra.videoDuration = 'short';
    const recentItems = await fetchYouTubeSearch(apiKey, baseQuery, 8, extra);
    const recent = await fetchVideoDetailsFull(
      apiKey,
      recentItems.map((i) => i.id.videoId).filter(Boolean),
    );
    upsert(recent, baseQuery, 'rising', 1.6);
  } catch {
    /* skip */
  }

  const sorted = [...pool.values()].sort((a, b) => b.score - a.score).slice(0, maxResults);
  if (sorted.length > 0) sorted[0]!.trendBadge = 'hot';
  return sorted.map(({ score: _score, ...video }) => video);
}

export async function checkYoutubeApiConnection(apiKey: string): Promise<YoutubeApiCheckResult> {
  try {
    const items = await fetchYouTubeSearch(apiKey, 'viral shorts', 3);
    if (items.length === 0) {
      return { valid: true, message: 'API 키는 유효하지만 검색 결과가 비어 있습니다.', sampleResultCount: 0 };
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
    return arrayBufferToBase64(await res.arrayBuffer());
  } catch {
    return null;
  }
}
