import { useRef, useState, useCallback, useEffect } from 'react';
import {
  Upload,
  Link,
  Camera,
  Play,
  Pause,
  SkipBack,
  Volume2,
  VolumeX,
  Layers,
  Loader2,
} from 'lucide-react';
import type { CaptureResult, VideoSourceType } from '../types';
import { extractYouTubeId, formatTimestamp, isDirectVideoUrl } from '../utils/storage';
import { computeAutoCaptureTimestamps, getVideoOrientation, type VideoOrientation } from '../utils/video';
import { extractYouTubeStoryboardFrames } from '../services/youtube';
import { storyboardRefsToCaptures } from '../utils/youtubeFrames';

const AUTO_CUT_OPTIONS = [10, 20, 30] as const;

interface VideoPlayerProps {
  sourceType: VideoSourceType;
  onSourceTypeChange: (type: VideoSourceType) => void;
  onCapture: (capture: CaptureResult) => void;
  onBatchCapture: (captures: CaptureResult[], replace?: boolean) => void;
  onVideoFile: (file: File | null, fileName: string) => void;
  onVideoSourceChange: () => void;
}

export function VideoPlayer({ sourceType, onSourceTypeChange, onCapture, onBatchCapture, onVideoFile, onVideoSourceChange }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [webUrl, setWebUrl] = useState('');
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [directUrl, setDirectUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fileName, setFileName] = useState('');
  const [autoCapturing, setAutoCapturing] = useState(false);
  const [autoCutCount, setAutoCutCount] = useState<number | null>(null);
  const [videoOrientation, setVideoOrientation] = useState<VideoOrientation>('landscape');
  const [youtubeMeta, setYoutubeMeta] = useState<{ title: string; duration: number } | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeWarning, setYoutubeWarning] = useState<string | null>(null);

  const activeVideoUrl = sourceType === 'local' ? localUrl : directUrl;

  const updateVideoOrientation = useCallback((v: HTMLVideoElement) => {
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      setVideoOrientation(getVideoOrientation(v.videoWidth, v.videoHeight));
    }
  }, []);

  const captureFromVideo = useCallback((v: HTMLVideoElement, c: HTMLCanvasElement): CaptureResult | null => {
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return null;

    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return {
      imageDataUrl: c.toDataURL('image/jpeg', 0.85),
      timestamp: v.currentTime,
      width: w,
      height: h,
    };
  }, []);

  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [localUrl]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (localUrl) URL.revokeObjectURL(localUrl);
    const url = URL.createObjectURL(file);
    onVideoSourceChange();
    setLocalUrl(url);
    setFileName(file.name);
    onVideoFile(file, file.name);
    setPlaying(false);
    setCurrentTime(0);
    setVideoOrientation('landscape');
  };

  const handleWebLoad = async () => {
    const trimmed = webUrl.trim();
    if (!trimmed) return;

    const ytId = extractYouTubeId(trimmed);
    if (ytId) {
      onVideoSourceChange();
      setYoutubeId(ytId);
      setDirectUrl(null);
      setYoutubeMeta(null);
      setYoutubeError(null);
      setYoutubeWarning(null);
      setYoutubeLoading(true);
      onVideoFile(null, trimmed);

      try {
        const { meta } = await extractYouTubeStoryboardFrames(ytId, 1);
        setYoutubeMeta({ title: meta.title, duration: meta.duration });
        onVideoFile(null, meta.title);
        if (meta.orientation) setVideoOrientation(meta.orientation);
        await handleYouTubeAutoCapture(30, ytId);
      } catch (err) {
        setYoutubeError(
          err instanceof Error ? err.message : 'YouTube 영상 정보를 불러오지 못했습니다.',
        );
      } finally {
        setYoutubeLoading(false);
      }
      return;
    }

    if (isDirectVideoUrl(trimmed)) {
      onVideoSourceChange();
      setYoutubeId(null);
      setYoutubeMeta(null);
      setYoutubeError(null);
      setYoutubeWarning(null);
      setDirectUrl(trimmed);
      onVideoFile(null, trimmed);
      return;
    }

    alert('지원되는 형식: YouTube URL 또는 직접 비디오 링크 (.mp4, .webm 등)');
  };

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const captureFrameAt = useCallback((time: number): Promise<CaptureResult | null> => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || v.readyState < 2) return Promise.resolve(null);

    return new Promise((resolve) => {
      const target = Math.min(Math.max(time, 0), Math.max(v.duration - 0.05, 0));

      const capture = () => {
        resolve(captureFromVideo(v, c));
      };

      if (Math.abs(v.currentTime - target) < 0.05) {
        capture();
        return;
      }

      const onSeeked = () => {
        v.removeEventListener('seeked', onSeeked);
        capture();
      };
      v.addEventListener('seeked', onSeeked);
      v.currentTime = target;
    });
  }, [captureFromVideo]);

  const handleCapture = async () => {
    if (youtubeId) {
      await handleYouTubeAutoCapture(1);
      return;
    }

    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || v.readyState < 2) return;

    const result = captureFromVideo(v, c);
    if (result) onCapture(result);
  };

  const handleYouTubeAutoCapture = async (count: number, videoId = youtubeId) => {
    if (!videoId) return;

    setAutoCapturing(true);
    setAutoCutCount(count);
    setYoutubeError(null);

    try {
      const { meta, frames } = await extractYouTubeStoryboardFrames(videoId, count);
      const captures = await storyboardRefsToCaptures(frames);
      onBatchCapture(captures, true);
      if (meta.frameSource === 'thumbnail') {
        setYoutubeWarning(
          '이 영상은 스토리보드 미리보기가 없어 고화질 썸네일로 대체했습니다. 정밀 분석은 로컬 파일 업로드를 권장합니다.',
        );
      }
    } catch (err) {
      setYoutubeError(
        err instanceof Error ? err.message : 'YouTube 프레임 추출에 실패했습니다.',
      );
    } finally {
      setAutoCapturing(false);
      setAutoCutCount(null);
    }
  };

  const handleAutoCapture = async (count: number) => {
    if (youtubeId) {
      await handleYouTubeAutoCapture(count);
      return;
    }

    const v = videoRef.current;
    if (!v || !activeVideoUrl || v.readyState < 2) {
      return;
    }

    if (!Number.isFinite(v.duration) || v.duration <= 0) {
      alert('영상 길이를 확인할 수 없습니다. 영상이 완전히 로드된 후 다시 시도해 주세요.');
      return;
    }

    setAutoCapturing(true);
    setAutoCutCount(count);
    v.pause();
    setPlaying(false);

    const timestamps = computeAutoCaptureTimestamps(v.duration, count);
    const captures: CaptureResult[] = [];

    for (const t of timestamps) {
      const frame = await captureFrameAt(t);
      if (frame) captures.push(frame);
    }

    if (captures.length > 0) {
      onBatchCapture(captures);
    }

    setAutoCapturing(false);
    setAutoCutCount(null);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const t = parseFloat(e.target.value);
    v.currentTime = t;
    setCurrentTime(t);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (v) setCurrentTime(v.currentTime);
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v) {
      setDuration(v.duration);
      updateVideoOrientation(v);
    }
  };

  const handleLoadedData = () => {
    const v = videoRef.current;
    if (v) updateVideoOrientation(v);
  };

  return (
    <div className="video-panel">
      <div className="source-tabs">
        <button
          className={`tab ${sourceType === 'local' ? 'active' : ''}`}
          onClick={() => onSourceTypeChange('local')}
        >
          <Upload size={15} />
          로컬 파일
        </button>
        <button
          className={`tab ${sourceType === 'web' ? 'active' : ''}`}
          onClick={() => onSourceTypeChange('web')}
        >
          <Link size={15} />
          웹 링크
        </button>
      </div>

      {sourceType === 'local' ? (
        <div className="source-input">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={handleFileSelect}
          />
          <button className="btn secondary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            {fileName || '영상 파일 선택'}
          </button>
        </div>
      ) : (
        <div className="source-input web-input">
          <input
            type="url"
            className="text-input"
            placeholder="YouTube URL 또는 직접 비디오 링크"
            value={webUrl}
            onChange={(e) => setWebUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleWebLoad()}
          />
          <button className="btn secondary" onClick={handleWebLoad}>
            불러오기
          </button>
        </div>
      )}

      <div className={`player-area ${videoOrientation}`}>
        {sourceType === 'web' && youtubeId ? (
          <iframe
            className="youtube-embed"
            src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1`}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : activeVideoUrl ? (
          <video
            ref={videoRef}
            src={activeVideoUrl}
            className="video-element"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={handleLoadedData}
            onEnded={() => setPlaying(false)}
            onClick={togglePlay}
          />
        ) : (
          <div className="player-placeholder">
            <Camera size={48} strokeWidth={1} />
            <p>영상을 불러와 재생한 뒤 원하는 순간을 캡처하세요</p>
          </div>
        )}
        <canvas ref={canvasRef} hidden />
      </div>

      {(activeVideoUrl || youtubeId) && (
        <div className="player-controls">
          {activeVideoUrl && (
            <>
              <button className="icon-btn" onClick={togglePlay} aria-label={playing ? '일시정지' : '재생'}>
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  const v = videoRef.current;
                  if (v) {
                    v.currentTime = 0;
                    setCurrentTime(0);
                  }
                }}
                aria-label="처음으로"
              >
                <SkipBack size={16} />
              </button>
              <span className="time-display">
                {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
              </span>
              <input
                type="range"
                className="seek-bar"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
              />
              <button
                className="icon-btn"
                onClick={() => {
                  const v = videoRef.current;
                  if (v) {
                    v.muted = !v.muted;
                    setMuted(v.muted);
                  }
                }}
                aria-label={muted ? '음소거 해제' : '음소거'}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </>
          )}
          <button className="btn capture-btn" onClick={handleCapture} disabled={(!activeVideoUrl && !youtubeId) || autoCapturing || youtubeLoading}>
            <Camera size={16} />
            프레임 캡처
          </button>
        </div>
      )}

      {youtubeError && <p className="youtube-error">{youtubeError}</p>}
      {youtubeWarning && <p className="youtube-warning">{youtubeWarning}</p>}

      {youtubeId && youtubeMeta && (
        <div className="youtube-meta">
          <span className="youtube-meta-title">{youtubeMeta.title}</span>
          <span className="youtube-meta-duration">{formatTimestamp(youtubeMeta.duration)}</span>
        </div>
      )}

      {((activeVideoUrl && duration > 0) || youtubeId) && (
        <div className="auto-capture-bar">
          <span className="auto-capture-label">
            <Layers size={14} />
            자동 컷 캡처
          </span>
          <div className="auto-capture-buttons">
            {AUTO_CUT_OPTIONS.map((count) => (
              <button
                key={count}
                className={`btn auto-cut-btn ${autoCutCount === count ? 'active' : ''}`}
                onClick={() => handleAutoCapture(count)}
                disabled={autoCapturing || youtubeLoading}
                title={
                  youtubeId
                    ? `YouTube 스토리보드에서 ${count}컷 추출`
                    : `영상 전체를 ${count}등분하여 균등 간격으로 캡처 (${formatTimestamp((duration || youtubeMeta?.duration || 0) / count)} 간격)`
                }
              >
                {autoCapturing && autoCutCount === count ? (
                  <Loader2 size={14} className="spin" />
                ) : null}
                {count}컷
              </button>
            ))}
          </div>
          {autoCapturing && autoCutCount && (
            <span className="auto-capture-status">
              {youtubeId ? 'YouTube ' : ''}{autoCutCount}컷 추출 중...
            </span>
          )}
          {youtubeLoading && (
            <span className="auto-capture-status">
              <Loader2 size={14} className="spin" /> YouTube 정보 불러오는 중...
            </span>
          )}
        </div>
      )}
    </div>
  );
}
