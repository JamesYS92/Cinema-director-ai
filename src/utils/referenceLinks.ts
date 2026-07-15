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

export function getYouTubeWatchUrl(videoId: string): string {
  if (isEstimatedReference(videoId)) {
    return '';
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export interface ReferenceLinkPair {
  watch: ReferenceLink | null;
  similar: ReferenceLink;
}

function buildSimilarSearchQuery(video: ReferenceVideo, nicheQuery?: string): string {
  if (nicheQuery?.trim()) {
    return nicheQuery.trim().slice(0, 120);
  }
  return video.title.replace(/#\S+/g, '').replace(/\?+/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

export function getReferenceLinkPair(video: ReferenceVideo, nicheQuery?: string): ReferenceLinkPair {
  const referenceSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(buildSearchQuery(video))}`;
  const similarUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(buildSimilarSearchQuery(video, nicheQuery))}`;

  if (!isEstimatedReference(video.videoId)) {
    return {
      watch: {
        href: getYouTubeWatchUrl(video.videoId),
        label: '레퍼런스 영상 보기',
        isSearch: false,
        canEmbed: true,
      },
      similar: {
        href: similarUrl,
        label: '유사 영상 검색',
        isSearch: true,
        canEmbed: false,
      },
    };
  }

  return {
    watch: {
      href: referenceSearchUrl,
      label: '레퍼런스 검색',
      isSearch: true,
      canEmbed: false,
    },
    similar: {
      href: similarUrl,
      label: '유사 영상 검색',
      isSearch: true,
      canEmbed: false,
    },
  };
}

export function getReferenceLink(video: ReferenceVideo): ReferenceLink {
  const pair = getReferenceLinkPair(video);
  return pair.watch ?? pair.similar;
}

export function getEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?rel=0`;
}
