// The four apps through the real SDK: registry, mountApp, ctx and runAction, on the fake DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';
import messages from '../public/apps/messages/index.js';
import writer from '../public/apps/writer/index.js';
import mine from '../public/apps/mine/index.js';

const APPS = [messages, writer, mine];

async function phone({ answers = [], picks = [], stopAfter = Infinity } = {}) {
  const doc = fakeDocument();
  const bus = createBus();
  const registry = createRegistry();
  for (const a of APPS) registry.register(a);
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const roots = {}, taps = [], said = [], asked = [], chose = [];
  const cursor = { async moveTo(el, name) { taps.push(name); }, hide() {} };
  for (const app of APPS) {
    // The shell's confirm says yes at once for the agent's own press: the runner already asked.
    roots[app.id] = await mountApp(app, doc.body, { kv: appKv(app.id, port), bus, say: (text) => said.push(text), confirm: async () => true });
    await app.reset();
  }
  let controller = new AbortController();
  const ask = async (q) => { asked.push(q); return answers.shift() ?? false; };
  const choose = async (q) => { chose.push(q); return picks.shift() ?? null; };
  const speak = async (text) => { said.push(text); if (said.length === stopAfter) controller.abort(); };
  const ctxFor = (app) => createCtx({ app, root: roots[app.id], bus, kv: appKv(app.id, port), cursor, ask, choose, speak, signal: controller.signal });
  let n = 0;
  const run = (name, params = {}) => (controller = new AbortController(), runAction)({ registry, name, params, bus, ctxFor, n: ++n, of: 9 });
  return { doc, bus, registry, roots, taps, said, asked, chose, run, ctxFor };
}

test('every app registers, mounts with an h2, and every tool exists', async () => {
  const p = await phone();
  const names = p.registry.tools().map((t) => t.name);
  for (const t of ['messages__openChat', 'messages__send', 'writer__readLastPage', 'writer__where', 'mine__delete']) assert.ok(names.includes(t), t);
  for (const a of APPS) assert.ok(p.roots[a.id].querySelector('h2'), a.id);
  assert.match(p.registry.tools().find((t) => t.name === 'messages__send').description, /asked first: send/);
});

test('Vertical 1: "Text Sam I\'m ten minutes late" asks Sam or Samira, writes, gates, sends, verifies', async () => {
  const p = await phone({ picks: [0], answers: [true] });
  let r = await p.run('messages__openChat', { who: 'Sam' });
  assert.ok(r.ok, r.reason);
  assert.deepEqual(p.chose.map((c) => [c.question, c.choices]), [['Sam or Samira?', ['Sam', 'Samira']]]);
  r = await p.run('messages__reply', { text: "I'm ten minutes late." });
  assert.ok(r.ok, r.reason);
  r = await p.run('messages__send');
  assert.ok(r.ok, r.reason);
  assert.deepEqual(p.asked.map((a) => [a.gate, a.readback]), [['send', "Send 'I'm ten minutes late' to Sam?"]]);
  assert.deepEqual(messages.state().lastSent, { to: 'sam', text: "I'm ten minutes late." });
  assert.equal(messages.actions.send.done(), 'Sent to Sam.', 'the short done line');
  assert.deepEqual(p.taps, ["Sam. New: Are you still coming to the quiz tonight? We start at seven.", 'Your reply, edit it here', 'Send']);
  const ev = p.bus.log.map((e) => e.name);
  assert.ok(ev.indexOf('confirm') < ev.lastIndexOf('step:verified'), 'asked before it sent');
});

