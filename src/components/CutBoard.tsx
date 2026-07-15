import { Trash2, Clock } from 'lucide-react';
import type { CutFrame } from '../types';
import { formatTimestamp } from '../utils/storage';
import { getVideoOrientation } from '../utils/video';

interface CutBoardProps {
  frames: CutFrame[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function CutBoard({ frames, onRemove, onClear }: CutBoardProps) {
  return (
    <div className="cutboard">
      <div className="cutboard-header">
        <h3>심사 분석 컷보드</h3>
        <span className="frame-count">{frames.length}장</span>
        {frames.length > 0 && (
          <button className="btn ghost small" onClick={onClear}>
            전체 삭제
          </button>
        )}
      </div>

      {frames.length === 0 ? (
        <div className="cutboard-empty">
          <p>재생 중 원하는 미장센 순간을 캡처하면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="cutboard-grid">
          {frames.map((frame, i) => {
            const orientation = getVideoOrientation(frame.width, frame.height);
            return (
              <div key={frame.id} className={`cut-tile ${orientation}`}>
                <img src={frame.imageDataUrl} alt={`컷 ${i + 1}`} />
                <div className="cut-tile-overlay">
                  <span className="cut-label">Cut {i + 1}</span>
                  <span className="cut-time">
                    <Clock size={11} />
                    {formatTimestamp(frame.timestamp)}
                  </span>
                </div>
                <button
                  className="cut-remove"
                  onClick={() => onRemove(frame.id)}
                  aria-label="삭제"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
