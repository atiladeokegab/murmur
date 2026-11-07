import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, validate, createCtx, controlName, appKv, mountApp, loadApps, runAction, EVENTS } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import appIds from '../public/apps/apps.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

// One phone: a registry with the listed apps, mounted into a fake document, with a scripted ask-first sheet.
async function phone({ answers = [] } = {}) {
  const doc = fakeDocument();
  const bus = createBus();
  const registry = createRegistry();
  await loadApps(registry, appIds);
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const roots = {}, taps = [];
  const cursor = { async moveTo(el, name) { taps.push(name); }, hide() {} };
  const asked = [];
  const ask = async (q) => { asked.push(q); return answers.shift() ?? false; };
  for (const app of registry.list()) {
    const kv = appKv(app.id, port);
    roots[app.id] = await mountApp(app, doc.body, { kv, bus, say: (text) => bus.emit('say', { text }) });
    await app.seed();
  }
  const controller = new AbortController();
  const ctxFor = (app) => createCtx({ app, root: roots[app.id], bus, kv: appKv(app.id, port), cursor, ask, signal: controller.signal });
  const run = (name, params, n, of) => runAction({ registry, name, params, bus, ctxFor, n, of });
  const names = () => bus.log.map((e) => e.name);
  return { doc, bus, registry, roots, taps, asked, run, names, controller, ctxFor };
}

test('bus: known events only, payloads stamped, broken listeners contained, * sees everything', () => {
  const bus = createBus({ keep: 3 });
  const seen = [];
  bus.on('*', (name) => seen.push(name));
  bus.on('say', () => { throw new Error('boom'); });
  const orig = console.error; console.error = () => {};
  try { assert.equal(typeof bus.emit('say', { text: 'hi' }).t, 'number'); } finally { console.error = orig; }
  assert.throws(() => bus.emit('nope'), /unknown event/);
  assert.throws(() => bus.on('step:begin', () => {}), /unknown event/);
  for (const e of ['task:start', 'step:start', 'task:done']) bus.emit(e, {});
  assert.deepEqual(seen, ['say', 'task:start', 'step:start', 'task:done']);
  assert.equal(bus.log.length, 3);
  assert.ok(EVENTS.includes('step:verified') && EVENTS.includes('confirm'));
});

test('registry: refuses a malformed app, and tools are generated from what apps declared', async () => {
  const r = createRegistry();
  assert.throws(() => r.register({ id: 'Bad_id' }), /id must match/);
  assert.throws(() => r.register({ id: 'x', name: 'X', mount() {}, read() {}, place() {}, state() {}, seed() {}, reset() {},
    actions: { go: { describe: 'Go', doing: 'Going', run() {}, verify() {}, gate: 'launch' } } }), /gate must be/);
  await loadApps(r, appIds);
  const tools = r.tools();
  const names = tools.map((t) => t.name);
  for (const b of ['open_app', 'read_screen', 'where', 'say', 'ask', 'save_workflow', 'run_workflow', 'explain']) assert.ok(names.includes(b), b);
  assert.ok(names.includes('hello__write') && names.includes('hello__send'));
  assert.deepEqual(tools.find((t) => t.name === 'open_app').parameters.properties.app.enum, appIds);
  assert.match(tools.find((t) => t.name === 'hello__send').description, /asked first: send/);
  assert.equal(r.resolve('hello__delete'), null, 'an action nobody declared does not exist');
  assert.equal(r.resolve('hello__write__x'), null);
  assert.equal(r.resolve('hello__write').key, 'write');
  assert.equal(r.resolve('where').builtin, 'where');
});

test('validate: drops unknown keys, checks types, enums and required', () => {
  const s = { type: 'object', properties: { text: { type: 'string' }, n: { type: 'integer' }, mood: { type: 'string', enum: ['warm', 'brief'] } }, required: ['text'] };
  assert.deepEqual(validate(s, { text: 'hi', n: 2, evil: 'rm -rf' }), { ok: true, params: { text: 'hi', n: 2 }, errors: [], dropped: ['evil'] });
  assert.equal(validate(s, { n: 1.5 }).ok, false);
  assert.deepEqual(validate(s, { text: 'x', mood: 'loud' }).errors, ['mood must be one of warm, brief']);
  assert.deepEqual(validate(s, undefined).errors, ['text is required']);
});

