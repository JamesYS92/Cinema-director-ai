import type {
  AnalysisPreset,
  AnalysisProgressStep,
  AnalysisReport,
  ExtractedKeywords,
  PlatformBenchmark,
  PlatformId,
  ReferenceAnalysis,
  TrendingVideo,
  VideoOrientation,
} from '../types';
import { PLATFORM_LABELS } from '../types';
import { detectDominantOrientation, ORIENTATION_LABELS } from '../utils/video';
import { prepareFramesForApi } from '../utils/imageCompress';
import { fetchApiStatus } from './apiClient';
import {
  analyzeFrameObservations,
  analyzeReferenceVideos,
  analyzeVideoHolistic,
  extractKeywords,
  generateBenchmarkReport,
  generateEstimatedReferences,
  generateMultiPlatformEstimatedReferences,
} from './gemini';
import {
  resolveEstimatedReference,
  searchPlatformReferences,
  searchTopVideos,
  searchTrendingRelatedVideos,
} from './youtube';

export type ProgressCallback = (step: AnalysisProgressStep, message: string) => void;

const PLATFORMS: PlatformId[] = ['youtube', 'instagram', 'tiktok'];

function buildSearchQueries(keywords: ExtractedKeywords): string[] {
  return [
    keywords.searchQuery,
    keywords.niche,
    `${keywords.niche} ${keywords.contentType}`.trim(),
    keywords.primary.slice(0, 4).join(' '),
    `${keywords.searchQuery} ${keywords.niche}`.trim(),
  ].filter((query, index, arr) => query.trim().length > 0 && arr.indexOf(query) === index);
}

