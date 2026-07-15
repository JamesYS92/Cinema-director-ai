import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isStudyProxyConfigured } from './lib/studyLlmProxy';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const studyProxy = isStudyProxyConfigured();
  const directGemini = !!process.env.GEMINI_API_KEY;
  const gemini = studyProxy || directGemini;
  const youtube = !!process.env.YOUTUBE_API_KEY;

  let message = '서버 API 준비 완료';
  if (!gemini) {
    message = 'AI API가 Vercel 환경변수에 설정되지 않았습니다. (STUDY_LLM_API_TOKEN 또는 GEMINI_API_KEY)';
  } else if (studyProxy) {
    message = 'Study LLM 프록시 연결됨 — 분석 API 사용 가능';
    if (!youtube) message += ' (YouTube 미설정 — AI 추정 레퍼런스 모드)';
  } else if (!youtube) {
    message = 'YouTube API 미설정 — AI 추정 레퍼런스 모드로 동작합니다.';
  }

  return res.status(200).json({
    ready: gemini,
    gemini,
    youtube,
    llmProvider: studyProxy ? 'study_proxy' : directGemini ? 'direct_gemini' : 'none',
    message,
  });
}
