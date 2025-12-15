import { fetchJson, nowIso } from './utils.mjs';

const STOPWORDS_US = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'your',
  'you',
  'are',
  'was',
  'were',
  'just',
  'have',
  'has',
  'our',
  'their',
  'from',
  'but',
  'new',
  'official',
  'video',
  'feat',
  'ft',
  'music',
  'live',
  'episode',
]);

const CLEAN_REGEX = /[“”"'\[\]\(\)\{\}.,!?/\\:;|#*~`_+=<>^%$@\-]/g;

function cleanTitle(title) {
  return title.toLowerCase().replace(CLEAN_REGEX, ' ').replace(/\s+/g, ' ').trim();
}

function addScore(map, keyword, weight) {
  const key = keyword.trim();
  if (!key || key.length < 2) return;
  map.set(key, (map.get(key) || 0) + weight);
}

function tokensFromTitle(title, geo) {
  const normalized = cleanTitle(title);
  const parts = normalized.split(' ').filter(Boolean);
  const filtered = parts.filter((token) => {
    if (token.length < 2) return false;
    if (/^\d+$/.test(token)) return false;
    if (geo === 'US' && STOPWORDS_US.has(token)) return false;
    return true;
  });
  return filtered;
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
    const title = item?.snippet?.title || '';
    const viewCountRaw = item?.statistics?.viewCount || 0;
    const viewCount = Number(viewCountRaw) || 0;
    const weight = 1 + Math.log10(1 + viewCount);

    const tokens = tokensFromTitle(title, geo);
    for (const token of tokens) {
      addScore(scoreMap, token, weight);
    }

    if (geo !== 'US') {
      const normalized = cleanTitle(title);
      const candidate =
        normalized.length > 40 ? normalized.slice(0, 40).trim() : normalized;
      if (candidate) {
        addScore(scoreMap, candidate, weight);
      }
    }
  }

  const items = Array.from(scoreMap.entries())
    .map(([keyword, score]) => ({
      keyword,
      score: Math.round(score * 1000) / 1000,
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

