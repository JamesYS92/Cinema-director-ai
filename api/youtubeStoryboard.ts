export type VideoOrientation = 'portrait' | 'landscape' | 'square';

export interface YouTubeVideoMeta {
  videoId: string;
  title: string;
  channelTitle: string;
  duration: number;
  orientation: VideoOrientation;
  thumbnailUrl: string;
  frameSource: 'storyboard' | 'thumbnail';
}

export interface StoryboardFrameRef {
  spriteUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
}

interface StoryboardLevel {
  levelIndex: number;
  width: number;
  height: number;
  count: number;
  cols: number;
  rows: number;
  replacement: string;
  sigh: string;
}

const WATCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Cookie: 'CONSENT=YES+cb; SOCS=CAI',
};

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
  if (items.length === 0) return [];
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => {
    const index = Math.round((i * (items.length - 1)) / (count - 1));
    return items[index]!;
  });
}

function extractBalancedJson(html: string, marker: string): string | null {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const start = html.indexOf('{', idx);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function extractSpecFromHtml(html: string): string | null {
  const direct = html.match(/"playerStoryboardSpecRenderer":\{"spec":"((?:\\.|[^"\\])*)"/);
  if (direct?.[1]) {
    return direct[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  }
  return null;
}

async function fetchPageHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: WATCH_HEADERS });
  if (!res.ok) {
    throw new Error('YouTube 영상 페이지를 불러오지 못했습니다.');
  }
  return res.text();
}

async function fetchWatchPagePlayer(videoId: string): Promise<Record<string, unknown>> {
  const urls = [
    `https://www.youtube.com/shorts/${videoId}`,
    `https://www.youtube.com/watch?v=${videoId}`,
  ];

  let lastError = 'YouTube 플레이어 정보를 찾을 수 없습니다.';

  for (const url of urls) {
    try {
      const html = await fetchPageHtml(url);
      const jsonText =
        extractBalancedJson(html, 'ytInitialPlayerResponse') ??
        extractBalancedJson(html, 'var ytInitialPlayerResponse');

      if (!jsonText) continue;
      return JSON.parse(jsonText) as Record<string, unknown>;
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }

  throw new Error(lastError);
}

function parseStoryboardLevels(spec: string): { baseUrl: string; levels: StoryboardLevel[] } {
  const parts = spec.split('|');
  const baseUrl = parts[0];
  if (!baseUrl) return { baseUrl: '', levels: [] };

  const levels = parts.slice(1).map((part, levelIndex) => {
    const chunks = part.split('#');
    let replacement = chunks[6] ?? 'M$M';
    if (replacement === 'default') replacement = 'M$M';
    const sighRaw = part.includes('rs$') ? part.split('rs$')[1] : '';

    return {
      levelIndex,
      width: parseInt(chunks[0] ?? '0', 10),
      height: parseInt(chunks[1] ?? '0', 10),
      count: parseInt(chunks[2] ?? '0', 10),
      cols: parseInt(chunks[3] ?? '0', 10),
      rows: parseInt(chunks[4] ?? '0', 10),
      replacement,
      sigh: sighRaw ? `rs$${sighRaw}` : '',
    };
  });

  return { baseUrl, levels: levels.filter((l) => l.width > 0 && l.height > 0 && l.count > 0) };
}

function buildSpriteUrl(baseUrl: string, level: StoryboardLevel, sheetIndex: number): string {
  const nRepl = level.replacement.replace('$M', String(sheetIndex));
  let url = baseUrl.replace(/\$L/g, String(level.levelIndex)).replace(/\$N/g, nRepl);
  if (level.sigh) url += `&sigh=${encodeURIComponent(level.sigh)}`;
  return url;
}

async function isSpriteUrlReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', headers: WATCH_HEADERS });
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 1000;
  } catch {
    return false;
  }
}

function buildFramesFromLevel(
  baseUrl: string,
  level: StoryboardLevel,
  duration: number,
): StoryboardFrameRef[] {
  const framesPerSheet = level.cols * level.rows;
  const frameInterval = duration > 0 ? duration / level.count : 1;
  const frames: StoryboardFrameRef[] = [];

  for (let i = 0; i < level.count; i++) {
    const sheetIndex = Math.floor(i / framesPerSheet);
    const pos = i % framesPerSheet;
    const col = pos % level.cols;
    const row = Math.floor(pos / level.cols);

    frames.push({
      spriteUrl: buildSpriteUrl(baseUrl, level, sheetIndex),
      x: col * level.width,
      y: row * level.height,
      width: level.width,
      height: level.height,
      timestamp: Math.min(i * frameInterval, duration || i * frameInterval),
    });
  }

  return frames;
}

