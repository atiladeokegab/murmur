import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { readLook } from '../public/look.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

// A phone whose light/dark setting the test can flip, and a page root that applyLook writes to.
const phone = { light: true, fns: [] };
globalThis.matchMedia = (q) => ({ get matches() { return /light/.test(q) && phone.light; }, addEventListener: (e, fn) => phone.fns.push(fn) });
const flip = (light) => { phone.light = light; phone.fns.forEach((fn) => fn()); };
globalThis.document = { documentElement: { style: {}, dataset: {} } };
const shown = () => globalThis.document.documentElement.dataset.theme || 'dark';

test('no colours chosen follows the phone, live; a chosen colour wins until Match my phone', async () => {
  const { default: look } = await import('../public/apps/look/index.js');
  const doc = fakeDocument(); doc.documentElement = globalThis.document.documentElement;
  const bus = createBus(), registry = createRegistry(); registry.register(look);
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const { librarian, datastore } = createToolkit({ kv: browserKV({ storage: fakeStorage() }) });
  await datastore.runMigrations();
  const root = await mountApp(look, doc.body, { kv: appKv('look', port), bus, librarian, datastore, say: async () => {} });
  const ctxFor = (app) => createCtx({ app, root, bus, kv: appKv(app.id, port), cursor: { async moveTo() {}, hide() {} }, ask: async () => true });
  const run = (name, params) => runAction({ registry, name, params, bus, ctxFor });

  assert.equal(look.state().theme, 'auto');
  assert.equal(shown(), 'light', 'a light phone opens light');
  assert.equal(root.querySelector('#look-theme-auto').getAttribute('aria-pressed'), 'true');
  assert.equal((await readLook(librarian)).theme, 'light', 'the profile holds what is shown');
  flip(false);
  assert.equal(shown(), 'dark', 'the phone goes dark, so does Murmur');

  assert.equal((await run('look__colours', { colours: 'yellow' })).ok, true);
  flip(true);
  assert.equal(shown(), 'yellow', 'a chosen colour wins over the phone');
  assert.equal((await run('look__colours', { colours: 'auto' })).ok, true);
  assert.equal(shown(), 'light', 'Match my phone hands it back');
  assert.equal(look.actions.colours.done(look.state()), 'Colours: match my phone.');
});