test('no pick, no chat: the step fails in words', async () => {
  const p = await phone({ picks: [null] });
  const r = await p.run('messages__openChat', { who: 'Sam' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'No one chosen.');
});

test('a no at the gate sends nothing', async () => {
  const p = await phone({ answers: [false] });
  await p.run('messages__openChat', { who: 'Mum' });
  await p.run('messages__reply', { text: 'See you then.' });
  const r = await p.run('messages__send');
  assert.deepEqual([r.ok, r.reason, r.cancelled], [false, 'Not sent.', true]);
  assert.equal(messages.state().lastSent, null);
});

test('the race: read Mum, reply, change Tuesday to Wednesday, send', async () => {
  const p = await phone({ answers: [true] });
  for (const [name, params] of [
    ['messages__openChat', { who: 'Mum' }],
    ['messages__read', {}],
    ['messages__reply', { text: "Tuesday's fine." }],
    ['messages__replace', { from: 'Tuesday', to: 'Wednesday' }],
    ['messages__send', {}],
  ]) {
    const r = await p.run(name, params);
    assert.ok(r.ok, `${name}: ${r.reason}`);
  }
  assert.deepEqual(p.said, ['Lunch on Tuesday?', "Wednesday's fine."]);
  assert.equal(p.asked[0].readback, "Send 'Wednesday's fine' to Mum?");
  assert.equal(messages.state().chats[0].messages.at(-1).text, "Wednesday's fine.");
  assert.match(messages.read(), /Sent\.$/);
});

test('change a word that is not there fails in words', async () => {
  const p = await phone();
  await p.run('messages__openChat', { who: 'Mum' });
  await p.run('messages__reply', { text: 'Fine.' });
  const r = await p.run('messages__replace', { from: 'Tuesday', to: 'Wednesday' });
  assert.equal(r.reason, "I can't find Tuesday in your reply.");
});

test('the changed word is marked in the reply', async () => {
  const p = await phone();
  await p.run('messages__openChat', { who: 'Mum' });
  await p.run('messages__reply', { text: "Tuesday's fine." });
  await p.run('messages__replace', { from: 'Tuesday', to: 'Wednesday' });
  const mark = p.roots.messages.querySelector('mark');
  assert.equal(mark.textContent, "Wednesday's");
  assert.equal(mark.className, 'changed');
});

test('the Writer beat: read the last page, stop mid-way, where am I, carry on', async () => {
  const p = await phone({ stopAfter: 4 });
  let r = await p.run('writer__readLastPage');
  assert.deepEqual([r.ok, r.stopped], [false, true], 'Stop ends the read');
  assert.deepEqual(p.said, ['The station smelled of wet coats and coffee.', 'A board above the gates clicked through the departures.',
    'The nine forty to Leeds was on time, for once.', 'I stood under the clock and looked for her.']);
  assert.equal(writer.place().say, 'Chapter 2, sentence 14 of 30, the part about the station.');
  r = await p.run('writer__where');
  assert.ok(r.ok, r.reason);
  assert.equal(p.said.at(-1), 'Chapter 2, sentence 14 of 30, the part about the station.');
  r = await p.run('writer__carryOn');
  assert.ok(r.ok, r.reason);
  assert.equal(p.said[5], 'I stood under the clock and looked for her.', 'carry on starts at the sentence you stopped in');
  assert.equal(p.said.at(-1), 'So I did.');
  assert.equal(p.roots.writer.querySelector('#wr-place').textContent, 'Chapter 2, sentence 30 of 30, the part about the envelope.');
});

test('the Writer: dictate, change, new chapter, open chapter', async () => {
  const p = await phone();
  for (const [name, params] of [
    ['writer__newChapter', { title: 'Leeds' }],
    ['writer__dictate', { text: 'The hotel was cold. I slept in my coat.' }],
    ['writer__change', { from: 'cold', to: 'freezing' }],
    ['writer__openChapter', { n: 1 }],
  ]) {
    const r = await p.run(name, params);
    assert.ok(r.ok, `${name}: ${r.reason}`);
  }
  assert.equal(p.said.at(-1), 'The hotel was freezing.');
  assert.equal(writer.state().chapters[2].text, 'The hotel was freezing. I slept in my coat.');
  const r = await p.run('writer__openChapter', { n: 9 });
  assert.equal(r.reason, "There's no chapter 9. The book has 3.");
});

test('Mine: explain, run, and delete only after the yes', async () => {
  const p = await phone({ answers: [false, true] });
  let r = await p.run('mine__explain', { name: 'my morning' });
  assert.ok(r.ok, r.reason);
  assert.equal(p.said.at(-1), "My morning: say what's on today, then open Mum's chat, then read the new message.");
  r = await p.run('mine__run', { name: 'My morning' });
  assert.ok(r.ok, r.reason);
  r = await p.run('mine__delete', { name: 'My morning' });
  assert.deepEqual([r.ok, r.reason], [false, 'Kept it.']);
  assert.equal(mine.state().workflows.length, 1);
  r = await p.run('mine__delete', { name: 'My morning' });
  assert.ok(r.ok, r.reason);
  assert.match(p.asked[1].readback, /^Delete My morning\?/);
  assert.equal(mine.state().workflows.length, 0);
  assert.equal(mine.read(), 'Mine. Nothing saved yet. Do something once, then say "save that as" and a name.');
});

test('Mine reads the agent store: skills with recipe.actions, slots said as someone', async () => {
  const { fakeDocument: fd } = await import('./fake-dom.js');
  const doc = fd(); const host = doc.body;
  let removed = null;
  const skills = [{ name: 'Message someone', murmur: true, recipe: { adapters: [], actions: [
    { tool: 'messages__openChat', app: 'messages', action: 'openChat', params: { who: '$who' }, gate: null },
    { tool: 'messages__send', app: 'messages', action: 'send', params: {}, gate: 'send' }] } }];
  const heard = [];
  const os = { kv: null, bus: createBus(), say() {}, hear: (t) => heard.push(t), agent: { runWorkflow: async (n) => heard.push(`runWorkflow ${n}`) }, confirm: async () => true, workflows: { all: async () => skills, remove: async (n) => { removed = n; } } };
  await mountApp(mine, host, os);
  assert.equal(mine.read(), 'Mine, 1 saved: Message someone.');
  assert.equal(host.querySelector('[data-explain="Message someone"]').textContent, "What's in Message someone");
  host.querySelector('[data-run="Message someone"]').click();
  assert.deepEqual(heard, [], 'an agent tap on Run does not start a second task');
  host.querySelector('[data-run="Message someone"]').dispatchEvent({ type: 'click', isTrusted: true });
  assert.deepEqual(heard, ['runWorkflow Message someone'], "a person's tap runs it through the agent");
  host.querySelector('[data-delete="Message someone"]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(removed, 'Message someone');
  await mine.reset();
});

test('the Writer: undo puts back the last change, then the last dictate, through the Undo button', async () => {
  const p = await phone();
  const before = writer.state().chapters[1].text;
  assert.equal(p.roots.writer.querySelector('#wr-undo'), null, 'no Undo until something changed');
  let r = await p.run('writer__dictate', { text: 'The train was late.' });
  assert.ok(r.ok, r.reason);
  r = await p.run('writer__change', { from: 'late', to: 'early' });
  assert.ok(r.ok, r.reason);
  await writer.actions.change.undo(p.ctxFor(writer), { from: 'late', to: 'early' });
  assert.ok(writer.state().chapters[1].text.endsWith('The train was late.'));
  assert.equal(p.taps.at(-1), 'Undo the last change');
  r = await p.run('writer__dictate', { text: 'Then it rained.' });
  await writer.actions.dictate.undo(p.ctxFor(writer), { text: 'Then it rained.' });
  assert.ok(writer.state().chapters[1].text.endsWith('The train was late.'));
  assert.notEqual(writer.state().chapters[1].text, before);
});

// public/apps/<id>/state.example.json is the shape the eval reads: state() after seed(), then after a typical action.
// This test fails if a field changes; WRITE_EXAMPLES=1 rewrites the files.
test('state.example.json matches what state() returns', async () => {
  const fs = await import('node:fs');
  const cases = {
    messages: { steps: [['messages__openChat', { who: 'Sam' }], ['messages__reply', { text: "I'm ten minutes late." }], ['messages__send', {}]], opts: { picks: [0], answers: [true] } },
    writer: { steps: [['writer__readLastPage', {}]], opts: { stopAfter: 4 } },
    mine: { steps: [['mine__explain', { name: 'My morning' }]], proposal: 'You message Mum most mornings. Add a tile?' },
  };
  const apps = { messages, writer, mine };
  for (const [id, c] of Object.entries(cases)) {
    const p = await phone(c.opts);
    const app = apps[id];
    await app.seed();
    const afterSeed = app.state();
    for (const [name, params] of c.steps) await p.run(name, params);
    if (c.proposal) p.bus.emit('memory', { proposal: c.proposal });
    const example = { afterSeed, afterAction: { said: c.steps.map(([name, params]) => ({ name, params })), state: app.state() } };
    const file = new URL(`../public/apps/${id}/state.example.json`, import.meta.url);
    if (process.env.WRITE_EXAMPLES) fs.writeFileSync(file, JSON.stringify(example, null, 2) + '\n');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), JSON.parse(JSON.stringify(example)), id);
  }
});