test('hello mounts with a focusable heading, a labelled box and named controls', async () => {
  const { roots } = await phone();
  const root = roots.hello;
  assert.equal(root.hidden, true);
  assert.equal(root.getAttribute('aria-labelledby'), 'hello-h');
  assert.equal(root.querySelector('h2').tabIndex, -1);
  assert.equal(controlName(root.querySelector('#hello-box')), 'Your message to Sam');
  assert.equal(controlName(root.querySelector('#hello-send')), 'Send to Sam');
});

test('a step runs through the cursor and is verified by the app, then says where you are', async () => {
  const { run, taps, names, registry, bus } = await phone();
  const r = await run('hello__write', { text: 'Ten minutes late', sneaky: 1 });
  assert.equal(r.ok, true);
  assert.deepEqual(taps, ['Your message to Sam']);
  assert.deepEqual(names(), ['step:start', 'tap', 'step:verified', 'place']);
  const start = bus.log[0];
  assert.equal(start.label, 'Writing to Sam');
  assert.deepEqual(start.dropped, ['sneaky']);
  assert.equal(registry.get('hello').state().draft, 'Ten minutes late');
  assert.equal(bus.log.at(-1).next, 'send');
});

test('a gated step asks with the state that will leave, and a no sends nothing', async () => {
  const { run, asked, names, registry } = await phone({ answers: [false] });
  await run('hello__write', { text: 'On my way' });
  const r = await run('hello__send', {});
  assert.deepEqual(r, { ok: false, reason: 'Not sent.', cancelled: true });
  assert.deepEqual(asked, [{ app: 'hello', gate: 'send', readback: 'Send to Sam: On my way' }]);
  assert.deepEqual(registry.get('hello').state().sent, []);
  assert.deepEqual(names().slice(-3), ['step:start', 'confirm', 'step:failed']);
});

test('a gated step with a yes presses Send and the app confirms it sent', async () => {
  const { run, names, registry, taps } = await phone({ answers: [true] });
  await run('hello__write', { text: 'On my way' });
  assert.equal((await run('hello__send', {})).ok, true);
  assert.deepEqual(registry.get('hello').state().sent, ['On my way']);
  assert.equal(taps.at(-1), 'Send to Sam');
  assert.deepEqual(names().slice(-5), ['step:start', 'confirm', 'tap', 'step:verified', 'place']);
});

