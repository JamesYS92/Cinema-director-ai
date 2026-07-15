import type {
  ExtractedKeywords,
  PlatformId,
  ReferenceVideo,
  TrendingVideo,
  VideoOrientation,
} from '../types';
import type { SearchOptions, YoutubeApiCheckResult } from '../server/youtubeCore';
import { buildPlatformSearchQuery } from '../server/youtubeCore';

export { buildPlatformSearchQuery };

export type { SearchOptions, YoutubeApiCheckResult };

async function youtubeApi<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('/api/youtube', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; result?: T };
  if (!res.ok) {
    throw new Error(data.error || `YouTube API 오류 (${res.status})`);
  }
  return data.result as T;
}

export async function searchTopVideos(
  query: string,
  options: SearchOptions = {},
): Promise<ReferenceVideo[]> {
  return youtubeApi('searchTopVideos', { query, options });
}

export async function searchPlatformReferences(
  baseQuery: string,
  orientation: VideoOrientation,
  platform: PlatformId,
  maxResults = 3,
): Promise<{ references: ReferenceVideo[]; searchQuery: string }> {
  return youtubeApi('searchPlatformReferences', { baseQuery, orientation, platform, maxResults });
}

export async function resolveEstimatedReference(
  video: ReferenceVideo,
  orientation: VideoOrientation,
  platform?: PlatformId,
  fallbackQuery?: string,
): Promise<ReferenceVideo> {
  return youtubeApi('resolveEstimatedReference', { video, orientation, platform, fallbackQuery });
}

export async function searchTrendingRelatedVideos(
  keywords: ExtractedKeywords,
  maxResults = 5,
): Promise<TrendingVideo[]> {
  return youtubeApi('searchTrendingRelatedVideos', { keywords, maxResults });
}

export async function checkYoutubeApiConnection(): Promise<YoutubeApiCheckResult> {
  return youtubeApi('checkConnection', {});
}

export async function fetchThumbnailAsBase64(url: string): Promise<string | null> {
  return youtubeApi('fetchThumbnail', { url });
}

export interface YouTubeVideoMeta {
  videoId: string;
  title: string;
  channelTitle: string;
  duration: number;
  orientation: 'portrait' | 'landscape' | 'square';
  thumbnailUrl: string;
  frameSource?: 'storyboard' | 'thumbnail';
}

export interface StoryboardFrameRef {
  spriteUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
}

export async function getYouTubeVideoMeta(videoId: string): Promise<YouTubeVideoMeta> {
  return youtubeApi('getVideoMeta', { videoId });
}

export async function extractYouTubeStoryboardFrames(
  videoId: string,
  count: number,
): Promise<{ meta: YouTubeVideoMeta; frames: StoryboardFrameRef[] }> {
  return youtubeApi('extractStoryboardFrames', { videoId, count });
}

export async function isYoutubeAvailable(): Promise<boolean> {
  try {
    const status = await import('./apiClient').then((m) => m.fetchApiStatus());
    return status.youtube;
  } catch {
    return false;
  }
}
