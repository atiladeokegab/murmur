import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, appKv, mountApp, loadApps } from '../../public/sdk/index.js';
import { removeApp, restoreApps } from '../../public/sdk/plugin.js';
import { browserKV } from '../../public/ports/browser-kv.js';
import appIds from '../../public/apps/apps.js';
import { fakeDocument, fakeStorage } from '../fake-dom.js';

test('a forged installed record cannot remove a built-in app or erase its data', async () => {
  const storage = fakeStorage();
  storage.setItem('murmur:os.plugins:installed', JSON.stringify([{ id: 'hello', path: 'taxi/index.js' }]));
  const port = browserKV({ storage, prefix: 'murmur' });
  const doc = fakeDocument(), registry = createRegistry(), bus = { emit() {} };
  await loadApps(registry, appIds);
  for (const app of registry.list()) {
    await mountApp(app, doc.body, { kv: appKv(app.id, port), bus, say() {} });
    await app.seed();
  }
  await port.set('app.hello', 'sentinel', 'keep built-in data');
  const plug = { registry, host: doc.body, port, os: (app, kv) => ({ kv, bus, say() {} }) };
  await restoreApps(plug);

  let asked = 0;
  const removed = await removeApp('hello', plug, async () => { asked++; return true; });

  assert.equal(removed.ok, false, 'a stale or forged saved id is not proof that a built-in is removable');
  assert.equal(asked, 0, 'built-ins are refused before asking to delete them');
  assert.ok(registry.get('hello'));
  assert.ok(doc.body.querySelector('#app-hello'));
  assert.ok(registry.tools().some((tool) => tool.name === 'hello__send'));
  assert.equal(await port.get('app.hello', 'sentinel'), 'keep built-in data');
});
