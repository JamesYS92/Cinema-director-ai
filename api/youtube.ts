import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ExtractedKeywords, PlatformId, ReferenceVideo, VideoOrientation } from '../src/types';
import * as youtubeCore from '../src/server/youtubeCore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'YouTube API 키가 서버에 설정되지 않았습니다.' });
  }

  const body = req.body as { action?: string };
  const { action, ...params } = body;

  try {
    switch (action) {
      case 'searchTopVideos':
        return res.status(200).json({
          result: await youtubeCore.searchTopVideos(
            apiKey,
            params.query as string,
            params.options as youtubeCore.SearchOptions,
          ),
        });

      case 'searchPlatformReferences':
        return res.status(200).json({
          result: await youtubeCore.searchPlatformReferences(
            apiKey,
            params.baseQuery as string,
            params.orientation as VideoOrientation,
            params.platform as PlatformId,
            params.maxResults as number | undefined,
          ),
        });

      case 'resolveEstimatedReference':
        return res.status(200).json({
          result: await youtubeCore.resolveEstimatedReference(
            apiKey,
            params.video as ReferenceVideo,
            params.orientation as VideoOrientation,
          ),
        });

      case 'searchTrendingRelatedVideos':
        return res.status(200).json({
          result: await youtubeCore.searchTrendingRelatedVideos(
            apiKey,
            params.keywords as ExtractedKeywords,
            params.maxResults as number | undefined,
          ),
        });

      case 'fetchThumbnail':
        return res.status(200).json({
          result: await youtubeCore.fetchThumbnailAsBase64(params.url as string),
        });

      case 'checkConnection':
        return res.status(200).json({
          result: await youtubeCore.checkYoutubeApiConnection(apiKey),
        });

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'YouTube API 오류';
    return res.status(500).json({ error: message });
  }
}
