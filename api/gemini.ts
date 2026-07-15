import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateViaStudyProxy, isStudyProxyConfigured, type LlmPart } from './lib/studyLlmProxy';

function parseQuotaError(message: string): { retryAfter: number } | null {
  const lower = message.toLowerCase();
  if (
    !lower.includes('429') &&
    !lower.includes('quota') &&
    !lower.includes('rate limit') &&
    !lower.includes('limit exceeded') &&
    !lower.includes('too many')
  ) {
    return null;
  }
  const retryMatch =
    message.match(/retry in ([\d.]+)s/i) ?? message.match(/"retryDelay":\s*"?(\d+)/i);
  const retryAfter = retryMatch ? Math.min(120, Math.ceil(parseFloat(retryMatch[1]))) : 30;
  return { retryAfter };
}

function formatQuotaMessage(useProxy: boolean, retryAfter: number): string {
  if (useProxy) {
    return (
      `Study LLM 프록시 요청 한도를 초과했습니다.\n` +
      `약 ${retryAfter}초 후 다시 시도해 주세요. (계정 한도: 분 30회 / 일 500회)`
    );
  }
  return (
    `Gemini API 요청 한도를 초과했습니다. (무료 플랜: 일 20회 제한)\n` +
    `약 ${retryAfter}초 후 다시 시도하거나, Study LLM 프록시 토큰을 설정해 주세요.`
  );
}

async function generateViaDirectGemini(parts: LlmPart[], jsonMode: boolean): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API 키가 서버에 설정되지 않았습니다.');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    ...(jsonMode ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
  });
  const result = await model.generateContent(parts);
  return result.response.text();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const useProxy = isStudyProxyConfigured();
  const hasDirectKey = !!process.env.GEMINI_API_KEY;

  if (!useProxy && !hasDirectKey) {
    return res.status(503).json({
      error:
        'AI API가 설정되지 않았습니다. Vercel에 STUDY_LLM_API_TOKEN 또는 GEMINI_API_KEY를 등록해 주세요.',
    });
  }

  const { parts, jsonMode } = req.body as { parts?: LlmPart[]; jsonMode?: boolean };
  if (!parts?.length) {
    return res.status(400).json({ error: 'parts가 필요합니다.' });
  }

  try {
    if (useProxy) {
      const proxyResult = await generateViaStudyProxy(parts, !!jsonMode);
      if (proxyResult.status !== 200) {
        const quota = proxyResult.status === 429 ? { retryAfter: proxyResult.retryAfter ?? 30 } : null;
        if (quota) {
          return res.status(429).json({
            error: formatQuotaMessage(true, quota.retryAfter),
            retryAfter: quota.retryAfter,
          });
        }
        return res.status(proxyResult.status).json({ error: proxyResult.error ?? 'Study LLM 프록시 오류' });
      }
      return res.status(200).json({ text: proxyResult.text });
    }

    const text = await generateViaDirectGemini(parts, !!jsonMode);
    return res.status(200).json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini API 오류';
    const quota = parseQuotaError(message);
    if (quota) {
      return res.status(429).json({
        error: formatQuotaMessage(false, quota.retryAfter),
        retryAfter: quota.retryAfter,
      });
    }
    return res.status(500).json({ error: message });
  }
}
