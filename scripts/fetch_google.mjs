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

function getLocale(geo) {
  if (geo === 'KR') return 'ko-KR';
  if (geo === 'JP') return 'ja-JP';
  return 'en-US';
}

function buildHeaders(geo) {
  const locale = getLocale(geo);
  return {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept-language': `${locale},en;q=0.7`,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  };
}

function extractArticles(entry) {
  const articles = Array.isArray(entry?.articles) ? entry.articles : [];
  return articles
    .map((article) => ({
      title: article?.title || '',
      url: article?.url || '',
      source: article?.source || '',
    }))
    .filter((article) => article.title && article.url)
    .slice(0, 2);
}

async function fetchDailyJson(geo) {
  const url = `https://trends.google.com/trends/api/dailytrends?hl=${getLocale(
    geo
  )}&geo=${geo}&ns=15`;
  const text = await fetchText(url, buildHeaders(geo));
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
    return { keyword, score, articles: extractArticles(entry) };
  });
}

async function fetchRealtimeJson(geo) {
  const url = `https://trends.google.com/trends/api/realtimetrends?hl=${getLocale(
    geo
  )}&tz=0&cat=all&fi=0&fs=0&geo=${geo}&ri=300&rs=20&sort=0`;
  const text = await fetchText(url, buildHeaders(geo));
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
    return { keyword, score, articles: extractArticles(entry) };
  });
}

function mergeUnique(items, incoming, contextMap) {
  const seen = new Set(items.map((item) => item.keyword));
  incoming.forEach((item) => {
    if (item.keyword && !seen.has(item.keyword)) {
      items.push({ keyword: item.keyword, score: item.score });
      seen.add(item.keyword);
      if (contextMap && item.articles?.length) {
        contextMap.set(item.keyword, item.articles);
      }
    }
  });
  return items;
}

export async function fetchGoogleBundle(geo) {
  if (!geo) {
    throw new Error('geo is required');
  }
  const errors = [];
  const contextMap = new Map();
  let items = [];

  try {
    const realtime = await fetchRealtimeJson(geo);
    if (realtime.length) {
      items = mergeUnique(items, realtime, contextMap);
    }
  } catch (err) {
    errors.push(err);
  }

  if (items.length < 20) {
    try {
      const daily = await fetchDailyJson(geo);
      if (daily.length) {
        items = mergeUnique(items, daily, contextMap);
      }
    } catch (err) {
      errors.push(err);
    }
  }

  if (items.length < 20) {
    try {
      const xml = await fetchText(
        `https://trends.google.com/trending/rss?geo=${geo}`,
        buildHeaders(geo)
      );
      const rssItems = extractTitles(xml).map((keyword, idx) => ({
        keyword,
        score: 100 - idx,
      }));
      if (rssItems.length) {
        items = mergeUnique(items, rssItems, contextMap);
      }
    } catch (err) {
      errors.push(err);
    }
  }

  if (!items.length) {
    throw errors[errors.length - 1] || new Error('No titles parsed from Google Trends feeds');
  }

  const snapshot = {
    capturedAt: nowIso(),
    geo,
    source: 'google',
    items: items.slice(0, 20),
  };

  const context = {
    capturedAt: snapshot.capturedAt,
    geo,
    source: 'google',
    items: snapshot.items.map((item) => ({
      keyword: item.keyword,
      articles: contextMap.get(item.keyword) || [],
    })),
  };

  return { snapshot, context };
}

export async function fetchGoogle(geo) {
  const bundle = await fetchGoogleBundle(geo);
  return bundle.snapshot;
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
