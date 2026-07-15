import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import type {
  AnalysisPreset,
  AnalysisReport,
  BenchmarkGap,
  BenchmarkReport,
  ExtractedKeywords,
  MarketingMetrics,
  PlatformBenchmark,
  PlatformId,
  ReferenceAnalysis,
  ReferenceVideo,
  TargetVideoReview,
  VideoHolisticAnalysis,
  VideoOrientation,
  TrendingVideo,
  ViewPotential,
} from '../types';
import { METRIC_LABELS, PLATFORM_LABELS } from '../types';
import { fileToBase64, MAX_VIDEO_ANALYSIS_BYTES, formatFileSize } from '../utils/file';
import { dataUrlToBase64 } from '../utils/storage';
import { ORIENTATION_LABELS, ORIENTATION_REFERENCE_HINT } from '../utils/video';
import { fetchThumbnailAsBase64 } from './youtube';

const PRESET_CONTEXT: Record<AnalysisPreset, string> = {
  cinematic:
    '스토리텔링·브랜드 무드·감정 몰입 관점에서 기획력과 조회 유도력을 평가하세요.',
  commercial:
    '타겟 오디언스·메시지·전환·구매/행동 유도 관점에서 마케팅 기획력을 평가하세요.',
  shortform:
    '트렌드 적합성·공감대·바이럴 훅·조회수 극대화 관점에서 숏폼 기획력을 평가하세요.',
};

const METRICS_SCHEMA = `{
  "trendFit": 0-100,
  "empathy": 0-100,
  "targetAudience": 0-100,
  "contentIdea": 0-100,
  "viralAppeal": 0-100
}`;

const METRICS_GUIDE = `
평가 기준 (조회수 최적화·기획/마케팅 관점, 시각 품질 아님):
- trendFit: 현재 유행/트렌드/화제성과 얼마나 맞는가
- empathy: 시청자 공감대·감정 연결·"나도 그래" 반응을 이끌 수 있는가
- targetAudience: 타겟(연령/성별/니치)을 얼마나 정확히 겨냥했는가
- contentIdea: 콘텐츠 아이디어·기획의 참신함·차별성
- viralAppeal: 클릭·시청·공유를 유도하는 조회 유도력`;

const DEFAULT_METRICS: MarketingMetrics = {
  trendFit: 70,
  empathy: 70,
  targetAudience: 70,
  contentIdea: 70,
  viralAppeal: 70,
};

function getModel(apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

function parseJson<T>(text: string): T {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다.');
  return JSON.parse(jsonMatch[0]) as T;
}

function avgMarketingMetrics(m: MarketingMetrics): number {
  return (m.trendFit + m.empathy + m.targetAudience + m.contentIdea + m.viralAppeal) / 5;
}

function imagePart(dataUrl: string): Part {
  return {
    inlineData: { mimeType: 'image/jpeg', data: dataUrlToBase64(dataUrl) },
  };
}

function thumbnailPart(base64: string): Part {
  return { inlineData: { mimeType: 'image/jpeg', data: base64 } };
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    await getModel(apiKey).generateContent('ping');
    return true;
  } catch {
    return false;
  }
}

function emptyVideoAnalysis(reason: string): VideoHolisticAnalysis {
  return {
    usedVideoFile: false,
    skipReason: reason,
    trendAlignment: '영상 파일 분석 미실행 — 컷보드 기반 기획 분석만 적용',
    hookForViews: '',
    empathyFlow: '',
    targetSignals: '',
    retentionForViews: '',
    temporalStrengths: [],
    temporalWeaknesses: [],
  };
}

