
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 설정
const BASE_URL = 'https://trending-portal.pages.dev'; // 사용자 도메인으로 변경 가능
const DATA_DIR = path.resolve(__dirname, '../app/data');
const KEYWORD_DIR = path.resolve(__dirname, '../app/keyword');
const APP_DIR = path.resolve(__dirname, '../app');

// 30일이 지난 파일 삭제 (밀리초 단위)
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanOldFiles() {
  if (!fs.existsSync(KEYWORD_DIR)) return;

  const files = fs.readdirSync(KEYWORD_DIR);
  const now = Date.now();
  let deletedCount = 0;

  files.forEach(file => {
    if (!file.endsWith('.html')) return;

    const filePath = path.join(KEYWORD_DIR, file);
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > MAX_AGE_MS) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    } catch (err) {
      console.error(`Failed to delete old file ${file}:`, err.message);
    }
  });

  if (deletedCount > 0) {
    console.log(`🧹 Cleaned up ${deletedCount} old keyword pages.`);
  }
}

function loadJson(filename) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Error loading ${filename}:`, err.message);
    return null;
  }
}

function slugify(text) {
  // 파일명으로 안전하게 변환 (한글 등 유지, 특수문자만 제거)
  return text
    .replace(/[\/\\\:\*\?\"\<\>\|]/g, '') // 윈도우 파일명 금지 문자 제거
    .replace(/\s+/g, '_')
    .trim();
}

// --- 1. Keyword Detail Page HTML Generator ---
function generateHtml(keyword, items, source, geo, context) {
  const safeKeyword = keyword.replace(/"/g, '&quot;');
  const displaySource = source === 'youtube' ? 'YouTube' : 'Google';

  // News/Video Links
  let relatedLinks = '';
  if (context && context.articles) {
    relatedLinks = context.articles.map(article => `
      <li class="item-row">
        <a href="${article.url}" target="_blank" class="keyword-btn" style="flex:1;">${article.title}</a>
        <span class="panel-meta">${article.source || displaySource}</span>
      </li>
    `).join('');
  }

  const description = `2025 Trend Analysis for '${safeKeyword}' in ${geo} (${displaySource}).`;

  // Uses Global CSS classes (.layout, .panel)
  return `<!DOCTYPE html>
<html lang="${geo === 'KR' ? 'ko' : geo === 'JP' ? 'ja' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeKeyword} - Trend Analysis | Trending Pulse</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${BASE_URL}/keyword/${slugify(keyword)}">
  <link rel="stylesheet" href="../styles.css">
</head>
<body>
  <div class="topbar">
    <div class="topbar-content">
      <div class="brand">
        <a href="../../" style="text-decoration:none; color:inherit;"><h1>Trending Pulse</h1></a>
      </div>
      <div class="controls">
        <a href="../../" class="report-link">← Dashboard</a>
      </div>
    </div>
  </div>

  <main class="layout" style="display:block; max-width:800px;"> <!-- Override grid -->
    
    <div class="panel" style="margin-bottom: 24px;">
      <div class="panel-header">
        <div class="panel-title" style="font-size:1.8rem;">${safeKeyword}</div>
        <span class="panel-meta">Trending in ${geo} · ${displaySource}</span>
      </div>
      <div style="padding: 24px;">
        <p style="font-size:1.1rem; line-height:1.6; color:var(--text); margin-bottom:16px;">
          This topic is currently trending on <strong>${displaySource}</strong> in <strong>${geo}</strong>.
          <br>
          <span style="color:var(--muted); font-size:0.95rem;">High search volume detected in the last 24 hours.</span>
        </p>
      </div>
    </div>

    ${relatedLinks ? `
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">Related News & Content</div>
      </div>
      <ul class="list-container">
        ${relatedLinks}
      </ul>
    </div>
    ` : ''}

  </main>
  
  <footer class="footer">
    <span>Trending Pulse © ${new Date().getFullYear()}</span>
  </footer>
</body>
</html>
  `;
}

function generateSitemap(filenames) {
  const urls = filenames.map(name => {
    // Report Page Special Case
    if (name.includes('report')) {
      return `
  <url>
    <loc>${BASE_URL}/report/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    }

    const slug = path.basename(name, '.html');
    // Cloudflare Pages 등 정적 호스팅에서는 .html 확장자를 생략한 URL을 선호함
    return `
  <url>
    <loc>${BASE_URL}/keyword/${slug}</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <changefreq>always</changefreq>
    <priority>1.0</priority>
  </url>${urls}
</urlset>`;

  fs.writeFileSync(path.join(APP_DIR, 'sitemap.xml'), xml);
  console.log(`🗺️ Generated sitemap.xml with ${filenames.length + 1} URLs`);
}

