import type { CaptureResult } from '../types';

import { fetchThumbnailAsBase64 } from '../services/youtube';

export interface StoryboardFrameRef {
  spriteUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = url;
  });
}

async function loadImageWithFallback(url: string): Promise<HTMLImageElement> {
  try {
    return await loadImage(url);
  } catch {
    const base64 = await fetchThumbnailAsBase64(url);
    if (!base64) throw new Error('YouTube 프레임 이미지를 불러오지 못했습니다.');
    return loadImage(`data:image/jpeg;base64,${base64}`);
  }
}

export async function storyboardRefToCapture(ref: StoryboardFrameRef): Promise<CaptureResult> {
  const img = await loadImageWithFallback(ref.spriteUrl);

  const width = ref.width > 0 ? ref.width : img.naturalWidth;
  const height = ref.height > 0 ? ref.height : img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('프레임 캔버스를 생성하지 못했습니다.');

  if (ref.width > 0 && ref.height > 0) {
    ctx.drawImage(img, ref.x, ref.y, ref.width, ref.height, 0, 0, width, height);
  } else {
    ctx.drawImage(img, 0, 0, width, height);
  }

  return {
    imageDataUrl: canvas.toDataURL('image/jpeg', 0.85),
    timestamp: ref.timestamp,
    width,
    height,
  };
}

export async function storyboardRefsToCaptures(refs: StoryboardFrameRef[]): Promise<CaptureResult[]> {
  const captures: CaptureResult[] = [];
  for (const ref of refs) {
    try {
      captures.push(await storyboardRefToCapture(ref));
    } catch {
      /* skip broken frame */
    }
  }
  if (captures.length === 0) {
    throw new Error('YouTube 프레임을 추출하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  return captures;
}
