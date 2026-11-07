import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import app from '../public/apps/instagram/index.js';
import appIds from '../public/apps/apps.js';
import { PHONE_APPS } from '../public/agent/phone-apps.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

async function phone(yes = true) {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(app);
  const kv = appKv('instagram', browserKV({ storage: fakeStorage(), prefix: 'murmur' }));
  const confirm = async () => yes; // the shell's confirm says yes at once when the agent pressed it
  const root = await mountApp(app, doc.body, { kv, bus, confirm, say: (text) => bus.emit('say', { text }) });
  await app.reset();
  const asks = [];
  const ctxFor = (a) => createCtx({ app: a, root, bus, kv, cursor: { async moveTo() {}, hide() {} }, ask: async (o) => { asks.push(o.readback); return yes; }, choose: async () => null, signal: new AbortController().signal });
  const run = (name, params) => runAction({ registry, name, params, bus, ctxFor, n: 1, of: 1 });
  const said = () => bus.log.filter((e) => e.name === 'say').map((e) => e.payload?.text ?? e.text);
  return { root, run, said, asks };
}

test("instagram: on the board, no gates; what's new reads three posts, like it marks the last one", async () => {
  assert.ok(appIds.includes('instagram'));
  assert.ok(!PHONE_APPS.some((a) => a.name === 'Instagram'));
  assert.ok(Object.values(app.actions).every((a) => !a.gate));
  const { root, run, said, asks } = await phone();
  assert.equal((await run('instagram__like', {})).ok, false, 'nothing read yet');
  assert.equal((await run('instagram__whatsNew', {})).ok, true);
  assert.equal(said().length, 3);
  assert.equal(said()[0], 'Priya: A long beach at low tide, two dogs running. Morning walk by the sea.');
  assert.equal((await run('instagram__like', {})).ok, true);
  assert.equal(said().at(-1), "Liked Priya's post.");
  assert.equal(asks.length, 0);
  assert.equal(root.querySelector('#ig-like').textContent, "Liked Priya's post");
  assert.match(root.querySelector('[data-post="p3"]').textContent, /Liked\./);
});
