// "What can I do?": one registry, two ways in. Every app, built-in or plug-in, offers its own actions by voice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hear } from '../public/agent/words.js';
import { offerLine, asSaid, spokenAs, OFFER_MAX } from '../public/agent/offer.js';
import { createAgent } from '../public/agent/index.js';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { phone, memoryKV } from './agent-fixtures.js';
import hello from '../public/apps/hello/index.js';
import messages from '../public/apps/messages/index.js';
import writer from '../public/apps/writer/index.js';
import mine from '../public/apps/mine/index.js';
import calendar from '../public/apps/calendar/index.js';
import look from '../public/apps/look/index.js';
import taxi from '../public/plugins/taxi/index.js';
import grocer from '../public/plugins/grocer/index.js';

const APPS = [hello, messages, writer, mine, calendar, look, taxi, grocer];
const kinds = (t) => hear(t).words.map((w) => w.kind);

test('"what can I do", "what can I say", "help" and "options" are reserved; inside content they are content', () => {
  for (const t of ['What can I do?', 'what can I say', 'Help.', 'options', 'um, help please', 'what can I do here']) assert.deepEqual(kinds(t), ['offer'], t);
  assert.deepEqual(kinds('Stop. What can I do?'), ['stop', 'offer']);
  for (const t of ['help me write to Mum', 'what can I do about the bill', 'options for dinner']) {
    assert.deepEqual(kinds(t), [], t);
    assert.equal(hear(t).rest, t);
  }
});

test('every app offers at most four of its own actions, in its own order, in its own words', () => {
  for (const app of APPS) {
    let st; try { st = app.state?.(); } catch { /* not mounted: say falls back */ }
    const said = Object.values(app.actions).map((x) => spokenAs(x, st)).filter(Boolean);
    const line = offerLine(APPS, app.id);
    assert.match(line, said.length ? /^Here you can: .+\. Or say go home\.$/ : /^In .+, ask in your own words\. Or say go home\.$/, app.id);
    let at = 0;
    for (const w of said.slice(0, OFFER_MAX)) { const i = line.indexOf(w, at); assert.ok(i >= at, `${app.id}: "${w}" in order in "${line}"`); at = i + w.length; }
    if (said[OFFER_MAX]) assert.ok(!line.includes(`, ${said[OFFER_MAX]}`) && !line.includes(`or ${said[OFFER_MAX]}.`), `${app.id}: at most ${OFFER_MAX}`);
  }
  assert.equal(offerLine(APPS, 'hello'), 'Here you can: send it. Or say go home.');
  assert.equal(offerLine(APPS, 'calendar'), "Here you can: what's on today, what's next, add an event on Friday, or move lunch to Wednesday. Or say go home.");
  assert.equal(offerLine(APPS, 'writer'), 'Here you can: read the last page, where am I, carry on, or new chapter. Or say go home.');
  assert.equal(offerLine(APPS, 'mine'), 'In Mine, ask in your own words. Or say go home.', 'nothing plans offline yet, so nothing is offered');
});

test("an action's say wins over describe, follows the app's state, and '' leaves it out for now", async () => {
  const p = await phone();
  const m = p.registry.get('messages'), ctx = p.ctxFor(m, { bus: p.bus });
  assert.equal(offerLine(p.registry.list(), 'messages'), "Here you can: open Mum's chat or read my messages. Or say go home.");
  await m.actions.openChat.run({ id: 'mum' }, ctx);
  assert.equal(offerLine(p.registry.list(), 'messages'), "Here you can: read Mum's message or reply to Mum. Or say go home.");
  await m.actions.reply.run({ text: 'On my way' }, ctx);
  assert.equal(offerLine(p.registry.list(), 'messages'), "Here you can: read Mum's message, reply to Mum, or send it. Or say go home.");
  const odd = { id: 'odd', name: 'Odd', state: () => ({}), actions: {
    a: { describe: 'Do the first thing, slowly', say: () => { throw new Error('boom'); } },
    b: { describe: 'Do the second thing', say: 42 },
    c: { describe: 'Do the third thing', say: null },
    d: { describe: 'Do the fourth thing', say: 'do it my way' } } };
  assert.equal(offerLine([odd], 'odd'), 'Here you can: do the first thing, do the second thing, or do it my way. Or say go home.', 'a throw or a non-string falls back; null leaves it out');
});

test('a plug-in offers only what plans offline; an app with nothing yet says to ask in your own words', () => {
  assert.equal(offerLine(APPS, 'taxi'), 'Here you can: book a taxi home. Or say go home.');
  assert.equal(offerLine(APPS, 'grocer'), 'In Corner Grocer, ask in your own words. Or say go home.');
  const bare = { id: 'bare', name: 'Bare', actions: { go: { describe: 'Go somewhere' } } };
  assert.equal(offerLine([bare], 'bare'), 'Here you can: go somewhere. Or say go home.', 'no say: describe, shortened');
  assert.equal(offerLine([{ id: 'none', name: 'None', actions: {} }], 'none'), 'In None, ask in your own words. Or say go home.');
});

test('on the board: the apps, and what is on today', () => {
  assert.equal(offerLine(APPS, null),
    "On the board: Hello, Messages, The Writer, Mine, Calendar, Your look, Northline Taxis, or Corner Grocer. Say an app's name to open it, or say what's on today.");
  assert.equal(offerLine([hello, messages], null), "On the board: Hello or Messages. Say an app's name to open it.");
});

test('asking only reads: nothing runs, nothing is remembered, and the board is the board after going home', async () => {
  const { librarian } = createToolkit({ kv: memoryKV() });
  const p = await phone();
  let here = null;
  const spoken = [], events = [];
  for (const e of ['task:start', 'step:start', 'task:done', 'memory']) p.bus.on(e, () => events.push(e));
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, librarian, agency: () => 'just',
    os: { current: () => here, open: async (id) => { here = id; } }, planOpts: { offline: true }, speak: async (t) => { spoken.push(t); } });
  await agent.hear('Make the text bigger'); // a step in Your look, then home: the agent's last app is look
  here = null; events.length = 0;
  const before = Object.fromEntries(p.apps.map((a) => [a.id, JSON.stringify(a.state())]));

  assert.equal((await agent.hear('What can I do?')).status, 'reserved');
  assert.equal(spoken.at(-1), offerLine(p.registry.list(), null));
  here = 'messages';
  await agent.hear('help');
  assert.equal(spoken.at(-1), offerLine(p.registry.list(), 'messages'));
  here = null;
  await agent.hear('options');
  assert.match(spoken.at(-1), /^On the board: /, 'home again: the board, not the last app');

  assert.deepEqual(events, [], 'no task, no step, no memory');
  assert.deepEqual(Object.fromEntries(p.apps.map((a) => [a.id, JSON.stringify(a.state())])), before, 'no app changed');
  assert.deepEqual(await librarian.listSkills(), [], 'nothing saved');
});
