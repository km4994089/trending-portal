import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { ensureDir, writeJson, sleep } from './utils.mjs';
import { fetchGoogleBundle } from './fetch_google.mjs';
import { fetchYoutube } from './fetch_youtube.mjs';
import { updateHistory } from './history.mjs';

const geos = ['US', 'KR', 'JP'];
const youtubeApiKey = process.env.YOUTUBE_API_KEY;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../app/data');

async function handleGeo(geo) {
  const googleBundle = await fetchGoogleBundle(geo);
  const googleSnapshot = googleBundle.snapshot;
  const googleLatestPath = path.join(dataDir, `latest_google_${geo}.json`);
  const googleHistoryPath = path.join(dataDir, `history_google_${geo}.json`);
  await writeJson(googleLatestPath, googleSnapshot);
  await updateHistory(googleSnapshot, googleHistoryPath);
  const googleContextPath = path.join(dataDir, `context_google_${geo}.json`);
  await writeJson(googleContextPath, googleBundle.context);

  const youtubeBundle = await fetchYoutube(geo, youtubeApiKey);
  const youtubeSnapshot = youtubeBundle.snapshot;
  const youtubeLatestPath = path.join(dataDir, `latest_youtube_${geo}.json`);
  const youtubeHistoryPath = path.join(dataDir, `history_youtube_${geo}.json`);
  await writeJson(youtubeLatestPath, youtubeSnapshot);
  await updateHistory(youtubeSnapshot, youtubeHistoryPath);
  const youtubeContextPath = path.join(dataDir, `context_youtube_${geo}.json`);
  await writeJson(youtubeContextPath, youtubeBundle.context);
}

function randomSleepMs() {
  const min = 300;
  const max = 500;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  if (!youtubeApiKey) {
    console.error('YOUTUBE_API_KEY is not set');
    process.exit(1);
  }

  await ensureDir(dataDir);

  for (let i = 0; i < geos.length; i += 1) {
    const geo = geos[i];
    await handleGeo(geo);
    if (i < geos.length - 1) {
      await sleep(randomSleepMs());
    }
  }

  // Generate SEO Pages
  console.log('Generating static pages...');
  try {
    const scriptPath = path.join(__dirname, 'generate_pages.mjs');
    execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to generate pages:', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
