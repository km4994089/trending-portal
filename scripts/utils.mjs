import fs from 'fs/promises';
import path from 'path';

export async function fetchText(url, options = {}) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      throw new Error(`Request failed ${res.status} ${res.statusText}`);
    }
    const buffer = await res.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  } catch (err) {
    throw new Error(`fetchText error for ${url}: ${err.message}`);
  }
}

export async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Request failed ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    throw new Error(`fetchJson error for ${url}: ${err.message}`);
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export async function readJsonIfExists(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return fallback;
    }
    throw new Error(`readJsonIfExists error for ${filePath}: ${err.message}`);
  }
}

export async function writeJson(filePath, obj) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const data = `${JSON.stringify(obj, null, 2)}\n`;
  await fs.writeFile(filePath, data, 'utf8');
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
