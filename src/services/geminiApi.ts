import type { Part } from '@google/generative-ai';

export const MAX_REQUEST_BYTES = 3.5 * 1024 * 1024;
export const IMAGES_PER_BATCH = 10;

function normalizeParts(parts: (string | Part)[]): Part[] {
  return parts.map((part) => (typeof part === 'string' ? { text: part } : part));
}

export function estimatePayloadBytes(parts: (string | Part)[]): number {
  return JSON.stringify({ parts: normalizeParts(parts) }).length;
}

export type GenerateApiOptions = { jsonMode?: boolean };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ApiResponse = { error?: string; text?: string; retryAfter?: number };

async function postGemini(payload: string): Promise<{ res: Response; data: ApiResponse }> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  const data = (await res.json().catch(() => ({}))) as ApiResponse;
  return { res, data };
}

export async function generateViaApi(
  parts: (string | Part)[],
  options?: GenerateApiOptions,
): Promise<string> {
  const normalized = normalizeParts(parts);
  const payload = JSON.stringify({ parts: normalized, jsonMode: options?.jsonMode ?? false });

  if (payload.length > 4 * 1024 * 1024) {
    throw new Error('분석 데이터가 너무 큽니다. 잠시 후 다시 시도해 주세요.');
  }

  let { res, data } = await postGemini(payload);

  if (res.status === 429) {
    const retryAfter = Math.min(data.retryAfter ?? 30, 60);
    await sleep(retryAfter * 1000);
    ({ res, data } = await postGemini(payload));
  }

  if (!res.ok) {
    if (res.status === 413) {
      throw new Error('요청 용량이 서버 제한을 초과했습니다. 잠시 후 다시 시도해 주세요.');
    }
    if (res.status === 429) {
      throw new Error(
        data.error ??
          'Gemini API 요청 한도를 초과했습니다. 잠시 후 다시 시도하거나 Google AI Studio 유료 플랜을 활성화해 주세요.',
      );
    }
    throw new Error(data.error || `AI 서버 오류 (${res.status})`);
  }
  if (!data.text) throw new Error('AI 응답이 비어 있습니다.');
  return data.text;
}

/** 배치 호출 간 분당 한도 완화 */
export function apiThrottle(): Promise<void> {
  return sleep(600);
}
