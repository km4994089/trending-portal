const geos = ['US', 'KR', 'JP'];
const sourceLabels = { google: 'Google', youtube: 'YouTube' };

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

async function loadData(source, geo) {
  const url = `./data/latest_${source}_${geo}.json`;
  const fallback = { capturedAt: null, geo, source, items: [] };
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = await res.json();
    return { ...fallback, ...json, source, geo, error: false };
  } catch (err) {
    console.warn(`Failed to load ${url}: ${err.message}`);
    return { ...fallback, error: true };
  }
}

function renderList(items, source) {
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
    metric.textContent = formatScore(source, item);

    row.appendChild(rank);
    row.appendChild(keywordBtn);
    row.appendChild(metric);
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
    card.appendChild(renderList(data.items || [], data.source));
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

async function renderPanels() {
  const token = ++renderToken;
  elements.panels.innerHTML = '';

  const results = await Promise.all(geos.map((geo) => loadData(currentSource, geo)));
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
