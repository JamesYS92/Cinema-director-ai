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

export function updateAnalysisRecord(
  id: string,
  patch: Partial<Pick<SavedAnalysisRecord, 'title' | 'report'>>,
): SavedAnalysisRecord | null {
  const history = getAnalysisHistory();
  const index = history.findIndex((r) => r.id === id);
  if (index === -1) return null;

  const updated: SavedAnalysisRecord = {
    ...history[index]!,
    ...patch,
    savedAt: Date.now(),
    viralIndex: patch.report?.viralIndex ?? history[index]!.viralIndex,
  };
  history[index] = updated;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  return updated;
}

export function exportAnalysisRecord(record: SavedAnalysisRecord): void {
  const safeTitle = record.title.replace(/[^\w\uAC00-\uD7A3-]+/g, '_').slice(0, 40) || 'report';
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `cinema-director-${safeTitle}-${record.id.slice(0, 8)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
