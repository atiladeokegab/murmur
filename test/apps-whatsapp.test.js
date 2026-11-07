import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import app from '../public/apps/whatsapp/index.js';
import appIds from '../public/apps/apps.js';
import { PHONE_APPS } from '../public/agent/phone-apps.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

async function phone(yes = true) {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(app);
  const kv = appKv('whatsapp', browserKV({ storage: fakeStorage(), prefix: 'murmur' }));
  const confirm = async () => yes; // the shell's confirm says yes at once when the agent pressed it
  const root = await mountApp(app, doc.body, { kv, bus, confirm, say: (text) => bus.emit('say', { text }) });
  await app.reset();
  const asks = [];
  const ctxFor = (a) => createCtx({ app: a, root, bus, kv, cursor: { async moveTo() {}, hide() {} }, ask: async (o) => { asks.push(o.readback); return yes; }, choose: async () => null, signal: new AbortController().signal });
  const run = (name, params) => runAction({ registry, name, params, bus, ctxFor, n: 1, of: 1 });
  const said = () => bus.log.filter((e) => e.name === 'say').map((e) => e.payload?.text ?? e.text);
  return { root, run, said, asks };
}

test('whatsapp: on the board, the real app wins over the acted-out one, only reply is gated (send)', () => {
  assert.ok(appIds.includes('whatsapp'));
  assert.ok(!PHONE_APPS.some((a) => a.name === 'WhatsApp'));
  assert.deepEqual(Object.entries(app.actions).filter(([, a]) => a.gate).map(([k, a]) => [k, a.gate]), [['reply', 'send']]);
});

test('whatsapp: read my new messages, then reply to Priya asks first and shows it sent', async () => {
  const { root, run, said, asks } = await phone();
  assert.equal((await run('whatsapp__readNew', {})).ok, true);
  assert.deepEqual(said(), ['Priya: Are we still on for the beach on Saturday? I can drive.', 'Tomas: I left your umbrella at the café. Grab it when you pass.']);
  assert.ok(app.state().chats.every((c) => !c.unread));
  const r = await run('whatsapp__reply', { who: 'priya', text: 'Yes, see you at ten.' });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(asks, ["Send 'Yes, see you at ten' to Priya on WhatsApp?"]);
  assert.equal(root.querySelector('#wa-chat-h').textContent, 'Chat with Priya');
  assert.deepEqual(app.state().chats[0].messages.at(-1), { from: 'me', text: 'Yes, see you at ten.' });
  assert.match(root.querySelector('[aria-label="The chat"]').textContent, /Yes, see you at ten\./, 'the mirror shows it sent');
});

test('whatsapp: a no at the gate sends nothing', async () => {
  const { run } = await phone(false);
  const r = await run('whatsapp__reply', { who: 'Priya', text: 'Hi' });
  assert.equal(r.ok, false);
  assert.equal(app.state().lastSent, null);
});
