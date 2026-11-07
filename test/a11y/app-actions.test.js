// Behavioral regressions through the real SDK and app modules, using the project's fake DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../../public/sdk/index.js';
import { browserKV } from '../../public/ports/browser-kv.js';
import { fakeDocument, fakeStorage } from '../fake-dom.js';
import mine from '../../public/apps/mine/index.js';
import messages from '../../public/apps/messages/index.js';

async function mount(app, os = {}) {
  const doc = fakeDocument();
  const bus = createBus();
  const registry = createRegistry();
  registry.register(app);
  const port = browserKV({ storage: fakeStorage(), prefix: `actions-${app.id}` });
  const root = await mountApp(app, doc.body, { kv: appKv(app.id, port), bus, say() {}, confirm: async () => true, ...os });
  await app.reset();
  const cursor = { async moveTo() {}, hide() {} };
  const ctxFor = (target) => createCtx({
    app: target,
    root,
    bus,
    kv: appKv(target.id, port),
    cursor,
    ask: async () => true,
    speak: async () => {},
    signal: new AbortController().signal,
  });
  return { doc, bus, registry, root, ctxFor };
}

test('Mine run cannot report success without handing the workflow to a dispatcher', async () => {
  const dispatched = [];
  const p = await mount(mine, {
    workflows: {
      all: async () => [{ name: 'Reply to Mum', recipe: { actions: [
        { app: 'messages', action: 'openChat', params: { who: 'Mum' } },
        { app: 'messages', action: 'send', params: {}, gate: 'send' },
      ] } }],
    },
    hear: (text) => dispatched.push(['hear', text]),
    agent: { runWorkflow: (name) => dispatched.push(['agent.runWorkflow', name]) },
  });
  const tool = p.registry.resolve('mine__run');

  // Removing the app action is valid if workflow execution belongs to the agent builtin.
  if (!tool) {
    assert.ok(p.registry.resolve('run_workflow')?.builtin, 'the SDK exposes the workflow runner as a builtin');
    return;
  }

  const result = await runAction({
    registry: p.registry,
    name: 'mine__run',
    params: { name: 'Reply to Mum' },
    bus: p.bus,
    ctxFor: p.ctxFor,
  });
  assert.ok(!result.ok || dispatched.length > 0,
    'Mine must not claim the workflow started unless execution was handed to a downstream dispatcher');
});

test('Messages cannot send the same reply again from the Sent control', async () => {
  const p = await mount(messages);
  p.root.querySelector('[data-chat="mum"]').click();
  const draft = p.root.querySelector('#msg-draft');
  draft.value = 'See you at lunch.';
  draft.dispatchEvent(new Event('input', { bubbles: true }));
  p.root.querySelector('#msg-send').click();
  await new Promise(setImmediate);

  const afterFirstSend = messages.state().chats.find((chat) => chat.id === 'mum').messages.length;
  assert.equal(p.root.querySelector('#msg-send').textContent, 'Sent');
  p.root.querySelector('#msg-send').click();
  await new Promise(setImmediate);

  assert.equal(messages.state().chats.find((chat) => chat.id === 'mum').messages.length, afterFirstSend,
    'repeated activation of the Sent control must not append a duplicate message');
});
