const DEFAULT_PROXY_URL = 'https://vibe-llm-proxy-17280846291.asia-northeast3.run.app';
const DEFAULT_PROXY_MODEL = 'gemini-2.0-flash-lite';

export type LlmPart = string | { text?: string; inlineData?: { mimeType: string; data: string } };

function normalizeParts(parts: LlmPart[]): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
  return parts.map((part) => {
    if (typeof part === 'string') return { text: part };
    return part;
  });
}

function hasMedia(parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>): boolean {
  return parts.some((part) => !!part.inlineData);
}

function buildMessages(
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
): Array<{ role: string; content: string | Array<Record<string, string>> }> {
  const blocks: Array<Record<string, string>> = [];

  for (const part of parts) {
    if (part.text) {
      blocks.push({ type: 'text', text: part.text });
      continue;
    }
    if (part.inlineData) {
      blocks.push({
        type: 'image',
        mimeType: part.inlineData.mimeType,
        data: part.inlineData.data,
      });
    }
  }

  const content =
    blocks.length === 1 && blocks[0].type === 'text' ? blocks[0].text! : blocks;

  return [{ role: 'user', content }];
}

function extractProxyText(data: Record<string, unknown>): string {
  if (typeof data.text === 'string') return data.text;
  if (typeof data.content === 'string') return data.content;
  if (typeof data.output === 'string') return data.output;

  const message = data.message as { content?: string } | undefined;
  if (message?.content) return message.content;

  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  if (choices?.[0]?.message?.content) return choices[0].message.content;

  const nested = data.data as Record<string, unknown> | undefined;
  if (nested) return extractProxyText(nested);

  throw new Error('프록시 응답에서 텍스트를 찾을 수 없습니다.');
}

function extractProxyError(data: Record<string, unknown>, status: number): string {
  const error = data.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: string }).message;
    if (message) return message;
    const code = (error as { code?: string }).code;
    if (code) return `${code}: ${message ?? '프록시 오류'}`;
  }
  return `Study LLM 프록시 오류 (${status})`;
}

export function isStudyProxyConfigured(): boolean {
  return !!process.env.STUDY_LLM_API_TOKEN?.trim();
}

function buildMultimodalMessages(
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
): Array<{ role: string; content: Array<Record<string, unknown>> }> {
  const blocks: Array<Record<string, unknown>> = [];

  for (const part of parts) {
    if (part.text) {
      blocks.push({ type: 'text', text: part.text });
      continue;
    }
    if (part.inlineData) {
      blocks.push({
        type: 'inline_data',
        inline_data: {
          mime_type: part.inlineData.mimeType,
          data: part.inlineData.data,
        },
      });
    }
  }

  return [{ role: 'user', content: blocks }];
}

async function callProxy(
  baseUrl: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/v1/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

export async function generateViaStudyProxy(
  parts: LlmPart[],
  jsonMode = false,
): Promise<{ text: string; status: number; retryAfter?: number; error?: string }> {
  const token = process.env.STUDY_LLM_API_TOKEN?.trim();
  if (!token) {
    return { text: '', status: 503, error: 'Study LLM API 토큰이 설정되지 않았습니다.' };
  }

  const baseUrl = (process.env.STUDY_LLM_API_URL?.trim() || DEFAULT_PROXY_URL).replace(/\/$/, '');
  const model = process.env.STUDY_LLM_MODEL?.trim() || DEFAULT_PROXY_MODEL;
  const normalized = normalizeParts(parts);
  const media = hasMedia(normalized);

  const baseBody: Record<string, unknown> = {
    provider: 'google',
    model,
    maxOutputTokens: 8192,
  };
  if (jsonMode) {
    baseBody.generationConfig = { responseMimeType: 'application/json' };
  }

  const attempts: Record<string, unknown>[] = [];
  if (media) {
    attempts.push({ ...baseBody, parts: normalized });
    attempts.push({ ...baseBody, messages: buildMultimodalMessages(normalized) });
  } else {
    attempts.push({ ...baseBody, messages: buildMessages(normalized) });
  }

  let lastError = 'Study LLM 프록시 오류';
  let lastStatus = 500;

  for (const body of attempts) {
    const result = await callProxy(baseUrl, token, body);
    if (result.ok) {
      try {
        return { text: extractProxyText(result.data), status: 200 };
      } catch (err) {
        lastError = err instanceof Error ? err.message : '프록시 응답 파싱 실패';
        lastStatus = 500;
        continue;
      }
    }

    lastStatus = result.status;
    lastError = extractProxyError(result.data, result.status);
    if (result.status === 429) {
      return { text: '', status: 429, retryAfter: 30, error: lastError };
    }
    if (result.status === 401 || result.status === 403) {
      return { text: '', status: result.status, error: lastError };
    }
  }

  return { text: '', status: lastStatus, error: lastError };
}