test("a person's tap on Read stops when the shell's say says Stop (resolves false)", async () => {
  const doc = fakeDocument(); const said = [];
  const os = { kv: null, bus: createBus(), say: async (t) => { said.push(t); return said.length < 2; } };
  await mountApp(writer, doc.body, os);
  await writer.reset();
  doc.body.querySelector('#wr-last').dispatchEvent({ type: 'click', isTrusted: true });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(said.length, 2, 'stopped after the sentence that was cut off');
  assert.equal(writer.place().say, 'Chapter 2, sentence 12 of 30, the part about the station.');
});

test("a person's own tap on Send or Delete asks first, with the readback; No sends and deletes nothing", async () => {
  const doc = fakeDocument(); const asked = []; let answer = false;
  const os = { kv: null, bus: createBus(), say: async () => true, confirm: async (c) => { asked.push(c); return answer; } };
  await mountApp(messages, doc.body, os);
  await messages.reset();
  const tap = (sel) => doc.body.querySelector(sel).dispatchEvent({ type: 'click', isTrusted: true });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  tap('[data-chat="sam"]');
  const box = doc.body.querySelector('#msg-draft');
  box.value = "I'm ten minutes late."; box.dispatchEvent({ type: 'input' });
  tap('#msg-send'); await settle();
  assert.deepEqual(asked, [{ gate: 'send', readback: "Send 'I'm ten minutes late' to Sam?" }]);
  assert.equal(messages.state().lastSent, null, 'No sends nothing');
  answer = true; tap('#msg-send'); await settle();
  assert.deepEqual(messages.state().lastSent, { to: 'sam', text: "I'm ten minutes late." });

  const doc2 = fakeDocument(); const asked2 = [];
  await mountApp(mine, doc2.body, { kv: null, bus: createBus(), say() {}, confirm: async (c) => { asked2.push(c); return false; } });
  await mine.reset();
  doc2.body.querySelector('[data-delete="My morning"]').dispatchEvent({ type: 'click', isTrusted: true }); await settle();
  assert.equal(asked2[0].gate, 'delete');
  assert.match(asked2[0].readback, /^Delete My morning\?/);
  assert.equal(mine.state().workflows.length, 1, 'No deletes nothing');
});

test('a mount with no confirm sends nothing and deletes nothing, even on a tap', async () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const doc = fakeDocument();
  await mountApp(messages, doc.body, { kv: null, bus: createBus(), say: async () => true });
  await messages.reset();
  const tap = (sel) => doc.body.querySelector(sel).dispatchEvent({ type: 'click', isTrusted: true });
  tap('[data-chat="mum"]');
  const box = doc.body.querySelector('#msg-draft'); box.value = 'See you then.'; box.dispatchEvent({ type: 'input' });
  tap('#msg-send'); await settle();
  assert.equal(messages.state().lastSent, null);
  const doc2 = fakeDocument();
  await mountApp(mine, doc2.body, { kv: null, bus: createBus(), say() {} });
  await mine.reset();
  doc2.body.querySelector('[data-delete="My morning"]').dispatchEvent({ type: 'click', isTrusted: true }); await settle();
  assert.equal(mine.state().workflows.length, 1);
});
