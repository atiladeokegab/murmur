import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createCtx, createRegistry, runAction, validate } from '../public/sdk/index.js';
import { fakeDocument } from './fake-dom.js';

test('JSON __proto__ cannot satisfy a required field or bypass its type', () => {
  const schema = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] };
  const params = JSON.parse('{"__proto__":{"text":9}}');

  const result = validate(schema, params);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['text is required']);
  assert.deepEqual(result.dropped, ['__proto__']);
  assert.equal(Object.hasOwn(result.params, 'text'), false);
});

test('Stop during pending async verification cannot emit step:verified', async () => {
  const doc = fakeDocument();
  const root = doc.createElement('section');
  doc.body.append(root);
  const bus = createBus();
  const registry = createRegistry();
  let enterVerify;
  let finishVerify;
  const verifyStarted = new Promise((resolve) => { enterVerify = resolve; });
  const verifyResult = new Promise((resolve) => { finishVerify = resolve; });
  const app = {
    id: 'stopcheck', name: 'Stop check', mount() {}, read: () => '', place: () => ({}),
    state: () => ({}), seed() {}, reset() {}, actions: {
      check: { describe: 'Check the action', doing: 'Checking action', run: async (_p, ctx) => ctx.say('Checking.'),
        verify: () => { enterVerify(); return verifyResult; } },
    },
  };
  registry.register(app);
  const controller = new AbortController();
  const ctx = createCtx({ app, root, bus, kv: null, cursor: { async moveTo() {}, hide() {} },
    ask: async () => true, speak: async () => {}, signal: controller.signal });

  const resultPromise = runAction({ registry, name: 'stopcheck__check', params: {}, bus, ctxFor: () => ctx });
  await verifyStarted;
  controller.abort();
  finishVerify(true);
  const result = await resultPromise;

  assert.equal(result.ok, false);
  assert.equal(result.stopped, true);
  assert.deepEqual(bus.log.map((event) => event.name), ['step:start', 'say', 'step:failed']);
});
