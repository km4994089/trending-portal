
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

function generateHtml(keyword, items, source, geo, context) {
  const safeKeyword = keyword.replace(/"/g, '&quot;');
  const displaySource = source === 'youtube' ? 'YouTube' : 'Google';

  // 관련 뉴스/영상 링크 생성
  let relatedLinks = '';
  if (context && context.articles) {
    relatedLinks = context.articles.map(article => `
      <a href="${article.url}" target="_blank" class="related-link">
        <span class="link-title">${article.title}</span>
        <span class="link-source">${article.source || displaySource}</span>
      </a>
    `).join('');
  }

  // YouTube 영상 정보 (썸네일 등)가 있다면 추가 가능 (현재 데이터 구조에 따라 조정)

  const description = `2025년 12월 기준 ${geo} ${displaySource}에서 급상승 중인 키워드 '${safeKeyword}'에 대한 트렌드 분석과 관련 정보를 확인하세요.`;

  return `<!DOCTYPE html>
<html lang="${geo === 'KR' ? 'ko' : geo === 'JP' ? 'ja' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeKeyword} - ${displaySource} Trend (${geo}) | Trending Pulse</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${BASE_URL}/keyword/${slugify(keyword)}">
  <link rel="stylesheet" href="../../styles.css">
  <style>
    .k-layout { max-width: 800px; margin: 40px auto; padding: 0 20px; }
    .k-header { text-align: center; margin-bottom: 40px; }
    .k-title { font-size: 2.5rem; margin-bottom: 10px; color: #1a1a1a; }
    .k-meta { color: #666; font-size: 0.9rem; }
    .k-card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #eee; margin-bottom: 24px; }
    .k-label { font-size: 0.8rem; font-weight: bold; color: #2563eb; text-transform: uppercase; margin-bottom: 8px; display: block; }
    .k-desc { font-size: 1.1rem; line-height: 1.6; color: #333; }
    .related-link { display: block; padding: 12px; border: 1px solid #eee; border-radius: 8px; text-decoration: none; color: inherit; margin-bottom: 8px; transition: all 0.2s; }
    .related-link:hover { border-color: #2563eb; background: #f8fafc; }
    .link-title { display: block; font-weight: 600; margin-bottom: 4px; }
    .link-source { font-size: 0.8rem; color: #666; }
    .back-link { display: inline-block; margin-top: 20px; color: #666; text-decoration: none; }
    .back-link:hover { color: #2563eb; }
  </style>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": "${safeKeyword} - Trending in ${geo}",
    "datePublished": "${new Date().toISOString()}",
    "dateModified": "${new Date().toISOString()}",
    "description": "${description}",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": "${BASE_URL}/keyword/${slugify(keyword)}"
    }
  }
  </script>
</head>
<body>
  <div class="k-layout">
    <header class="k-header">
      <div class="k-label">Trending Now in ${geo}</div>
      <h1 class="k-title">${safeKeyword}</h1>
      <div class="k-meta">Source: ${displaySource} Trends • Updated: ${new Date().toLocaleDateString()}</div>
    </header>

    <main>
      <section class="k-card">
        <span class="k-label">Why is this trending?</span>
        <p class="k-desc">
          '${safeKeyword}' is currently a top trending search topic in ${geo}. 
          It has shown significant search volume activity on ${displaySource}.
        </p>
      </section>

      ${relatedLinks ? `
      <section class="k-card">
        <span class="k-label">Related Content</span>
        <div class="links-grid">
          ${relatedLinks}
        </div>
      </section>
      ` : ''}

      <div style="text-align: center;">
        <a href="/" class="back-link">← Back to Dashboard</a>
      </div>
    </main>
  </div>
</body>
</html>
  `;
}

function generateSitemap(filenames) {
  const urls = filenames.map(name => {
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

function generateReportHtml(data) {
  const dateStr = new Date().toLocaleDateString();

  // HTML 생성 (간단한 스타일 포함)
  let sectionsHtml = '';

  // 우선 KR 데이터만 메인으로 보여주거나, 탭으로 구성 가능. 여기선 단순 나열.
  for (const geo of Object.keys(data)) {
    const geoData = data[geo];
    if (!geoData.google && !geoData.youtube) continue;

    sectionsHtml += `<section class="report-geo-section">
      <h2 class="geo-title">🌏 ${geo} Analysis</h2>
      <div class="report-grid">`;

    ['google', 'youtube'].forEach(source => {
      const metrics = geoData[source];
      if (!metrics) return;

      const sourceName = source === 'youtube' ? 'YouTube' : 'Google';

      sectionsHtml += `
        <div class="report-card">
          <h3 class="source-title">${sourceName} Trends</h3>
          
          <div class="metric-block">
            <h4>🏆 Most #1 (Last 24h)</h4>
            <ul>
              ${metrics.top1s.map((m, i) => `
                <li>
                  <span class="rank">${i + 1}</span>
                  <a href="../keyword/${slugify(m.keyword)}.html" class="keyword-link">${m.keyword}</a>
                  <span class="count">${m.count} times</span>
                </li>
              `).join('') || '<li class="empty">No data</li>'}
            </ul>
          </div>

          <div class="metric-block">
            <h4>🔥 Longest Trending (Last 72h)</h4>
            <ul>
               ${metrics.longRun.map((m, i) => `
                <li>
                  <span class="rank">${i + 1}</span>
                  <a href="../keyword/${slugify(m.keyword)}.html" class="keyword-link">${m.keyword}</a>
                  <span class="count">${m.count} snapshots</span>
                </li>
              `).join('') || '<li class="empty">No data</li>'}
            </ul>
          </div>
        </div>
      `;
    });

    sectionsHtml += `</div></section>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trend Analysis Report - ${dateStr}</title>
  <link rel="stylesheet" href="../styles.css">
  <style>
    .report-layout { max-width: 1000px; margin: 0 auto; padding: 20px; }
    .report-header { text-align: center; margin-bottom: 40px; padding: 40px 0; background: linear-gradient(135deg, #f6f8fd 0%, #f1f5f9 100%); border-radius: 16px; }
    .report-title { font-size: 2.5rem; margin-bottom: 10px; color: #1e293b; }
    .report-date { color: #64748b; }
    
    .report-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
    .report-card { background: white; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .source-title { border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 20px; color: #334155; }
    
    .metric-block { margin-bottom: 30px; }
    .metric-block h4 { font-size: 0.9rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 12px; }
    .metric-block ul { list-style: none; padding: 0; }
    .metric-block li { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px dashed #f1f5f9; }
    .metric-block li:last-child { border-bottom: none; }
    
    .rank { font-weight: bold; width: 24px; color: #cbd5e1; }
    .metric-block li:nth-child(1) .rank { color: #eab308; } /* Gold */
    .metric-block li:nth-child(2) .rank { color: #94a3b8; } /* Silver */
    .metric-block li:nth-child(3) .rank { color: #b45309; } /* Bronze */
    
    .keyword-link { flex: 1; text-decoration: none; color: #0f172a; font-weight: 500; }
    .keyword-link:hover { color: #2563eb; text-decoration: underline; }
    .count { font-size: 0.8rem; color: #94a3b8; background: #f8fafc; padding: 2px 6px; border-radius: 4px; }
    
    .geo-section { margin-bottom: 60px; }
    .geo-title { margin-bottom: 20px; color: #1e293b; display: flex; align-items: center; gap: 8px; }
    
    .back-nav { margin-top: 40px; text-align: center; }
    .btn-back { display: inline-block; padding: 12px 24px; background: #1e293b; color: white; text-decoration: none; border-radius: 8px; transition: background 0.2s; }
    .btn-back:hover { background: #334155; }
  </style>
</head>
<body>
  <div class="report-layout">
    <header class="report-header">
      <h1 class="report-title">📊 Trend Insights Report</h1>
      <div class="report-date">Generated on ${dateStr}</div>
    </header>
    
    <main>
      ${sectionsHtml}
    </main>
    
    <div class="back-nav">
      <a href="../" class="btn-back">← Back to Dashboard</a>
    </div>
  </div>
</body>
</html>`;
}
