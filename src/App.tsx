import type { ReactNode } from 'react';
import { useState, useCallback } from 'react';
import {
  Clapperboard,
  Settings,
  Sparkles,
  Film,
  Megaphone,
  Zap,
  Loader2,
  History,
} from 'lucide-react';
import { VideoPlayer } from './components/VideoPlayer';
import { CutBoard } from './components/CutBoard';
import { SettingsModal } from './components/SettingsModal';
import { SimulationReport } from './components/SimulationReport';
import { AnalysisHistory, CompareReport } from './components/AnalysisHistory';
import { runBenchmarkPipeline } from './services/benchmark';
import type {
  AnalysisPreset,
  AnalysisProgressStep,
  AnalysisReport,
  CaptureResult,
  CutFrame,
  SavedAnalysisRecord,
  VideoSourceType,
} from './types';
import { PRESET_DESCRIPTIONS, PRESET_LABELS } from './types';
import { saveAnalysisRecord } from './utils/analysisHistory';
import { generateId, getApiKey, getYoutubeApiKey } from './utils/storage';
import { detectDominantOrientation } from './utils/video';

const PROGRESS_MESSAGES: Record<AnalysisProgressStep, string> = {
  keywords: '키워드 추출 중...',
  video: '영상 전체 분석 중...',
  search: '플랫폼별 레퍼런스 검색 중...',
  trending: '유행 영상 검색 중...',
  references: '레퍼런스 분석 중...',
  compare: '벤치마크 비교 중...',
  done: '완료',
};

const PRESETS: { id: AnalysisPreset; icon: ReactNode }[] = [
  { id: 'cinematic', icon: <Film size={16} /> },
  { id: 'commercial', icon: <Megaphone size={16} /> },
  { id: 'shortform', icon: <Zap size={16} /> },
];

