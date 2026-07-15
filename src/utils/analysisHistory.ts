import type { AnalysisReport, SavedAnalysisRecord, VideoOrientation } from '../types';
import { generateId } from './storage';

const HISTORY_KEY = 'cinema-director-ai-history';
const MAX_HISTORY = 30;

export function getAnalysisHistory(): SavedAnalysisRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedAnalysisRecord[];
  } catch {
    return [];
  }
}

export function saveAnalysisRecord(
  report: AnalysisReport,
  meta: { title: string; thumbnail: string; videoFormat: VideoOrientation },
): SavedAnalysisRecord {
  const record: SavedAnalysisRecord = {
    id: generateId(),
    savedAt: Date.now(),
    title: meta.title,
    thumbnail: meta.thumbnail,
    videoFormat: meta.videoFormat,
    viralIndex: report.viralIndex,
    report,
  };

  const history = getAnalysisHistory();
  history.unshift(record);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  return record;
}

export function deleteAnalysisRecord(id: string): void {
  const history = getAnalysisHistory().filter((r) => r.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function getAnalysisById(id: string): SavedAnalysisRecord | null {
  return getAnalysisHistory().find((r) => r.id === id) ?? null;
}
