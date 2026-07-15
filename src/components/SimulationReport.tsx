import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Youtube,
  Instagram,
  Music2,
  Lightbulb,
  Target,
  CheckCircle2,
  AlertTriangle,
  ListChecks,
  Search,
  BarChart3,
  ExternalLink,
  Database,
  Film,
  ThumbsUp,
  ThumbsDown,
  Smartphone,
  Clapperboard,
  Video,
  Play,
  Flame,
  TrendingUp as TrendingUpIcon,
} from 'lucide-react';
import type { AnalysisReport, BenchmarkGap, ReferenceAnalysis, TrendBadge, TrendingVideo } from '../types';
import { formatViews } from '../utils/storage';
import { getEmbedUrl, getReferenceLink, isEstimatedReference } from '../utils/referenceLinks';
import { ORIENTATION_LABELS, ORIENTATION_REFERENCE_HINT } from '../utils/video';

const SHOWCASE_COUNT = 3;

const TREND_BADGE_LABELS: Record<TrendBadge, string> = {
  hot: '지금 핫한',
  rising: '최근 급상승',
  popular: '고조회수',
};

function formatPublishedDate(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface SimulationReportProps {
  report: AnalysisReport;
  onClose: () => void;
  savedLabel?: string;
}

const PLATFORM_ICONS: Record<string, ReactNode> = {
  youtube: <Youtube size={18} />,
  instagram: <Instagram size={18} />,
  tiktok: <Music2 size={18} />,
};

const PLATFORM_COLORS: Record<string, string> = {
  youtube: '#ff4444',
  instagram: '#e1306c',
  tiktok: '#00f2ea',
};

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color =
    score >= 75 ? 'var(--accent-green)' : score >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)';
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="score-gauge">
      <svg viewBox="0 0 120 120" className="gauge-svg">
        <circle cx="60" cy="60" r="54" className="gauge-bg" />
        <circle
          cx="60"
          cy="60"
          r="54"
          className="gauge-fill"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="gauge-center">
        <span className="gauge-score" style={{ color }}>{score}</span>
        <span className="gauge-label">{label}</span>
      </div>
    </div>
  );
}

function avgMetrics(metrics: ReferenceAnalysis['metrics']): number {
  return Math.round(
    (metrics.trendFit + metrics.empathy + metrics.targetAudience +
      metrics.contentIdea + metrics.viralAppeal) / 5,
  );
}

function ReferenceShowcaseCard({ reference, rank }: { reference: ReferenceAnalysis; rank: number }) {
  const [playing, setPlaying] = useState(false);
  const isEstimated = isEstimatedReference(reference.video.videoId);
  const hasThumbnail = !!reference.video.thumbnailUrl;
  const score = avgMetrics(reference.metrics);
  const link = getReferenceLink(reference.video);

  const card = (
    <div className="ref-showcase-card">
      <div className="ref-showcase-thumb">
        {playing && link.canEmbed ? (
          <iframe
            className="ref-showcase-embed"
            src={getEmbedUrl(reference.video.videoId)}
            title={reference.video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : hasThumbnail ? (
          <>
            <img src={reference.video.thumbnailUrl} alt={reference.video.title} loading="lazy" />
            {link.canEmbed && (
              <button
                type="button"
                className="ref-play-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPlaying(true);
                }}
                aria-label="영상 재생"
              >
                <Play size={22} fill="currentColor" />
              </button>
            )}
          </>
        ) : (
          <div className="ref-showcase-placeholder">
            <Film size={28} strokeWidth={1.2} />
            <span>{isEstimated ? 'AI 추정 레퍼런스' : '썸네일 없음'}</span>
          </div>
        )}
        <span className="ref-showcase-rank">#{rank}</span>
        <span className="ref-showcase-score">{score} 기획점</span>
        {isEstimated && (
          <span className="ref-showcase-est-badge">AI 추정</span>
        )}
      </div>
      <div className="ref-showcase-body">
        <strong title={reference.video.title}>{reference.video.title}</strong>
        <span className="ref-showcase-meta">
          {reference.video.channelTitle} · {formatViews(reference.video.viewCount)} views
        </span>
        <p>{reference.summary}</p>
      </div>
      <div className={`ref-showcase-footer ${link.isSearch ? 'search' : ''}`}>
        {link.isSearch ? <Search size={14} /> : <Youtube size={14} />}
        <span>{link.label}</span>
        <ExternalLink size={12} />
      </div>
    </div>
  );

  if (playing && link.canEmbed) {
    return (
      <div className="ref-showcase-wrap">
        {card}
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="ref-showcase-external"
        >
          YouTube에서 열기
        </a>
      </div>
    );
  }

  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className="ref-showcase-link"
      onClick={(e) => {
        if (link.canEmbed && hasThumbnail && !playing) {
          e.preventDefault();
          setPlaying(true);
        }
      }}
    >
      {card}
    </a>
  );
}

