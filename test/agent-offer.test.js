// "What can I do?": one registry, two ways in. Every app, built-in or plug-in, offers its own actions by voice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hear } from '../public/agent/words.js';
import { offerLine, asSaid, OFFER_MAX } from '../public/agent/offer.js';
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

test('Hello with no draft invites, it does not report an empty message', () => {
  assert.equal(hello.read(), 'Say hello to Sam.');
});

test('every app offers at most four of its own actions, in its own order, as a person would say them', () => {
  for (const app of APPS) {
    const line = offerLine(APPS, app.id);
    const said = Object.values(app.actions).map((x) => asSaid(x.describe)).slice(0, OFFER_MAX);
    assert.match(line, /^Here you can: .+\. Or say go home\.$/, app.id);
    let at = 0;
    for (const s of said) { const i = line.indexOf(s, at); assert.ok(i > at - 1, `${app.id}: "${s}" in order in "${line}"`); at = i + s.length; }
    const fifth = Object.values(app.actions)[OFFER_MAX];
    if (fifth) assert.ok(!line.includes(asSaid(fifth.describe)), `${app.id}: at most ${OFFER_MAX}`);
  }
  assert.equal(offerLine(APPS, 'messages'),
    'Here you can: open the chat with a person, read the new message, write a reply, or change one word in the reply to another. Or say go home.');
  assert.equal(offerLine(APPS, 'hello'), 'Here you can: write a message to Sam or send the message to Sam. Or say go home.');
  assert.equal(offerLine(APPS, 'calendar').slice(0, 45), "Here you can: what's on today, what's next in");
});

test('a plug-in gets its options for free, from the same declared actions the planner sees', () => {
  assert.equal(offerLine(APPS, 'grocer'),
    'Here you can: read what is in the basket and what it costs, add one item to the basket, take one item out of the basket, or order and pay for the basket. Or say go home.');
  assert.equal(offerLine(APPS, 'taxi'),
    'Here you can: get the price and wait for a taxi to a place, book and pay for a taxi to a place, say where the booked taxi is now, or cancel the booked taxi. Or say go home.');
  const bare = { id: 'bare', name: 'Bare', actions: {} };
  assert.equal(offerLine([bare], 'bare'), 'Bare has nothing to ask for yet. Or say go home.');
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
