const API_KEY_STORAGE = 'cinema-director-ai-gemini-key';
const YOUTUBE_API_KEY_STORAGE = 'cinema-director-ai-youtube-key';

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE);
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE);
}

export function getYoutubeApiKey(): string | null {
  return localStorage.getItem(YOUTUBE_API_KEY_STORAGE);
}

export function setYoutubeApiKey(key: string): void {
  localStorage.setItem(YOUTUBE_API_KEY_STORAGE, key);
}

export function clearYoutubeApiKey(): void {
  localStorage.removeItem(YOUTUBE_API_KEY_STORAGE);
}

export function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}

export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] ?? dataUrl;
}

export function generateId(): string {
  return crypto.randomUUID();
}
