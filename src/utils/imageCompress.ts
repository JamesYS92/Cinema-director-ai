const MAX_API_WIDTH = 480;
const JPEG_QUALITY = 0.5;

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

/** 전체 컷보드(최대 30장)를 API 전송용으로 압축 */
export async function prepareFramesForApi(imageDataUrls: string[]): Promise<string[]> {
  return Promise.all(imageDataUrls.map((url) => compressDataUrl(url)));
}

/** Vercel 서버리스 요청 본문 제한(~4.5MB) 대응 */
export const SERVER_VIDEO_UPLOAD_LIMIT = 800 * 1024;
