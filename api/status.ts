import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const gemini = !!process.env.GEMINI_API_KEY;
  const youtube = !!process.env.YOUTUBE_API_KEY;

  let message = '서버 API 준비 완료';
  if (!gemini) message = 'Gemini API 키가 Vercel 환경변수에 설정되지 않았습니다.';
  else if (!youtube) message = 'YouTube API 미설정 — AI 추정 레퍼런스 모드로 동작합니다.';

  return res.status(200).json({
    ready: gemini,
    gemini,
    youtube,
    message,
  });
}
