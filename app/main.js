const geos = ['US', 'KR', 'JP'];
const sourceLabels = { google: 'Google', youtube: 'YouTube' };
const COUNTERPART = { google: 'youtube', youtube: 'google' };
const KEYWORD_CATEGORIES = [
  {
    category: 'politics',
    match: ['election', 'assembly', 'president', 'party', 'candidate', 'vote'],
    description: 'Political topic interest spike',
  },
  {
    category: 'business',
    match: ['stock', 'market', 'company', 'earnings', 'invest'],
    description: 'Business topic spike',
  },
  {
    category: 'incident',
    match: ['accident', 'incident', 'police', 'fire', 'disaster'],
    description: 'Incident-related coverage',
  },
  {
    category: 'entertainment',
    match: ['actor', 'drama', 'movie', 'concert', 'music'],
    description: 'Entertainment interest spike',
  },
];



let currentSource = 'google';
let renderToken = 0;
let newsMode = false;

const elements = {
  sourceButtons: document.getElementById('sourceButtons'),
  panels: document.getElementById('panels'),
  lastUpdated: document.getElementById('lastUpdated'),
  newsModeToggle: document.getElementById('newsModeToggle'),
};

function formatTimestamp(capturedAt) {
  const ts = Date.parse(capturedAt);
  if (Number.isNaN(ts)) return '--';
  return new Date(ts).toLocaleString();
}

function formatScore(source, item) {
  const value = Number(item.score);
  if (Number.isNaN(value)) return '--';
  return source === 'youtube' ? value.toFixed(2) : Math.round(value);
}

function getSearchBase(source) {
  if (source === 'youtube') {
    return 'https://www.youtube.com/results?search_query=';
  }
  if (newsMode) {
    return 'https://www.google.com/search?tbm=nws&q=';
  }
  return 'https://www.google.com/search?q=';
}

function openSearch(keyword, source) {
  const url = getSearchBase(source) + encodeURIComponent(keyword);
  window.open(url, '_blank', 'noopener,noreferrer');
}

function createSourceButtons() {
  ['google', 'youtube'].forEach((source) => {
    const btn = document.createElement('button');
    btn.textContent = sourceLabels[source];
    btn.dataset.source = source;
    btn.addEventListener('click', () => setSource(source));
    elements.sourceButtons.appendChild(btn);
  });
  updateSourceButtonState();
}

function setSource(source) {
  if (currentSource === source) return;
  currentSource = source;
  updateSourceButtonState();
  renderPanels();
}

function updateSourceButtonState() {
  document
    .querySelectorAll('#sourceButtons button')
    .forEach((btn) => btn.classList.toggle('active', btn.dataset.source === currentSource));
}

async function fetchJsonSafe(url, fallback) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn(`Failed to load ${url}: ${err.message}`);
    return fallback;
  }
}

async function loadContext(source, geo) {
  const fallback = { geo, source, items: [] };
  const data = await fetchJsonSafe(`./data/context_${source}_${geo}.json`, fallback);
  return { ...fallback, ...data, items: Array.isArray(data?.items) ? data.items : [] };
}

async function loadLatest(source, geo) {
  const fallback = { capturedAt: null, geo, source, items: [], error: true };
  const data = await fetchJsonSafe(`./data/latest_${source}_${geo}.json`, fallback);
  return { ...fallback, ...data, geo, source, error: !Array.isArray(data?.items) };
}

async function loadHistory(source, geo) {
  const fallback = { geo, source, snapshots: [] };
  const history = await fetchJsonSafe(`./data/history_${source}_${geo}.json`, fallback);
  return { ...fallback, ...history, snapshots: Array.isArray(history?.snapshots) ? history.snapshots : [] };
}

