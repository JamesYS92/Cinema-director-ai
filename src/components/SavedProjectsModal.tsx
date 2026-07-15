import { useEffect, useState } from 'react';
import { FolderKanban, X, Trash2, Eye, Download } from 'lucide-react';
import type { SavedAnalysisRecord } from '../types';
import { ORIENTATION_LABELS } from '../utils/video';
import {
  deleteAnalysisRecord,
  exportAnalysisRecord,
  getAnalysisHistory,
} from '../utils/analysisHistory';

interface SavedProjectsModalProps {
  open: boolean;
  activeProjectId?: string | null;
  onClose: () => void;
  onLoad: (record: SavedAnalysisRecord) => void;
  onProjectsChange?: () => void;
}

export function SavedProjectsModal({
  open,
  activeProjectId,
  onClose,
  onLoad,
  onProjectsChange,
}: SavedProjectsModalProps) {
  const [projects, setProjects] = useState<SavedAnalysisRecord[]>([]);

  useEffect(() => {
    if (!open) return;
    setProjects(getAnalysisHistory());
  }, [open]);

  if (!open) return null;

  const refresh = () => {
    const next = getAnalysisHistory();
    setProjects(next);
    onProjectsChange?.();
  };

  const handleDelete = (id: string) => {
    deleteAnalysisRecord(id);
    refresh();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal projects-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FolderKanban size={20} />
            <h2>저장된 프로젝트</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="projects-body">
          {projects.length === 0 ? (
            <p className="history-empty">
              저장된 프로젝트가 없습니다. 분석 완료 후 <strong>프로젝트 저장</strong> 버튼으로 저장하거나, 분석 시 자동 저장됩니다.
            </p>
          ) : (
            <>
              <p className="history-hint">프로젝트를 선택해 리포트를 다시 불러올 수 있습니다.</p>
              <div className="history-list">
                {projects.map((record) => (
                  <div
                    key={record.id}
                    className={`history-item project-item ${activeProjectId === record.id ? 'active-project' : ''}`}
                  >
                    {record.thumbnail ? (
                      <img src={record.thumbnail} alt="" className="history-thumb" />
                    ) : (
                      <div className="history-thumb history-thumb-empty" />
                    )}
                    <div className="history-info">
                      <strong>{record.title}</strong>
                      <span>
                        {ORIENTATION_LABELS[record.videoFormat]} · Viral {record.viralIndex} ·{' '}
                        {new Date(record.savedAt).toLocaleString('ko-KR')}
                      </span>
                    </div>
                    <div className="history-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="프로젝트 불러오기"
                        onClick={() => {
                          onLoad(record);
                          onClose();
                        }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="JSON 내보내기"
                        onClick={() => exportAnalysisRecord(record)}
                      >
                        <Download size={16} />
                      </button>
                      <button
                        type="button"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
