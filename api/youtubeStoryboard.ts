export type VideoOrientation = 'portrait' | 'landscape' | 'square';

export interface YouTubeVideoMeta {
  videoId: string;
  title: string;
  channelTitle: string;
  duration: number;
  orientation: VideoOrientation;
  thumbnailUrl: string;
}

export interface StoryboardFrameRef {
  spriteUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
}

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLgclyiPYBHN2_QXI';

function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const seconds = parseInt(match[3] ?? '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function getOrientation(width: number, height: number): VideoOrientation {
  if (!width || !height) return 'landscape';
  const ratio = width / height;
  if (ratio < 0.95) return 'portrait';
  if (ratio > 1.05) return 'landscape';
  return 'square';
}

function sampleEvenly<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => {
    const index = Math.round((i * (items.length - 1)) / (count - 1));
    return items[index]!;
  });
}

async function fetchInnertubePlayer(videoId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20241120.01.00',
          hl: 'ko',
          gl: 'KR',
        },
      },
      videoId,
    }),
  });

  if (!res.ok) {
    throw new Error('YouTube 영상 정보를 불러오지 못했습니다.');
  }

  return (await res.json()) as Record<string, unknown>;
}

function parseStoryboardSpec(spec: string, duration: number): StoryboardFrameRef[] {
  const [urlTemplate, sizing] = spec.split('|');
  if (!urlTemplate || !sizing) return [];

  const nums = sizing.split('#').map((v) => parseFloat(v));
  const [thumbWidth, thumbHeight, thumbCount, cols, rows, interval] = nums;
  if (!thumbWidth || !thumbHeight || !thumbCount || !cols || !rows) return [];

  const frameInterval = interval || (duration > 0 ? duration / thumbCount : 1);
  const frames: StoryboardFrameRef[] = [];

  for (let i = 0; i < thumbCount; i++) {
    const sheetIndex = Math.floor(i / (cols * rows));
    const pos = i % (cols * rows);
    const col = pos % cols;
    const row = Math.floor(pos / cols);

    const spriteUrl = urlTemplate
      .replace(/\$L/g, '0')
      .replace(/\$N/g, String(sheetIndex))
      .replace(/\$M/g, String(row));

    frames.push({
      spriteUrl,
      x: col * thumbWidth,
      y: row * thumbHeight,
      width: thumbWidth,
      height: thumbHeight,
      timestamp: Math.min(i * frameInterval, duration || i * frameInterval),
    });
  }

  return frames;
}

function extractStoryboardSpec(player: Record<string, unknown>): string | null {
  const storyboards = player.storyboards as Record<string, unknown> | undefined;
  const renderer = storyboards?.playerStoryboardSpecRenderer as { spec?: string } | undefined;
  return renderer?.spec ?? null;
}

export async function fetchYouTubeVideoMeta(
  videoId: string,
  apiKey?: string,
): Promise<YouTubeVideoMeta> {
  if (apiKey) {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      id: videoId,
      key: apiKey,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    if (res.ok) {
      const data = (await res.json()) as {
        items?: Array<{
          snippet: {
            title: string;
            channelTitle: string;
            thumbnails?: { maxres?: { url: string }; high?: { url: string } };
          };
          contentDetails: { duration: string };
        }>;
      };
      const item = data.items?.[0];
      if (item) {
        const duration = parseIsoDuration(item.contentDetails.duration);
        const thumb =
          item.snippet.thumbnails?.maxres?.url ??
          item.snippet.thumbnails?.high?.url ??
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        return {
          videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          duration,
          orientation: duration <= 60 ? 'portrait' : 'landscape',
          thumbnailUrl: thumb,
        };
      }
    }
  }

  const player = await fetchInnertubePlayer(videoId);
  const details = player.videoDetails as
    | {
        title?: string;
        author?: string;
        lengthSeconds?: string;
        thumbnail?: { thumbnails?: Array<{ url?: string; width?: number; height?: number }> };
      }
    | undefined;

  if (!details?.title) {
    throw new Error('YouTube 영상 메타데이터를 찾을 수 없습니다.');
  }

  const thumbs = details.thumbnail?.thumbnails ?? [];
  const bestThumb = thumbs[thumbs.length - 1];
  const duration = parseInt(details.lengthSeconds ?? '0', 10) || 0;

  return {
    videoId,
    title: details.title,
    channelTitle: details.author ?? '',
    duration,
    orientation: getOrientation(bestThumb?.width ?? 0, bestThumb?.height ?? 0),
    thumbnailUrl: bestThumb?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

export async function fetchYouTubeStoryboardFrames(
  videoId: string,
  count: number,
  apiKey?: string,
): Promise<{ meta: YouTubeVideoMeta; frames: StoryboardFrameRef[] }> {
  const meta = await fetchYouTubeVideoMeta(videoId, apiKey);
  const player = await fetchInnertubePlayer(videoId);
  const spec = extractStoryboardSpec(player);

  if (spec) {
    const allFrames = parseStoryboardSpec(spec, meta.duration);
    if (allFrames.length > 0) {
      return { meta, frames: sampleEvenly(allFrames, count) };
    }
  }

  const fallbackFrames: StoryboardFrameRef[] = [
    {
      spriteUrl: meta.thumbnailUrl,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      timestamp: 0,
    },
  ];

  return { meta, frames: sampleEvenly(fallbackFrames, Math.min(count, 1)) };
}
