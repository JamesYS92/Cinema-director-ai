function stripCodeFences(text: string): string {
  return text
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
}

/** 응답 텍스트에서 균형 잡힌 최상위 JSON 객체 추출 */
export function extractJsonObject(text: string): string {
  const cleaned = stripCodeFences(text);
  const start = cleaned.indexOf('{');
  if (start === -1) {
    throw new Error('AI 응답에서 JSON을 찾을 수 없습니다.');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }

  throw new Error('AI 응답 JSON이 잘려 있습니다. 다시 시도해 주세요.');
}

function repairJson(json: string): string {
  return json
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/:\s*0-100\b/g, ': 75')
    .replace(/:\s*0-15\b/g, ': 8')
    .replace(/:\s*숫자\b/g, ': 0');
}

export function parseAiJson<T>(text: string): T {
  const raw = extractJsonObject(text);
  try {
    return JSON.parse(raw) as T;
  } catch {
    try {
      return JSON.parse(repairJson(raw)) as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'JSON 파싱 실패';
      throw new Error(`AI 응답 JSON 형식 오류: ${message}`);
    }
  }
}
