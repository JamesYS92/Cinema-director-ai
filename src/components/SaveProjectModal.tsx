import { useEffect, useState, type FormEvent } from 'react';
import { FolderKanban, X } from 'lucide-react';

interface SaveProjectModalProps {
  open: boolean;
  defaultTitle: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (title: string) => void;
}

export function SaveProjectModal({
  open,
  defaultTitle,
  saving = false,
  error,
  onClose,
  onSave,
}: SaveProjectModalProps) {
  const [title, setTitle] = useState(defaultTitle);

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
    }
  }, [open, defaultTitle]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    onSave(trimmed);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal save-project-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FolderKanban size={20} />
            <h2>프로젝트 저장</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <form className="save-project-body" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="save-project-title">
            프로젝트 이름
          </label>
          <input
            id="save-project-title"
            className="save-project-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 7월 숏폼 벤치마크"
            autoFocus
            disabled={saving}
          />
          <p className="save-project-hint">
            이 브라우저에 프로젝트로 저장됩니다. 나중에 상단 <strong>히스토리</strong>에서 다시 불러올 수 있습니다.
          </p>

          {error && <p className="status-msg error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="submit" className="btn primary" disabled={saving || !title.trim()}>
              {saving ? '저장 중...' : '프로젝트 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
