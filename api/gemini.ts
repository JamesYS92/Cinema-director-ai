import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Gemini API 키가 서버에 설정되지 않았습니다.' });
  }

  const { parts } = req.body as { parts?: unknown[] };
  if (!parts?.length) {
    return res.status(400).json({ error: 'parts가 필요합니다.' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(parts);
    return res.status(200).json({ text: result.response.text() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini API 오류';
    return res.status(500).json({ error: message });
  }
}
