import test from 'node:test';
import assert from 'node:assert/strict';
import { browserKV } from '../public/ports/browser-kv.js';
import { createToolkit } from '../public/vendor/toolkit/index.js';

// A Web Storage stand-in with the real interface (length, key, getItem, setItem, removeItem).
function fakeStorage(limit = Infinity) {
  const m = new Map();
  return {
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), removeItem: (k) => m.delete(k),
    setItem(k, v) { if (String(v).length > limit) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
  };
}

test('get, set, delete and getAll per area', async () => {
  const kv = browserKV({ storage: fakeStorage() });
  assert.equal(await kv.get('local', 'a'), undefined);
  await kv.set('local', 'a', { n: 1 });
  await kv.set('local', 'b', [1, 2]);
  await kv.set('sync', 'a', 'other area');
  assert.deepEqual(await kv.get('local', 'a'), { n: 1 });
  assert.deepEqual(await kv.getAll('local'), { a: { n: 1 }, b: [1, 2] });
  await kv.set('local', 'a', undefined);
  assert.deepEqual(await kv.getAll('local'), { b: [1, 2] });
  assert.equal(await kv.get('sync', 'a'), 'other area');
});

test('prefixes keep two stores apart, and a full store rejects', async () => {
  const s = fakeStorage(20);
  const a = browserKV({ storage: s, prefix: 'one' });
  const b = browserKV({ storage: s, prefix: 'two' });
  await a.set('local', 'k', 1);
  assert.equal(await b.get('local', 'k'), undefined);
  await assert.rejects(a.set('local', 'big', 'x'.repeat(50)));
  assert.equal(await a.get('local', 'big'), undefined);
  assert.throws(() => browserKV({ storage: null }));
});

test('the toolkit Librarian runs on it and persists across restarts', async () => {
  const s = fakeStorage();
  let tk = createToolkit({ kv: browserKV({ storage: s }) });
  await tk.datastore.runMigrations();
  assert.deepEqual(await tk.librarian.logObservation({ type: 'saved-action', data: { tile: 'mum' }, text: 'Message Mum' }), { logged: true });
  tk = createToolkit({ kv: browserKV({ storage: s }) });
  await tk.datastore.runMigrations();
  const log = await tk.datastore.get('mine.episodicLog');
  assert.equal(log.entries.length, 1);
  assert.equal(log.entries[0].data.tile, 'mum');
  await tk.librarian.setMemoryPaused(true);
  assert.deepEqual(await tk.librarian.logObservation({ type: 'saved-action', data: { tile: 'x' } }), { logged: false, reason: 'paused' });
});