/** 영상 파일 전체 — 기획/마케팅·조회수 관점 분석 */
export async function analyzeVideoHolistic(
  apiKey: string,
  videoFile: File | null,
  preset: AnalysisPreset,
  videoFormat: VideoOrientation,
): Promise<VideoHolisticAnalysis> {
  if (!videoFile) return emptyVideoAnalysis('로컬 영상 파일이 없습니다.');
  if (videoFile.size > MAX_VIDEO_ANALYSIS_BYTES) {
    return emptyVideoAnalysis(
      `영상 크기(${formatFileSize(videoFile.size)})가 15MB 제한을 초과하여 컷보드 분석으로 대체합니다.`,
    );
  }

  const base64 = await fileToBase64(videoFile);
  const mimeType = videoFile.type || 'video/mp4';

  const prompt = `당신은 숏폼/롱폼 **조회수 극대화** 기획·마케팅 전문가입니다.
첨부 영상 전체를 분석하세요. (형식: ${ORIENTATION_LABELS[videoFormat]})
프리셋: ${PRESET_CONTEXT[preset]}

**시각 품질(구도·조명)이 아닌** 기획·마케팅 관점으로 평가:
- 트렌드/유행과의 정합성
- 공감대를 이끄는 순간
- 타겟(성별·연령·니치) 신호
- 조회수를 끌어올리는 훅·리텐션

반드시 JSON만 응답:
{
  "usedVideoFile": true,
  "trendAlignment": "트렌드/유행 적합성 (2-3문장, 한국어)",
  "hookForViews": "조회수를 끌어올리는 오프닝·훅 분석 (2-3문장)",
  "empathyFlow": "공감대 형성·감정 연결 분석 (2-3문장)",
  "targetSignals": "타겟 오디언스(예: 20대 여성) 적중 신호 (2-3문장)",
  "retentionForViews": "시청 유지·조회수 관점 리텐션 (2-3문장)",
  "temporalStrengths": ["기획/마케팅 장점 1", "장점 2", "장점 3"],
  "temporalWeaknesses": ["기획/마케팅 단점 1", "단점 2", "단점 3"]
}`;

  try {
    const result = await getModel(apiKey).generateContent([
      { inlineData: { mimeType, data: base64 } },
      prompt,
    ]);
    const parsed = parseJson<VideoHolisticAnalysis>(result.response.text());
    return { ...parsed, usedVideoFile: true };
  } catch {
    return emptyVideoAnalysis('영상 파일 분석 중 오류 — 컷보드 분석으로 대체');
  }
}

export async function generatePlatformEstimatedReferences(
  apiKey: string,
  keywords: ExtractedKeywords,
  preset: AnalysisPreset,
  platform: PlatformId,
  count = 3,
): Promise<ReferenceAnalysis[]> {
  const platformLabel = PLATFORM_LABELS[platform];
  const prompt = `당신은 ${platformLabel} **조회수 흥행** 기획 분석가입니다.
니치: ${keywords.niche} / 키워드: ${keywords.primary.join(', ')}
프리셋: ${PRESET_CONTEXT[preset]}
${METRICS_GUIDE}

${platformLabel} 상위 1% 고조회수 영상 ${count}개를 추정하고, 각각 기획/마케팅 지표로 평가하세요.

JSON만 응답:
{
  "references": [
    {
      "title": "영상 제목",
      "channelTitle": "채널명",
      "viewCount": 숫자,
      "metrics": ${METRICS_SCHEMA},
      "summary": "이 영상이 조회수를 뽑은 기획/마케팅 이유 한 문장"
    }
  ]
}`;

  const result = await getModel(apiKey).generateContent(prompt);
  const parsed = parseJson<{
    references: {
      title: string;
      channelTitle: string;
      viewCount: number;
      metrics: MarketingMetrics;
      summary: string;
    }[];
  }>(result.response.text());

  return parsed.references.map((r, i) => ({
    video: {
      videoId: `estimated-${platform}-${i}`,
      title: r.title,
      channelTitle: r.channelTitle,
      viewCount: r.viewCount,
      thumbnailUrl: '',
    },
    metrics: r.metrics,
    summary: r.summary,
  }));
}

export async function extractKeywords(
  apiKey: string,
  imageDataUrls: string[],
  videoFormat: VideoOrientation,
): Promise<ExtractedKeywords> {
  const formatLabel = ORIENTATION_LABELS[videoFormat];
  const formatHint = ORIENTATION_REFERENCE_HINT[videoFormat];

  const prompt = `당신은 **조회수 극대화**를 위한 콘텐츠 기획·키워드 전문가입니다.
컷보드 프레임에서 콘텐츠 니치, 타겟, 트렌드 키워드를 추출하세요.

형식: ${formatLabel} / 레퍼런스: ${formatHint}

JSON만 응답:
{
  "primary": ["핵심 키워드 1", "핵심 키워드 2", "핵심 키워드 3"],
  "secondary": ["보조 키워드 1", "보조 키워드 2"],
  "niche": "니치/카테고리 + 추정 타겟 (예: 20-30대 여성 뷰티)",
  "contentType": "콘텐츠 유형",
  "searchQuery": "고조회수 레퍼런스 검색어 (트렌드 반영)",
  "videoFormat": "${videoFormat}"
}`;

  const result = await getModel(apiKey).generateContent([
    prompt,
    ...imageDataUrls.map(imagePart),
  ]);
  const parsed = parseJson<ExtractedKeywords>(result.response.text());
  return { ...parsed, videoFormat };
}

