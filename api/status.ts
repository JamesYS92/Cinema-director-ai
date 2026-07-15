export const config = { runtime: 'edge' };

export default function handler() {
  const studyToken = (process.env.STUDY_LLM_API_TOKEN ?? '').trim();
  const studyProxy = studyToken.startsWith('study_live_');
  const directGemini = !!process.env.GEMINI_API_KEY;
  const gemini = studyProxy || directGemini;
  const youtube = !!process.env.YOUTUBE_API_KEY;

  let message = '서버 API 준비 완료';
  if (!gemini) {
    if (studyToken && !studyProxy) {
      message =
        'STUDY_LLM_API_TOKEN 형식이 잘못되었습니다. study_live_ 로 시작하는 토큰을 Vercel에 등록해 주세요.';
    } else {
      message = 'AI API가 Vercel 환경변수에 설정되지 않았습니다. (STUDY_LLM_API_TOKEN 또는 GEMINI_API_KEY)';
    }
  } else if (studyProxy) {
    message = directGemini
      ? 'Study LLM 프록시 연결됨 — 텍스트는 프록시, 이미지는 Gemini 직접 호출'
      : 'Study LLM 프록시 연결됨 — 텍스트 분석 가능 (이미지 분석은 GEMINI_API_KEY 필요)';
    if (!youtube) message += ' (YouTube 미설정 — AI 추정 레퍼런스 모드)';
  } else if (!youtube) {
    message = 'YouTube API 미설정 — AI 추정 레퍼런스 모드로 동작합니다.';
  }

  return Response.json({
    ready: gemini,
    gemini,
    youtube,
    llmProvider: studyProxy ? 'study_proxy' : directGemini ? 'direct_gemini' : 'none',
    message,
  });
}
