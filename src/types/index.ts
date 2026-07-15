export type AnalysisPreset = 'cinematic' | 'commercial' | 'shortform';

export type VideoSourceType = 'local' | 'web';

export type PlatformId = 'youtube' | 'instagram' | 'tiktok';

export interface CutFrame {
  id: string;
  imageDataUrl: string;
  timestamp: number;
  label: string;
  width: number;
  height: number;
}

export interface CaptureResult {
  imageDataUrl: string;
  timestamp: number;
  width: number;
  height: number;
}

export interface PlatformScore {
  platform: PlatformId;
  label: string;
  fitScore: number;
  estimatedViews: { min: number; max: number };
  avd: number;
  ctr: number;
}

export interface MarketingFeedback {
  trendInsight: string;
  empathy: string;
  targetFit: string;
  viewStrategy: string;
}

export type VideoOrientation = 'landscape' | 'portrait' | 'square';

export interface TargetVideoReview {
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

export interface VideoHolisticAnalysis {
  usedVideoFile: boolean;
  skipReason?: string;
  trendAlignment: string;
  hookForViews: string;
  empathyFlow: string;
  targetSignals: string;
  retentionForViews: string;
  temporalStrengths: string[];
  temporalWeaknesses: string[];
}

export interface ExtractedKeywords {
  primary: string[];
  secondary: string[];
  niche: string;
  contentType: string;
  searchQuery: string;
  videoFormat: VideoOrientation;
}

export interface ReferenceVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  thumbnailUrl: string;
  /** Resolved YouTube watch URL for the reference used in benchmark comparison */
  watchUrl?: string;
}

export type TrendBadge = 'hot' | 'rising' | 'popular';

export interface TrendingVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  thumbnailUrl: string;
  publishedAt?: string;
  trendBadge: TrendBadge;
  matchedQuery: string;
}

/** 기획·마케팅 평가 지표 (조회수 최적화 관점) */
export interface MarketingMetrics {
  trendFit: number;
  empathy: number;
  targetAudience: number;
  contentIdea: number;
  viralAppeal: number;
}

export interface ReferenceAnalysis {
  video: ReferenceVideo;
  metrics: MarketingMetrics;
  summary: string;
}

export interface PlatformBenchmark {
  platform: PlatformId;
  label: string;
  references: ReferenceAnalysis[];
  dataSource: 'youtube_api' | 'ai_estimated';
  searchQuery: string;
}

export interface BenchmarkGap {
  metric: keyof MarketingMetrics;
  label: string;
  targetScore: number;
  referenceAvg: number;
  topTierAvg: number;
  gap: number;
  gapPercent: number;
}

export interface ViewPotential {
  percentile: number;
  realisticViews: { min: number; max: number };
  reasoning: string;
  dataSource: 'youtube_api' | 'ai_estimated';
}

export interface BenchmarkReport {
  keywords: ExtractedKeywords;
  videoFormat: VideoOrientation;
  targetThumbnail: string;
  references: ReferenceAnalysis[];
  trendingVideos: TrendingVideo[];
  platformBenchmarks: PlatformBenchmark[];
  videoAnalysis: VideoHolisticAnalysis;
  targetMetrics: MarketingMetrics;
  targetReview: TargetVideoReview;
  gaps: BenchmarkGap[];
  benchmarkSummary: string;
  viewPotential: ViewPotential;
}

export interface AnalysisReport {
  viralIndex: number;
  platformScores: PlatformScore[];
  feedback: MarketingFeedback;
  strengths: string[];
  improvements: string[];
  actionPlan: string[];
  benchmark: BenchmarkReport;
}

export interface SavedAnalysisRecord {
  id: string;
  savedAt: number;
  title: string;
  thumbnail: string;
  videoFormat: VideoOrientation;
  viralIndex: number;
  report: AnalysisReport;
}

export type AnalysisProgressStep =
  | 'keywords'
  | 'video'
  | 'search'
  | 'trending'
  | 'references'
  | 'compare'
  | 'done';

export const PRESET_LABELS: Record<AnalysisPreset, string> = {
  cinematic: '시네마틱',
  commercial: '상업 광고',
  shortform: '숏폼',
};

export const PRESET_DESCRIPTIONS: Record<AnalysisPreset, string> = {
  cinematic: '스토리텔링·브랜드 무드 중심 기획 분석',
  commercial: '타겟·전환·메시지 중심 마케팅 분석',
  shortform: '트렌드·훅·바이럴 중심 조회수 분석',
};

export const METRIC_LABELS: Record<keyof MarketingMetrics, string> = {
  trendFit: '트렌드/유행 적합도',
  empathy: '공감대 형성',
  targetAudience: '타겟 적중도',
  contentIdea: '아이디어/기획력',
  viralAppeal: '조회 유도력',
};

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram Reels',
  tiktok: 'TikTok',
};