function findClosestSnapshot(snapshots, hoursAgo) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
  const target = Date.now() - hoursAgo * 60 * 60 * 1000;
  let best = null;
  let minDiff = Infinity;
  snapshots.forEach((snap) => {
    const ts = Date.parse(snap.capturedAt);
    if (Number.isNaN(ts)) return;
    const diff = Math.abs(ts - target);
    if (diff < minDiff) {
      minDiff = diff;
      best = snap;
    }
  });
  return best;
}

function buildRankMap(items) {
  const map = new Map();
  (items || []).forEach((item, idx) => map.set(item.keyword, idx + 1));
  return map;
}

function annotateChanges(items, history, hoursAgo) {
  const snap = findClosestSnapshot(history?.snapshots, hoursAgo);
  const rankMap = buildRankMap(snap?.items || []);
  const map = new Map();
  (items || []).forEach((item, idx) => {
    const prevRank = rankMap.get(item.keyword);
    if (prevRank === undefined) {
      map.set(item.keyword, { label: 'NEW', direction: 'up' });
      return;
    }
    const currentRank = idx + 1;
    const diff = prevRank - currentRank;
    if (diff > 0) {
      map.set(item.keyword, { label: '+' + diff, direction: 'up' });
    } else if (diff < 0) {
      map.set(item.keyword, { label: '-' + Math.abs(diff), direction: 'down' });
    } else {
      map.set(item.keyword, { label: '0', direction: 'same' });
    }
  });
  return map;
}


function buildCrossSet(latestCounterpart) {
  const set = new Set();
  (latestCounterpart?.items || []).slice(0, 20).forEach((item) => set.add(item.keyword));
  return set;
}

function formatPublishedAt(value) {
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return '';
  return new Date(ts).toLocaleDateString();
}

