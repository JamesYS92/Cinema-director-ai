import * as youtubeCore from './youtubeCore';
import * as youtubeStoryboard from './youtubeStoryboard';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as string | undefined;
  const params = body;

  const storyboardActions = new Set(['getVideoMeta', 'extractStoryboardFrames']);
  if (!apiKey && !storyboardActions.has(action ?? '')) {
    return Response.json({ error: 'YouTube API 키가 서버에 설정되지 않았습니다.' }, { status: 503 });
  }

  try {
    switch (action) {
      case 'searchTopVideos':
        return Response.json({
          result: await youtubeCore.searchTopVideos(
            apiKey,
            params.query as string,
            params.options as youtubeCore.SearchOptions,
          ),
        });

      case 'searchPlatformReferences':
        return Response.json({
          result: await youtubeCore.searchPlatformReferences(
            apiKey,
            params.baseQuery as string,
            params.orientation as youtubeCore.VideoOrientation,
            params.platform as youtubeCore.PlatformId,
            params.maxResults as number | undefined,
          ),
        });

      case 'resolveEstimatedReference':
        return Response.json({
          result: await youtubeCore.resolveEstimatedReference(
            apiKey,
            params.video as youtubeCore.ReferenceVideo,
            params.orientation as youtubeCore.VideoOrientation,
            params.platform as youtubeCore.PlatformId | undefined,
          ),
        });

      case 'searchTrendingRelatedVideos':
        return Response.json({
          result: await youtubeCore.searchTrendingRelatedVideos(
            apiKey,
            params.keywords as youtubeCore.ExtractedKeywords,
            params.maxResults as number | undefined,
          ),
        });

      case 'fetchThumbnail':
        return Response.json({
          result: await youtubeCore.fetchThumbnailAsBase64(params.url as string),
        });

      case 'getVideoMeta':
        return Response.json({
          result: await youtubeStoryboard.fetchYouTubeVideoMeta(
            params.videoId as string,
            apiKey ?? undefined,
          ),
        });

      case 'extractStoryboardFrames':
        return Response.json({
          result: await youtubeStoryboard.fetchYouTubeStoryboardFrames(
            params.videoId as string,
            (params.count as number) || 30,
            apiKey ?? undefined,
          ),
        });

      case 'checkConnection':
        return Response.json({
          result: await youtubeCore.checkYoutubeApiConnection(apiKey),
        });

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'YouTube API 오류';
    return Response.json({ error: message }, { status: 500 });
  }
}