function TrendingVideoCard({ video }: { video: TrendingVideo }) {
  const [playing, setPlaying] = useState(false);
  const published = formatPublishedDate(video.publishedAt);
  const watchUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

  const card = (
    <div className="trending-card">
      <div className="trending-thumb">
        {playing ? (
          <iframe
            className="ref-showcase-embed"
            src={getEmbedUrl(video.videoId)}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            <img src={video.thumbnailUrl} alt={video.title} loading="lazy" />
            <button
              type="button"
              className="ref-play-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPlaying(true);
              }}
              aria-label="영상 재생"
            >
              <Play size={22} fill="currentColor" />
            </button>
          </>
        )}
        <span className={`trending-badge ${video.trendBadge}`}>
          {video.trendBadge === 'hot' ? <Flame size={12} /> : <TrendingUpIcon size={12} />}
          {TREND_BADGE_LABELS[video.trendBadge]}
        </span>
      </div>
      <div className="trending-body">
        <strong title={video.title}>{video.title}</strong>
        <span className="trending-meta">
          {video.channelTitle} · {formatViews(video.viewCount)} views
          {published ? ` · ${published}` : ''}
        </span>
        <span className="trending-query">검색: {video.matchedQuery}</span>
      </div>
      <div className="ref-showcase-footer">
        <Youtube size={14} />
        <span>YouTube에서 보기</span>
        <ExternalLink size={12} />
      </div>
    </div>
  );

  if (playing) {
    return (
      <div className="ref-showcase-wrap">
        {card}
        <a href={watchUrl} target="_blank" rel="noopener noreferrer" className="ref-showcase-external">
          YouTube에서 열기
        </a>
      </div>
    );
  }

  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="ref-showcase-link"
      onClick={(e) => {
        e.preventDefault();
        setPlaying(true);
      }}
    >
      {card}
    </a>
  );
}

function GapBar({ gap }: { gap: BenchmarkGap }) {
  const isPositive = gap.gap >= 0;
  return (
    <div className="gap-row">
      <span className="gap-label">{gap.label}</span>
      <div className="gap-scores">
        <span className="gap-target">{gap.targetScore}</span>
        <span className="gap-vs">vs</span>
        <span className="gap-ref">{gap.referenceAvg}</span>
        <span className="gap-top">(Top {gap.topTierAvg})</span>
      </div>
      <span className={`gap-diff ${isPositive ? 'positive' : 'negative'}`}>
        {isPositive ? '+' : ''}{gap.gapPercent}%
      </span>
    </div>
  );
}

