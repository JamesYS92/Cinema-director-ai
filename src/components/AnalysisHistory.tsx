import { useState, useEffect } from 'react';
import { History, X, Trash2, GitCompare, Eye } from 'lucide-react';
import type { SavedAnalysisRecord } from '../types';
import { ORIENTATION_LABELS } from '../utils/video';
import {
  deleteAnalysisRecord,
  getAnalysisHistory,
} from '../utils/analysisHistory';
import { formatViews } from '../utils/storage';

interface AnalysisHistoryProps {
  open: boolean;
  onClose: () => void;
  onLoad: (record: SavedAnalysisRecord) => void;
  onCompare: (a: SavedAnalysisRecord, b: SavedAnalysisRecord) => void;
}

export function AnalysisHistory({ open, onClose, onLoad, onCompare }: AnalysisHistoryProps) {
  const [history, setHistory] = useState<SavedAnalysisRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setHistory(getAnalysisHistory());
    setSelected([]);
  }, [open]);

  if (!open) return null;

  const refresh = () => setHistory(getAnalysisHistory());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const handleCompare = () => {
    if (selected.length !== 2) return;
    const a = history.find((r) => r.id === selected[0]);
    const b = history.find((r) => r.id === selected[1]);
    if (a && b) {
      onCompare(a, b);
      onClose();
    }
  };

  const handleDelete = (id: string) => {
    deleteAnalysisRecord(id);
    setSelected((prev) => prev.filter((x) => x !== id));
    refresh();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <History size={20} />
            <h2>분석 히스토리</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="history-body">
          {history.length === 0 ? (
            <p className="history-empty">저장된 분석 결과가 없습니다. 분석 완료 시 자동 저장됩니다.</p>
          ) : (
            <>
              <p className="history-hint">
                {selected.length < 2
                  ? '비교할 항목 2개를 선택하세요'
                  : '「비교하기」를 눌러 나란히 비교'}
              </p>
              <div className="history-list">
                {history.map((record) => (
                  <div
                    key={record.id}
                    className={`history-item ${selected.includes(record.id) ? 'selected' : ''}`}
                  >
                    <button
                      className="history-select"
                      onClick={() => toggleSelect(record.id)}
                      aria-label="비교 선택"
                    >
                      <input type="checkbox" readOnly checked={selected.includes(record.id)} />
                    </button>
                    <img src={record.thumbnail} alt="" className="history-thumb" />
                    <div className="history-info">
                      <strong>{record.title}</strong>
                      <span>
                        {ORIENTATION_LABELS[record.videoFormat]} · Viral {record.viralIndex} ·{' '}
                        {new Date(record.savedAt).toLocaleString('ko-KR')}
                      </span>
                    </div>
                    <div className="history-actions">
                      <button
                        className="icon-btn"
                        title="리포트 보기"
                        onClick={() => {
                          onLoad(record);
                          onClose();
                        }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        title="삭제"
                        onClick={() => handleDelete(record.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="history-footer">
                <button
                  className="btn primary"
                  disabled={selected.length !== 2}
                  onClick={handleCompare}
                >
                  <GitCompare size={16} />
                  선택 항목 비교하기
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCompare({ label, a, b }: { label: string; a: number; b: number }) {
  const winner = a > b ? 'a' : b > a ? 'b' : 'tie';
  return (
    <div className="compare-metric">
      <span>{label}</span>
      <div className="compare-values">
        <strong className={winner === 'a' ? 'winner' : ''}>{a}</strong>
        <span>vs</span>
        <strong className={winner === 'b' ? 'winner' : ''}>{b}</strong>
      </div>
    </div>
  );
}

interface CompareReportProps {
  recordA: SavedAnalysisRecord;
  recordB: SavedAnalysisRecord;
  onClose: () => void;
}

export function CompareReport({ recordA, recordB, onClose }: CompareReportProps) {
  const a = recordA.report;
  const b = recordB.report;

  return (
    <div className="report-panel compare-panel">
      <div className="report-header">
        <div>
          <h2>
            <GitCompare size={22} />
            분석 비교
          </h2>
          <p>{recordA.title} vs {recordB.title}</p>
        </div>
        <button className="btn ghost" onClick={onClose}>닫기</button>
      </div>

      <div className="report-body">
        <div className="compare-header-row">
          <div className="compare-col-head">
            <img src={recordA.thumbnail} alt="" />
            <strong>{recordA.title}</strong>
            <span>{new Date(recordA.savedAt).toLocaleDateString('ko-KR')}</span>
          </div>
          <div className="compare-col-head">
            <img src={recordB.thumbnail} alt="" />
            <strong>{recordB.title}</strong>
            <span>{new Date(recordB.savedAt).toLocaleDateString('ko-KR')}</span>
          </div>
        </div>

        <section className="report-section">
          <h3>핵심 지표</h3>
          <div className="compare-metrics-grid">
            <MetricCompare label="Viral Index" a={a.viralIndex} b={b.viralIndex} />
            {a.platformScores.map((ps, i) => {
              const pb = b.platformScores[i];
              if (!pb) return null;
              return (
                <MetricCompare
                  key={ps.platform}
                  label={ps.label}
                  a={ps.fitScore}
                  b={pb.fitScore}
                />
              );
            })}
          </div>
        </section>

        <section className="report-section">
          <h3>예상 조회수 (YouTube)</h3>
          <div className="compare-views">
            <span>
              {formatViews(a.benchmark.viewPotential.realisticViews.min)} –{' '}
              {formatViews(a.benchmark.viewPotential.realisticViews.max)}
            </span>
            <span className="compare-vs">vs</span>
            <span>
              {formatViews(b.benchmark.viewPotential.realisticViews.min)} –{' '}
              {formatViews(b.benchmark.viewPotential.realisticViews.max)}
            </span>
          </div>
        </section>

        <section className="report-section compare-lists">
          <div>
            <h4>장점 — {recordA.title}</h4>
            <ul>{a.benchmark.targetReview.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <h4>장점 — {recordB.title}</h4>
            <ul>{b.benchmark.targetReview.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <h4>단점 — {recordA.title}</h4>
            <ul>{a.benchmark.targetReview.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <h4>단점 — {recordB.title}</h4>
            <ul>{b.benchmark.targetReview.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        </section>
      </div>
    </div>
  );
}
