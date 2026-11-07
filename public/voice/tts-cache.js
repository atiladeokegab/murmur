// Spoken lines as audio, fetched once: warm the fixed lines at boot (agent.warm()), and every later line is
// one round trip at most. The shell's speak() plays what this returns ({ audio, rate }, as /api/tts sends it).
const MAX = 200; // shortcut: oldest-first eviction, enough for a demo session's lines
const cache = new Map();

export function cachedTts(text, { fetch = globalThis.fetch } = {}) {
  if (!cache.has(text)) {
    const p = fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`tts ${r.status}`))));
    p.catch(() => cache.delete(text)); // a failed line is fetched again next time
    cache.set(text, p);
    if (cache.size > MAX) cache.delete(cache.keys().next().value);
  }
  return cache.get(text);
}

export const warmTts = (lines, o) => Promise.allSettled(lines.map((l) => cachedTts(l, o)));
