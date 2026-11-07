// Browser KVStore port for the AI for Accessibility Toolkit, over Web Storage.
// Same contract as toolkit/platforms/node/kv.js and chrome/ports.js:chromeKV:
//   get(area, key)        -> the stored value, or undefined
//   set(area, key, value) -> persists; undefined deletes
//   getAll(area)          -> { key: value } for the whole area
// One storage item per (area, key), JSON-encoded, under `${prefix}:${area}:`.
// A full or blocked store rejects set() rather than dropping the write silently.

export function browserKV({ storage = globalThis.localStorage, prefix = 'aat' } = {}) {
  if (!storage) throw new Error('browserKV: no Web Storage available');
  const base = (area) => `${prefix}:${area}:`;
  const parse = (raw) => (raw == null ? undefined : JSON.parse(raw));

  return {
    async get(area, key) {
      return parse(storage.getItem(base(area) + key));
    },
    async set(area, key, value) {
      const k = base(area) + key;
      if (value === undefined) storage.removeItem(k);
      else storage.setItem(k, JSON.stringify(value)); // throws QuotaExceededError -> rejected promise
    },
    async getAll(area) {
      const p = base(area);
      const out = {};
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(p)) out[k.slice(p.length)] = parse(storage.getItem(k));
      }
      return out;
    },
  };
}
