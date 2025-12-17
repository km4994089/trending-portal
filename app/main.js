const geos = ['US', 'KR', 'JP'];
const sourceLabels = { google: 'Google', youtube: 'YouTube' };
const languages = [
  { key: 'original', label: 'Original', enabled: true },
  { key: 'en', label: 'English', enabled: false },
  { key: 'ko', label: 'Korean', enabled: false },
  { key: 'ja', label: 'Japanese', enabled: false },
  { key: 'zh-CN', label: 'Chinese (Simplified)', enabled: false },
  { key: 'es', label: 'Spanish', enabled: false },
];

const state = {
  source: 'google',
  language: 'original',
  search: '',
};

let renderToken = 0;

const elements = {
  sourceButtons: document.getElementById('sourceButtons'),
  languageButtons: document.getElementById('languageButtons'),
  searchInput: document.getElementById('searchInput'),
  panels: document.getElementById('panels'),
  lastUpdated: document.getElementById('lastUpdated'),
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

function openSearch(keyword, source) {
  const base =
    source === 'youtube'
      ? 'https://www.youtube.com/results?search_query='
      : 'https://www.google.com/search?q=';
  const url = base + encodeURIComponent(keyword);
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

function createLanguageButtons() {
  languages.forEach((lang) => {
    const btn = document.createElement('button');
    btn.textContent = lang.label;
    btn.dataset.lang = lang.key;
    btn.disabled = !lang.enabled;
    btn.addEventListener('click', () => {
      if (!lang.enabled) return;
      setLanguage(lang.key);
    });
    elements.languageButtons.appendChild(btn);
  });
  updateLanguageButtonState();
}

function setSource(source) {
  if (state.source === source) return;
  state.source = source;
  updateSourceButtonState();
  renderPanels();
}

function setLanguage(language) {
  if (state.language === language) return;
  state.language = language;
  updateLanguageButtonState();
}

function updateSourceButtonState() {
  document
    .querySelectorAll('#sourceButtons button')
    .forEach((btn) => btn.classList.toggle('active', btn.dataset.source === state.source));
}

function updateLanguageButtonState() {
  document
    .querySelectorAll('#languageButtons button')
    .forEach((btn) => btn.classList.toggle('active', btn.dataset.lang === state.language));
}

async function loadGeoData(source, geo) {
  const latestFallback = { capturedAt: null, geo, source, items: [] };
  const historyFallback = { geo, source, snapshots: [] };
  let latest = latestFallback;
  let history = historyFallback;
  let latestError = false;

  try {
    const res = await fetch(`./data/latest_${source}_${geo}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    latest = await res.json();
  } catch (err) {
    latestError = true;
    console.warn(`Failed to load latest_${source}_${geo}: ${err.message}`);
  }

  try {
    const res = await fetch(`./data/history_${source}_${geo}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    history = await res.json();
  } catch (err) {
    console.warn(`Failed to load history_${source}_${geo}: ${err.message}`);
  }

  const hasItems = Array.isArray(latest.items);
  return {
    latest: hasItems ? { ...latest, geo, source } : latestFallback,
    history: history || historyFallback,
    error: latestError || !hasItems,
  };
}

const bannedGoogleSingles = new Set(['다시보기', '보기', '영상', '공식', '홈페이지', '사이트']);
const bannedYoutubeSingles = new Set(['official', 'video', 'ep', 'mv', 'trailer', 'teaser', 'shorts']);
const englishStopwords = new Set(['the', 'of', 'to', 'with', 'in', 'on', 'for', 'and', 'or', 'a', 'an', 'vs', 'vs.']);

function shouldFilterKeyword(keyword, source) {
  if (!keyword) return true;
  const trimmed = String(keyword).trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  const isSingleWord = !lower.includes(' ');

  if (source === 'google') {
    if (bannedGoogleSingles.has(trimmed) || bannedGoogleSingles.has(lower)) return true;
    if (isSingleWord && trimmed.length <= 2) return true;
  }

  if (source === 'youtube') {
    if (isSingleWord && (bannedYoutubeSingles.has(lower) || englishStopwords.has(lower))) return true;
  }

  return false;
}

function cleanItems(items, source, limit = 20) {
  return (items || [])
    .filter((item) => !shouldFilterKeyword(item.keyword, source))
    .slice(0, limit);
}

function filterBySearch(items) {
  if (!state.search) return items;
  const q = state.search.toLowerCase();
  return items.filter((item) => item.keyword.toLowerCase().includes(q));
}

function findClosestSnapshot(snapshots, targetMs) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
  let closest = null;
  let minDiff = Infinity;
  snapshots.forEach((snap) => {
    const ts = Date.parse(snap.capturedAt);
    if (Number.isNaN(ts)) return;
    const diff = Math.abs(ts - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = snap;
    }
  });
  return closest;
}

function buildRankMap(items, source) {
  const map = new Map();
  cleanItems(items, source, Number.MAX_SAFE_INTEGER).forEach((item, idx) => {
    map.set(item.keyword, idx + 1);
  });
  return map;
}

function annotateChanges(latestItems, baseSnapshot, source) {
  const baseMap = buildRankMap(baseSnapshot?.items || [], source);
  return latestItems.map((item, idx) => {
    const currentRank = idx + 1;
    const prevRank = baseMap.get(item.keyword);
    if (prevRank === undefined) {
      return { ...item, changeLabel: 'NEW', direction: 'up', changeScore: 9999 };
    }
    const diff = prevRank - currentRank;
    if (diff > 0) {
      return { ...item, changeLabel: `▲${diff}`, direction: 'up', changeScore: diff };
    }
    if (diff < 0) {
      return { ...item, changeLabel: `▼${Math.abs(diff)}`, direction: 'down', changeScore: diff };
    }
    return { ...item, changeLabel: '—', direction: 'same', changeScore: 0 };
  });
}

function renderList(items, source, { showChange } = {}) {
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No data available yet.';
    return empty;
  }

  const list = document.createElement('ol');
  items.forEach((item, index) => {
    const row = document.createElement('li');
    row.className = 'row';

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = index + 1;

    const keywordBtn = document.createElement('button');
    keywordBtn.className = 'keyword-btn';
    keywordBtn.textContent = item.keyword;
    keywordBtn.addEventListener('click', () => openSearch(item.keyword, source));

    const metric = document.createElement('span');
    metric.className = 'metric';

    if (showChange) {
      metric.textContent = item.changeLabel;
      metric.classList.add('change');
      metric.dataset.direction = item.direction;
    } else {
      metric.textContent = formatScore(source, item);
    }

    row.appendChild(rank);
    row.appendChild(keywordBtn);
    row.appendChild(metric);
    list.appendChild(row);
  });

  return list;
}

function buildCard(title, contentEl) {
  const card = document.createElement('div');
  card.className = 'card list';

  const header = document.createElement('div');
  header.className = 'card-head';
  const titleEl = document.createElement('h3');
  titleEl.textContent = title;
  header.appendChild(titleEl);

  card.appendChild(header);
  card.appendChild(contentEl);
  return card;
}

function createPanel(data) {
  const panel = document.createElement('section');
  panel.className = 'panel';

  const head = document.createElement('div');
  head.className = 'section-head';

  const titleWrap = document.createElement('div');
  const heading = document.createElement('h2');
  heading.textContent = `${data.geo} · ${sourceLabels[data.source] || data.source}`;
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = data.error ? 'Data load failed' : 'Live top keywords';
  titleWrap.appendChild(heading);
  titleWrap.appendChild(hint);

  const timestamp = document.createElement('span');
  timestamp.className = 'muted timestamp';
  timestamp.textContent = `Updated: ${formatTimestamp(data.latest.capturedAt)}`;

  head.appendChild(titleWrap);
  head.appendChild(timestamp);
  panel.appendChild(head);

  if (data.error) {
    const err = document.createElement('div');
    err.className = 'empty';
    err.textContent = 'Failed to load data. Retrying soon.';
    panel.appendChild(buildCard('Now', err));
    return panel;
  }

  const latestItems = filterBySearch(cleanItems(data.latest.items, data.latest.source));

  const cardNow = buildCard('Now', renderList(latestItems, data.latest.source));

  const snapshot24h = findClosestSnapshot(data.history.snapshots, Date.now() - 24 * 60 * 60 * 1000);
  const annotated24h = annotateChanges(latestItems, snapshot24h, data.latest.source)
    .sort((a, b) => b.changeScore - a.changeScore)
    .slice(0, 20);
  const cardRising = buildCard('Rising (24h)', renderList(annotated24h, data.latest.source, { showChange: true }));

  const snapshot72h = findClosestSnapshot(data.history.snapshots, Date.now() - 72 * 60 * 60 * 1000);
  const annotated72h = annotateChanges(latestItems, snapshot72h, data.latest.source)
    .sort((a, b) => b.changeScore - a.changeScore)
    .slice(0, 20);
  const cardTrending = buildCard('Trending (3 days)', renderList(annotated72h, data.latest.source, { showChange: true }));

  panel.appendChild(cardNow);
  panel.appendChild(cardRising);
  panel.appendChild(cardTrending);

  return panel;
}

function updateLastUpdated(panelsData) {
  const timestamps = panelsData
    .map((data) => Date.parse(data.latest?.capturedAt))
    .filter((ts) => !Number.isNaN(ts));
  if (!timestamps.length) {
    elements.lastUpdated.textContent = '--';
    return;
  }
  const latest = new Date(Math.max(...timestamps));
  elements.lastUpdated.textContent = latest.toLocaleString();
}

async function renderPanels() {
  const token = ++renderToken;
  elements.panels.innerHTML = '';

  const results = await Promise.all(geos.map((geo) => loadGeoData(state.source, geo)));
  if (token !== renderToken) return;

  results.forEach((data) => elements.panels.appendChild(createPanel(data)));
  updateLastUpdated(results);
}

function startAutoRefresh() {
  setInterval(renderPanels, 180000);
}

function setupSearch() {
  elements.searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderPanels();
  });
}

function init() {
  createSourceButtons();
  createLanguageButtons();
  setupSearch();
  renderPanels();
  startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);
