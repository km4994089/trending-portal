import { fetchJson, nowIso } from './utils.mjs';

const BANNED_SINGLE_WORD = new Set([
  'official',
  'video',
  'ep',
  'mv',
  'trailer',
  'teaser',
  'shorts',
  'the',
  'of',
  'to',
  'with',
  'vs',
  'we',
  'me',
  'is',
  'in',
  'day',
]);

function normalizeKey(title) {
  return title
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function shouldSkipTitle(title) {
  const normalized = normalizeKey(title);
  if (!normalized || normalized.length < 2) return true;
  const parts = normalized.split(' ');
  if (parts.length === 1 && BANNED_SINGLE_WORD.has(normalized)) return true;
  return false;
}

export async function fetchYoutube(geo, apiKey) {
  if (!geo) {
    throw new Error('geo is required');
  }
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is missing');
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,statistics');
  url.searchParams.set('chart', 'mostPopular');
  url.searchParams.set('maxResults', '50');
  url.searchParams.set('regionCode', geo);
  url.searchParams.set('key', apiKey);

  let data;
  try {
    data = await fetchJson(url.toString());
  } catch (err) {
    throw new Error(`YouTube API request failed: ${err.message}`);
  }

  if (!data || !Array.isArray(data.items)) {
    throw new Error('YouTube API response missing items');
  }

  const scoreMap = new Map();

  for (const item of data.items) {
    const rawTitle = item?.snippet?.title || '';
    const channelTitle = item?.snippet?.channelTitle || '';
    const publishedAt = item?.snippet?.publishedAt || '';
    const videoId = item?.id || '';
    const viewCountRaw = item?.statistics?.viewCount || 0;
    const viewCount = Number(viewCountRaw) || 0;
    const weight = 1 + Math.log10(1 + viewCount);

    if (shouldSkipTitle(rawTitle)) continue;
    const key = normalizeKey(rawTitle);
    const current = scoreMap.get(key) || {
      keyword: rawTitle.trim(),
      score: 0,
      channelTitle,
      publishedAt,
      videoId,
      topWeight: 0,
    };
    current.score += weight;
    if (weight > current.topWeight) {
      current.channelTitle = channelTitle;
      current.publishedAt = publishedAt;
      current.videoId = videoId;
      current.topWeight = weight;
    }
    scoreMap.set(key, current);
  }

  const sorted = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
  const items = sorted.slice(0, 20).map((entry) => ({
    keyword: entry.keyword,
    score: Math.round(entry.score * 1000) / 1000,
  }));
  const contextItems = sorted.slice(0, 20).map((entry) => ({
    keyword: entry.keyword,
    channelTitle: entry.channelTitle || '',
    publishedAt: entry.publishedAt || '',
    videoId: entry.videoId || '',
  }));

  const capturedAt = nowIso();
  const snapshot = {
    capturedAt,
    geo,
    source: 'youtube',
    items,
  };
  const context = {
    capturedAt,
    geo,
    source: 'youtube',
    items: contextItems,
  };
  return { snapshot, context };
}

async function runCli() {
  const geo = process.argv[2];
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!geo) {
    console.error('Usage: node scripts/fetch_youtube.mjs <GEO>');
    process.exit(1);
  }
  try {
    const bundle = await fetchYoutube(geo, apiKey);
    console.log(JSON.stringify(bundle.snapshot, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
