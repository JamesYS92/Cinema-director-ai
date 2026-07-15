export const config = { runtime: 'edge' };

const DEFAULT_PROXY_URL = 'https://vibe-llm-proxy-17280846291.asia-northeast3.run.app';
const DEFAULT_PROXY_MODEL = 'gemini-2.0-flash-lite';

type LlmPart = string | { text?: string; inlineData?: { mimeType: string; data: string } };

function normalizeParts(parts: LlmPart[]) {
  return parts.map((part) => (typeof part === 'string' ? { text: part } : part));
}

function toGeminiRestParts(parts: LlmPart[]) {
  return normalizeParts(parts).map((part) => {
    if (part.text) return { text: part.text };
    if (part.inlineData) {
      return {
        inline_data: { mime_type: part.inlineData.mimeType, data: part.inlineData.data },
      };
    }
    return { text: '' };
  });
}

function hasMedia(parts: ReturnType<typeof normalizeParts>) {
  return parts.some((part) => !!part.inlineData);
}

function buildMessages(parts: ReturnType<typeof normalizeParts>) {
  const blocks: Array<Record<string, string>> = [];
  for (const part of parts) {
    if (part.text) blocks.push({ type: 'text', text: part.text });
    else if (part.inlineData) {
      blocks.push({ type: 'image', mimeType: part.inlineData.mimeType, data: part.inlineData.data });
    }
  }
  const content = blocks.length === 1 && blocks[0].type === 'text' ? blocks[0].text! : blocks;
  return [{ role: 'user', content }];
}

function buildMultimodalMessages(parts: ReturnType<typeof normalizeParts>) {
  const blocks: Array<Record<string, unknown>> = [];
  for (const part of parts) {
    if (part.text) blocks.push({ type: 'text', text: part.text });
    else if (part.inlineData) {
      blocks.push({
        type: 'inline_data',
        inline_data: { mime_type: part.inlineData.mimeType, data: part.inlineData.data },
      });
    }
  }
  return [{ role: 'user', content: blocks }];
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
  }
  return `Study LLM 프록시 오류 (${status})`;
}

function parseQuotaError(message: string): number | null {
  const lower = message.toLowerCase();
  if (!lower.includes('429') && !lower.includes('quota') && !lower.includes('rate limit')) return null;
  const retryMatch =
    message.match(/retry in ([\d.]+)s/i) ?? message.match(/"retryDelay":\s*"?(\d+)/i);
  return retryMatch ? Math.min(120, Math.ceil(parseFloat(retryMatch[1]))) : 30;
}

async function callProxy(baseUrl: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/api/v1/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

async function generateViaStudyProxy(parts: LlmPart[], jsonMode: boolean): Promise<Response> {
  const token = (process.env.STUDY_LLM_API_TOKEN ?? '').trim();
  if (!token) {
    return Response.json({ error: 'Study LLM API 토큰이 설정되지 않았습니다.' }, { status: 503 });
  }
  if (!token.startsWith('study_live_')) {
    return Response.json(
      { error: 'STUDY_LLM_API_TOKEN 형식이 잘못되었습니다. study_live_ 로 시작해야 합니다.' },
      { status: 400 },
    );
  }

  const baseUrl = (process.env.STUDY_LLM_API_URL?.trim() || DEFAULT_PROXY_URL).replace(/\/$/, '');
  const model = (process.env.STUDY_LLM_MODEL?.trim() || DEFAULT_PROXY_MODEL);
  const normalized = normalizeParts(parts);
  const media = hasMedia(normalized);
  const baseBody: Record<string, unknown> = { provider: 'google', model, maxOutputTokens: 8192 };
  if (jsonMode) baseBody.generationConfig = { responseMimeType: 'application/json' };

  const attempts = media
    ? [{ ...baseBody, parts: normalized }, { ...baseBody, messages: buildMultimodalMessages(normalized) }]
    : [{ ...baseBody, messages: buildMessages(normalized) }];

  let lastError = 'Study LLM 프록시 오류';
  let lastStatus = 500;

  for (const body of attempts) {
    const result = await callProxy(baseUrl, token, body);
    if (result.ok) {
      try {
        return Response.json({ text: extractProxyText(result.data) });
      } catch (err) {
        lastError = err instanceof Error ? err.message : '프록시 응답 파싱 실패';
        lastStatus = 500;
        continue;
      }
    }
    lastStatus = result.status;
    lastError = extractProxyError(result.data, result.status);
    if (result.status === 429) {
      return Response.json({ error: lastError, retryAfter: 30 }, { status: 429 });
    }
    if (result.status === 401 || result.status === 403) {
      return Response.json({ error: lastError }, { status: result.status });
    }
  }

  return Response.json({ error: lastError }, { status: lastStatus });
}

async function generateViaDirectGemini(parts: LlmPart[], jsonMode: boolean): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Gemini API 키가 서버에 설정되지 않았습니다.' }, { status: 503 });
  }

  const body: Record<string, unknown> = {
    contents: [{ parts: toGeminiRestParts(parts) }],
  };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  if (!res.ok) {
    const message = data.error?.message ?? `Gemini API 오류 (${res.status})`;
    const retryAfter = parseQuotaError(message);
    if (retryAfter) {
      return Response.json(
        {
          error: `Gemini API 요청 한도를 초과했습니다. 약 ${retryAfter}초 후 다시 시도해 주세요.`,
          retryAfter,
        },
        { status: 429 },
      );
    }
    return Response.json({ error: message }, { status: res.status });
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) return Response.json({ error: 'AI 응답이 비어 있습니다.' }, { status: 500 });
  return Response.json({ text });
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const studyToken = (process.env.STUDY_LLM_API_TOKEN ?? '').trim();
  const useProxy = studyToken.startsWith('study_live_');
  const hasDirectKey = !!process.env.GEMINI_API_KEY;

  if (!useProxy && !hasDirectKey) {
    return Response.json(
      { error: 'AI API가 설정되지 않았습니다. STUDY_LLM_API_TOKEN 또는 GEMINI_API_KEY를 등록해 주세요.' },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { parts?: LlmPart[]; jsonMode?: boolean };
  if (!body.parts?.length) {
    return Response.json({ error: 'parts가 필요합니다.' }, { status: 400 });
  }

  if (useProxy) return generateViaStudyProxy(body.parts, !!body.jsonMode);
  return generateViaDirectGemini(body.parts, !!body.jsonMode);
}
