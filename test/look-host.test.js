import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import look from '../public/apps/look/index.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

test('Your look runs on the bare contract host (kv, bus, say) with no Librarian and no localStorage', async () => {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(look);
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const root = await mountApp(look, doc.body, { kv: appKv('look', port), bus, say: (text) => bus.emit('say', { text }) });
  await look.seed();
  const ctxFor = (app) => createCtx({ app, root, bus, kv: appKv(app.id, port), cursor: { async moveTo() {}, hide() {} }, ask: async () => true });
  assert.equal((await runAction({ registry, name: 'look__textBigger', params: {}, bus, ctxFor })).ok, true);
  assert.equal((await port.get('app.look', 'look')).size, 150, 'kept in the app kv');
  assert.equal((await runAction({ registry, name: 'look__whatYouKnow', params: {}, bus, ctxFor })).ok, true);
  assert.ok(bus.log.some((e) => e.name === 'say' && /nothing about you yet/.test(e.text)));
  const r = await runAction({ registry, name: 'look__forget', params: {}, bus, ctxFor });
  assert.deepEqual([r.ok, r.reason], [false, 'There was nothing to forget.']);
});
