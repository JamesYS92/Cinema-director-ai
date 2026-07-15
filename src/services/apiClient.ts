export interface ApiStatus {
  ready: boolean;
  gemini: boolean;
  youtube: boolean;
  llmProvider?: 'study_proxy' | 'direct_gemini' | 'none';
  message: string;
}

export async function fetchApiStatus(): Promise<ApiStatus> {
  try {
    const res = await fetch(`/api/status?_=${Date.now()}`, { cache: 'no-store' });
    const contentType = res.headers.get('content-type') ?? '';

    if (!res.ok) {
      return {
        ready: false,
        gemini: false,
        youtube: false,
        message:
          `서버 API 오류 (HTTP ${res.status}). Vercel → Deployments에서 최신 배포가 Production인지 확인 후 Redeploy 해 주세요.`,
      };
    }

    if (!contentType.includes('application/json')) {
      return {
        ready: false,
        gemini: false,
        youtube: false,
        message:
          '서버 API 경로가 응답하지 않습니다. 예전 배포가 Production에 연결된 상태일 수 있습니다. Vercel에서 최신 커밋(290288c)을 Production으로 승격해 주세요.',
      };
    }

    return (await res.json()) as ApiStatus;
  } catch {
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    return {
      ready: false,
      gemini: false,
      youtube: false,
      message: isLocal
        ? '로컬 개발 서버에서는 API가 동작하지 않습니다. cinema-director-ai.vercel.app 에서 접속하거나 vercel dev 를 사용해 주세요.'
        : '서버에 연결할 수 없습니다. 인터넷 연결과 배포 URL을 확인해 주세요.',
    };
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; result?: T; text?: string };
  if (!res.ok) {
    throw new Error(data.error || `요청 실패 (${res.status})`);
  }
  if (data.result !== undefined) return data.result;
  if (data.text !== undefined) return data.text as T;
  return data as T;
}
