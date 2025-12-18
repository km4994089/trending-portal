const geos = ['US', 'KR', 'JP'];
const sourceLabels = { google: 'Google', youtube: 'YouTube' };
const COUNTERPART = { google: 'youtube', youtube: 'google' };

let currentSource = 'google';
let renderToken = 0;

const elements = {
  sourceButtons: document.getElementById('sourceButtons'),
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
      map.set(item.keyword, { label: `▲${diff}`, direction: 'up' });
    } else if (diff < 0) {
      map.set(item.keyword, { label: `▼${Math.abs(diff)}`, direction: 'down' });
    } else {
      map.set(item.keyword, { label: '—', direction: 'same' });
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

function renderList(items, source, meta) {
  const limited = (items || []).slice(0, 20);
  if (!limited.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No data available yet.';
    return empty;
  }

  const maxScore = Math.max(...limited.map((i) => Number(i.score) || 0), 1);
  const list = document.createElement('ol');

  limited.forEach((item, index) => {
    const row = document.createElement('li');
    row.className = 'row';

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = index + 1;

    const keywordWrap = document.createElement('div');
    keywordWrap.className = 'keyword-wrap';

    const keywordBtn = document.createElement('button');
    keywordBtn.className = 'keyword-btn';
    keywordBtn.textContent = item.keyword;
    keywordBtn.addEventListener('click', () => openSearch(item.keyword, source));
    keywordWrap.appendChild(keywordBtn);

    const contextEntry = meta.contextMap.get(item.keyword);
    if (contextEntry && source === 'google' && contextEntry.articles?.length) {
      const article = contextEntry.articles[0];
      const link = document.createElement('a');
      link.className = 'context-link';
      link.href = article.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = article.title;
      keywordWrap.appendChild(link);
    }

    if (contextEntry && source === 'youtube') {
      const infoParts = [];
      if (contextEntry.channelTitle) infoParts.push(contextEntry.channelTitle);
      const dateLabel = formatPublishedAt(contextEntry.publishedAt);
      if (dateLabel) infoParts.push(dateLabel);
      if (infoParts.length) {
        const metaLine = document.createElement('span');
        metaLine.className = 'context-meta';
        metaLine.textContent = infoParts.join(' · ');
        keywordWrap.appendChild(metaLine);
      }
    }

    const badges = document.createElement('div');
    badges.className = 'badges';
    const changeInfo = meta.changeMap.get(item.keyword);
    if (changeInfo) {
      const badge = document.createElement('span');
      badge.className = `badge change ${changeInfo.direction || 'same'}`;
      badge.textContent = changeInfo.label;
      badges.appendChild(badge);
    }
    if (meta.crossSet.has(item.keyword)) {
      const both = document.createElement('span');
      both.className = 'badge both';
      both.textContent = 'Both';
      badges.appendChild(both);
    }

    const metricWrap = document.createElement('div');
    metricWrap.className = 'metric-wrap';
    const metric = document.createElement('span');
    metric.className = 'metric';
    metric.textContent = formatScore(source, item);

    const bar = document.createElement('span');
    bar.className = 'bar';
    const width = Math.max(6, Math.round(((Number(item.score) || 0) / maxScore) * 100));
    bar.style.width = `${width}%`;

    metricWrap.appendChild(metric);
    metricWrap.appendChild(bar);

    row.appendChild(rank);
    row.appendChild(keywordWrap);
    row.appendChild(badges);
    row.appendChild(metricWrap);
    list.appendChild(row);
  });

  return list;
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
  timestamp.textContent = `Updated: ${formatTimestamp(data.capturedAt)}`;

  head.appendChild(titleWrap);
  head.appendChild(timestamp);

  const card = document.createElement('div');
  card.className = 'card list';

  if (data.error) {
    const err = document.createElement('div');
    err.className = 'empty';
    err.textContent = 'Failed to load data. Retrying soon.';
    card.appendChild(err);
  } else {
    card.appendChild(
      renderList(data.items || [], data.source, {
        changeMap: data.changeMap || new Map(),
        crossSet: data.crossSet || new Set(),
        contextMap: data.contextMap || new Map(),
      })
    );
  }

  panel.appendChild(head);
  panel.appendChild(card);
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

function init() {
  createSourceButtons();
  renderPanels();
  startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);
