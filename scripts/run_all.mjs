import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDir, writeJson, sleep } from './utils.mjs';
import { fetchGoogle } from './fetch_google.mjs';
import { fetchYoutube } from './fetch_youtube.mjs';
import { updateHistory } from './history.mjs';

const geos = ['US', 'KR', 'JP'];
const youtubeApiKey = process.env.YOUTUBE_API_KEY;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../app/data');

async function handleGeo(geo) {
  const googleSnapshot = await fetchGoogle(geo);
  const googleLatestPath = path.join(dataDir, `latest_google_${geo}.json`);
  const googleHistoryPath = path.join(dataDir, `history_google_${geo}.json`);
  await writeJson(googleLatestPath, googleSnapshot);
  await updateHistory(googleSnapshot, googleHistoryPath);

  const youtubeSnapshot = await fetchYoutube(geo, youtubeApiKey);
  const youtubeLatestPath = path.join(dataDir, `latest_youtube_${geo}.json`);
  const youtubeHistoryPath = path.join(dataDir, `history_youtube_${geo}.json`);
  await writeJson(youtubeLatestPath, youtubeSnapshot);
  await updateHistory(youtubeSnapshot, youtubeHistoryPath);
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
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