export async function analyzeReferenceVideos(
  apiKey: string,
  references: ReferenceVideo[],
  preset: AnalysisPreset,
): Promise<ReferenceAnalysis[]> {
  const thumbnails: { ref: ReferenceVideo; base64: string }[] = [];
  for (const ref of references) {
    const base64 = await fetchThumbnailAsBase64(ref.thumbnailUrl);
    if (base64) thumbnails.push({ ref, base64 });
  }

  if (thumbnails.length === 0) {
    return references.map((video) => ({
      video,
      metrics: DEFAULT_METRICS,
      summary: '썸네일 분석 불가 — 조회수 기반 추정',
    }));
  }

  const refList = thumbnails
    .map(
      (t, i) =>
        `[${i + 1}] "${t.ref.title}" / ${t.ref.channelTitle} / ${t.ref.viewCount.toLocaleString()}회`,
    )
    .join('\n');

  const prompt = `당신은 고조회수 영상의 **기획·마케팅** 분석가입니다.
프리셋: ${PRESET_CONTEXT[preset]}
${METRICS_GUIDE}

제목·썸네일·조회수를 바탕으로 각 레퍼런스가 **왜 조회수를 뽑았는지** 기획 관점에서 평가하세요.
(구도·조명이 아닌 트렌드·공감대·타겟·아이디어·바이럴 관점)

${refList}

JSON만 응답:
{
  "references": [
    {
      "index": 0,
      "metrics": ${METRICS_SCHEMA},
      "summary": "조회수 성공 기획 요인 한 문장"
    }
  ]
}`;

  const parts: (string | Part)[] = [prompt];
  for (const t of thumbnails) parts.push(thumbnailPart(t.base64));

  const result = await getModel(apiKey).generateContent(parts);
  const parsed = parseJson<{ references: { index: number; metrics: MarketingMetrics; summary: string }[] }>(
    result.response.text(),
  );

  return parsed.references.map((r) => ({
    video: thumbnails[r.index]?.ref ?? references[r.index],
    metrics: r.metrics,
    summary: r.summary,
  }));
}

export async function generateEstimatedReferences(
  apiKey: string,
  keywords: ExtractedKeywords,
  preset: AnalysisPreset,
  videoFormat: VideoOrientation,
): Promise<ReferenceAnalysis[]> {
  const formatHint = ORIENTATION_REFERENCE_HINT[videoFormat];

  const prompt = `당신은 YouTube **조회수 흥행** 기획 분석가입니다.
니치: ${keywords.niche} / 키워드: ${keywords.primary.join(', ')}
형식: ${ORIENTATION_LABELS[videoFormat]}
프리셋: ${PRESET_CONTEXT[preset]}
${METRICS_GUIDE}

${formatHint} 중 상위 1% 고조회수 영상 5개를 추정하고 기획/마케팅 지표로 평가하세요.

JSON만 응답:
{
  "references": [
    {
      "title": "추정 제목",
      "channelTitle": "채널명",
      "viewCount": 숫자,
      "metrics": ${METRICS_SCHEMA},
      "summary": "조회수 성공 기획 요인"
    }
  ]
}`;

  const result = await getModel(apiKey).generateContent(prompt);
  const parsed = parseJson<{
    references: {
      title: string;
      channelTitle: string;
      viewCount: number;
      metrics: MarketingMetrics;
      summary: string;
    }[];
  }>(result.response.text());

  return parsed.references.map((r, i) => ({
    video: {
      videoId: `estimated-${i}`,
      title: r.title,
      channelTitle: r.channelTitle,
      viewCount: r.viewCount,
      thumbnailUrl: '',
    },
    metrics: r.metrics,
    summary: r.summary,
  }));
}

function computeGaps(target: MarketingMetrics, references: ReferenceAnalysis[]): BenchmarkGap[] {
  const keys = Object.keys(METRIC_LABELS) as (keyof MarketingMetrics)[];

  return keys.map((metric) => {
    const scores = references.map((r) => r.metrics[metric]);
    const referenceAvg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const topTierAvg = Math.max(...scores);
    const targetScore = target[metric];
    const gap = Math.round((targetScore - referenceAvg) * 10) / 10;
    const gapPercent = referenceAvg > 0 ? Math.round((gap / referenceAvg) * 1000) / 10 : 0;

    return {
      metric,
      label: METRIC_LABELS[metric],
      targetScore,
      referenceAvg: Math.round(referenceAvg * 10) / 10,
      topTierAvg,
      gap,
      gapPercent,
    };
  });
}

