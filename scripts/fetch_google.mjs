import { fetchText, nowIso } from './utils.mjs';

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(text) {
  return text.replace(/&([a-z]+);/gi, (match, key) => {
    const normalized = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITY_MAP, normalized)
      ? ENTITY_MAP[normalized]
      : match;
  });
}

function extractTitles(xml) {
  const titles = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml))) {
    const block = match[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    if (!titleMatch) continue;
    let title = titleMatch[1];
    const cdataMatch = title.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
    if (cdataMatch) {
      title = cdataMatch[1];
    }
    title = decodeEntities(title.trim());
    if (title) {
      titles.push(title);
    }
  }
  return titles;
}

function parseTraffic(formattedTraffic, fallback) {
  if (typeof formattedTraffic !== 'string') return fallback;
  const clean = formattedTraffic.replace(/[,+]/g, '').trim().toUpperCase();
  const match = clean.match(/^(\d+(?:\.\d+)?)([KM]?)\+?$/);
  if (!match) return fallback;
  const value = parseFloat(match[1]);
  const unit = match[2];
  if (Number.isNaN(value)) return fallback;
  if (unit === 'M') return Math.round(value * 1_000_000);
  if (unit === 'K') return Math.round(value * 1_000);
  return Math.round(value);
}

async function fetchDailyJson(geo) {
  const url = `https://trends.google.com/trends/api/dailytrends?hl=en-US&geo=${geo}&ns=15`;
  const text = await fetchText(url);
  const cleaned = text.replace(/^\)\]\}',?\s*/, '');
  const data = JSON.parse(cleaned);
  const list = data?.default?.trendingSearchesDays?.[0]?.trendingSearches;
  if (!Array.isArray(list)) return [];

  return list.slice(0, 20).map((entry, idx) => {
    const keyword = entry?.title?.query || entry?.title || '';
    const score =
      parseTraffic(entry?.formattedTraffic, 0) ||
      parseTraffic(entry?.trafficBreakdown?.[0]?.formattedTraffic, 0) ||
      100 - idx;
    return { keyword, score };
  });
}

async function fetchRealtimeJson(geo) {
  const url = `https://trends.google.com/trends/api/realtimetrends?hl=en-US&tz=0&cat=all&fi=0&fs=0&geo=${geo}&ri=300&rs=20&sort=0`;
  const text = await fetchText(url);
  const cleaned = text.replace(/^\)\]\}',?\s*/, '');
  const data = JSON.parse(cleaned);
  const list = data?.storySummaries?.trendingStories;
  if (!Array.isArray(list)) return [];

  return list.slice(0, 20).map((entry, idx) => {
    const keyword =
      entry?.title ||
      entry?.entityNames?.[0] ||
      entry?.shareUrl?.split('/').pop()?.replace(/_/g, ' ') ||
      '';
    const score =
      parseTraffic(entry?.formattedTraffic, 0) ||
      parseTraffic(entry?.entityNames?.length ? '0' : '', 0) ||
      100 - idx;
    return { keyword, score };
  });
}

export async function fetchGoogle(geo) {
  if (!geo) {
    throw new Error('geo is required');
  }
  const candidates = [
    async () => fetchRealtimeJson(geo),
    async () => fetchDailyJson(geo),
    async () => {
      const xml = await fetchText(
        `https://trends.google.com/trending/rss?geo=${geo}`
      );
      return extractTitles(xml).map((keyword, idx) => ({
        keyword,
        score: 100 - idx,
      }));
    },
  ];

  let items = [];
  let lastErr = null;
  for (const getter of candidates) {
    try {
      const result = await getter();
      if (Array.isArray(result) && result.length) {
        items = result.slice(0, 20);
        if (items.length >= 20) break;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (!items.length) {
    throw lastErr || new Error('No titles parsed from Google Trends feeds');
  }

  return {
    capturedAt: nowIso(),
    geo,
    source: 'google',
    items,
  };
}

async function runCli() {
  const geo = process.argv[2];
  if (!geo) {
    console.error('Usage: node scripts/fetch_google.mjs <GEO>');
    process.exit(1);
  }
  try {
    const snapshot = await fetchGoogle(geo);
    console.log(JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