test('a failed verify is a failed step in the app\'s words, never a tick', async () => {
  const { run, bus, roots } = await phone({ answers: [true] });
  roots.hello.querySelector('#hello-send').disabled = true; // a broken control
  await run('hello__write', { text: 'x' });
  const r = await run('hello__send', {});
  assert.equal(r.ok, false);
  assert.match(r.reason, /isn't available/);
  assert.ok(!bus.log.slice(-3).some((e) => e.name === 'step:verified'));
});

test('a verify that says no stops the step with its reason', async () => {
  const { run, registry, bus } = await phone();
  const write = registry.get('hello').actions.write;
  const orig = write.verify;
  write.verify = () => 'The message box did not take it.';
  try {
    const r = await run('hello__write', { text: 'x' });
    assert.deepEqual([r.ok, r.reason], [false, 'The message box did not take it.']);
    assert.equal(bus.log.at(-1).name, 'step:failed');
  } finally { write.verify = orig; }
});

test('bad params, unknown tools and Stop all fail cleanly', async () => {
  const { run, controller } = await phone();
  assert.match((await run('hello__write', {})).reason, /needs text is required/);
  assert.equal((await run('bank__pay', {})).reason, "I can't do that here.");
  controller.abort();
  const r = await run('hello__write', { text: 'late' });
  assert.deepEqual([r.ok, r.stopped, r.reason], [false, true, 'Stopped.']);
});

test('ctx.choose returns the chosen object and records it; ctx.say waits for the voice and stops on Stop', async () => {
  const bus = createBus(); const doc = fakeDocument(); const root = doc.createElement('section'); doc.body.append(root);
  const spoken = [];
  const controller = new AbortController();
  const ctx = createCtx({ app: { id: 'x', name: 'X' }, root, bus, kv: null, cursor: null, ask: async () => false, signal: controller.signal,
    choose: async ({ choices }) => choices.indexOf('Samira'),
    speak: async (text) => { spoken.push(text); if (spoken.length === 2) controller.abort(); } });
  const picked = await ctx.choose('Sam or Samira?', [{ label: 'Sam', id: 'sam' }, { label: 'Samira', id: 'samira' }]);
  assert.deepEqual(picked, { label: 'Samira', id: 'samira' });
  assert.deepEqual(bus.log.at(-1), { name: 'ask', app: 'x', question: 'Sam or Samira?', choices: ['Sam', 'Samira'], result: 'Samira', t: bus.log.at(-1).t });
  const read = async () => { for (const s of ['One.', 'Two.', 'Three.']) await ctx.say(s); };
  await assert.rejects(read(), { name: 'AbortError' });
  assert.deepEqual(spoken, ['One.', 'Two.']);
});

test('ctx refuses controls outside the app and things that are not controls', async () => {
  const { ctxFor, registry, doc, roots } = await phone();
  const ctx = ctxFor(registry.get('hello'));
  const stray = doc.createElement('button'); doc.body.append(stray);
  await assert.rejects(ctx.tap(stray), /isn't on screen/);
  await assert.rejects(ctx.tap(roots.hello.querySelector('h2')), /isn't a control/);
});

test('undo and kv: an app keeps its own data, and undo goes back through the same controls', async () => {
  const { run, registry, ctxFor } = await phone({ answers: [true] });
  const hello = registry.get('hello');
  await run('hello__write', { text: 'first' });
  await run('hello__send', {});
  await run('hello__write', { text: 'second' });
  await hello.actions.write.undo(ctxFor(hello), {});
  assert.equal(hello.state().draft, 'first');
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  await appKv('a', port).set('k', 1);
  assert.equal(await appKv('b', port).get('k'), undefined);
  await hello.reset();
  assert.deepEqual(hello.state(), { draft: '', sent: [], lastSent: null });
});

test('review fixes: no typing into a read-only box, no prototype keys through validate, no tick after Stop', async () => {
  const { ctxFor, registry, roots, run, controller, bus } = await phone();
  const box = roots.hello.querySelector('#hello-box');
  box.readOnly = true;
  await assert.rejects(ctxFor(registry.get('hello')).type(box, 'sneaky'), /can't be changed/);
  assert.equal(box.value, '');
  box.readOnly = false;
  const fs = roots.hello.ownerDocument.createElement('fieldset'); fs.disabled = true;
  const inner = roots.hello.ownerDocument.createElement('textarea'); fs.append(inner); roots.hello.append(fs);
  await assert.rejects(ctxFor(registry.get('hello')).type(inner, 'sneaky'), /can't be changed/);
  const innerBtn = roots.hello.ownerDocument.createElement('button'); fs.append(innerBtn);
  await assert.rejects(ctxFor(registry.get('hello')).tap(innerBtn, 'Send'), /isn't available/);
  assert.equal(inner.value, '');

  const s = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] };
  const v = validate(s, JSON.parse('{"constructor": 1, "__proto__": {"admin": true}, "toString": 2}'));
  assert.equal(v.ok, false);
  assert.deepEqual(v.errors, ['text is required']);
  assert.equal(v.params.admin, undefined);
  assert.deepEqual(validate({ type: 'object', properties: {}, required: ['constructor'] }, {}).errors, ['constructor is required']);

  // Stop lands while the step runs: the step fails as stopped, never verified.
  const app = registry.get('hello');
  const realRun = app.actions.write.run;
  app.actions.write.run = async (p, ctx) => { await realRun(p, ctx); controller.abort(); };
  const r = await run('hello__write', { text: 'late' });
  app.actions.write.run = realRun;
  assert.deepEqual([r.ok, r.stopped], [false, true]);
  assert.ok(!bus.log.some((e) => e.name === 'step:verified'));
});
