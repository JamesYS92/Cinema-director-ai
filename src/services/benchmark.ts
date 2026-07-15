import type {
  AnalysisPreset,
  AnalysisProgressStep,
  AnalysisReport,
  PlatformBenchmark,
  PlatformId,
  ReferenceAnalysis,
  TrendingVideo,
  VideoOrientation,
} from '../types';
import { PLATFORM_LABELS } from '../types';
import { detectDominantOrientation, ORIENTATION_LABELS } from '../utils/video';
import { fetchApiStatus } from './apiClient';
import {
  analyzeReferenceVideos,
  analyzeVideoHolistic,
  extractKeywords,
  generateBenchmarkReport,
  generateEstimatedReferences,
  generatePlatformEstimatedReferences,
} from './gemini';
import {
  resolveEstimatedReference,
  searchPlatformReferences,
  searchTopVideos,
  searchTrendingRelatedVideos,
} from './youtube';

export type ProgressCallback = (step: AnalysisProgressStep, message: string) => void;

const PLATFORMS: PlatformId[] = ['youtube', 'instagram', 'tiktok'];

async function resolveReferenceAnalyses(
  references: ReferenceAnalysis[],
  videoFormat: VideoOrientation,
  youtubeEnabled: boolean,
): Promise<ReferenceAnalysis[]> {
  if (!youtubeEnabled) return references;

  const resolved = await Promise.all(
    references.map(async (ref) => {
      try {
        const video = await resolveEstimatedReference(ref.video, videoFormat);
        if (video.videoId === ref.video.videoId) return ref;
        return { ...ref, video };
      } catch {
        return ref;
      }
    }),
  );

  return resolved;
}

export interface PipelineInput {
  imageDataUrls: string[];
  frameDimensions: { width: number; height: number }[];
  preset: AnalysisPreset;
  videoFile: File | null;
  videoTitle?: string;
}

async function fetchPlatformBenchmark(
  keywords: Awaited<ReturnType<typeof extractKeywords>>,
  preset: AnalysisPreset,
  platform: PlatformId,
  videoFormat: VideoOrientation,
  youtubeEnabled: boolean,
): Promise<PlatformBenchmark> {
  const label = PLATFORM_LABELS[platform];

  if (youtubeEnabled) {
    try {
      const { references, searchQuery } = await searchPlatformReferences(
        keywords.searchQuery,
        videoFormat,
        platform,
        3,
      );
      if (references.length > 0) {
        const analyses = await analyzeReferenceVideos(references, preset);
        return { platform, label, references: analyses, dataSource: 'youtube_api', searchQuery };
      }
    } catch {
      /* fall through to AI */
    }
  }

  const estimated = await generatePlatformEstimatedReferences(keywords, preset, platform, 3);
  const references = youtubeEnabled
    ? await resolveReferenceAnalyses(estimated, videoFormat, true)
    : estimated;
  return {
    platform,
    label,
    references,
    dataSource: references.some((r) => !r.video.videoId.startsWith('estimated-'))
      ? 'youtube_api'
      : 'ai_estimated',
    searchQuery: `${keywords.searchQuery} (${label} AI 추정)`,
  };
}

export async function runBenchmarkPipeline(
  input: PipelineInput,
  onProgress?: ProgressCallback,
): Promise<AnalysisReport> {
  const status = await fetchApiStatus();
  if (!status.ready) {
    throw new Error(status.message || '서버 Gemini API가 설정되지 않았습니다.');
  }

  const youtubeEnabled = status.youtube;

  const { imageDataUrls, frameDimensions, preset, videoFile } = input;
  const videoFormat: VideoOrientation = detectDominantOrientation(frameDimensions);
  const formatLabel = ORIENTATION_LABELS[videoFormat];
  const targetThumbnail = imageDataUrls[0] ?? '';

  onProgress?.('keywords', `${formatLabel} — 키워드 추출 중...`);
  const keywords = await extractKeywords(imageDataUrls, videoFormat);

  let trendingVideos: TrendingVideo[] = [];
  if (youtubeEnabled) {
    onProgress?.('trending', '키워드 기반 유행 영상 검색 중...');
    try {
      trendingVideos = await searchTrendingRelatedVideos(keywords, 5);
    } catch {
      trendingVideos = [];
    }
  }

  onProgress?.('video', '영상 전체 분석 중 (편집·훅·리텐션)...');
  const videoAnalysis = await analyzeVideoHolistic(videoFile, preset, videoFormat);

  onProgress?.('search', '플랫폼별 고조회수 레퍼런스 검색 중...');
  const platformBenchmarks: PlatformBenchmark[] = [];
  for (const platform of PLATFORMS) {
    onProgress?.('search', `${PLATFORM_LABELS[platform]} 레퍼런스 검색 중...`);
    const pb = await fetchPlatformBenchmark(keywords, preset, platform, videoFormat, youtubeEnabled);
    platformBenchmarks.push(pb);
  }

  let referenceAnalyses = platformBenchmarks.find((p) => p.platform === 'youtube')?.references ?? [];
  let dataSource = platformBenchmarks.find((p) => p.platform === 'youtube')?.dataSource ?? 'ai_estimated';

  if (referenceAnalyses.length === 0) {
    onProgress?.('references', `${formatLabel} 통합 레퍼런스 생성 중...`);
    if (youtubeEnabled) {
      try {
        const refs = await searchTopVideos(keywords.searchQuery, {
          orientation: videoFormat,
          maxResults: 5,
        });
        if (refs.length > 0) {
          referenceAnalyses = await analyzeReferenceVideos(refs, preset);
          dataSource = 'youtube_api';
        }
      } catch {
        referenceAnalyses = await generateEstimatedReferences(keywords, preset, videoFormat);
        dataSource = 'ai_estimated';
      }
    } else {
      referenceAnalyses = await generateEstimatedReferences(keywords, preset, videoFormat);
      dataSource = 'ai_estimated';
    }
  } else if (referenceAnalyses.length < 5) {
    const extras = platformBenchmarks
      .flatMap((p) => p.references)
      .filter((r) => !referenceAnalyses.some((e) => e.video.videoId === r.video.videoId))
      .slice(0, 5 - referenceAnalyses.length);
    referenceAnalyses = [...referenceAnalyses, ...extras];
  }

  if (youtubeEnabled) {
    onProgress?.('references', '레퍼런스 영상 링크 연결 중...');
    referenceAnalyses = await resolveReferenceAnalyses(referenceAnalyses, videoFormat, true);
    if (referenceAnalyses.some((r) => !r.video.videoId.startsWith('estimated-'))) {
      dataSource = 'youtube_api';
    }
  }

  onProgress?.('compare', '멀티플랫폼 벤치마크 비교 및 리포트 생성 중...');
  const report = await generateBenchmarkReport(
    imageDataUrls,
    preset,
    keywords,
    referenceAnalyses.slice(0, 5),
    platformBenchmarks,
    videoAnalysis,
    dataSource,
    videoFormat,
    targetThumbnail,
    trendingVideos,
  );

  onProgress?.('done', '분석 완료');
  return report;
}
