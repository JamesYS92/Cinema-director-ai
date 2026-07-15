import { compressDataUrl } from './imageCompress';
import type { AnalysisReport, SavedAnalysisRecord, VideoOrientation } from '../types';
import { generateId } from './storage';

const HISTORY_KEY = 'cinema-director-ai-history';
const MAX_HISTORY = 30;
const STORAGE_THUMB_WIDTH = 200;
const STORAGE_THUMB_QUALITY = 0.55;
const STORAGE_REPORT_THUMB_WIDTH = 320;

export function getAnalysisHistory(): SavedAnalysisRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedAnalysisRecord[];
  } catch {
    return [];
  }
}

export function getProjectCount(): number {
  return getAnalysisHistory().length;
}

async function compressThumbnail(dataUrl: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
  return compressDataUrl(dataUrl, STORAGE_THUMB_WIDTH, STORAGE_THUMB_QUALITY);
}

async function prepareReportForStorage(report: AnalysisReport): Promise<AnalysisReport> {
  if (!report.benchmark.targetThumbnail?.startsWith('data:')) {
    return report;
  }

  const targetThumbnail = await compressDataUrl(
    report.benchmark.targetThumbnail,
    STORAGE_REPORT_THUMB_WIDTH,
    STORAGE_THUMB_QUALITY,
  );

  return {
    ...report,
    benchmark: {
      ...report.benchmark,
      targetThumbnail,
    },
  };
}

function writeHistory(history: SavedAnalysisRecord[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    throw new Error('브라우저 저장 공간에 기록할 수 없습니다. 오래된 프로젝트를 삭제하거나 시크릿 모드를 해제해 주세요.');
  }
}

export async function saveAnalysisRecord(
  report: AnalysisReport,
  meta: { title: string; thumbnail: string; videoFormat: VideoOrientation },
): Promise<SavedAnalysisRecord> {
  const [thumbnail, reportForStorage] = await Promise.all([
    compressThumbnail(meta.thumbnail),
    prepareReportForStorage(report),
  ]);

  const record: SavedAnalysisRecord = {
    id: generateId(),
    savedAt: Date.now(),
    title: meta.title,
    thumbnail,
    videoFormat: meta.videoFormat,
    viralIndex: report.viralIndex,
    report: reportForStorage,
  };

  const history = getAnalysisHistory();
  history.unshift(record);
  writeHistory(history);
  return record;
}

export function deleteAnalysisRecord(id: string): void {
  const history = getAnalysisHistory().filter((r) => r.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function getAnalysisById(id: string): SavedAnalysisRecord | null {
  return getAnalysisHistory().find((r) => r.id === id) ?? null;
}

export async function updateAnalysisRecord(
  id: string,
  patch: Partial<Pick<SavedAnalysisRecord, 'title' | 'report'>>,
): Promise<SavedAnalysisRecord | null> {
  const history = getAnalysisHistory();
  const index = history.findIndex((r) => r.id === id);
  if (index === -1) return null;

  const current = history[index]!;
  const nextReport = patch.report ? await prepareReportForStorage(patch.report) : current.report;

  const updated: SavedAnalysisRecord = {
    ...current,
    ...patch,
    report: nextReport,
    savedAt: Date.now(),
    viralIndex: patch.report?.viralIndex ?? current.viralIndex,
  };

  history[index] = updated;
  writeHistory(history);
  return updated;
}

export function exportAnalysisRecord(record: SavedAnalysisRecord): void {
  const safeTitle = record.title.replace(/[^\w\uAC00-\uD7A3-]+/g, '_').slice(0, 40) || 'project';
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `cinema-director-${safeTitle}-${record.id.slice(0, 8)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