async function searchPlatformReferencesWithFallback(
  keywords: ExtractedKeywords,
  videoFormat: VideoOrientation,
  platform: PlatformId,
  preset: AnalysisPreset,
): Promise<{ references: ReferenceAnalysis[]; searchQuery: string } | null> {
  for (const baseQuery of buildSearchQueries(keywords)) {
    try {
      const { references, searchQuery } = await searchPlatformReferences(
        baseQuery,
        videoFormat,
        platform,
        3,
      );
      if (references.length > 0) {
        return {
          references: await analyzeReferenceVideos(references, preset),
          searchQuery,
        };
      }
    } catch {
      continue;
    }
  }

  for (const baseQuery of buildSearchQueries(keywords)) {
    try {
      const references = await searchTopVideos(baseQuery, {
        orientation: platform === 'youtube' ? videoFormat : 'portrait',
        maxResults: 3,
      });
      if (references.length > 0) {
        return {
          references: await analyzeReferenceVideos(references, preset),
          searchQuery: baseQuery,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function resolveReferenceAnalyses(
  references: ReferenceAnalysis[],
  videoFormat: VideoOrientation,
  youtubeEnabled: boolean,
  platform?: PlatformId,
  fallbackQuery?: string,
): Promise<ReferenceAnalysis[]> {
  if (!youtubeEnabled) return references;

  const resolved = await Promise.all(
    references.map(async (ref) => {
      try {
        const video = await resolveEstimatedReference(
          ref.video,
          videoFormat,
          platform,
          fallbackQuery,
        );
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

  onProgress?.('keywords', `전체 ${imageDataUrls.length}컷 압축·최적화 중...`);
  const apiImages = await prepareFramesForApi(imageDataUrls);

  onProgress?.('keywords', `${formatLabel} — ${apiImages.length}컷 프레임 분석 중...`);
  const frameObservations = await analyzeFrameObservations(apiImages);

  onProgress?.('keywords', `${formatLabel} — 키워드 추출 중...`);
  const keywords = await extractKeywords(apiImages, videoFormat, frameObservations);

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
  const pendingAiPlatforms: PlatformId[] = [];

  for (const platform of PLATFORMS) {
    const label = PLATFORM_LABELS[platform];
    onProgress?.('search', `${label} 레퍼런스 검색 중...`);

    if (youtubeEnabled) {
      const found = await searchPlatformReferencesWithFallback(keywords, videoFormat, platform, preset);
      if (found) {
        platformBenchmarks.push({
          platform,
          label,
          references: found.references,
          dataSource: 'youtube_api',
          searchQuery: found.searchQuery,
        });
        continue;
      }
    }

    pendingAiPlatforms.push(platform);
  }

  if (pendingAiPlatforms.length > 0) {
    if (youtubeEnabled) {
      onProgress?.('search', 'YouTube API로 레퍼런스 재검색 중...');
      for (const platform of pendingAiPlatforms) {
        const label = PLATFORM_LABELS[platform];
        const found = await searchPlatformReferencesWithFallback(keywords, videoFormat, platform, preset);
        if (found) {
          platformBenchmarks.push({
            platform,
            label,
            references: found.references,
            dataSource: 'youtube_api',
            searchQuery: found.searchQuery,
          });
        }
      }
    }

    const stillMissing = PLATFORMS.filter(
      (platform) => !platformBenchmarks.some((pb) => pb.platform === platform),
    );

    if (stillMissing.length > 0 && !youtubeEnabled) {
      onProgress?.('search', 'AI 레퍼런스 추정 중...');
      const multi = await generateMultiPlatformEstimatedReferences(keywords, preset, stillMissing);
      for (const platform of stillMissing) {
        const label = PLATFORM_LABELS[platform];
        const estimated = multi[platform] ?? [];
        platformBenchmarks.push({
          platform,
          label,
          references: estimated,
          dataSource: 'ai_estimated',
          searchQuery: `${keywords.searchQuery} (${label} AI 추정)`,
        });
      }
    }
  }

  if (youtubeEnabled) {
    onProgress?.('references', '레퍼런스 영상 링크 연결 중...');
    for (const pb of platformBenchmarks) {
      pb.references = await resolveReferenceAnalyses(
        pb.references,
        videoFormat,
        true,
        pb.platform,
        pb.searchQuery,
      );
      const resolvedCount = pb.references.filter((r) => !r.video.videoId.startsWith('estimated-')).length;
      if (resolvedCount > 0) {
        pb.dataSource = resolvedCount === pb.references.length ? 'youtube_api' : pb.dataSource;
      }
    }
  }

  let referenceAnalyses = platformBenchmarks.find((p) => p.platform === 'youtube')?.references ?? [];
  let dataSource = platformBenchmarks.find((p) => p.platform === 'youtube')?.dataSource ?? 'ai_estimated';

  if (referenceAnalyses.length === 0) {
    onProgress?.('references', `${formatLabel} 통합 레퍼런스 생성 중...`);
    if (youtubeEnabled) {
      const found = await searchPlatformReferencesWithFallback(keywords, videoFormat, 'youtube', preset);
      if (found) {
        referenceAnalyses = found.references;
        dataSource = 'youtube_api';
      } else {
        referenceAnalyses = await generateEstimatedReferences(keywords, preset, videoFormat);
        referenceAnalyses = await resolveReferenceAnalyses(
          referenceAnalyses,
          videoFormat,
          true,
          'youtube',
          keywords.searchQuery,
        );
        dataSource = referenceAnalyses.some((r) => !r.video.videoId.startsWith('estimated-'))
          ? 'youtube_api'
          : 'ai_estimated';
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
    referenceAnalyses = await resolveReferenceAnalyses(
      referenceAnalyses,
      videoFormat,
      true,
      'youtube',
      keywords.searchQuery,
    );
    if (referenceAnalyses.some((r) => !r.video.videoId.startsWith('estimated-'))) {
      dataSource = referenceAnalyses.every((r) => !r.video.videoId.startsWith('estimated-'))
        ? 'youtube_api'
        : dataSource;
    }
  }

  onProgress?.('compare', `전체 ${apiImages.length}컷 벤치마크 리포트 생성 중...`);
  const report = await generateBenchmarkReport(
    apiImages,
    preset,
    keywords,
    referenceAnalyses.slice(0, 5),
    platformBenchmarks,
    videoAnalysis,
    dataSource,
    videoFormat,
    targetThumbnail,
    trendingVideos,
    frameObservations,
  );

  onProgress?.('done', '분석 완료');
  return report;
}
