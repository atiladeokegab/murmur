import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createBus, createRegistry, createCtx, appKv, mountApp, loadApps, runAction } from '../public/sdk/index.js';
import { installApp, uninstallApp, removeApp, removeByName, restoreApps, installByName, availableApps, appsHeard, PLUGINS, INSTALL_APP, REMOVE_APP } from '../public/sdk/plugin.js';
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
  // confirm: yes, as the shell's is when the agent pressed the control (the runner already asked)
  const plug = { registry, host: doc.body, port, os: (app, kv) => ({ kv, bus, say() {}, confirm: async () => true }) };
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
    /comes with the phone/, 'a plug-in cannot replace a built-in app');
});

test('a bad gate is refused, and money or message actions may not skip the ask', async () => {
  const p = await phone();
  await assert.rejects(installApp(bad('launcher', `{ go: { describe: 'Go', doing: 'Going', gate: 'launch', run() {}, verify: () => true } }`), p.plug),
    /gate must be one of/);
  for (const k of ['pay', 'sendMoney', 'transfer', 'callDriver', 'order', 'bookRide', 'checkout']) {
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
  assert.deepEqual(list.map((x) => [x.id, x.installed]), [['taxi', false], ['grocer', false]]);
  const miss = await installByName('pizza', p.plug);
  assert.equal(miss.ok, false);
  assert.match(miss.say, /I can't find pizza\. I can add Northline Taxis/);
  const r = await installByName('the taxi app', p.plug);
  assert.equal(r.ok, true, r.say);
  assert.match(r.say, /^Added Northline Taxis\./);
  assert.ok(p.names().includes('taxi__book'));
  assert.match((await installByName('Northline', p.plug)).say, /already on your phone/);
});

const GROCER = new URL('grocer/index.js', PLUGINS).href;

test('a second plug-in: Corner Grocer installs by name beside taxi, and both come back after a reload', async () => {
  const p = await phone();
  assert.equal((await installByName('the taxi app', p.plug)).ok, true);
  const g = await installByName('my groceries', p.plug);
  assert.equal(g.ok, true, g.say);
  assert.match(g.say, /^Added Corner Grocer\./);
  for (const n of ['grocer__basket', 'grocer__add', 'grocer__remove', 'grocer__order', 'taxi__book']) assert.ok(p.names().includes(n), n);
  assert.match(p.registry.tools().find((t) => t.name === 'grocer__order').description, /asked first: pay/);
  const again = await phone({ storage: p.storage });
  assert.ok(again.names().includes('grocer__order') && again.names().includes('taxi__book'));
  assert.deepEqual((await availableApps(again.plug)).map((x) => x.installed), [true, true]);
});

test('grocer: add and remove go through the controls; an unknown item fails in words', async () => {
  const p = await phone();
  p.add(await installApp(GROCER, p.plug));
  const s = () => p.registry.get('grocer').state();
  assert.deepEqual(s().basket, ['milk', 'bread', 'eggs', 'bananas']);
  assert.equal((await p.run('grocer__basket', {})).ok, true);
  const add = await p.run('grocer__add', { item: 'a box of tea' });
  assert.equal(add.ok, true, add.reason);
  assert.ok(s().basket.includes('tea'));
  const rm = await p.run('grocer__remove', { item: 'bananas' });
  assert.equal(rm.ok, true, rm.reason);
  assert.deepEqual(s().basket, ['milk', 'bread', 'eggs', 'tea']);
  const bad = await p.run('grocer__add', { item: 'caviar' });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /We don't sell caviar/);
  assert.match((await p.run('grocer__remove', { item: 'cheese' })).reason, /cheese is not in your basket/);
});

test('grocer: a No at the pay gate orders nothing; a Yes hears the exact readback and orders', async () => {
  const p = await phone({ answers: [false, true] });
  p.add(await installApp(GROCER, p.plug));
  const no = await p.run('grocer__order', {});
  assert.deepEqual([no.ok, no.cancelled, no.reason], [false, true, 'Not paid.']);
  assert.equal(p.registry.get('grocer').state().order, null);
  assert.equal(p.asked[0].gate, 'pay');
  assert.equal(p.asked[0].readback, 'Order your basket: milk, bread, eggs and bananas, £5.70, delivered by 6 pm. Pay?');
  const yes = await p.run('grocer__order', {});
  assert.equal(yes.ok, true, yes.reason);
  assert.equal(p.registry.get('grocer').state().order.total, 570);
  assert.equal((await phone({ storage: p.storage })).registry.get('grocer').state().order.total, 570, 'the order survives a reload');
});

test('a person removes a plug-in with its own Remove button: asked first (delete), a No keeps it', async () => {
  const p = await phone();
  const answers = [false, true], asked = [];
  let done;
  const plug = { ...p.plug, confirm: async (q) => { asked.push(q); return answers.shift(); } };
  plug.removed = (x) => done(x);
  const r = p.add(await installApp(GROCER, plug));
  const btn = r.root.querySelector('#app-grocer-remove');
  assert.equal(btn.textContent, 'Remove Corner Grocer from your phone');
  assert.equal(r.root.children.at(-1), btn, 'Remove is the last control in reading order');
  const click = () => new Promise((res) => { done = res; btn.click(); });
  const no = await click();
  assert.deepEqual([no.ok, no.cancelled, no.say], [false, true, 'Kept it.']);
  assert.deepEqual(asked[0], { app: 'grocer', gate: 'delete', readback: 'Remove Corner Grocer from your phone?' });
  assert.ok(p.names().includes('grocer__order'), 'a No removes nothing');
  const yes = await click();
  assert.deepEqual([yes.ok, yes.say], [true, 'Removed Corner Grocer.']);
  assert.ok(!p.names().some((n) => n.startsWith('grocer__')));
  assert.deepEqual(await p.plug.port.getAll('app.grocer'), {});
  assert.ok(!(await phone({ storage: p.storage })).names().includes('grocer__order'), 'still gone after a reload');
});

test('built-in apps cannot be removed, and are never asked about', async () => {
  const p = await phone();
  let asked = 0;
  const x = await removeApp('hello', p.plug, async () => { asked++; return true; });
  assert.deepEqual([x.ok, x.say, asked], [false, 'Hello came with the phone, so it stays.', 0]);
  assert.ok(p.names().includes('hello__send'));
  assert.equal((await removeApp('nope', p.plug, async () => true)).ok, false);
  assert.equal((await installApp(GROCER, p.plug)).root.querySelector('#app-grocer-remove'), null, 'no confirm, no Remove button');
});

test('fail closed: with no confirm on the mount, a hand tap books, orders and cancels nothing', async () => {
  const p = await phone({ answers: [true] });
  p.add(await installApp(TAXI, p.plug));
  assert.equal((await p.run('taxi__book', { to: 'Home' })).ok, true);
  const bare = { ...p.plug, os: (app, kv) => ({ kv, say() {} }) };
  await uninstallApp('taxi', p.plug);
  const t = p.add(await installApp(TAXI, bare));
  await p.plug.port.set('app.taxi', 'booking', null);
  const taxi = p.registry.get('taxi');
  t.root.querySelector('#taxi-to').value = 'Home';
  t.root.querySelector('#taxi-to').dispatchEvent(new Event('input'));
  t.root.querySelector('#taxi-book').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(taxi.state().booking, null, 'no booking without a confirm');
  const g = p.add(await installApp(GROCER, bare));
  g.root.querySelector('#grocer-order').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(p.registry.get('grocer').state().order, null, 'no order without a confirm');
});

test('review: an encoded path, a query or a capital cannot step outside /plugins/', async () => {
  const p = await phone();
  for (const rel of ['%2e%2e%2fapps/hello/index.js', '%2E%2E/apps/hello/index.js', 'taxi%2findex.js', 'taxi/index.js?x=1', 'taxi/index.js#x', 'Taxi/index.js', 'taxi/index.json']) {
    await assert.rejects(installApp(new URL(rel, PLUGINS).href, p.plug), /plug-ins load only from/, rel);
  }
  assert.ok(!p.names().includes('taxi__book'));
});

test('review: money must be gated pay, never downgraded to send or call; send and call need their own gate or pay', async () => {
  const p = await phone();
  for (const [k, gate] of [['pay', 'send'], ['sendMoney', 'send'], ['transfer', 'call'], ['order', 'delete'], ['send', 'call'], ['callDriver', 'send']]) {
    await assert.rejects(installApp(bad(`down${k.toLowerCase()}${gate}`, `{ ${k}: { describe: 'Do it', doing: 'Doing it', gate: '${gate}', run() {}, verify: () => true } }`), p.plug),
      /must have a gate of/, `${k} with ${gate}`);
  }
  const ok = await installApp(bad('okcall', `{ callDriver: { describe: 'Ring', doing: 'Ringing', gate: 'call', run() {}, verify: () => true }, sendNote: { describe: 'Send', doing: 'Sending', gate: 'pay', run() {}, verify: () => true } }`), p.plug);
  assert.equal(ok.id, 'okcall', 'the right gate, or the stricter pay, is accepted');
});

test('review: a corrupt or tampered saved list never stops boot', async () => {
  const storage = fakeStorage();
  storage.setItem('murmur:os.plugins:installed', JSON.stringify([null, 5, 'taxi', { id: 'x' }, { id: 'evil', path: '../apps/hello/index.js' }, { id: 'taxi', path: 'taxi/index.js' }]));
  const p = await phone({ storage });
  assert.ok(p.names().includes('taxi__book'), 'the good entry still comes back');
  storage.setItem('murmur:os.plugins:installed', '{not json');
  const q = await phone({ storage });
  assert.ok(!q.names().includes('taxi__book') && q.names().includes('hello__send'), 'unreadable list: boot with the built-ins');
});

test('review: a failed save rolls an install back, and a failed uninstall leaves the app in place', async () => {
  const p = await phone();
  const real = p.plug.port;
  const broken = { ...real, set: async (area, k, v) => { if (area === 'os.plugins') throw new Error('QuotaExceededError'); return real.set(area, k, v); } };
  await assert.rejects(installApp(TAXI, { ...p.plug, port: broken }), /QuotaExceeded/);
  assert.ok(!p.names().includes('taxi__book'), 'not half-installed');
  p.add(await installApp(TAXI, p.plug));
  await assert.rejects(uninstallApp('taxi', { ...p.plug, port: broken }), /QuotaExceeded/);
  assert.ok(p.names().includes('taxi__book'), 'still installed, and still in the saved list');
  assert.ok((await phone({ storage: p.storage })).names().includes('taxi__book'));
});

test('remove_app by voice: the same delete sheet; a No keeps it; built-ins and unknown names are never asked', async () => {
  const p = await phone();
  assert.deepEqual(REMOVE_APP.params, INSTALL_APP.params);
  assert.equal(typeof REMOVE_APP.describe, 'string');
  await installByName('grocer', p.plug);
  await installByName('taxi', p.plug);
  const asked = [], answers = [false, 'yes', true];
  const confirm = async (q) => { asked.push(q); return answers.shift(); };
  const no = await removeByName('Corner Grocer', p.plug, confirm);
  assert.deepEqual([no.ok, no.cancelled, no.say], [false, true, 'Kept it.']);
  assert.deepEqual(asked[0], { app: 'grocer', gate: 'delete', readback: 'Remove Corner Grocer from your phone?' });
  assert.equal((await removeByName('Corner Grocer', p.plug, confirm)).cancelled, true, 'only a literal true removes');
  assert.ok(p.names().includes('grocer__order'));
  const yes = await removeByName('my groceries', p.plug, confirm);
  assert.deepEqual([yes.ok, yes.id, yes.say], [true, 'grocer', 'Removed Corner Grocer.']);
  assert.ok(!p.names().some((n) => n.startsWith('grocer__')) && p.names().includes('taxi__book'), 'only the named app goes');
  assert.equal(asked.length, 3);
  const built = await removeByName('Hello', p.plug, confirm);
  assert.deepEqual([built.ok, built.say], [false, 'Hello came with the phone, so it stays.']);
  assert.match((await removeByName('pizza', p.plug, confirm)).say, /There's no pizza on your phone/);
  assert.match((await removeByName('Corner Grocer', p.plug, confirm)).say, /There's no Corner Grocer/, 'already gone');
  assert.equal(asked.length, 3, 'none of those asked');
});

test('a spoken name matches whole words only, and only when it means one app', async () => {
  const p = await phone();
  for (const t of ['taxidermy', 'cabbage', 'a cabinet', 'groceriesss', 'corners']) {
    assert.equal((await installByName(t, p.plug)).ok, false, t);
    assert.equal(p.registry.get('taxi') || p.registry.get('grocer'), undefined, `${t} installed nothing`);
  }
  assert.equal((await installByName('get me a cab', p.plug)).id, 'taxi');
  assert.equal((await installByName('Corner', p.plug)).id, 'grocer');
  assert.equal((await removeByName('taxidermy', p.plug, async () => true)).say, "There's no taxidermy on your phone.");
  assert.ok(p.registry.get('taxi'), 'still there');
  const two = [{ id: 'a', name: 'Corner Grocer' }, { id: 'b', name: 'Corner Cafe' }];
  assert.deepEqual(appsHeard(two, 'corner').map((x) => x.id), ['a', 'b'], 'ambiguous: both');
  assert.deepEqual(appsHeard(two, 'the corner cafe').map((x) => x.id), ['b']);
  assert.deepEqual(appsHeard(two, 'x'.repeat(90) + ' cafe'), [], 'bounded: only the first 80 characters are heard');
});

test("one voice: no live region of their own; a person's tap says the result through the shell, an agent's press says nothing", async () => {
  const p = await phone();
  const said = [];
  const plug = { ...p.plug, os: (app, kv) => ({ kv, bus: p.bus, say: (t) => said.push(t), confirm: async () => true }) };
  const g = p.add(await installApp(GROCER, plug)), t = p.add(await installApp(TAXI, plug));
  for (const id of ['#grocer-line', '#taxi-line']) assert.equal((g.root.querySelector(id) || t.root.querySelector(id)).role, undefined, `${id}: the shell's status is the only live region`);
  const person = { type: 'click', isTrusted: true };
  const milk = [...g.root.all()].find((b) => b.textContent === 'Remove milk');
  milk.click(); await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(said, [], 'an untrusted click (the agent) says nothing: the runner narrates');
  [...g.root.all()].find((b) => b.textContent === 'Remove bread').dispatchEvent(person);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(said, ['Took bread out.']);
  t.root.querySelector('#taxi-to').value = 'Home';
  t.root.querySelector('#taxi-to').dispatchEvent(new Event('input'));
  t.root.querySelector('#taxi-book').dispatchEvent(person);
  await new Promise((r) => setTimeout(r, 10));
  assert.match(said.at(-1), /^Your taxi to Home is booked, arriving in \d+ minutes\.$/);
});

test('review: removability is the built-in list, never the saved claim; a claimed Hello stays, and so does its data', async () => {
  const storage = fakeStorage();
  storage.setItem('murmur:os.plugins:installed', JSON.stringify([{ id: 'hello', path: 'taxi/index.js' }]));
  const p = await phone({ storage });
  await p.plug.port.set('app.hello', 'sent', ['keep me']);
  let asked = 0;
  const yes = async () => { asked++; return true; };
  assert.equal((await removeApp('hello', p.plug, yes)).say, 'Hello came with the phone, so it stays.');
  assert.equal((await removeByName('hello', p.plug, yes)).say, 'Hello came with the phone, so it stays.');
  await assert.rejects(uninstallApp('hello', p.plug), /not an added app/);
  assert.equal(asked, 0, 'never asked');
  assert.ok(p.names().includes('hello__send') && p.doc.body.querySelector('#app-hello'));
  assert.deepEqual(await p.plug.port.get('app.hello', 'sent'), ['keep me']);
  await assert.rejects(installApp(bad('shop', `{ go: { describe: 'Go', doing: 'Going', run() {}, verify: () => true } }`), p.plug),
    /comes with the phone/, 'a built-in name not on this phone yet is still not a plug-in name');
});

test('review: a mount that throws leaves no section; a data wipe that fails still cleans the phone, then says so', async () => {
  const p = await phone();
  const dir = new URL('throwy/', tmp);
  mkdirSync(fileURLToPath(dir), { recursive: true });
  writeFileSync(fileURLToPath(new URL('index.js', dir)), `const f = () => {}; export default { id: 'throwy', name: 'Throwy',
    mount() { throw new Error('broken mount'); }, read: () => '', place: () => ({}), state: () => ({}), seed: f, reset: f,
    actions: { go: { describe: 'Go', doing: 'Going', run() {}, verify: () => true } } };`);
  await assert.rejects(installApp(new URL('index.js', dir).href, p.plug), /broken mount/);
  assert.equal(p.doc.body.querySelector('#app-throwy'), null, 'no orphan section');
  assert.equal(p.registry.get('throwy'), undefined);
  p.add(await installApp(TAXI, p.plug));
  const real = p.plug.port;
  await real.set('app.taxi', 'booking', { to: 'Home' });
  const broken = { ...real, set: async (area, k, v) => { if (area === 'app.taxi' && v === undefined) throw new Error('disk gone'); return real.set(area, k, v); } };
  const x = await removeApp('taxi', { ...p.plug, port: broken }, async () => true);
  assert.deepEqual([x.ok, x.say], [true, 'Removed Northline Taxis, but some of its data could not be cleared.']);
  assert.ok(!p.names().includes('taxi__book') && !p.doc.body.querySelector('#app-taxi'), 'tools and section gone first');
  assert.ok(!(await phone({ storage: p.storage })).names().includes('taxi__book'), 'and off the saved list');
  const y = await removeApp('grocer', p.plug, async () => true);
  assert.equal(y.say, "That app isn't on your phone.");
});

test('Hello: Send always asks, even on a hand tap; a No, or no confirm on the mount, sends nothing', async () => {
  const hello = (await import('../public/apps/hello/index.js')).default;
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const mount = async (confirm) => {
    const root = await mountApp(hello, fakeDocument().body, { kv: appKv('hello', port), say() {}, ...(confirm && { confirm }) });
    await hello.seed();
    return root;
  };
  const tap = async (root, text) => {
    const box = root.querySelector('#hello-box');
    box.value = text; box.dispatchEvent(new Event('input'));
    root.querySelector('#hello-send').click();
    await new Promise((r) => setTimeout(r, 10));
  };
  await tap(await mount(), 'hi');
  assert.deepEqual(hello.state().sent, [], 'no confirm, no send');
  const asked = [];
  let yes = false;
  const r = await mount(async (q) => { asked.push(q); return yes; });
  await tap(r, 'On my way');
  assert.deepEqual(hello.state().sent, [], 'a No sends nothing');
  assert.deepEqual(asked, [{ gate: 'send', readback: 'Send to Sam: On my way' }], 'the same readback as the agent hears');
  yes = true;
  await tap(r, 'On my way');
  assert.deepEqual(hello.state().sent, ['On my way']);
});

test('review: forged phone and look rows cannot remove the shell\'s own apps or wipe their data', async () => {
  const storage = fakeStorage();
  storage.setItem('murmur:os.plugins:installed', JSON.stringify([{ id: 'phone', path: 'taxi/index.js' }, { id: 'look', path: 'grocer/index.js' }]));
  const p = await phone({ storage });
  const { createPhone } = await import('../public/os/phone.js');
  const f = () => false;
  p.registry.register(createPhone({ stop: f, where: f, noLook: f, isNoLook: f, sound: f, isSound: f }));   // as the shell does
  p.registry.register((await import('../public/apps/look/index.js')).default);
  for (const id of ['phone', 'look']) await p.plug.port.set(`app.${id}`, 'mine', 'keep me');
  let asked = 0;
  const yes = async () => { asked++; return true; };
  for (const [id, name] of [['phone', 'Phone'], ['look', 'Your look']]) {
    const app = p.registry.get(id);
    assert.equal((await removeApp(id, p.plug, yes)).say, `${app.name} came with the phone, so it stays.`, id);
    assert.equal((await removeByName(app.name, p.plug, yes)).say, `${app.name} came with the phone, so it stays.`, name);
    await assert.rejects(uninstallApp(id, p.plug), /not an added app/);
    assert.ok(p.registry.get(id), `${id} still registered`);
    assert.equal(await p.plug.port.get(`app.${id}`, 'mine'), 'keep me', `${id} data kept`);
  }
  assert.equal(asked, 0, 'never asked');
  assert.ok(p.names().includes('taxi__book') && p.names().includes('grocer__order'), 'the modules the rows point at still load');
});
