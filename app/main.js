const geos = ['US', 'KR', 'JP'];
const sources = ['google', 'youtube', 'overlap'];

const state = {
  geo: 'US',
  source: 'google',
  search: '',
  selectedKeyword: null,
  data: {
    google: {},
    youtube: {},
  },
};

const elements = {
  geoButtons: document.getElementById('geoButtons'),
  sourceButtons: document.getElementById('sourceButtons'),
  searchInput: document.getElementById('searchInput'),
  nowList: document.getElementById('nowList'),
  risingList: document.getElementById('risingList'),
  selectedKeyword: document.getElementById('selectedKeyword'),
  lastUpdated: document.getElementById('lastUpdated'),
  detailMessage: document.getElementById('detailMessage'),
  chart: document.getElementById('trendChart'),
};

let loadVersion = 0;

function createButtons() {
  geos.forEach((geo) => {
    const btn = document.createElement('button');
    btn.textContent = geo;
    btn.dataset.geo = geo;
    btn.addEventListener('click', () => setGeo(geo));
    elements.geoButtons.appendChild(btn);
  });

  const labelMap = {
    google: 'Google',
    youtube: 'YouTube',
    overlap: 'Overlap',
  };

  sources.forEach((source) => {
    const btn = document.createElement('button');
    btn.textContent = labelMap[source];
    btn.dataset.source = source;
    btn.addEventListener('click', () => setSource(source));
    elements.sourceButtons.appendChild(btn);
  });
}

function setGeo(geo) {
  if (state.geo === geo) return;
  state.geo = geo;
  state.selectedKeyword = null;
  refresh();
}

function setSource(source) {
  if (state.source === source) return;
  state.source = source;
  state.selectedKeyword = null;
  refresh();
}

function updateButtonStates() {
  document
    .querySelectorAll('#geoButtons button')
    .forEach((btn) => btn.classList.toggle('active', btn.dataset.geo === state.geo));
  document
    .querySelectorAll('#sourceButtons button')
    .forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.source === state.source)
    );
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

async function loadSourceData(source, geo) {
  const fallbackLatest = { capturedAt: null, geo, source, items: [] };
  const fallbackHistory = { geo, source, snapshots: [] };
  const [latest, history] = await Promise.all([
    fetchJsonSafe(`/data/latest_${source}_${geo}.json`, fallbackLatest),
    fetchJsonSafe(`/data/history_${source}_${geo}.json`, fallbackHistory),
  ]);
  state.data[source][geo] = { latest, history };
  return state.data[source][geo];
}

async function refresh() {
  loadVersion += 1;
  const token = loadVersion;
  updateButtonStates();

  if (state.source === 'overlap') {
    await Promise.all([loadSourceData('google', state.geo), loadSourceData('youtube', state.geo)]);
  } else {
    await loadSourceData(state.source, state.geo);
  }

  if (token === loadVersion) {
    render();
  }
}

function getLatest(source, geo) {
  return state.data[source]?.[geo]?.latest;
}

function getHistory(source, geo) {
  return state.data[source]?.[geo]?.history;
}

function filterItemsBySearch(items) {
  if (!state.search) return items;
  const q = state.search.toLowerCase();
  return items.filter((item) => item.keyword.toLowerCase().includes(q));
}

function computeOverlapLatest(geo) {
  const googleLatest = getLatest('google', geo);
  const youtubeLatest = getLatest('youtube', geo);
  if (!googleLatest || !youtubeLatest) return [];

  const gMap = new Map(
    (googleLatest.items || []).map((item) => [item.keyword, Number(item.score) || 0])
  );

  const combined = [];
  (youtubeLatest.items || []).forEach((item) => {
    if (gMap.has(item.keyword)) {
      const score = (Number(item.score) || 0) + gMap.get(item.keyword);
      combined.push({
        keyword: item.keyword,
        score: Math.round(score * 1000) / 1000,
      });
    }
  });

  return combined.sort((a, b) => b.score - a.score).slice(0, 20);
}

function buildDeltaFromMaps(nowMap, baseMap) {
  const deltas = [];
  for (const [keyword, nowScore] of nowMap.entries()) {
    if (nowScore < 5) continue;
    const delta = nowScore - (baseMap.get(keyword) || 0);
    deltas.push({
      keyword,
      delta: Math.round(delta * 1000) / 1000,
      score: Math.round(nowScore * 1000) / 1000,
    });
  }
  return deltas.sort((a, b) => b.delta - a.delta).slice(0, 20);
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

function computeRisingForSource(source, geo) {
  const latest = getLatest(source, geo);
  const history = getHistory(source, geo);
  if (!latest || !history) return [];

  const nowMap = new Map(
    (latest.items || []).map((item) => [item.keyword, Number(item.score) || 0])
  );

  const targetMs = Date.now() - 72 * 60 * 60 * 1000;
  const baseSnap = findClosestSnapshot(history.snapshots, targetMs);
  const baseMap = new Map(
    (baseSnap?.items || []).map((item) => [item.keyword, Number(item.score) || 0])
  );

  return buildDeltaFromMaps(nowMap, baseMap);
}

function buildCombinedScoreMap(parts) {
  const map = new Map();
  parts.forEach((snap) => {
    if (!snap || !snap.items) return;
    snap.items.forEach((item) => {
      const score = Number(item.score) || 0;
      if (!item.keyword) return;
      map.set(item.keyword, (map.get(item.keyword) || 0) + score);
    });
  });
  return map;
}

function computeOverlapRising(geo) {
  const latestMap = buildCombinedScoreMap([
    getLatest('google', geo),
    getLatest('youtube', geo),
  ]);
  if (latestMap.size === 0) return [];

  const targetMs = Date.now() - 72 * 60 * 60 * 1000;
  const baseSnapG = findClosestSnapshot(getHistory('google', geo)?.snapshots, targetMs);
  const baseSnapY = findClosestSnapshot(getHistory('youtube', geo)?.snapshots, targetMs);
  const baseMap = buildCombinedScoreMap([baseSnapG, baseSnapY]);

  return buildDeltaFromMaps(latestMap, baseMap);
}

function getNowItems() {
  if (state.source === 'overlap') {
    return filterItemsBySearch(computeOverlapLatest(state.geo));
  }
  const latest = getLatest(state.source, state.geo);
  if (!latest) return [];
  return filterItemsBySearch(latest.items || []);
}

function getRisingItems() {
  if (state.source === 'overlap') {
    return filterItemsBySearch(computeOverlapRising(state.geo));
  }
  return filterItemsBySearch(computeRisingForSource(state.source, state.geo));
}

function renderList(container, items, metricKey) {
  container.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No data available yet.';
    container.appendChild(empty);
    return;
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
    keywordBtn.addEventListener('click', () => {
      state.selectedKeyword = item.keyword;
      renderChart();
    });

    const metric = document.createElement('span');
    metric.className = 'metric';
    const value = item[metricKey];
    metric.textContent = metricKey === 'delta' ? `${value}` : value;

    row.appendChild(rank);
    row.appendChild(keywordBtn);
    row.appendChild(metric);
    list.appendChild(row);
  });

  container.appendChild(list);
}

