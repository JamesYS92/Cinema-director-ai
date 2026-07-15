import { useState, useEffect } from 'react';
import { Server, X, CheckCircle, AlertCircle, Youtube } from 'lucide-react';
import { fetchApiStatus, type ApiStatus } from '../services/apiClient';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchApiStatus()
      .then(setStatus)
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Server size={20} />
            <h2>서버 설정</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-info">
            <CheckCircle size={16} />
            <p>
              API 키는 <strong>Vercel 서버 환경변수</strong>에만 저장됩니다.
              링크를 받은 사용자는 별도 키 입력 없이 바로 분석할 수 있습니다.
            </p>
          </div>

          <div className="settings-info youtube-info">
            <Youtube size={16} />
            <p>
              Vercel 대시보드 → Project → <strong>Settings → Environment Variables</strong>에서
              <code> STUDY_LLM_API_TOKEN</code>(권장) 또는 <code> GEMINI_API_KEY</code>,
              <code> YOUTUBE_API_KEY</code>를 등록하세요.
            </p>
          </div>

          {loading && <p className="status-msg idle">서버 상태 확인 중...</p>}

          {status && (
            <div className={`status-msg ${status.ready ? 'success' : 'error'}`}>
              {status.ready ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {status.message}
            </div>
          )}

          {status && (
            <ul className="server-status-list">
              <li className={status.gemini ? 'ok' : 'missing'}>
                AI API:{' '}
                {status.llmProvider === 'study_proxy'
                  ? 'Study LLM 프록시'
                  : status.gemini
                    ? 'Gemini 직접 연결'
                    : '미설정'}
              </li>
              <li className={status.youtube ? 'ok' : 'missing'}>
                YouTube API: {status.youtube ? '연결됨' : '미설정 (AI 추정 모드)'}
              </li>
            </ul>
          )}

          <div className="modal-actions">
            <button
              className="btn primary"
              onClick={() => {
                onSaved();
                onClose();
              }}
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
