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
import {
  analyzeReferenceVideos,
  analyzeVideoHolistic,
  extractKeywords,
  generateBenchmarkReport,
  generateEstimatedReferences,
  generatePlatformEstimatedReferences,
} from './gemini';
import { searchPlatformReferences, searchTopVideos, resolveEstimatedReference, searchTrendingRelatedVideos } from './youtube';

export type ProgressCallback = (step: AnalysisProgressStep, message: string) => void;

const PLATFORMS: PlatformId[] = ['youtube', 'instagram', 'tiktok'];

async function resolveReferenceAnalyses(
  youtubeKey: string | null,
  references: ReferenceAnalysis[],
  videoFormat: VideoOrientation,
): Promise<ReferenceAnalysis[]> {
  if (!youtubeKey) return references;

  const resolved = await Promise.all(
    references.map(async (ref) => {
      const video = await resolveEstimatedReference(youtubeKey, ref.video, videoFormat);
      if (video.videoId === ref.video.videoId) return ref;
      return { ...ref, video };
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
  geminiKey: string,
  youtubeKey: string | null,
  keywords: Awaited<ReturnType<typeof extractKeywords>>,
  preset: AnalysisPreset,
  platform: PlatformId,
  videoFormat: VideoOrientation,
): Promise<PlatformBenchmark> {
  const label = PLATFORM_LABELS[platform];

  if (youtubeKey) {
    try {
      const { references, searchQuery } = await searchPlatformReferences(
        youtubeKey,
        keywords.searchQuery,
        videoFormat,
        platform,
        3,
      );
      if (references.length > 0) {
        const analyses = await analyzeReferenceVideos(geminiKey, references, preset);
        return { platform, label, references: analyses, dataSource: 'youtube_api', searchQuery };
      }
    } catch {
      /* fall through to AI */
    }
  }

  const estimated = await generatePlatformEstimatedReferences(
    geminiKey,
    keywords,
    preset,
    platform,
    3,
  );
  const references = youtubeKey
    ? await resolveReferenceAnalyses(youtubeKey, estimated, videoFormat)
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
  geminiKey: string,
  youtubeKey: string | null,
  input: PipelineInput,
  onProgress?: ProgressCallback,
): Promise<AnalysisReport> {
  const { imageDataUrls, frameDimensions, preset, videoFile } = input;
  const videoFormat: VideoOrientation = detectDominantOrientation(frameDimensions);
  const formatLabel = ORIENTATION_LABELS[videoFormat];
  const targetThumbnail = imageDataUrls[0] ?? '';

  onProgress?.('keywords', `${formatLabel} — 키워드 추출 중...`);
  const keywords = await extractKeywords(geminiKey, imageDataUrls, videoFormat);

  let trendingVideos: TrendingVideo[] = [];
  if (youtubeKey) {
    onProgress?.('trending', '키워드 기반 유행 영상 검색 중...');
    try {
      trendingVideos = await searchTrendingRelatedVideos(youtubeKey, keywords, 5);
    } catch {
      trendingVideos = [];
    }
  }

  onProgress?.('video', '영상 전체 분석 중 (편집·훅·리텐션)...');
  const videoAnalysis = await analyzeVideoHolistic(geminiKey, videoFile, preset, videoFormat);

  onProgress?.('search', '플랫폼별 고조회수 레퍼런스 검색 중...');
  const platformBenchmarks: PlatformBenchmark[] = [];
  for (const platform of PLATFORMS) {
    onProgress?.('search', `${PLATFORM_LABELS[platform]} 레퍼런스 검색 중...`);
    const pb = await fetchPlatformBenchmark(
      geminiKey,
      youtubeKey,
      keywords,
      preset,
      platform,
      videoFormat,
    );
    platformBenchmarks.push(pb);
  }

  // 통합 레퍼런스: YouTube 플랫폼 우선, 없으면 전체 병합
  let referenceAnalyses = platformBenchmarks.find((p) => p.platform === 'youtube')?.references ?? [];
  let dataSource = platformBenchmarks.find((p) => p.platform === 'youtube')?.dataSource ?? 'ai_estimated';

  if (referenceAnalyses.length === 0) {
    onProgress?.('references', `${formatLabel} 통합 레퍼런스 생성 중...`);
    if (youtubeKey) {
      try {
        const refs = await searchTopVideos(youtubeKey, keywords.searchQuery, {
          orientation: videoFormat,
          maxResults: 5,
        });
        if (refs.length > 0) {
          referenceAnalyses = await analyzeReferenceVideos(geminiKey, refs, preset);
          dataSource = 'youtube_api';
        }
      } catch {
        referenceAnalyses = await generateEstimatedReferences(geminiKey, keywords, preset, videoFormat);
        dataSource = 'ai_estimated';
      }
    } else {
      referenceAnalyses = await generateEstimatedReferences(geminiKey, keywords, preset, videoFormat);
      dataSource = 'ai_estimated';
    }
  } else if (referenceAnalyses.length < 5) {
    const extras = platformBenchmarks
      .flatMap((p) => p.references)
      .filter((r) => !referenceAnalyses.some((e) => e.video.videoId === r.video.videoId))
      .slice(0, 5 - referenceAnalyses.length);
    referenceAnalyses = [...referenceAnalyses, ...extras];
  }

  if (youtubeKey) {
    onProgress?.('references', '레퍼런스 영상 링크 연결 중...');
    referenceAnalyses = await resolveReferenceAnalyses(youtubeKey, referenceAnalyses, videoFormat);
    if (referenceAnalyses.some((r) => !r.video.videoId.startsWith('estimated-'))) {
      dataSource = 'youtube_api';
    }
  }

  onProgress?.('compare', '멀티플랫폼 벤치마크 비교 및 리포트 생성 중...');
  const report = await generateBenchmarkReport(
    geminiKey,
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
