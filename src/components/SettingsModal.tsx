import { useState, useEffect } from 'react';
import { Key, X, Shield, CheckCircle, AlertCircle, Youtube } from 'lucide-react';
import { validateApiKey } from '../services/gemini';
import { checkYoutubeApiConnection } from '../services/youtube';
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  getYoutubeApiKey,
  setYoutubeApiKey,
  clearYoutubeApiKey,
} from '../utils/storage';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const [geminiKey, setGeminiKey] = useState(getApiKey() ?? '');
  const [youtubeKey, setYoutubeKey] = useState(getYoutubeApiKey() ?? '');
  const [status, setStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [youtubeStatus, setYoutubeStatus] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const savedYoutube = getYoutubeApiKey();
    if (!savedYoutube) {
      setYoutubeStatus('');
      return;
    }

    let cancelled = false;
    setYoutubeStatus('YouTube API 연결 확인 중...');
    checkYoutubeApiConnection(savedYoutube).then((result) => {
      if (cancelled) return;
      setYoutubeStatus(result.message);
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!geminiKey.trim()) {
      setStatus('error');
      setMessage('Gemini API 키를 입력해 주세요.');
      return;
    }
    setStatus('validating');
    setMessage('Gemini 키 검증 중...');

    const geminiValid = await validateApiKey(geminiKey.trim());
    if (!geminiValid) {
      setStatus('error');
      setMessage('유효하지 않은 Gemini API 키입니다.');
      return;
    }

    if (youtubeKey.trim()) {
      setMessage('YouTube API 키 검증 중...');
      const ytCheck = await checkYoutubeApiConnection(youtubeKey.trim());
      if (!ytCheck.valid) {
        setStatus('error');
        setMessage(ytCheck.message);
        return;
      }
      setYoutubeApiKey(youtubeKey.trim());
      setYoutubeStatus(ytCheck.message);
    } else {
      clearYoutubeApiKey();
      setYoutubeStatus('');
    }

    setApiKey(geminiKey.trim());
    setStatus('success');
    setMessage('API 키가 저장되었습니다.');
    setTimeout(() => {
      onSaved();
      onClose();
    }, 800);
  };

  const handleClear = () => {
    clearApiKey();
    clearYoutubeApiKey();
    setGeminiKey('');
    setYoutubeKey('');
    setStatus('idle');
    setMessage('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Key size={20} />
            <h2>API 설정</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-info">
            <Shield size={16} />
            <p>
              API 키는 브라우저 <strong>localStorage</strong>에만 저장됩니다.{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                Gemini 키 발급
              </a>
            </p>
          </div>

          <label className="field-label">Gemini API Key (필수)</label>
          <input
            type="password"
            className="text-input"
            placeholder="AIza..."
            value={geminiKey}
            onChange={(e) => {
              setGeminiKey(e.target.value);
              setStatus('idle');
              setMessage('');
            }}
          />

          <div className="settings-info youtube-info">
            <Youtube size={16} />
            <p>
              <strong>YouTube Data API Key (선택)</strong> — 등록 시 실제 고조회수 영상을 검색하여
              벤치마킹합니다. 미등록 시 AI 업계 추정 데이터를 사용합니다.{' '}
              <a
                href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                API 활성화
              </a>
            </p>
          </div>

          <label className="field-label">YouTube Data API Key (선택)</label>
          <input
            type="password"
            className="text-input"
            placeholder="AIza..."
            value={youtubeKey}
            onChange={(e) => {
              setYoutubeKey(e.target.value);
              setStatus('idle');
              setMessage('');
            }}
          />

          {youtubeStatus && (
            <div className={`status-msg ${youtubeStatus.includes('정상') ? 'success' : 'idle'}`}>
              {youtubeStatus.includes('정상') ? <CheckCircle size={14} /> : null}
              {youtubeStatus}
            </div>
          )}

          {message && (
            <div className={`status-msg ${status}`}>
              {status === 'success' ? <CheckCircle size={14} /> : status === 'error' ? <AlertCircle size={14} /> : null}
              {message}
            </div>
          )}

          <div className="modal-actions">
            <button className="btn ghost" onClick={handleClear}>
              전체 삭제
            </button>
            <button className="btn primary" onClick={handleSave} disabled={status === 'validating'}>
              {status === 'validating' ? '검증 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