function slugify(text) {
  return text
    .replace(/[\/\\\:\*\?\"\<\>\|]/g, '')
    .replace(/\s+/g, '_')
    .trim();
}

function getKeywordReason(keyword) {
  for (const rule of KEYWORD_CATEGORIES) {
    if (rule.match.some((word) => keyword.includes(word))) {
      return rule.description;
    }
  }
  return null;
}

function renderList(items, source, meta) {
  const limited = (items || []).slice(0, 20);
  if (!limited.length) {
    const empty = document.createElement('div');
    empty.style.padding = '20px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--muted)';
    empty.textContent = 'No data available yet.';
    return empty;
  }

  const maxScore = Math.max(...limited.map((i) => Number(i.score) || 0), 1);

  const list = document.createElement('ul');
  list.className = 'list-container';

  limited.forEach((item, index) => {
    const row = document.createElement('li');
    row.className = 'item-row';

    // 1. Rank
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = index + 1;

    // 2. Keyword Link (Direct External Search) + optional reason
    const textWrap = document.createElement('div');
    textWrap.className = 'keyword-text';

    const link = document.createElement('a');
    link.className = 'keyword-btn';
    link.textContent = item.keyword;

    // Construct Search URL
    link.href = getSearchBase(source) + encodeURIComponent(item.keyword);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    textWrap.appendChild(link);

    const reason = getKeywordReason(item.keyword);
    if (reason) {
      const reasonEl = document.createElement('div');
      reasonEl.className = 'keyword-reason';
      reasonEl.textContent = `??${reason}`;
      textWrap.appendChild(reasonEl);
    }

    // 3. Visual Score Bar
    const scoreVal = Number(item.score) || 0;
    const barWrap = document.createElement('div');
    barWrap.className = 'score-bar-bg';
    barWrap.style.width = '60px';

    const widthPct = Math.max(10, Math.round((scoreVal / maxScore) * 100));
    const fill = document.createElement('div');
    fill.className = 'score-bar-fill';
    fill.style.width = widthPct + '%';
    barWrap.appendChild(fill);

    row.appendChild(rank);
    row.appendChild(textWrap);
    row.appendChild(barWrap);
    list.appendChild(row);
  });

  return list;
}

function createPanel(data) {
  const panel = document.createElement('div');
  panel.className = 'panel';

  // Header
  const head = document.createElement('div');
  head.className = 'panel-header';

  const title = document.createElement('div');
  title.className = 'panel-title';

  // ÃªÂµ?Â¸Â° ?ÂÃ¬ÂÂ´Ã¬Â½?Ã«Â§Â¤Ã­ÂÂ
  const flags = { KR: '?ÂÂ°?ÂÂ·', US: '?ÂÂº?ÂÂ¸', JP: '?ÂÂ¯?ÂÂµ' };
  const flagSources = {
    KR: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f1f0-1f1f7.svg',
    US: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f1fa-1f1f8.svg',
    JP: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f1ef-1f1f5.svg',
  };
  const flag = flags[data.geo] || '';
  const flagUrl = flagSources[data.geo];
  const flagHtml = flagUrl
    ? `<img class="flag-icon" src="${flagUrl}" alt="${data.geo} flag" loading="lazy" />`
    : `<span class="flag-badge">${flag}</span>`;
  title.innerHTML = `${flagHtml}<span>${data.geo}</span>`;

  const meta = document.createElement('span');
  meta.className = 'panel-meta';
  meta.textContent = `Updated: ${formatTimestamp(data.capturedAt)}`;

  head.appendChild(title);
  head.appendChild(meta);
  panel.appendChild(head);

  // Body
  if (data.error) {
    const err = document.createElement('div');
    err.style.padding = '20px';
    err.style.color = 'red';
    err.textContent = 'Failed to load data.';
    panel.appendChild(err);
  } else {
    panel.appendChild(
      renderList(data.items || [], data.source, {
        changeMap: data.changeMap || new Map(),
        crossSet: data.crossSet || new Set(),
        contextMap: data.contextMap || new Map(),
      })
    );
  }

  return panel;
}

function updateLastUpdated(panelsData) {
  const timestamps = panelsData
    .map((data) => Date.parse(data.capturedAt))
    .filter((ts) => !Number.isNaN(ts));
  if (!timestamps.length) {
    elements.lastUpdated.textContent = '--';
    return;
  }
  const latest = new Date(Math.max(...timestamps));
  elements.lastUpdated.textContent = latest.toLocaleString();
}

async function loadPanelData(source, geo) {
  const [latest, history, counterpart] = await Promise.all([
    loadLatest(source, geo),
    loadHistory(source, geo),
    loadLatest(COUNTERPART[source], geo),
  ]);
  const context = await loadContext(source, geo);
  const contextMap = new Map(
    (context.items || []).map((entry) => [entry.keyword, entry])
  );

  const changeMap = annotateChanges(latest.items, history, 24);
  const crossSet = buildCrossSet(counterpart);

  return { ...latest, changeMap, crossSet, contextMap };
}

async function renderPanels() {
  const token = ++renderToken;
  elements.panels.innerHTML = '';

  const results = await Promise.all(geos.map((geo) => loadPanelData(currentSource, geo)));
  if (token !== renderToken) return;

  results.forEach((data) => elements.panels.appendChild(createPanel(data)));
  updateLastUpdated(results);
}

function startAutoRefresh() {
  setInterval(renderPanels, 180000);
}

function initNewsMode() {
  if (!elements.newsModeToggle) return;
  try {
    const stored = localStorage.getItem('newsMode');
    if (stored !== null) {
      newsMode = stored === 'true';
    }
  } catch (err) {
    newsMode = false;
  }
  elements.newsModeToggle.checked = newsMode;
  elements.newsModeToggle.addEventListener('change', (event) => {
    newsMode = event.target.checked;
    try {
      localStorage.setItem('newsMode', String(newsMode));
    } catch (err) {
      // Ignore storage failures (private mode, etc.).
    }
    renderPanels();
  });
}

function init() {
  createSourceButtons();
  initNewsMode();
  renderPanels();
  startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);







