import { fetchText } from './utils.mjs';

const geo = 'KR';
const url = `https://trends.google.com/trends/api/realtimetrends?hl=ko&tz=0&cat=all&fi=0&fs=0&geo=${geo}&ri=300&rs=20&sort=0`;

import fs from 'fs';
import path from 'path';

function log(msg) {
    fs.appendFileSync('debug_rt_out.txt', msg + '\n');
}

async function run() {
    log(`Fetching ${url}...`);
    try {
        const text = await fetchText(url, {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
        });
        log('Raw response length: ' + text.length);
        log('First 500 chars: ' + text.substring(0, 500));

        const cleaned = text.replace(/^\)\]\}',?\s*/, '');
        try {
            const data = JSON.parse(cleaned);
            const stories = data?.storySummaries?.trendingStories;
            log('Stories count: ' + (stories ? stories.length : 'undefined'));
            if (stories && stories.length > 0) {
                log('First story title: ' + stories[0].title);
                log('First story entityNames: ' + JSON.stringify(stories[0].entityNames));
            }
        } catch (e) {
            log('JSON parse error: ' + e.message);
        }
    } catch (err) {
        log('Fetch error: ' + err.message);
    }
}

run();
