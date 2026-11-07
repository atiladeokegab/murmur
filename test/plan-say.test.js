// A plug-in plans offline from its own action words (name, say, describe): no planner words written for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hear } from '../public/agent/words.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { describeRegistry } from '../public/agent/plan.js';
import { asSaid } from '../public/agent/offer.js';
import { createAgent } from '../public/agent/index.js';
import { createBus, createRegistry, createCtx, appKv, mountApp } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';
import ids from '../public/apps/apps.js';
import taxi from '../public/plugins/taxi/index.js';
import grocer from '../public/plugins/grocer/index.js';

const apps = [];
for (const id of [...ids, 'look']) { try { apps.push((await import(`../public/apps/${id}/index.js`)).default); } catch { /* not merged */ } }
apps.push(taxi, grocer); // the real phone with both plug-ins: no stub Shop, so nothing hand-written claims the basket
const reg = describeRegistry(apps);
const tool = (said, app = null, extra = {}) => {
  const h = hear(said);
  const p = demoPlan(h.rest || said, reg, { app, workflows: [], ...extra });
  return p.plan.length ? p.plan.map((s) => `${s.tool}${JSON.stringify(s.params)}`).join(' > ') : p.say;
};

test('Grocer and Taxi plan from their own words, whichever app is open', () => {
  for (const open of [null, 'grocer', 'taxi', 'messages', 'writer']) {
    assert.equal(tool('read my basket', open), 'grocer__basket{}', open);
    assert.equal(tool('add milk', open), 'grocer__add{"item":"milk"}', open);
    assert.equal(tool('take out milk', open), 'grocer__remove{"item":"milk"}', open);
    assert.equal(tool('order my usual', open), 'grocer__order{}', open);
    assert.equal(tool('get a price to the station', open), 'taxi__quote{"to":"station"}', open);
    assert.equal(tool('track my taxi', open), 'taxi__track{}', open);
    assert.equal(tool('cancel my taxi', open), 'taxi__cancel{}', open);
  }
});

