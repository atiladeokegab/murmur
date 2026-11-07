import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import { readLook, writeLook, fromSettings } from '../public/look.js';

function fakeStorage() {
  const m = new Map();
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('Your look round-trips through the toolkit ability profile', async () => {
  const { datastore, librarian } = createToolkit({ kv: browserKV({ storage: fakeStorage() }) });
  await datastore.runMigrations();
  assert.deepEqual(await readLook(librarian), { size: 100, theme: 'light', rate: 1 });
  for (const look of [{ size: 400, theme: 'yellow', rate: 1.25 }, { size: 150, theme: 'dark', rate: 0.75 }, { size: 100, theme: 'light', rate: 1 }]) {
    assert.deepEqual(await writeLook(librarian, look), look);
  }
});

test('high contrast wins over dark', () => {
  assert.equal(fromSettings({ text: { scalePercent: 100 }, display: { darkMode: true, highContrast: true }, speech: { rate: 1 } }).theme, 'yellow');
});