function computeViewPotential(
  target: MarketingMetrics,
  references: ReferenceAnalysis[],
  dataSource: 'youtube_api' | 'ai_estimated',
): ViewPotential {
  const targetAvg = avgMarketingMetrics(target);
  const refMetricsAvg =
    references.reduce((sum, r) => sum + avgMarketingMetrics(r.metrics), 0) / references.length;

  const qualityRatio = refMetricsAvg > 0 ? targetAvg / refMetricsAvg : 0.5;
  const viewCounts = references.map((r) => r.video.viewCount).filter((v) => v > 0);
  const maxRef = viewCounts.length ? Math.max(...viewCounts) : 1_000_000;
  const medianRef = viewCounts.length
    ? viewCounts.sort((a, b) => a - b)[Math.floor(viewCounts.length / 2)]
    : 100_000;

  const percentile = Math.min(99, Math.max(1, Math.round(qualityRatio * 50)));

  return {
    percentile,
    realisticViews: {
      min: Math.max(100, Math.floor(medianRef * qualityRatio * 0.01)),
      max: Math.max(1000, Math.floor(maxRef * qualityRatio * 0.05)),
    },
    reasoning: `기획·마케팅 종합 점수(${Math.round(targetAvg)})가 레퍼런스 평균(${Math.round(refMetricsAvg)}) 대비 ${Math.round(qualityRatio * 100)}%입니다. 트렌드·공감대·타겟 적합도를 반영해 동일 니치 고조회수 영상(중앙값 ${medianRef.toLocaleString()}회) 기준 조회 범위를 산출했습니다.`,
    dataSource,
  };
}

