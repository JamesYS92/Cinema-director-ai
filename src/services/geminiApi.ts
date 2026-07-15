import type { Part } from '@google/generative-ai';

function normalizeParts(parts: (string | Part)[]): Part[] {
  return parts.map((part) => (typeof part === 'string' ? { text: part } : part));
}

export async function generateViaApi(parts: (string | Part)[]): Promise<string> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts: normalizeParts(parts) }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; text?: string };
  if (!res.ok) {
    throw new Error(data.error || `AI 서버 오류 (${res.status})`);
  }
  if (!data.text) throw new Error('AI 응답이 비어 있습니다.');
  return data.text;
}
