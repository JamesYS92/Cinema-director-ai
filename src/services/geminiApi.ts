import type { Part } from '@google/generative-ai';

function normalizeParts(parts: (string | Part)[]): Part[] {
  return parts.map((part) => (typeof part === 'string' ? { text: part } : part));
}

export async function generateViaApi(parts: (string | Part)[]): Promise<string> {
  const normalized = normalizeParts(parts);
  const payload = JSON.stringify({ parts: normalized });

  if (payload.length > 4 * 1024 * 1024) {
    throw new Error(
      '분석 데이터가 너무 큽니다. 컷 수를 줄이거나(8장 이하 권장) 다시 시도해 주세요.',
    );
  }

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; text?: string };
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(
        '요청 용량이 서버 제한을 초과했습니다. 컷 수를 줄이고(8장 이하 권장) 다시 시도해 주세요.',
      );
    }
    throw new Error(data.error || `AI 서버 오류 (${res.status})`);
  }
  if (!data.text) throw new Error('AI 응답이 비어 있습니다.');
  return data.text;
}
