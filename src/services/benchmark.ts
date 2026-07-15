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

async function resolveReferenceAnalyses(
  references: ReferenceAnalysis[],
  videoFormat: VideoOrientation,
  youtubeEnabled: boolean,
  platform?: PlatformId,
): Promise<ReferenceAnalysis[]> {
  if (!youtubeEnabled) return references;

  const resolved = await Promise.all(
    references.map(async (ref) => {
      try {
        const video = await resolveEstimatedReference(ref.video, videoFormat, platform);
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
  let sharedReferences: ReferenceAnalysis[] | null = null;
  const pendingAiPlatforms: PlatformId[] = [];

  for (const platform of PLATFORMS) {
    const label = PLATFORM_LABELS[platform];
    onProgress?.('search', `${label} 레퍼런스 검색 중...`);

    if (sharedReferences && sharedReferences.length > 0) {
      platformBenchmarks.push({
        platform,
        label,
        references: sharedReferences.slice(0, 3),
        dataSource: sharedReferences.some((r) => !r.video.videoId.startsWith('estimated-'))
          ? 'youtube_api'
          : 'ai_estimated',
        searchQuery: keywords.searchQuery,
      });
      continue;
    }

    if (youtubeEnabled) {
      try {
        const { references, searchQuery } = await searchPlatformReferences(
          keywords.searchQuery,
          videoFormat,
          platform,
          3,
        );
        if (references.length > 0) {
          sharedReferences = await analyzeReferenceVideos(references, preset);
          platformBenchmarks.push({
            platform,
            label,
            references: sharedReferences,
            dataSource: 'youtube_api',
            searchQuery,
          });
          continue;
        }
      } catch {
        /* fall through */
      }
    }

    pendingAiPlatforms.push(platform);
  }

  if (pendingAiPlatforms.length > 0 && !sharedReferences) {
    onProgress?.('search', 'AI 레퍼런스 추정 중...');
    const multi = await generateMultiPlatformEstimatedReferences(keywords, preset, pendingAiPlatforms);
    for (const platform of pendingAiPlatforms) {
      const label = PLATFORM_LABELS[platform];
      const estimated = multi[platform] ?? [];
      const references = youtubeEnabled
        ? await resolveReferenceAnalyses(estimated, videoFormat, true, platform)
        : estimated;
      platformBenchmarks.push({
        platform,
        label,
        references,
        dataSource: references.some((r) => !r.video.videoId.startsWith('estimated-'))
          ? 'youtube_api'
          : 'ai_estimated',
        searchQuery: `${keywords.searchQuery} (${label} AI 추정)`,
      });
    }
  } else if (pendingAiPlatforms.length > 0 && sharedReferences) {
    for (const platform of pendingAiPlatforms) {
      platformBenchmarks.push({
        platform,
        label: PLATFORM_LABELS[platform],
        references: sharedReferences.slice(0, 3),
        dataSource: 'youtube_api',
        searchQuery: keywords.searchQuery,
      });
    }
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
    for (const pb of platformBenchmarks) {
      pb.references = await resolveReferenceAnalyses(pb.references, videoFormat, true, pb.platform);
      const resolvedCount = pb.references.filter((r) => !r.video.videoId.startsWith('estimated-')).length;
      if (resolvedCount > 0 && pb.references.length > 0) {
        pb.dataSource = resolvedCount === pb.references.length ? 'youtube_api' : pb.dataSource;
      }
    }
    referenceAnalyses = await resolveReferenceAnalyses(referenceAnalyses, videoFormat, true, 'youtube');
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
