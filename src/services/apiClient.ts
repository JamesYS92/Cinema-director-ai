export interface ApiStatus {
  ready: boolean;
  gemini: boolean;
  youtube: boolean;
  message: string;
}

export async function fetchApiStatus(): Promise<ApiStatus> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) {
      return {
        ready: false,
        gemini: false,
        youtube: false,
        message: '서버 API 상태를 확인할 수 없습니다.',
      };
    }
    return (await res.json()) as ApiStatus;
  } catch {
    return {
      ready: false,
      gemini: false,
      youtube: false,
      message: '서버에 연결할 수 없습니다. Vercel 배포 환경에서 실행해 주세요.',
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
