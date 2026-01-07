import { Router } from 'express';

const router = Router();

// 型別定義
interface ImageSearchResult {
  id: string;
  url: string;
  thumbnailUrl: string;
  author: string;
  authorUrl?: string;
  source: 'unsplash' | 'pexels';
  width: number;
  height: number;
}

interface UnsplashPhoto {
  id: string;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  user: {
    name: string;
    links: {
      html: string;
    };
  };
  width: number;
  height: number;
}

interface PexelsPhoto {
  id: number;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    tiny: string;
  };
  photographer: string;
  photographer_url: string;
  width: number;
  height: number;
}

// 快取（簡易記憶體快取）
const cache = new Map<string, { data: ImageSearchResult[]; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 分鐘

/**
 * 從快取取得結果
 */
function getFromCache(key: string): ImageSearchResult[] | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

/**
 * 存入快取
 */
function setToCache(key: string, data: ImageSearchResult[]): void {
  // 限制快取大小
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * 搜尋 Unsplash
 */
async function searchUnsplash(query: string, count: number): Promise<ImageSearchResult[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    console.warn('UNSPLASH_ACCESS_KEY not set');
    return [];
  }

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
      {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Unsplash API error:', error);
      return [];
    }

    const data = await response.json();
    const photos: UnsplashPhoto[] = data.results || [];

    return photos.map((photo) => ({
      id: photo.id,
      url: photo.urls.regular,
      thumbnailUrl: photo.urls.small,
      author: photo.user.name,
      authorUrl: photo.user.links.html,
      source: 'unsplash' as const,
      width: photo.width,
      height: photo.height,
    }));
  } catch (error) {
    console.error('Unsplash search error:', error);
    return [];
  }
}

/**
 * 搜尋 Pexels
 */
async function searchPexels(query: string, count: number): Promise<ImageSearchResult[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn('PEXELS_API_KEY not set');
    return [];
  }

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
      {
        headers: {
          Authorization: apiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Pexels API error:', error);
      return [];
    }

    const data = await response.json();
    const photos: PexelsPhoto[] = data.photos || [];

    return photos.map((photo) => ({
      id: String(photo.id),
      url: photo.src.large,
      thumbnailUrl: photo.src.medium,
      author: photo.photographer,
      authorUrl: photo.photographer_url,
      source: 'pexels' as const,
      width: photo.width,
      height: photo.height,
    }));
  } catch (error) {
    console.error('Pexels search error:', error);
    return [];
  }
}

/**
 * GET /api/images/search
 * 搜尋圖片
 *
 * Query params:
 * - q: 搜尋關鍵字
 * - count: 數量（預設 6，最大 30）
 * - source: 來源（unsplash, pexels, 或 all）
 */
router.get('/search', async (req, res) => {
  try {
    const query = (req.query.q as string)?.trim();
    const count = Math.min(parseInt(req.query.count as string) || 6, 30);
    const source = (req.query.source as string) || 'all';

    if (!query) {
      return res.status(400).json({ error: '請提供搜尋關鍵字 (q)' });
    }

    // 檢查快取
    const cacheKey = `${query}:${count}:${source}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log(`Image search cache hit: ${query}`);
      return res.json({ images: cached, cached: true });
    }

    console.log(`Image search: "${query}", count=${count}, source=${source}`);

    let results: ImageSearchResult[] = [];

    if (source === 'unsplash') {
      results = await searchUnsplash(query, count);
    } else if (source === 'pexels') {
      results = await searchPexels(query, count);
    } else {
      // 同時搜尋兩個來源
      const [unsplashResults, pexelsResults] = await Promise.all([
        searchUnsplash(query, Math.ceil(count / 2)),
        searchPexels(query, Math.ceil(count / 2)),
      ]);

      // 交錯合併結果
      const maxLen = Math.max(unsplashResults.length, pexelsResults.length);
      for (let i = 0; i < maxLen; i++) {
        if (unsplashResults[i]) results.push(unsplashResults[i]);
        if (pexelsResults[i]) results.push(pexelsResults[i]);
      }

      // 限制數量
      results = results.slice(0, count);
    }

    // 存入快取
    if (results.length > 0) {
      setToCache(cacheKey, results);
    }

    res.json({ images: results, cached: false });
  } catch (error) {
    console.error('Image search error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : '圖片搜尋失敗',
      images: [],
    });
  }
});

/**
 * GET /api/images/random
 * 取得隨機圖片（用於預設背景）
 */
router.get('/random', async (req, res) => {
  try {
    const query = (req.query.q as string) || 'abstract background';
    const count = Math.min(parseInt(req.query.count as string) || 1, 10);

    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
      return res.status(503).json({ error: 'Image service not configured' });
    }

    const response = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&count=${count}&orientation=landscape`,
      {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Unsplash random error:', error);
      return res.status(response.status).json({ error: 'Failed to get random images' });
    }

    const photos: UnsplashPhoto[] = await response.json();

    const images: ImageSearchResult[] = (Array.isArray(photos) ? photos : [photos]).map((photo) => ({
      id: photo.id,
      url: photo.urls.regular,
      thumbnailUrl: photo.urls.small,
      author: photo.user.name,
      authorUrl: photo.user.links.html,
      source: 'unsplash' as const,
      width: photo.width,
      height: photo.height,
    }));

    res.json({ images });
  } catch (error) {
    console.error('Random image error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get random images',
    });
  }
});

export default router;