export function SimulationReport({ report, onClose, savedLabel }: SimulationReportProps) {
  const { benchmark } = report;
  const chartData = report.platformScores.map((p) => ({
    name: p.label.split(' ')[0],
    fitScore: p.fitScore,
    platform: p.platform,
  }));

  const radarData = benchmark.gaps.map((g) => ({
    metric: g.label.split(' ')[0],
    target: g.targetScore,
    reference: g.referenceAvg,
    topTier: g.topTierAvg,
  }));

  const isRealData = benchmark.viewPotential.dataSource === 'youtube_api' ||
    benchmark.platformBenchmarks.some((p) => p.dataSource === 'youtube_api');
  const showcaseRefs = benchmark.references.slice(0, SHOWCASE_COUNT);
  const extraRefs = benchmark.references.slice(SHOWCASE_COUNT);
  const videoFormat = benchmark.videoFormat;
  const formatLabel = ORIENTATION_LABELS[videoFormat];
  const topRef = showcaseRefs[0];
  const trendingVideos = benchmark.trendingVideos ?? [];

  return (
    <div className="report-panel">
      <div className="report-header">
        <div>
          <h2>
            <TrendingUp size={22} />
            Benchmark Report
          </h2>
          <p>
            {isRealData ? '멀티플랫폼 실데이터' : 'AI 추정'} + 영상 단위 분석 리포트
          </p>
          {savedLabel && <span className="saved-badge">{savedLabel}</span>}
        </div>
        <button className="btn ghost" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="report-body">
        {/* Keywords */}
        <section className="report-section">
          <h3>
            <Search size={18} />
            추출된 키워드
          </h3>
          <div className="keyword-tags">
            <span className="keyword-niche">{benchmark.keywords.niche}</span>
            {benchmark.keywords.primary.map((k) => (
              <span key={k} className="keyword-tag primary">{k}</span>
            ))}
            {benchmark.keywords.secondary.map((k) => (
              <span key={k} className="keyword-tag">{k}</span>
            ))}
          </div>
          <p className="search-query">
            YouTube 검색어: <strong>{benchmark.keywords.searchQuery}</strong>
          </p>
          <span className="format-badge">
            <Smartphone size={13} />
            {formatLabel} 기준 분석
          </span>
        </section>

        {/* Trending Recommendations */}
        <section className="report-section trending-section">
          <h3>
            <Flame size={18} />
            키워드 기반 유행 영상 추천
          </h3>
          {trendingVideos.length > 0 ? (
            <>
              <p className="ref-showcase-desc">
                업로드 영상 키워드로 YouTube에서 지금 조회가 붙는 영상 {trendingVideos.length}개를 찾았습니다.
                썸네일을 클릭하면 재생되고, 링크로 YouTube에서 바로 열 수 있습니다.
              </p>
              <div className="trending-grid">
                {trendingVideos.map((video) => (
                  <TrendingVideoCard key={video.videoId} video={video} />
                ))}
              </div>
            </>
          ) : (
            <p className="trending-empty">
              YouTube API로 유행 영상을 검색하지 못했습니다. 설정에서 API 키를 확인한 뒤 다시 분석해 주세요.
            </p>
          )}
        </section>

        {/* Target Video Review - 장점/단점 */}
        <section className="report-section target-review-section">
          <h3>내 영상 분석</h3>
          <p className="target-review-summary">{benchmark.targetReview.summary}</p>
          <div className="target-review-grid">
            <div className="target-review-col strengths">
              <h4>
                <ThumbsUp size={16} />
                장점
              </h4>
              <ul>
                {benchmark.targetReview.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="target-review-col weaknesses">
              <h4>
                <ThumbsDown size={16} />
                단점
              </h4>
              <ul>
                {benchmark.targetReview.weaknesses.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Visual Compare */}
        {topRef && benchmark.targetThumbnail && (
          <section className="report-section visual-compare-section">
            <h3>내 영상 vs 레퍼런스 #1 비교</h3>
            <div className={`visual-compare-grid ${videoFormat}`}>
              <div className="visual-compare-card">
                <span className="visual-compare-label">내 영상</span>
                <div className={`visual-compare-frame ${videoFormat}`}>
                  <img src={benchmark.targetThumbnail} alt="내 영상" />
                </div>
              </div>
              <div className="visual-compare-vs">VS</div>
              <div className="visual-compare-card">
                <span className="visual-compare-label">레퍼런스 #1</span>
                <div className="visual-compare-frame landscape">
                  {topRef.video.thumbnailUrl ? (
                    <img src={topRef.video.thumbnailUrl} alt={topRef.video.title} />
                  ) : (
                    <div className="ref-showcase-placeholder">
                      <Film size={24} />
                    </div>
                  )}
                </div>
                <p className="visual-compare-ref-title">{topRef.video.title}</p>
                <span className="visual-compare-ref-views">
                  {formatViews(topRef.video.viewCount)} views
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Video Holistic Analysis */}
        <section className="report-section video-analysis-section">
          <h3>
            <Video size={18} />
            영상 단위 분석
            {benchmark.videoAnalysis.usedVideoFile ? (
              <span className="analysis-badge real">실제 영상 파일</span>
            ) : (
              <span className="analysis-badge est">컷보드 기반</span>
            )}
          </h3>
          {benchmark.videoAnalysis.skipReason && !benchmark.videoAnalysis.usedVideoFile && (
            <p className="video-skip-note">{benchmark.videoAnalysis.skipReason}</p>
          )}
          {benchmark.videoAnalysis.usedVideoFile && (
            <>
              <div className="video-analysis-grid">
                <div className="video-analysis-card">
                  <h4>트렌드 적합성</h4>
                  <p>{benchmark.videoAnalysis.trendAlignment}</p>
                </div>
                <div className="video-analysis-card">
                  <h4>조회 유도 훅</h4>
                  <p>{benchmark.videoAnalysis.hookForViews}</p>
                </div>
                <div className="video-analysis-card">
                  <h4>공감대 흐름</h4>
                  <p>{benchmark.videoAnalysis.empathyFlow}</p>
                </div>
                <div className="video-analysis-card">
                  <h4>타겟 신호</h4>
                  <p>{benchmark.videoAnalysis.targetSignals}</p>
                </div>
              </div>
              {benchmark.videoAnalysis.retentionForViews && (
                <p className="video-retention-note">
                  <strong>리텐션·조회:</strong> {benchmark.videoAnalysis.retentionForViews}
                </p>
              )}
              {(benchmark.videoAnalysis.temporalStrengths.length > 0 ||
                benchmark.videoAnalysis.temporalWeaknesses.length > 0) && (
                <div className="target-review-grid" style={{ marginTop: 12 }}>
                  {benchmark.videoAnalysis.temporalStrengths.length > 0 && (
                    <div className="target-review-col strengths">
                      <h4><ThumbsUp size={14} /> 흐름상 장점</h4>
                      <ul>
                        {benchmark.videoAnalysis.temporalStrengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {benchmark.videoAnalysis.temporalWeaknesses.length > 0 && (
                    <div className="target-review-col weaknesses">
                      <h4><ThumbsDown size={14} /> 흐름상 단점</h4>
                      <ul>
                        {benchmark.videoAnalysis.temporalWeaknesses.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* Platform Benchmarks */}
        <section className="report-section">
          <h3>
            <Clapperboard size={18} />
            플랫폼별 실데이터 벤치마크
          </h3>
          <div className="platform-benchmark-grid">
            {benchmark.platformBenchmarks.map((pb) => (
              <div key={pb.platform} className="platform-benchmark-card">
                <div className="pb-header">
                  {PLATFORM_ICONS[pb.platform]}
                  <span>{pb.label}</span>
                  <span className={`data-badge ${pb.dataSource}`}>
                    {pb.dataSource === 'youtube_api' ? '실측' : 'AI 추정'}
                  </span>
                </div>
                <p className="pb-query">검색: {pb.searchQuery}</p>
                {pb.references[0] && (
                  <div className="pb-top-ref">
                    {pb.references[0].video.thumbnailUrl && (
                      <img src={pb.references[0].video.thumbnailUrl} alt="" />
                    )}
                    <div>
                      <strong>{pb.references[0].video.title}</strong>
                      <span>{formatViews(pb.references[0].video.viewCount)} views</span>
                    </div>
                  </div>
                )}
                <span className="pb-count">레퍼런스 {pb.references.length}개</span>
              </div>
            ))}
          </div>
        </section>

        {/* Reference Showcase TOP 3 */}
        <section className="report-section">
          <h3>
            <Database size={18} />
            비교 분석 레퍼런스 TOP {showcaseRefs.length}
          </h3>
          <p className="ref-showcase-desc">
            {isRealData
              ? `"${benchmark.keywords.searchQuery}" — ${formatLabel} 고조회수 영상 ${showcaseRefs.length}개와 비교했습니다.`
              : `${ORIENTATION_REFERENCE_HINT[videoFormat]} 중 상위 영상 ${showcaseRefs.length}개(AI 추정)와 비교했습니다. 카드를 클릭하면 YouTube에서 유사 영상을 검색하거나 재생할 수 있습니다.`}
          </p>
          <div className="ref-showcase-grid">
            {showcaseRefs.map((ref, i) => (
              <ReferenceShowcaseCard key={ref.video.videoId + i} reference={ref} rank={i + 1} />
            ))}
          </div>

          {extraRefs.length > 0 && (
            <details className="ref-extra-details">
              <summary>추가 레퍼런스 {extraRefs.length}개 보기</summary>
              <div className="reference-list">
                {extraRefs.map((ref, i) => {
                  const link = getReferenceLink(ref.video);
                  return (
                  <div key={ref.video.videoId + i} className="reference-item">
                    <div className="reference-rank">#{i + SHOWCASE_COUNT + 1}</div>
                    <div className="reference-info">
                      <strong>{ref.video.title}</strong>
                      <span>{ref.video.channelTitle} · {formatViews(ref.video.viewCount)} views</span>
                      <p>{ref.summary}</p>
                    </div>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="reference-link"
                      title={link.label}
                    >
                      {link.isSearch ? <Search size={14} /> : <ExternalLink size={14} />}
                    </a>
                  </div>
                  );
                })}
              </div>
            </details>
          )}
        </section>

        {/* Gap Analysis */}
        <section className="report-section">
          <h3>
            <BarChart3 size={18} />
            상위 영상 대비 기획·마케팅 비교
          </h3>
          <p className="benchmark-summary">{benchmark.benchmarkSummary}</p>

          <div className="gap-list">
            {benchmark.gaps.map((g) => (
              <GapBar key={g.metric} gap={g} />
            ))}
          </div>

          <div className="chart-wrap radar-wrap">
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#333" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#888', fontSize: 11 }} />
                <Radar name="내 영상" dataKey="target" stroke="#e94560" fill="#e94560" fillOpacity={0.3} />
                <Radar name="레퍼런스 평균" dataKey="reference" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.15} />
                <Radar name="상위 1%" dataKey="topTier" stroke="#f5c542" fill="#f5c542" fillOpacity={0.1} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#888' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* View Potential */}
        <section className="report-section view-potential-section">
          <h3>데이터 기반 조회수 예측</h3>
          <div className="view-potential-card">
            <div className="view-potential-main">
              <span className="view-range">
                {formatViews(benchmark.viewPotential.realisticViews.min)} – {formatViews(benchmark.viewPotential.realisticViews.max)}
              </span>
              <span className="view-percentile">상위 {100 - benchmark.viewPotential.percentile}% 예상</span>
            </div>
            <p className="view-reasoning">{benchmark.viewPotential.reasoning}</p>
          </div>
        </section>

        {/* Viral Index */}
        <section className="report-section viral-section">
          <ScoreGauge score={report.viralIndex} label="조회 잠재력" />
          <div className="viral-bar-wrap">
            <div className="viral-bar">
              <div className="viral-bar-fill" style={{ width: `${report.viralIndex}%` }} />
            </div>
            <div className="viral-bar-labels">
              <span>0</span>
              <span>종합 조회 잠재력</span>
              <span>100</span>
            </div>
          </div>
        </section>

        {/* Platform Scores */}
        <section className="report-section">
          <h3>플랫폼별 적합도</h3>
          <div className="platform-cards">
            {report.platformScores.map((p) => (
              <div key={p.platform} className="platform-card">
                <div className="platform-card-header">
                  {PLATFORM_ICONS[p.platform]}
                  <span>{p.label}</span>
                  <strong style={{ color: PLATFORM_COLORS[p.platform] }}>{p.fitScore}</strong>
                </div>
                <div className="platform-metrics">
                  <div className="metric">
                    <span>예상 조회수</span>
                    <strong>
                      {formatViews(p.estimatedViews.min)} – {formatViews(p.estimatedViews.max)}
                    </strong>
                  </div>
                  <div className="metric">
                    <span>AVD</span>
                    <strong>{p.avd}%</strong>
                  </div>
                  <div className="metric">
                    <span>CTR</span>
                    <strong>{p.ctr}%</strong>
                  </div>
                </div>
                <div className="fit-bar">
                  <div
                    className="fit-bar-fill"
                    style={{ width: `${p.fitScore}%`, background: PLATFORM_COLORS[p.platform] }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barSize={48}>
                <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#888', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, color: '#fff' }} />
                <Bar dataKey="fitScore" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* AI Director Feedback */}
        <section className="report-section">
          <h3>
            <Lightbulb size={18} />
            조회수 관점 기획·마케팅 조언
          </h3>
          <div className="feedback-grid">
            <div className="feedback-card">
              <h4>Trend · 트렌드/아이디어</h4>
              <p>{report.feedback.trendInsight}</p>
            </div>
            <div className="feedback-card">
              <h4>Empathy · 공감대</h4>
              <p>{report.feedback.empathy}</p>
            </div>
            <div className="feedback-card">
              <h4>Target · 타겟 적합</h4>
              <p>{report.feedback.targetFit}</p>
            </div>
            <div className="feedback-card highlight">
              <h4>View Strategy · 조회수 전략</h4>
              <p>{report.feedback.viewStrategy}</p>
            </div>
          </div>
        </section>

        {/* Action Plan */}
        <section className="report-section action-section">
          <div className="action-col">
            <h3><CheckCircle2 size={18} /> 레퍼런스 대비 기획 강점</h3>
            <ul>{report.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div className="action-col">
            <h3><AlertTriangle size={18} /> 조회수 개선 포인트</h3>
            <ul>{report.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div className="action-col">
            <h3><ListChecks size={18} /> 액션 플랜</h3>
            <ul className="action-plan">
              {report.actionPlan.map((s, i) => (
                <li key={i}><Target size={14} />{s}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
