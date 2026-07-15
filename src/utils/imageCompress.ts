const MAX_API_FRAMES = 8;
const MAX_API_WIDTH = 640;
const JPEG_QUALITY = 0.62;

function sampleFrames<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return Array.from({ length: max }, (_, i) => {
    const index = Math.round((i * (items.length - 1)) / (max - 1));
    return items[index];
  });
}

export async function compressDataUrl(
  dataUrl: string,
  maxWidth = MAX_API_WIDTH,
  quality = JPEG_QUALITY,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, 1));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function prepareFramesForApi(
  imageDataUrls: string[],
  maxFrames = MAX_API_FRAMES,
): Promise<string[]> {
  const sampled = sampleFrames(imageDataUrls, maxFrames);
  return Promise.all(sampled.map((url) => compressDataUrl(url)));
}

/** Vercel 서버리스 요청 본문 제한(~4.5MB) 대응 */
export const SERVER_VIDEO_UPLOAD_LIMIT = 800 * 1024;
