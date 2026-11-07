import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import look from '../public/apps/look/index.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

test('every changing Your look action undoes to the value before it ran, through the same controls; reads and gates have none', async () => {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(look);
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const root = await mountApp(look, doc.body, { kv: appKv('look', port), bus, say: async () => {} });
  await look.seed();
  const taps = [];
  const ctxFor = (app) => createCtx({ app, root, bus, kv: appKv(app.id, port), cursor: { async moveTo(el, n) { taps.push(n); }, hide() {} }, ask: async () => true });
  const run = (name, params = {}) => runAction({ registry, name, params, bus, ctxFor });
  const undo = (key, params = {}) => look.actions[key].undo(ctxFor(look), params);
  const s = () => look.state();

  assert.equal((await run('look__textBigger')).ok, true);
  assert.equal(s().size, 150);
  taps.length = 0;
  await undo('textBigger');
  assert.equal(s().size, 100);
  assert.deepEqual(taps, ['Text: smaller. Now 150 percent'], 'undo pressed the real control');

  await run('look__setText', { percent: 300 });
  await run('look__setText', { percent: 400 });
  await undo('setText');
  assert.equal(s().size, 300, 'undo goes back one action, not to the start');

  for (const [key, name, params, row, was] of [
    ['voiceSlower', 'look__voiceSlower', {}, 'rate', 1.15],
    ['colours', 'look__colours', { colours: 'yellow' }, 'theme', 'dark'],
    ['whoSpeaks', 'look__whoSpeaks', { who: 'reader' }, 'speaker', 'murmur'],
    ['howMuch', 'look__howMuch', { mode: 'teach' }, 'agency', 'ask'],
    ['learning', 'look__learning', { on: false }, 'learning', true],
  ]) {
    assert.equal((await run(name, params)).ok, true, name);
    assert.notEqual(s()[row], was, `${name} changed it`);
    await undo(key, params);
    assert.equal(s()[row], was, `${name} undone`);
  }

  assert.equal(look.actions.whatYouKnow.undo, undefined, 'reading changes nothing, so it has no undo');
  assert.equal(look.actions.forget.undo, undefined, 'a gated delete is final');
});

test('the done line after a change says only the changed row; read() stays the whole screen', async () => {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(look);
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const root = await mountApp(look, doc.body, { kv: appKv('look', port), bus, say: async () => {} });
  await look.reset();
  const ctxFor = (app) => createCtx({ app, root, bus, kv: appKv(app.id, port), cursor: { async moveTo() {}, hide() {} }, ask: async () => true });
  const line = async (name, params = {}) => {
    assert.equal((await runAction({ registry, name, params, bus, ctxFor })).ok, true, name);
    return look.actions[name.split('__')[1]].done(look.state(), params);
  };
  assert.equal(await line('look__textBigger'), 'Text 150 percent.');
  assert.equal(await line('look__setText', { percent: 400 }), 'Text 400 percent.');
  assert.equal(await line('look__voiceFaster'), 'Voice 1.25 times.');
  assert.equal(await line('look__voiceSlower'), 'Voice 1.15 times.');
  assert.equal(await line('look__colours', { colours: 'yellow' }), 'Colours: yellow on black.');
  assert.equal(await line('look__howMuch', { mode: 'teach' }), 'How much Murmur does: teach me.');
  assert.equal(await line('look__learning', { on: false }), 'Learning stopped.');
  assert.equal(await line('look__whoSpeaks', { who: 'reader' }), 'My screen reader speaks.');
  assert.equal(look.actions.whatYouKnow.done, undefined, 'a read keeps the full line');
  assert.match(look.read(), /^Your look\. Text 400 percent, colours yellow on black, /);
  await look.reset();
});
