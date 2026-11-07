import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createBus, createRegistry, createCtx, appKv, mountApp, loadApps, runAction } from '../public/sdk/index.js';
import { installApp, uninstallApp, restoreApps, installByName, availableApps, PLUGINS, INSTALL_APP } from '../public/sdk/plugin.js';
import { browserKV } from '../public/ports/browser-kv.js';
import appIds from '../public/apps/apps.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

const TAXI = new URL('taxi/index.js', PLUGINS).href;
// Bad plug-ins have to sit under /plugins/ to get past the origin check, so they live there only for this run.
const tmp = new URL(`t${process.pid}/`, PLUGINS);
const bad = (name, actions) => {
  const dir = new URL(`${name}/`, tmp);
  mkdirSync(fileURLToPath(dir), { recursive: true });
  writeFileSync(fileURLToPath(new URL('index.js', dir)), `const f = () => {}; export default { id: '${name}', name: '${name}',
    mount(r) { r.append(r.ownerDocument.createElement('h2')); }, read: () => '', place: () => ({}), state: () => ({}), seed: f, reset: f,
    actions: ${actions} };`);
  return new URL('index.js', dir).href;
};
before(() => mkdirSync(fileURLToPath(tmp), { recursive: true }));
after(() => rmSync(fileURLToPath(tmp), { recursive: true, force: true }));

// One phone: built-in apps mounted, a plug-in options object, and a scripted ask-first sheet. Pass `storage` to reload.
async function phone({ storage = fakeStorage(), answers = [] } = {}) {
  const doc = fakeDocument();
  const bus = createBus();
  const registry = createRegistry();
  await loadApps(registry, appIds);
  const port = browserKV({ storage, prefix: 'murmur' });
  const roots = {};
  for (const app of registry.list()) {
    roots[app.id] = await mountApp(app, doc.body, { kv: appKv(app.id, port), bus, say() {}, workflows: null });
    await app.seed();
  }
  const plug = { registry, host: doc.body, port, os: (app, kv) => ({ kv, bus, say() {} }) };
  const add = (r) => { roots[r.id] = r.root; return r; };
  for (const r of await restoreApps(plug)) add(r);
  const asked = [];
  const ask = async (q) => { asked.push(q); return answers.shift() ?? false; };
  const cursor = { async moveTo() {}, hide() {} };
  const ctxFor = (app) => createCtx({ app, root: roots[app.id], bus, kv: appKv(app.id, port), cursor, ask, signal: new AbortController().signal });
  const run = (name, params) => runAction({ registry, name, params, bus, ctxFor });
  const names = () => registry.tools().map((t) => t.name);
  return { storage, registry, plug, add, run, names, asked, doc };
}

test('install: taxi plugs in, its actions become tools, and the agent can quote straight away', async () => {
  const p = await phone();
  assert.ok(!p.names().includes('taxi__book'));
  const r = p.add(await installApp(TAXI, p.plug));
  assert.equal(r.id, 'taxi');
  assert.equal(r.name, 'Northline Taxis');
  assert.deepEqual(r.actions, ['quote', 'book', 'track', 'cancel']);
  for (const a of r.actions) assert.ok(p.names().includes(`taxi__${a}`), a);
  assert.ok(p.registry.tools().find((t) => t.name === 'open_app').parameters.properties.app.enum.includes('taxi'));
  assert.equal(r.root.getAttribute('aria-labelledby'), 'taxi-h');
  const q = await p.run('taxi__quote', { to: 'home' });
  assert.equal(q.ok, true, q.reason);
  assert.deepEqual(p.registry.get('taxi').state().quote, { to: 'Home', price: 14, eta: 6 });
  const unknown = await p.run('taxi__quote', { to: 'the moon' });
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /I don't know the moon/);
});

test('install refuses a second app with the same id', async () => {
  const p = await phone();
  p.add(await installApp(TAXI, p.plug));
  await assert.rejects(installApp(TAXI, p.plug), /already registered/);
  await assert.rejects(installApp(bad('hello', `{ go: { describe: 'Go', doing: 'Going', run() {}, verify: () => true } }`), p.plug),
    /already registered/, 'a plug-in cannot replace a built-in app');
});

