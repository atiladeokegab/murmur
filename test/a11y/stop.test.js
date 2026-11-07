import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createCtx, createRegistry, runAction } from '../../public/sdk/index.js';
import { fakeDocument } from '../fake-dom.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(action, { moveTo = async () => {}, speak = async () => {} } = {}) {
  const doc = fakeDocument();
  const root = doc.createElement('section');
  doc.body.append(root);
  const bus = createBus();
  const registry = createRegistry();
  const app = {
    id: 'stoptest', name: 'Stop test', mount() {}, read: () => '', place: () => ({}),
    state: () => ({}), seed() {}, reset() {}, actions: { check: action },
  };
  registry.register(app);
  const controller = new AbortController();
  const ctx = createCtx({ app, root, bus, kv: null, cursor: { moveTo }, ask: async () => true,
    speak, signal: controller.signal });
  const run = () => runAction({ registry, name: 'stoptest__check', params: {}, bus, ctxFor: () => ctx });
  return { doc, root, bus, controller, run };
}

test('Stop during pending verification cannot emit a success tick', async () => {
  const started = deferred();
  const finishVerify = deferred();
  const { bus, controller, run } = setup({
    describe: 'Check the action', doing: 'Checking action', run: async (_p, ctx) => ctx.say('Checking.'),
    verify: async () => { started.resolve(); return finishVerify.promise; },
  });

  const resultPromise = run();
  await started.promise;
  controller.abort();
  finishVerify.resolve(true);
  const result = await resultPromise;

  assert.equal(result.ok, false);
  assert.equal(result.stopped, true);
  assert.deepEqual(bus.log.map((event) => event.name), ['step:start', 'say', 'step:failed']);
});

test('Stop while the cursor is moving prevents the control click', async () => {
  const moving = deferred();
  const cursorReady = deferred();
  const { doc, root, bus, controller, run } = setup({
    describe: 'Press the action', doing: 'Pressing action',
    run: async (_p, ctx) => ctx.tap(root.querySelector('button')),
    verify: () => true,
  }, { moveTo: () => { cursorReady.resolve(); return moving.promise; } });
  const button = doc.createElement('button');
  root.append(button);
  let clicked = false;
  button.addEventListener('click', () => { clicked = true; });

  const resultPromise = run();
  await cursorReady.promise;
  controller.abort();
  moving.resolve();
  const result = await resultPromise;

  assert.equal(clicked, false);
  assert.equal(result.stopped, true);
  assert.deepEqual(bus.log.map((event) => event.name), ['step:start', 'tap', 'step:failed']);
});

test('an already aborted task cannot produce a side effect', async () => {
  const { bus, controller, run } = setup({
    describe: 'Say a sentence', doing: 'Saying sentence',
    run: async (_p, ctx) => ctx.say('Hello.'), verify: () => true,
  });
  controller.abort();

  const result = await run();

  assert.equal(result.ok, false);
  assert.equal(result.stopped, true);
  assert.deepEqual(bus.log.map((event) => event.name), ['step:start', 'step:failed']);
});