test('a missing slot is asked, and the answer finishes it', () => {
  assert.equal(tool('get a price'), 'open_app{"app":"taxi"} > ask{"question":"Where to: Home, Work, the Station or the Airport?"}');
  assert.equal(tool('The airport.', 'taxi', { asked: 'get a price' }), 'taxi__quote{"to":"airport"}');
  assert.match(tool('The airport.', 'taxi'), /^I can't do that one yet/, 'no question asked: no guess');
});

test('"write to Sam" is a message to Sam, not the Writer', () => {
  assert.equal(tool('write to Sam'), 'messages__openChat{"who":"Sam"} > ask{"question":"What should it say?"}');
  assert.equal(tool("Write to Sam I'm running late"), 'messages__openChat{"who":"Sam"} > messages__reply{"text":"I\'m running late."} > messages__send{}');
});

test('the open app wins a tie; an unclear match asks "Which one: A or B?"', () => {
  const two = describeRegistry([taxi, { ...taxi, id: 'cabco', name: 'Cab Co' }]);
  assert.equal(demoPlan('cancel it', two, { app: 'cabco', workflows: [] }).plan[0].tool, 'cabco__cancel');
  assert.equal(demoPlan('cancel it', two, { app: null, workflows: [] }).say, 'Which one: cancel my taxi in Northline Taxis or cancel my taxi in Cab Co?');
  assert.match(demoPlan('say hello', reg, { app: null, workflows: [] }).say, /^I can't do that one yet/, 'one shared word that is not its verb plans nothing');
});

test('for free: every Grocer and Taxi action, said as its describe, plans that action', () => {
  for (const app of [grocer, taxi]) for (const [name, x] of Object.entries(app.actions)) {
    if (x.gate === 'pay' && x.params?.required?.length) continue; // "book a taxi home": money with a slot keeps its hand-written words
    const said = asSaid(x.describe), got = demoPlan(said, reg, { app: null, workflows: [] }).plan;
    const asks = got[0]?.tool === 'open_app' && got[0].params.app === app.id && got[1]?.tool === 'ask'; // "add one item": which item?
    assert.ok(asks || got.some((s) => s.tool === `${app.id}__${name}`), `"${said}" -> ${JSON.stringify(got)}`);
  }
});

test('end to end: "get a price", "the station" quotes the taxi', async () => {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry(), port = browserKV({ storage: fakeStorage(), prefix: 't' });
  const roots = {};
  for (const app of apps) { registry.register(app); roots[app.id] = await mountApp(app, doc.body, { kv: appKv(app.id, port), bus, say: () => {}, confirm: async () => true }); await app.reset(); }
  const ctxFor = (app, hooks) => createCtx({ app, root: roots[app.id], kv: appKv(app.id, port), cursor: { async moveTo() {}, hide() {} }, ...hooks });
  const spoken = [];
  const agent = createAgent({ registry, bus, ctxFor, agency: () => 'just', planOpts: { offline: true }, speak: async (t) => { spoken.push(t); } });
  await agent.hear('get a price');
  assert.ok(spoken.includes('Where to: Home, Work, the Station or the Airport?'), spoken.join(' | '));
  await agent.hear('the station');
  assert.equal(registry.get("taxi").state().quote?.to, "the Station", spoken.join(" | "));
});

// build-calendar's blind probe: wrong plans pre-empt Gemini, so they go first.
test('a bare "start" or "do" is not a routine unless one has that name', () => {
  for (const u of ['start over', 'do I have anything this afternoon']) assert.match(tool(u), /^I can't do that one yet/, u);
  assert.notEqual(tool('start a new note').split('{')[0], 'run_workflow');
  assert.equal(tool('run my morning', null, { workflows: ['My morning'] }), 'run_workflow{"name":"my morning"}');
});
test('"add a dentist appointment on Friday at three" is a calendar add at 3pm', () => {
  assert.equal(tool('Add a dentist appointment on Friday at three'), 'calendar__add{"title":"Dentist appointment","day":"Friday","time":"3pm"}');
  assert.equal(tool('add coffee with Ana on Monday at 10am'), 'calendar__add{"title":"Coffee with Ana","day":"Monday","time":"10am"}');
});
test('"take me home" goes home', () => { for (const u of ['Take me home', 'go home', 'take me back home']) assert.equal(tool(u), 'go_home{}', u); });
test('"reply to that message" asks what to say, and the answer is the reply', () => {
  assert.equal(tool('Reply to that message'), 'ask{"question":"What should I say?"}');
  assert.equal(demoPlan('Reply to that message', reg, { app: null, workflows: [] }).asked, 'reply');
  assert.equal(tool("I'm on my way", 'messages', { asked: 'reply' }), 'messages__reply{"text":"I\'m on my way."}');
});
test('cheap hits: next appointment, read back, next one, again, the clock', () => {
  assert.equal(tool("What's my next appointment"), 'calendar__next{}');
  assert.equal(tool('read back what I wrote'), 'writer__readLastPage{}');
  assert.equal(tool('read the next one'), 'messages__read{"new":true}');
  assert.equal(tool('read my last message again'), 'messages__read{}');
  assert.match(tool('what time is it'), /^say\{"text":"It's \d{1,2}:\d\d\."\}$/);
  assert.match(tool('what day is it'), /^say\{"text":"It's (Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day \d{1,2} [A-Z][a-z]+\."\}$/);
});

test('build-plugin phrases: a placeholder asks, a place is not the words, recall is recall', () => {
  assert.equal(tool('take an item out'), 'open_app{"app":"grocer"} > ask{"question":"The item to take out?"}');
  assert.equal(tool('milk', 'grocer', { asked: 'take an item out' }), 'grocer__remove{"item":"milk"}');
  assert.equal(tool('write in the book', 'writer'), 'open_app{"app":"writer"} > ask{"question":"What should I write?"}');
  assert.equal(tool('Buy milk on Tuesday', 'writer', { asked: 'write' }), 'writer__dictate{"text":"Buy milk on Tuesday"}');
  assert.equal(tool('what Murmur knows about me'), 'recall{}');
});
test('"open a chapter" with Writer open asks for the number, and "two" opens it', () => {
  assert.match(tool('open a chapter', 'writer'), /^open_app\{"app":"writer"\} > ask/);
  assert.equal(tool('two', 'writer', { asked: 'open a chapter' }), 'writer__openChapter{"n":2}');
  assert.equal(tool('open chapter 3', 'writer'), 'writer__openChapter{"n":3}');
});

test('blind 60 regressions: no claim on a verb alone, another app\'s noun, or a guessed optional slot', () => {
  for (const open of [null, 'messages', 'writer', 'look', 'mine']) {
    for (const u of ['Delete that message', 'Delete the last word', 'Who is my latest message from', 'New paragraph']) {
      assert.match(tool(u, open), /^I can't do that one yet/, `${u} (${open})`);
    }
    assert.equal(tool('Use a dark background', open), 'look__colours{"colours":"dark"}', open);
  }
  assert.equal(tool('delete the morning tile'), 'mine__delete{"name":"morning"}', 'its own noun still plans it');
});