export async function generateBenchmarkReport(
  apiKey: string,
  imageDataUrls: string[],
  preset: AnalysisPreset,
  keywords: ExtractedKeywords,
  referenceAnalyses: ReferenceAnalysis[],
  platformBenchmarks: PlatformBenchmark[],
  videoAnalysis: VideoHolisticAnalysis,
  dataSource: 'youtube_api' | 'ai_estimated',
  videoFormat: VideoOrientation,
  targetThumbnail: string,
  trendingVideos: TrendingVideo[] = [],
): Promise<AnalysisReport> {
  const formatLabel = ORIENTATION_LABELS[videoFormat];
  const refData = referenceAnalyses.map((r) => ({
    title: r.video.title,
    views: r.video.viewCount,
    channel: r.video.channelTitle,
    metrics: r.metrics,
    summary: r.summary,
  }));

  const platformData = platformBenchmarks.map((pb) => ({
    platform: pb.platform,
    label: pb.label,
    dataSource: pb.dataSource,
    searchQuery: pb.searchQuery,
    topReference: pb.references[0]
      ? { title: pb.references[0].video.title, views: pb.references[0].video.viewCount }
      : null,
    avgViews:
      pb.references.length > 0
        ? Math.round(pb.references.reduce((s, r) => s + r.video.viewCount, 0) / pb.references.length)
        : 0,
  }));

  const videoContext = videoAnalysis.usedVideoFile
    ? `## 영상 전체 기획 분석
- 트렌드: ${videoAnalysis.trendAlignment}
- 조회 훅: ${videoAnalysis.hookForViews}
- 공감대: ${videoAnalysis.empathyFlow}
- 타겟: ${videoAnalysis.targetSignals}
- 리텐션: ${videoAnalysis.retentionForViews}`
    : `## 영상 전체 분석: 컷보드 기반 (${videoAnalysis.skipReason ?? ''})`;

  const prompt = `당신은 **조회수 극대화** 전문 콘텐츠 기획·마케팅 디렉터입니다.
목표: 이 영상이 얼마나 많은 조회수를 뽑을 수 있는지, 어떻게 개선하면 되는지 제시.

## 프리셋
${PRESET_CONTEXT[preset]}

## 키워드·니치
- 니치/타겟: ${keywords.niche}
- 유형: ${keywords.contentType}
- 형식: ${formatLabel}
- 키워드: ${keywords.primary.join(', ')}

${videoContext}

## 고조회수 레퍼런스 (기획·마케팅 지표)
${JSON.stringify(refData, null, 2)}

## 플랫폼별 벤치마크
${JSON.stringify(platformData, null, 2)}

${METRICS_GUIDE}

## 지시사항
1. **구도·조명·색조 평가 금지** — 트렌드·공감대·타겟·아이디어·조회유도력만 평가
2. 레퍼런스 **실조회수**를 앵커로 플랫폼별 조회수 예측
3. 내 영상 장점/단점은 기획·마케팅 관점 (예: "20대 여성 공감대 우수", "트렌드 키워드 미반영")
4. viralIndex = 조회수 잠재력 종합 점수

JSON만 응답:
{
  "targetMetrics": ${METRICS_SCHEMA},
  "targetReview": {
    "summary": "기획·마케팅 관점 종합 총평 (조회수 관점, 2-3문장)",
    "strengths": ["기획/마케팅 장점 1", "장점 2", "장점 3", "장점 4"],
    "weaknesses": ["기획/마케팅 단점 1", "단점 2", "단점 3", "단점 4"]
  },
  "viralIndex": 0-100,
  "platformScores": [
    { "platform": "youtube", "label": "${videoFormat === 'portrait' ? 'YouTube Shorts' : 'YouTube'}", "fitScore": 0-100, "estimatedViews": { "min": 숫자, "max": 숫자 }, "avd": 0-100, "ctr": 0-15 },
    { "platform": "instagram", "label": "Instagram Reels", "fitScore": 0-100, "estimatedViews": { "min": 숫자, "max": 숫자 }, "avd": 0-100, "ctr": 0-15 },
    { "platform": "tiktok", "label": "TikTok", "fitScore": 0-100, "estimatedViews": { "min": 숫자, "max": 숫자 }, "avd": 0-100, "ctr": 0-15 }
  ],
  "feedback": {
    "trendInsight": "트렌드/아이디어 관점 레퍼런스 대비 분석 (2-3문장)",
    "empathy": "공감대 관점 분석 (2-3문장)",
    "targetFit": "타겟(성별·연령·니치) 적합도 분석 (2-3문장)",
    "viewStrategy": "조회수를 끌어올리는 구체적 전략 (2-3문장)"
  },
  "strengths": ["레퍼런스 대비 기획 강점 1", "강점 2", "강점 3"],
  "improvements": ["조회수 개선 포인트 1", "개선 2", "개선 3"],
  "actionPlan": ["즉시 실행 액션 1", "액션 2", "액션 3"],
  "benchmarkSummary": "고조회수 레퍼런스 대비 기획·마케팅 벤치마킹 요약 (3-4문장)"
}

조회수는 레퍼런스 조회수(${refData.map((r) => r.views.toLocaleString()).join(', ')})를 기준으로 현실적으로 산출하세요.`;

  const result = await getModel(apiKey).generateContent([
    prompt,
    ...imageDataUrls.map(imagePart),
  ]);

  const parsed = parseJson<
    Omit<AnalysisReport, 'benchmark'> & {
      targetMetrics: MarketingMetrics;
      targetReview: TargetVideoReview;
      benchmarkSummary: string;
    }
  >(result.response.text());

  const gaps = computeGaps(parsed.targetMetrics, referenceAnalyses);
  const viewPotential = computeViewPotential(parsed.targetMetrics, referenceAnalyses, dataSource);

  const benchmark: BenchmarkReport = {
    keywords,
    videoFormat,
    targetThumbnail,
    references: referenceAnalyses,
    trendingVideos,
    platformBenchmarks,
    videoAnalysis,
    targetMetrics: parsed.targetMetrics,
    targetReview: parsed.targetReview,
    gaps,
    benchmarkSummary: parsed.benchmarkSummary,
    viewPotential,
  };

  const platformScores = parsed.platformScores.map((p) => {
    if (p.platform === 'youtube') {
      return { ...p, estimatedViews: viewPotential.realisticViews };
    }
    return {
      ...p,
      estimatedViews: {
        min: Math.floor(viewPotential.realisticViews.min * (p.platform === 'tiktok' ? 1.5 : 0.8)),
        max: Math.floor(viewPotential.realisticViews.max * (p.platform === 'tiktok' ? 2 : 1.2)),
      },
    };
  });

  return {
    viralIndex: parsed.viralIndex,
    platformScores,
    feedback: parsed.feedback,
    strengths: parsed.strengths,
    improvements: parsed.improvements,
    actionPlan: parsed.actionPlan,
    benchmark,
  };
}
