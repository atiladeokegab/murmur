import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import { describeRegistry } from '../public/agent/plan.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { toUtterance } from '../public/voice/gpt.js';
import notifications from '../public/apps/notifications/index.js';
import messages from '../public/apps/messages/index.js';
import appIds from '../public/apps/apps.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

const apps = describeRegistry([notifications, messages]);
const plan = (said, context = {}) => demoPlan(said, apps, { app: null, workflows: [], ...context }).plan?.map((x) => [x.tool, x.params]);

test('notifications: on the phone, and each phrasing (typed, said or from GPT) reaches check', () => {
  assert.ok(appIds.includes('notifications'));
  for (const t of ['Check my notifications', 'check my notifications.', 'Any notifications?', 'Do I have any new notifications?', 'Read my notifications', 'notifications']) {
    assert.deepEqual(plan(t), [['notifications__check', {}]], t);
  }
  assert.deepEqual(plan('Any notifications from Sam?'), [['notifications__check', { who: 'Sam' }]]);
  assert.deepEqual(plan('What did Mum send me?'), [['notifications__check', { who: 'Mum' }]]);
  assert.deepEqual(plan(toUtterance('do', { request: 'check my notifications' })), [['notifications__check', {}]], 'a GPT tool call');
  const after = { app: 'notifications', notified: { who: 'Sam', app: 'messages', id: 'sam' } };
  assert.deepEqual(plan('Open it', after), [['messages__openChat', { id: 'sam' }]]);
  assert.deepEqual(plan('Reply', after).map((x) => x[0]), ['messages__openChat', 'ask']);
  assert.deepEqual(plan('Reply Running late, see you soon', { ...after, app: 'messages' }).map((x) => x[0]), ['messages__openChat', 'messages__reply', 'messages__send'], 'the answer to What should it say? goes to the send gate');
  assert.deepEqual(plan('open it', { app: 'notifications', notified: { who: 'Uber', app: 'uber' } }), [['open_app', { app: 'uber' }]]);
});

test('notifications: reads the latest 1 to 3, who, what and when, and never says it cannot', async () => {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(notifications);
  const kv = appKv('notifications', browserKV({ storage: fakeStorage(), prefix: 'murmur' }));
  const root = await mountApp(notifications, doc.body, { kv, bus, say: (text) => bus.emit('say', { text }) });
  await notifications.reset();
  const ctxFor = (app) => createCtx({ app, root, bus, kv, cursor: { async moveTo() {}, hide() {} }, ask: async () => false, signal: new AbortController().signal });
  const run = (name, params) => runAction({ registry, name, params, bus, ctxFor, n: 1, of: 1 });
  const said = () => bus.log.filter((e) => e.name === 'say').map((e) => e.payload?.text ?? e.text).at(-1);
  assert.equal((await run('notifications__check', {})).ok, true);
  assert.match(said(), /^You have 6 notifications\. The latest: Uber, a minute ago: .+ Mum, 4 minutes ago: .+ Sam, 12 minutes ago: .+ Say open it, or reply\.$/);
  assert.equal((await run('notifications__check', { who: 'Mum' })).ok, true);
  assert.match(said(), /^From Mum: Mum, 4 minutes ago: .+ Mum, an hour ago: /);
  assert.deepEqual(notifications.state().last, { ...notifications.state().last, id: 'mum', who: 'Mum', app: 'messages' });
  assert.equal((await run('notifications__check', { who: 'Zara' })).ok, true);
  assert.match(said(), /^Nothing from Zara\. The latest: Uber/);
  assert.doesNotMatch(said(), /can'?t|try again/i);
});