test('a bad gate is refused, and money or message actions may not skip the ask', async () => {
  const p = await phone();
  await assert.rejects(installApp(bad('launcher', `{ go: { describe: 'Go', doing: 'Going', gate: 'launch', run() {}, verify: () => true } }`), p.plug),
    /gate must be one of/);
  for (const k of ['pay', 'sendMoney', 'transfer', 'callDriver']) {
    await assert.rejects(installApp(bad(`sneaky${k.toLowerCase()}`, `{ ${k}: { describe: 'Do it', doing: 'Doing it', gate: null, run() {}, verify: () => true } }`), p.plug),
      /must have a gate/, k);
  }
  assert.ok(!p.names().some((n) => n.startsWith('sneaky') || n.startsWith('launcher')), 'nothing half-installed');
});

test('a foreign origin, or anything outside /plugins/, is refused before it loads', async () => {
  const p = await phone();
  for (const u of ['https://evil.example/plugins/taxi/index.js', 'data:text/javascript,export default {}',
    new URL('../sdk/run.js', PLUGINS).href, new URL('taxi/../../apps/hello/index.js', PLUGINS).href]) {
    await assert.rejects(installApp(u, p.plug), /plug-ins load only from/, u);
  }
});

test('an installed app, and its booking, come back after a reload', async () => {
  const p = await phone({ answers: [true] });
  p.add(await installApp(TAXI, p.plug));
  const b = await p.run('taxi__book', { to: 'Home' });
  assert.equal(b.ok, true, b.reason);
  const again = await phone({ storage: p.storage });
  assert.ok(again.names().includes('taxi__book'));
  assert.equal(again.registry.get('taxi').state().booking.name, 'Home');
  const t = await again.run('taxi__track', {});
  assert.equal(t.ok, true, t.reason);
});

test('registry.unregister drops an app and its tools; an unknown id is a no-op', () => {
  const r = createRegistry();
  const f = () => {};
  r.register({ id: 'x', name: 'X', mount: f, read: f, place: f, state: f, seed: f, reset: f, actions: { go: { describe: 'Go', doing: 'Going', run: f, verify: f } } });
  assert.ok(r.resolve('x__go'));
  assert.equal(r.unregister('x'), true);
  assert.equal(r.unregister('x'), false);
  assert.equal(r.resolve('x__go'), null);
  assert.equal(r.get('x'), undefined);
  assert.ok(!r.tools().some((t) => t.name.startsWith('x__')));
});

test('uninstall removes the tools and stays gone after a reload; built-in apps cannot be uninstalled', async () => {
  const p = await phone();
  p.add(await installApp(TAXI, p.plug));
  await p.plug.port.set('app.taxi', 'booking', { name: 'Home' });
  await uninstallApp('taxi', p.plug);
  assert.deepEqual(await p.plug.port.getAll('app.taxi'), {}, 'its kv area is wiped');
  assert.ok(!p.names().some((n) => n.startsWith('taxi__')));
  assert.equal((await p.run('taxi__quote', { to: 'Home' })).reason, "I can't do that here.");
  assert.ok(!(await phone({ storage: p.storage })).names().includes('taxi__book'));
  await assert.rejects(uninstallApp('hello', p.plug), /not an added app/);
  assert.ok(p.names().includes('hello__send'));
});

test('a No at the pay gate books nothing; a Yes hears the exact readback', async () => {
  const p = await phone({ answers: [false, true] });
  p.add(await installApp(TAXI, p.plug));
  const no = await p.run('taxi__book', { to: 'home' });
  assert.deepEqual([no.ok, no.cancelled, no.reason], [false, true, 'Not paid.']);
  assert.equal(p.registry.get('taxi').state().booking, null);
  assert.equal(p.asked[0].gate, 'pay');
  assert.equal(p.asked[0].readback, 'Book a taxi to Home, £14, arriving in 6 minutes. Pay?');
  const yes = await p.run('taxi__book', { to: 'home' });
  assert.equal(yes.ok, true, yes.reason);
  assert.equal(p.registry.get('taxi').state().booking.price, 14);
});

test('install_app by spoken name, through the manifest', async () => {
  const p = await phone();
  assert.deepEqual(Object.keys(INSTALL_APP.params.properties), ['name']);
  const list = await availableApps(p.plug);
  assert.deepEqual(list.map((x) => [x.id, x.installed]), [['taxi', false]]);
  const miss = await installByName('pizza', p.plug);
  assert.equal(miss.ok, false);
  assert.match(miss.say, /I can't find pizza\. I can add Northline Taxis/);
  const r = await installByName('the taxi app', p.plug);
  assert.equal(r.ok, true, r.say);
  assert.match(r.say, /^Added Northline Taxis\./);
  assert.ok(p.names().includes('taxi__book'));
  assert.match((await installByName('Northline', p.plug)).say, /already on your phone/);
});
