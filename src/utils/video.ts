/** 영상 길이를 N등분하여 각 구간 중앙 시점의 타임스탬프 배열 반환 */
export function computeAutoCaptureTimestamps(duration: number, count: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || count <= 0) return [];
  const segment = duration / count;
  return Array.from({ length: count }, (_, i) => segment * i + segment / 2);
}

export type VideoOrientation = 'landscape' | 'portrait' | 'square';

export function getVideoOrientation(width: number, height: number): VideoOrientation {
  if (!width || !height) return 'landscape';
  const ratio = width / height;
  if (ratio < 0.95) return 'portrait';
  if (ratio > 1.05) return 'landscape';
  return 'square';
}

export function detectDominantOrientation(
  frames: { width: number; height: number }[],
): VideoOrientation {
  if (frames.length === 0) return 'landscape';
  const counts: Record<VideoOrientation, number> = { portrait: 0, landscape: 0, square: 0 };
  for (const f of frames) {
    counts[getVideoOrientation(f.width, f.height)]++;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as VideoOrientation;
}

export const ORIENTATION_LABELS: Record<VideoOrientation, string> = {
  portrait: '세로형 (9:16 숏폼)',
  landscape: '가로형 (16:9)',
  square: '정사각형 (1:1)',
};

export const ORIENTATION_REFERENCE_HINT: Record<VideoOrientation, string> = {
  portrait: 'YouTube Shorts / Instagram Reels / TikTok 등 세로형 숏폼',
  landscape: 'YouTube 롱폼 / 가로형 콘텐츠',
  square: 'Instagram 피드 / 정사각형 콘텐츠',
};