export default function App() {
  const [sourceType, setSourceType] = useState<VideoSourceType>('local');
  const [frames, setFrames] = useState<CutFrame[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoFileName, setVideoFileName] = useState('');
  const [preset, setPreset] = useState<AnalysisPreset>('cinematic');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [compareRecords, setCompareRecords] = useState<[SavedAnalysisRecord, SavedAnalysisRecord] | null>(null);
  const [savedLabel, setSavedLabel] = useState<string | undefined>();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(!!getApiKey());
  const [hasYoutubeKey, setHasYoutubeKey] = useState(!!getYoutubeApiKey());

  const handleCapture = useCallback((capture: CaptureResult) => {
    setFrames((prev) => [
      ...prev,
      {
        id: generateId(),
        imageDataUrl: capture.imageDataUrl,
        timestamp: capture.timestamp,
        width: capture.width,
        height: capture.height,
        label: `Cut ${prev.length + 1}`,
      },
    ]);
  }, []);

  const handleBatchCapture = useCallback((captures: CaptureResult[]) => {
    setFrames((prev) => [
      ...prev,
      ...captures.map((cap, i) => ({
        id: generateId(),
        imageDataUrl: cap.imageDataUrl,
        timestamp: cap.timestamp,
        width: cap.width,
        height: cap.height,
        label: `Cut ${prev.length + i + 1}`,
      })),
    ]);
  }, []);

  const handleVideoFile = useCallback((file: File | null, name: string) => {
    setVideoFile(file);
    setVideoFileName(name);
  }, []);

  const handleVideoSourceChange = useCallback(() => {
    setFrames([]);
    setReport(null);
    setCompareRecords(null);
    setSavedLabel(undefined);
    setError(null);
  }, []);

  const handleSourceTypeChange = useCallback((type: VideoSourceType) => {
    if (type !== sourceType) {
      handleVideoSourceChange();
    }
    setSourceType(type);
  }, [sourceType, handleVideoSourceChange]);

  const handleRemoveFrame = (id: string) => {
    setFrames((prev) => prev.filter((f) => f.id !== id));
  };

  const handleAnalyze = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setSettingsOpen(true);
      setError('분석을 위해 Gemini API 키를 먼저 등록해 주세요.');
      return;
    }
    if (frames.length === 0) {
      setError('분석할 컷보드 프레임을 최소 1장 이상 캡처해 주세요.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setCompareRecords(null);
    setAnalysisStep('분석 시작...');
    try {
      const result = await runBenchmarkPipeline(
        apiKey,
        getYoutubeApiKey(),
        {
          imageDataUrls: frames.map((f) => f.imageDataUrl),
          frameDimensions: frames.map((f) => ({ width: f.width, height: f.height })),
          preset,
          videoFile,
          videoTitle: videoFileName,
        },
        (step, message) => setAnalysisStep(message || PROGRESS_MESSAGES[step]),
      );

      const title =
        videoFileName.replace(/\.[^.]+$/, '') ||
        result.benchmark.keywords.niche ||
        '분석 결과';

      const saved = saveAnalysisRecord(result, {
        title,
        thumbnail: frames[0].imageDataUrl,
        videoFormat: detectDominantOrientation(frames),
      });

      setSavedLabel(`저장됨 · ${new Date(saved.savedAt).toLocaleTimeString('ko-KR')}`);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
    } finally {
      setAnalyzing(false);
      setAnalysisStep('');
    }
  };

  const handleLoadHistory = (record: SavedAnalysisRecord) => {
    setCompareRecords(null);
    setReport(record.report);
    setSavedLabel(`불러옴 · ${new Date(record.savedAt).toLocaleString('ko-KR')}`);
  };

  const handleCompare = (a: SavedAnalysisRecord, b: SavedAnalysisRecord) => {
    setReport(null);
    setCompareRecords([a, b]);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon-wrap">
            <Clapperboard size={22} className="brand-icon" />
          </div>
          <div>
            <h1>Cinema Director AI</h1>
            <p>조회수 극대화 기획 분석 & 멀티플랫폼 벤치마킹</p>
          </div>
        </div>
        <div className="header-actions">
          {!hasApiKey && (
            <span className="api-badge warning">Gemini 키 미등록</span>
          )}
          {hasApiKey && !hasYoutubeKey && (
            <span className="api-badge info">YouTube API 미등록 (AI 추정)</span>
          )}
          {hasApiKey && hasYoutubeKey && (
            <span className="api-badge success">YouTube API 등록됨</span>
          )}
          <button
            className="icon-btn"
            onClick={() => setHistoryOpen(true)}
            aria-label="분석 히스토리"
            title="분석 히스토리 / 비교"
          >
            <History size={20} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="설정"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="dashboard">
        <div className="dashboard-left">
          <VideoPlayer
            sourceType={sourceType}
            onSourceTypeChange={handleSourceTypeChange}
            onCapture={handleCapture}
            onBatchCapture={handleBatchCapture}
            onVideoFile={handleVideoFile}
            onVideoSourceChange={handleVideoSourceChange}
          />

          <div className="action-card">
            <div className="preset-selector">
              <span className="preset-label">분석 프리셋</span>
              <div className="preset-buttons">
                {PRESETS.map(({ id, icon }) => (
                  <button
                    key={id}
                    className={`preset-btn ${preset === id ? 'active' : ''}`}
                    onClick={() => setPreset(id)}
                    title={PRESET_DESCRIPTIONS[id]}
                  >
                    {icon}
                    {PRESET_LABELS[id]}
                  </button>
                ))}
              </div>
            </div>

            <div className="analyze-bar">
              {error && <p className="error-msg">{error}</p>}
              <button
                className="btn primary analyze-btn"
                onClick={handleAnalyze}
                disabled={analyzing || frames.length === 0}
              >
                {analyzing ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    {analysisStep || 'AI 분석 중...'}
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    영상 분석 & 멀티플랫폼 벤치마킹
                  </>
                )}
              </button>
            </div>
          </div>

          <CutBoard
            frames={frames}
            onRemove={handleRemoveFrame}
            onClear={() => setFrames([])}
          />
        </div>

        {compareRecords && (
          <CompareReport
            recordA={compareRecords[0]}
            recordB={compareRecords[1]}
            onClose={() => setCompareRecords(null)}
          />
        )}

        {report && !compareRecords && (
          <SimulationReport
            report={report}
            onClose={() => setReport(null)}
            savedLabel={savedLabel}
          />
        )}
      </main>

      <AnalysisHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onLoad={handleLoadHistory}
        onCompare={handleCompare}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setHasApiKey(true);
          setHasYoutubeKey(!!getYoutubeApiKey());
        }}
      />
    </div>
  );
}