function renderLists() {
  const nowItems = getNowItems();
  const risingItems = getRisingItems();

  renderList(elements.nowList, nowItems, 'score');
  renderList(elements.risingList, risingItems, 'delta');

  if (!state.selectedKeyword && nowItems.length) {
    state.selectedKeyword = nowItems[0].keyword;
  }
}

function getScoreFromItems(items, keyword) {
  if (!items) return 0;
  const entry = items.find((item) => item.keyword === keyword);
  return entry ? Number(entry.score) || 0 : 0;
}

function buildSeries(keyword) {
  if (!keyword) return [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  if (state.source === 'overlap') {
    const points = new Map();
    const mergeHistory = (history) => {
      if (!history || !history.snapshots) return;
      history.snapshots.forEach((snap) => {
        const ts = Date.parse(snap.capturedAt);
        if (Number.isNaN(ts) || ts < cutoff) return;
        const score = getScoreFromItems(snap.items, keyword);
        points.set(ts, (points.get(ts) || 0) + score);
      });
    };

    mergeHistory(getHistory('google', state.geo));
    mergeHistory(getHistory('youtube', state.geo));

    return Array.from(points.entries())
      .map(([ts, score]) => ({ time: new Date(ts).toISOString(), score }))
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  }

  const history = getHistory(state.source, state.geo);
  if (!history || !history.snapshots) return [];

  return history.snapshots
    .filter((snap) => Date.parse(snap.capturedAt) >= cutoff)
    .map((snap) => ({
      time: snap.capturedAt,
      score: getScoreFromItems(snap.items, keyword),
    }))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

function drawChart(series) {
  const canvas = elements.chart;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  if (!series.length) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillText('No data in the past 24h.', 16, 28);
    return;
  }

  const times = series.map((p) => Date.parse(p.time));
  const scores = series.map((p) => p.score);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const maxScore = Math.max(...scores, 1);

  const padX = 30;
  const padY = 20;
  const w = canvas.clientWidth - padX * 2;
  const h = canvas.clientHeight - padY * 2;

  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, canvas.clientHeight - padY);
  ctx.lineTo(padX + w, canvas.clientHeight - padY);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;

  series.forEach((point, idx) => {
    const t = Date.parse(point.time);
    const x =
      padX +
      w *
        (maxTime === minTime ? 0.5 : (t - minTime) / Math.max(1, maxTime - minTime));
    const y =
      canvas.clientHeight -
      padY -
      h * (maxScore === 0 ? 0 : point.score / maxScore);

    if (idx === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = '#2563eb';
  series.forEach((point) => {
    const t = Date.parse(point.time);
    const x =
      padX +
      w *
        (maxTime === minTime ? 0.5 : (t - minTime) / Math.max(1, maxTime - minTime));
    const y =
      canvas.clientHeight -
      padY -
      h * (maxScore === 0 ? 0 : point.score / maxScore);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderChart() {
  elements.selectedKeyword.textContent = state.selectedKeyword || '--';
  const series = buildSeries(state.selectedKeyword);
  drawChart(series);
  elements.detailMessage.textContent = series.length
    ? ''
    : 'Waiting for enough snapshots to draw the past 24h.';
}

function updateLastUpdated() {
  if (state.source === 'overlap') {
    const stamps = [];
    const g = getLatest('google', state.geo);
    const y = getLatest('youtube', state.geo);
    if (g?.capturedAt) stamps.push(g.capturedAt);
    if (y?.capturedAt) stamps.push(y.capturedAt);
    elements.lastUpdated.textContent = stamps.length
      ? new Date(stamps.sort().slice(-1)[0]).toLocaleString()
      : '--';
    return;
  }

  const latest = getLatest(state.source, state.geo);
  elements.lastUpdated.textContent = latest?.capturedAt
    ? new Date(latest.capturedAt).toLocaleString()
    : '--';
}

function render() {
  renderLists();
  renderChart();
  updateLastUpdated();
}

function setupSearch() {
  elements.searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    render();
  });
}

function startAutoRefresh() {
  setInterval(() => {
    refresh();
  }, 180000);
}

function init() {
  createButtons();
  setupSearch();
  refresh();
  startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);

