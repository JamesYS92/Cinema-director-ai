export const config = { runtime: 'edge' };

const DEFAULT_PROXY_URL = 'https://vibe-llm-proxy-17280846291.asia-northeast3.run.app';
const DEFAULT_PROXY_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_VISION_MODEL = 'gemini-2.0-flash';

type LlmPart = string | { text?: string; inlineData?: { mimeType: string; data: string } };

function normalizeParts(parts: LlmPart[]) {
  return parts.map((part) => (typeof part === 'string' ? { text: part } : part));
}

function hasMediaParts(parts: LlmPart[]): boolean {
  return normalizeParts(parts).some((part) => !!part.inlineData);
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

function buildGeminiContentParts(normalized: ReturnType<typeof normalizeParts>, combinedText: string) {
  const geminiParts: Array<Record<string, unknown>> = [];
  if (combinedText) geminiParts.push({ text: combinedText });
  for (const part of normalized) {
    if (part.inlineData) {
      geminiParts.push({
        inline_data: { mime_type: part.inlineData.mimeType, data: part.inlineData.data },
      });
    }
  }
  return geminiParts;
}

function buildProxyBodies(parts: LlmPart[], jsonMode: boolean): Record<string, unknown>[] {
  const normalized = normalizeParts(parts);
  const model = process.env.STUDY_LLM_MODEL?.trim() || DEFAULT_PROXY_MODEL;
  const visionModel = process.env.STUDY_LLM_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;
  const jsonPrefix = jsonMode ? '반드시 유효한 JSON만 출력하세요.\n\n' : '';

  const textChunks: string[] = [];
  const imageUrls: string[] = [];
  for (const part of normalized) {
    if (part.text) textChunks.push(part.text);
    if (part.inlineData) {
      imageUrls.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
    }
  }

  const combinedText = `${jsonPrefix}${textChunks.join('\n\n')}`.trim();

  if (imageUrls.length === 0) {
    return [
      {
        provider: 'google',
        model,
        messages: [{ role: 'user', content: combinedText }],
        maxOutputTokens: 8192,
      },
    ];
  }

  const geminiParts = buildGeminiContentParts(normalized, combinedText);
  const bodies: Record<string, unknown>[] = [];

  for (const candidate of [visionModel, model]) {
    bodies.push({
      provider: 'google',
      model: candidate,
      contents: [{ role: 'user', parts: geminiParts }],
      maxOutputTokens: 8192,
    });
    bodies.push({
      provider: 'google',
      model: candidate,
      contents: [{ parts: geminiParts }],
      maxOutputTokens: 8192,
    });
  }

  bodies.push({
    provider: 'google',
    model: visionModel,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: combinedText },
          ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      },
    ],
    maxOutputTokens: 8192,
  });

  return bodies;
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
  if (!token.startsWith('study_live_')) {
    return Response.json(
      { error: 'STUDY_LLM_API_TOKEN 형식이 잘못되었습니다. study_live_ 로 시작해야 합니다.' },
      { status: 400 },
    );
  }

  const baseUrl = (process.env.STUDY_LLM_API_URL?.trim() || DEFAULT_PROXY_URL).replace(/\/$/, '');
  const bodies = buildProxyBodies(parts, jsonMode);
  let lastError = 'Study LLM 프록시 오류';
  let lastStatus = 500;

  for (const body of bodies) {
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

  const payload: Record<string, unknown> = {
    contents: [{ parts: toGeminiRestParts(parts) }],
  };
  if (jsonMode) {
    payload.generationConfig = { responseMimeType: 'application/json' };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
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

async function generateWithProvider(
  parts: LlmPart[],
  jsonMode: boolean,
  useProxy: boolean,
  hasDirectKey: boolean,
): Promise<Response> {
  const hasMedia = hasMediaParts(parts);

  // Study 프록시는 멀티모달(이미지) 미지원 → 이미지는 Gemini 직접 호출 우선
  if (hasMedia) {
    if (hasDirectKey) {
      return generateViaDirectGemini(parts, jsonMode);
    }
    if (useProxy) {
      const proxyResponse = await generateViaStudyProxy(parts, jsonMode);
      if (proxyResponse.status < 400) return proxyResponse;
      const proxyData = (await proxyResponse.clone().json().catch(() => ({}))) as { error?: string };
      return Response.json(
        {
          error:
            proxyData.error ??
            '이미지 분석에 실패했습니다. Vercel에 GEMINI_API_KEY를 추가해 주세요. (Study 프록시는 이미지 미지원)',
        },
        { status: proxyResponse.status },
      );
    }
    return Response.json(
      { error: '이미지 분석에는 GEMINI_API_KEY가 필요합니다.' },
      { status: 503 },
    );
  }

  if (useProxy) return generateViaStudyProxy(parts, jsonMode);
  return generateViaDirectGemini(parts, jsonMode);
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

  return generateWithProvider(body.parts, !!body.jsonMode, useProxy, hasDirectKey);
}