async function main() {
  console.log('🚀 Starting static page generation...');
  await ensureDir(KEYWORD_DIR);

  // 1. 오래된 파일 정리
  cleanOldFiles();

  const geos = ['KR', 'US', 'JP'];
  const sources = ['google', 'youtube'];
  const generatedFiles = new Set();

  for (const geo of geos) {
    for (const source of sources) {
      const filename = `latest_${source}_${geo}.json`;
      const data = loadJson(filename);
      if (!data) continue;

      const contextData = loadJson(`context_${source}_${geo}.json`);

      const contextMap = new Map();
      if (contextData && Array.isArray(contextData.items)) {
        contextData.items.forEach(item => contextMap.set(item.keyword, item));
      }

      if (!data || !Array.isArray(data.items)) continue;

      for (const item of data.items) {
        if (!item.keyword) continue;

        const slug = slugify(item.keyword);
        const fileName = `${slug}.html`;
        const filePath = path.join(KEYWORD_DIR, fileName);

        // 데이터가 이미 있거나, 새로 생성
        const context = contextMap.get(item.keyword) || {};
        const html = generateHtml(item.keyword, item, source, geo, context);

        fs.writeFileSync(filePath, html);
        generatedFiles.add(fileName);
      }
    }
  }

  console.log(`✨ Generated ${generatedFiles.size} keyword pages.`);

  // 2. 인사이트(분석) 페이지 생성
  await generateInsightPages(geos, sources);

  // 3. Sitemap 생성
  // Sitemap에 리포트 페이지도 추가
  const sitemapUrls = Array.from(generatedFiles);
  sitemapUrls.push('../report/index.html'); // 상대 경로 조정 필요하지만 sitemap 생성 함수에서 처리

  generateSitemap(Array.from(generatedFiles));
}

// --- Insight Generation Logic ---

async function generateInsightPages(geos, sources) {
  const reportDir = path.resolve(APP_DIR, 'report');
  await ensureDir(reportDir);

  const reportData = {};

  for (const geo of geos) {
    reportData[geo] = {};
    for (const source of sources) {
      const historyFilename = `history_${source}_${geo}.json`;
      const history = loadJson(historyFilename);

      if (!history || !history.snapshots) {
        reportData[geo][source] = null;
        continue;
      }

      // 24시간, 72시간 통계
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      const threeDays = 72 * 60 * 60 * 1000;

      const snapshots24h = history.snapshots.filter(s => (now - new Date(s.capturedAt).getTime()) < oneDay);
      const snapshots72h = history.snapshots.filter(s => (now - new Date(s.capturedAt).getTime()) < threeDays);

      reportData[geo][source] = {
        top1s: analyzeTopRankers(snapshots24h, 1), // 1위 횟수
        top3s: analyzeTopRankers(snapshots72h, 3), // Top 3 진입 횟수
        longRun: analyzeLongRun(snapshots72h)      // 롱런 키워드
      };
    }
  }

  const html = generateReportHtml(reportData);
  fs.writeFileSync(path.join(reportDir, 'index.html'), html);
  console.log('📊 Generated insights report.');
}

function analyzeTopRankers(snapshots, limitRank) {
  const counts = {};
  snapshots.forEach(s => {
    // items가 점수순 정렬되어 있다고 가정
    const topItems = s.items.slice(0, limitRank);
    topItems.forEach(item => {
      const k = item.keyword;
      counts[k] = (counts[k] || 0) + 1;
    });
  });

  // 많이 등장한 순으로 정렬
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5) // Top 5만 추출
    .map(([keyword, count]) => ({ keyword, count }));
}

