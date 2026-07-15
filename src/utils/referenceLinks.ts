import type { ReferenceVideo } from '../types';

export function isEstimatedReference(videoId: string): boolean {
  return videoId.startsWith('estimated-');
}

function buildSearchQuery(video: ReferenceVideo): string {
  const title = video.title.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
  return `${video.channelTitle} ${title}`.trim().slice(0, 120);
}

export interface ReferenceLink {
  href: string;
  label: string;
  isSearch: boolean;
  canEmbed: boolean;
}

export function getReferenceLink(video: ReferenceVideo): ReferenceLink {
  if (!isEstimatedReference(video.videoId)) {
    return {
      href: `https://www.youtube.com/watch?v=${video.videoId}`,
      label: 'YouTube에서 보기',
      isSearch: false,
      canEmbed: true,
    };
  }

  return {
    href: `https://www.youtube.com/results?search_query=${encodeURIComponent(buildSearchQuery(video))}`,
    label: 'YouTube에서 유사 영상 검색',
    isSearch: true,
    canEmbed: false,
  };
}

export function getEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?rel=0`;
}
