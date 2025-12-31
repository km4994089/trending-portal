import { readJsonIfExists, writeJson } from './utils.mjs';

export async function updateHistory(latestSnapshot, historyPath, maxDays = 4) {
  const fallback = {
    geo: latestSnapshot.geo,
    source: latestSnapshot.source,
    snapshots: [],
  };

  const history = await readJsonIfExists(historyPath, fallback);
  const snapshots = Array.isArray(history.snapshots)
    ? [...history.snapshots]
    : [];

  const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  const filtered = snapshots.filter((snap) => {
    if (!snap || !snap.capturedAt) return false;
    const ts = Date.parse(snap.capturedAt);
    if (Number.isNaN(ts)) return false;
    if (ts < cutoff) return false;
    return snap.capturedAt !== latestSnapshot.capturedAt;
  });

  filtered.push(latestSnapshot);
  filtered.sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
  );

  const updated = {
    geo: latestSnapshot.geo,
    source: latestSnapshot.source,
    snapshots: filtered,
  };

  await writeJson(historyPath, updated);
}