function analyzeLongRun(snapshots) {
  const counts = {};
  snapshots.forEach(s => {
    s.items.forEach(item => {
      const k = item.keyword;
      counts[k] = (counts[k] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([keyword, count]) => ({ keyword, count }));
}

// --- 2. Insights Report HTML Generator ---
function generateReportHtml(data) {
  const dateStr = new Date().toLocaleDateString();

  let layoutContent = '';

  for (const geo of Object.keys(data)) {
    const geoData = data[geo];
    if (!geoData.google && !geoData.youtube) continue;

    layoutContent += `
      <div style="grid-column: 1 / -1; margin-top: 20px; margin-bottom: 10px;">
        <h2 style="font-size:1.5rem; font-weight:800; color:var(--text); padding-left: 4px;">🌏 ${geo} Insights</h2>
      </div>
    `;

    ['google', 'youtube'].forEach(source => {
      const metrics = geoData[source];
      if (!metrics) return;

      const sourceName = source === 'youtube' ? 'YouTube' : 'Google';

      layoutContent += `
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">${sourceName} Analysis</div>
          </div>
          
          <div style="padding:0;">
            <div style="padding: 16px 20px; background:#f9fafb; border-bottom:1px solid var(--border); font-weight:600; font-size:0.9rem; color:var(--muted); display:flex; gap:8px; align-items:center;">
              <span>🏆</span> Most #1 (Last 24h)
            </div>
            <ul class="list-container">
              ${metrics.top1s.map((m, i) => `
                <li class="item-row">
                  <span class="rank" style="font-size:1rem;">${i + 1}</span>
                  <button onclick="openModal('${m.keyword.replace(/'/g, "\\'")}', '${m.count}', 'Most #1 (24h)', '${sourceName}')" class="keyword-btn" style="text-align:left; cursor:pointer;">${m.keyword}</button>
                  <span class="panel-meta" style="white-space:nowrap; margin-top:0;">${m.count} times</span>
                </li>
              `).join('') || '<li class="item-row" style="color:var(--muted); justify-content:center;">No data</li>'}
            </ul>

            <div style="padding: 16px 20px; background:#f9fafb; border-bottom:1px solid var(--border); border-top:1px solid var(--border); font-weight:600; font-size:0.9rem; color:var(--muted); display:flex; gap:8px; align-items:center;">
              <span>🔥</span> Longest Trending (Last 72h)
            </div>
            <ul class="list-container">
               ${metrics.longRun.map((m, i) => `
                <li class="item-row">
                  <span class="rank" style="font-size:1rem;">${i + 1}</span>
                  <button onclick="openModal('${m.keyword.replace(/'/g, "\\'")}', '${m.count}', 'Longest Trending (72h)', '${sourceName}')" class="keyword-btn" style="text-align:left; cursor:pointer;">${m.keyword}</button>
                  <span class="panel-meta" style="white-space:nowrap; margin-top:0;">${m.count} snaps</span>
                </li>
              `).join('') || '<li class="item-row" style="color:var(--muted); justify-content:center;">No data</li>'}
            </ul>
          </div>
        </div>
      `;
    });
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trend Insights - Trending Pulse</title>
  <link rel="stylesheet" href="../styles.css">
  <style>
    /* Modal Styles */
    dialog {
      border: none;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      padding: 0;
      max-width: 400px;
      width: 90%;
      background: white;
    }
    dialog::backdrop {
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(2px);
    }
    .modal-content {
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .modal-title {
      font-size: 1.25rem;
      font-weight: 800;
      margin-bottom: 8px;
      color: var(--text);
    }
    .modal-desc {
      color: var(--muted);
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .modal-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
    }
    .btn-search {
      background: var(--accent);
      color: white;
      padding: 12px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      transition: background 0.2s;
    }
    .btn-search:hover {
      background: var(--accent-hover);
    }
    .btn-close {
      background: white;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 12px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-close:hover {
      background: #f9fafb;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-content">
      <div class="brand">
        <a href="../" style="text-decoration:none; color:inherit;"><h1>Trending Pulse</h1></a>
      </div>
      <div class="controls">
        <span class="subtitle">Data Analysis Report</span>
      </div>
    </div>
  </div>

  <main class="layout">
    ${layoutContent}
  </main>
  
  <footer class="footer">
    <a href="../" class="report-link">← Back to Dashboard</a>
  </footer>

  <dialog id="infoModal">
    <div class="modal-content">
      <div class="modal-title" id="mKey"></div>
      <div class="modal-desc" id="mDesc"></div>
      <div class="modal-actions">
        <a href="#" id="mSearch" target="_blank" class="btn-search">Search Now</a>
        <button onclick="document.getElementById('infoModal').close()" class="btn-close">Close</button>
      </div>
    </div>
  </dialog>

  <script>
    function openModal(keyword, count, type, source) {
      document.getElementById('mKey').textContent = keyword;
      document.getElementById('mDesc').innerHTML = 
        type + '<br>Recorded <strong>' + count + '</strong> events';
      
      const searchUrl = source === 'YouTube' 
        ? 'https://www.youtube.com/results?search_query=' 
        : 'https://www.google.com/search?q=';
      
      const btn = document.getElementById('mSearch');
      btn.href = searchUrl + encodeURIComponent(keyword);
      btn.textContent = 'Search on ' + source;
      
      document.getElementById('infoModal').showModal();
    }

    // Close on backdrop click
    const dialog = document.getElementById('infoModal');
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  </script>
</body>
</html>`;
}

main().catch(console.error);