async function parseStoryboardSpec(spec: string, duration: number): Promise<StoryboardFrameRef[]> {
  const { baseUrl, levels } = parseStoryboardLevels(spec);
  if (!baseUrl || levels.length === 0) return [];

  const sorted = [...levels].sort((a, b) => b.width * b.height - a.width * a.height);
  for (const level of sorted) {
    const probeUrl = buildSpriteUrl(baseUrl, level, 0);
    const reachable = await isSpriteUrlReachable(probeUrl);
    if (!reachable && level.levelIndex > 0) continue;

    const frames = buildFramesFromLevel(baseUrl, level, duration);
    if (frames.length > 0) return frames;
  }

  for (const level of sorted) {
    const frames = buildFramesFromLevel(baseUrl, level, duration);
    if (frames.length > 0) return frames;
  }

  return [];
}

function extractStoryboardSpec(
  player: Record<string, unknown>,
  htmlSpec?: string | null,
): string | null {
  const storyboards = player.storyboards as Record<string, unknown> | undefined;
  const renderer = storyboards?.playerStoryboardSpecRenderer as { spec?: string } | undefined;
  return renderer?.spec ?? htmlSpec ?? null;
}

function extractVideoDetails(player: Record<string, unknown>) {
  return player.videoDetails as
    | {
        title?: string;
        author?: string;
        lengthSeconds?: string;
        thumbnail?: { thumbnails?: Array<{ url?: string; width?: number; height?: number }> };
      }
    | undefined;
}

function metaFromPlayer(player: Record<string, unknown>, videoId: string): YouTubeVideoMeta {
  const details = extractVideoDetails(player);
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
    frameSource: 'storyboard',
  };
}

function buildThumbnailFallback(meta: YouTubeVideoMeta, count: number): StoryboardFrameRef[] {
  const duration = meta.duration || count;
  return Array.from({ length: count }, (_, i) => ({
    spriteUrl: meta.thumbnailUrl,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    timestamp: duration > 0 ? (duration * i) / Math.max(count - 1, 1) : i,
  }));
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
            thumbnails?: {
              maxres?: { url: string };
              standard?: { url: string };
              high?: { url: string };
            };
          };
          contentDetails: { duration: string };
        }>;
      };
      const item = data.items?.[0];
      if (item) {
        const duration = parseIsoDuration(item.contentDetails.duration);
        const thumb =
          item.snippet.thumbnails?.maxres?.url ??
          item.snippet.thumbnails?.standard?.url ??
          item.snippet.thumbnails?.high?.url ??
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        return {
          videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          duration,
          orientation: duration <= 60 ? 'portrait' : 'landscape',
          thumbnailUrl: thumb,
          frameSource: 'storyboard',
        };
      }
    }
  }

  const player = await fetchWatchPagePlayer(videoId);
  return metaFromPlayer(player, videoId);
}

export async function fetchYouTubeStoryboardFrames(
  videoId: string,
  count: number,
  apiKey?: string,
): Promise<{ meta: YouTubeVideoMeta; frames: StoryboardFrameRef[] }> {
  const urls = [
    `https://www.youtube.com/shorts/${videoId}`,
    `https://www.youtube.com/watch?v=${videoId}`,
  ];

  let player: Record<string, unknown> | null = null;
  let htmlSpec: string | null = null;

  for (const url of urls) {
    try {
      const html = await fetchPageHtml(url);
      htmlSpec = htmlSpec ?? extractSpecFromHtml(html);
      const jsonText =
        extractBalancedJson(html, 'ytInitialPlayerResponse') ??
        extractBalancedJson(html, 'var ytInitialPlayerResponse');
      if (jsonText) {
        player = JSON.parse(jsonText) as Record<string, unknown>;
        break;
      }
    } catch {
      /* try next */
    }
  }

  if (!player) {
    throw new Error('YouTube 영상 정보를 불러오지 못했습니다.');
  }

  let meta: YouTubeVideoMeta;
  if (apiKey) {
    try {
      meta = await fetchYouTubeVideoMeta(videoId, apiKey);
    } catch {
      meta = metaFromPlayer(player, videoId);
    }
  } else {
    meta = metaFromPlayer(player, videoId);
  }

  const details = extractVideoDetails(player);
  if (details?.lengthSeconds) {
    meta.duration = parseInt(details.lengthSeconds, 10) || meta.duration;
  }

  const spec = extractStoryboardSpec(player, htmlSpec);
  if (spec) {
    const allFrames = await parseStoryboardSpec(spec, meta.duration);
    if (allFrames.length > 0) {
      return { meta, frames: sampleEvenly(allFrames, count) };
    }
  }

  if (meta.thumbnailUrl) {
    meta.frameSource = 'thumbnail';
    return {
      meta,
      frames: buildThumbnailFallback(meta, count),
    };
  }

  throw new Error(
    'YouTube 미리보기 프레임을 가져올 수 없습니다. 연령 제한·비공개·지역 제한 영상이거나 서버에서 스토리보드가 비활성화된 경우입니다.',
  );
}
