import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

function parseQuotaError(message: string): { retryAfter: number } | null {
  const lower = message.toLowerCase();
  if (!lower.includes('429') && !lower.includes('quota') && !lower.includes('rate limit')) {
    return null;
  }
  const retryMatch =
    message.match(/retry in ([\d.]+)s/i) ?? message.match(/"retryDelay":\s*"?(\d+)/i);
  const retryAfter = retryMatch ? Math.min(120, Math.ceil(parseFloat(retryMatch[1]))) : 30;
  return { retryAfter };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Gemini API 키가 서버에 설정되지 않았습니다.' });
  }

  const { parts, jsonMode } = req.body as { parts?: unknown[]; jsonMode?: boolean };
  if (!parts?.length) {
    return res.status(400).json({ error: 'parts가 필요합니다.' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      ...(jsonMode ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    });
    const result = await model.generateContent(parts);
    return res.status(200).json({ text: result.response.text() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini API 오류';
    const quota = parseQuotaError(message);
    if (quota) {
      return res.status(429).json({
        error:
          `Gemini API 요청 한도를 초과했습니다. (무료 플랜: 일 20회 제한)\n` +
          `약 ${quota.retryAfter}초 후 다시 시도하거나, Google AI Studio에서 유료 결제를 활성화해 주세요.`,
        retryAfter: quota.retryAfter,
      });
    }
    return res.status(500).json({ error: message });
  }
}
