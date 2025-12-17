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

export async function fetchGoogle(geo) {
  if (!geo) {
    throw new Error('geo is required');
  }
  const candidates = [
    `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}&hl=en-US`,
    `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`,
    `https://trends.google.com/trending/rss?geo=${geo}`,
  ];

  let titles = [];
  let lastErr = null;
  for (const url of candidates) {
    try {
      const xml = await fetchText(url);
      titles = extractTitles(xml).slice(0, 20);
      if (titles.length) {
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (!titles.length) {
    throw lastErr || new Error('No titles parsed from Google Trends RSS');
  }

  const items = titles.map((keyword, idx) => ({
    keyword,
    score: 100 - idx,
  }));

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
