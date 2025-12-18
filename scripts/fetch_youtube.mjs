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
    const viewCountRaw = item?.statistics?.viewCount || 0;
    const viewCount = Number(viewCountRaw) || 0;
    const weight = 1 + Math.log10(1 + viewCount);

    if (shouldSkipTitle(rawTitle)) continue;
    const key = normalizeKey(rawTitle);
    const current = scoreMap.get(key) || { keyword: rawTitle.trim(), score: 0 };
    current.score += weight;
    scoreMap.set(key, current);
  }

  const items = Array.from(scoreMap.values())
    .map((entry) => ({
      keyword: entry.keyword,
      score: Math.round(entry.score * 1000) / 1000,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return {
    capturedAt: nowIso(),
    geo,
    source: 'youtube',
    items,
  };
}

async function runCli() {
  const geo = process.argv[2];
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!geo) {
    console.error('Usage: node scripts/fetch_youtube.mjs <GEO>');
    process.exit(1);
  }
  try {
    const snapshot = await fetchYoutube(geo, apiKey);
    console.log(JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
