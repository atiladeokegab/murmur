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

test('Grocer plans from its own words when open, over the built-in Shop; Taxi whichever app is open', () => {
  assert.equal(tool('read my basket', 'grocer'), 'grocer__basket{}');
  assert.equal(tool('add milk', 'grocer'), 'grocer__add{"item":"milk"}');
  assert.equal(tool('take out milk', 'grocer'), 'grocer__remove{"item":"milk"}');
  assert.equal(tool('order my usual', 'grocer'), 'grocer__order{}');
  assert.match(tool('add milk', null), /^shop__addToBasket/, 'nothing open: the built-in Shop');
  for (const open of [null, 'grocer', 'taxi', 'messages', 'writer']) {
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

test('the open app wins a tie; still tied, the first app that fits does it, never "Which one?"', () => {
  const two = describeRegistry([taxi, { ...taxi, id: 'cabco', name: 'Cab Co' }]);
  assert.equal(demoPlan('cancel it', two, { app: 'cabco', workflows: [] }).plan[0].tool, 'cabco__cancel');
  assert.equal(demoPlan('cancel it', two, { app: null, workflows: [] }).plan[0].tool, 'taxi__cancel', 'never asks which app');
  assert.match(demoPlan('say hello', reg, { app: null, workflows: [] }).say, /^I can't do that one yet/, 'one shared word that is not its verb plans nothing');
});

test('for free: every Grocer and Taxi action, said as its describe, plans that action', () => {
  for (const app of [grocer, taxi]) for (const [name, x] of Object.entries(app.actions)) {
    if (x.gate === 'pay' && x.params?.required?.length) continue; // "book a taxi home": money with a slot keeps its hand-written words
    const said = asSaid(x.describe), got = demoPlan(said, reg, { app: app.id, workflows: [] }).plan; // the plug-in open: Shop is built in now
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
  assert.equal(tool('start over'), 'stop{}', 'start over stops, never a routine');
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
  assert.match(tool('what time is it'), /^clock__time\{\}$|^say\{"text":"It's \d{1,2}:\d\d\."\}$/, 'the Clock app when it is installed');
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
    for (const u of ['Delete that message', 'Delete the last word', 'New paragraph']) {
      assert.match(tool(u, open), /^I can't do that one yet/, `${u} (${open})`);
    }
    assert.equal(tool('Use a dark background', open), 'look__colours{"colours":"dark"}', open);
  }
  assert.equal(tool('delete the morning tile'), 'mine__delete{"name":"morning"}', 'its own noun still plans it');
});

test('blind 60 misses, round 2: remind, this afternoon, a new note, a lot bigger, hello, who wrote', () => {
  assert.equal(tool('Remind me to take my medicine at eight tonight'), 'calendar__add{"title":"Take my medicine","day":"Today","time":"8pm"}');
  assert.equal(tool('Do I have anything this afternoon'), 'calendar__whatsOn{"day":"Today"}');
  for (const u of ['I want to write something', 'Start a new note']) assert.equal(tool(u), 'open_app{"app":"writer"} > ask{"question":"What should I write?"}', u);
  assert.equal(tool('Buy milk', 'writer', { asked: 'write' }), 'writer__dictate{"text":"Buy milk"}');
  assert.equal(tool('Make it a lot bigger'), 'look__textBigger{}');
  for (const u of ['Hello', 'Hi, is anyone there', "I can't see the screen, how do I start"]) assert.match(tool(u), /^say\{"text":"Hello, I'm Murmur\./, u);
  assert.equal(tool('Who is my latest message from'), 'messages__read{"new":true}');
});

test('"Call Mum" opens her chat on the real phone, whose Phone app is settings; an app with a call action plans the call', async () => {
  const { createPhone } = await import('../public/os/phone.js');
  const phoneApp = createPhone({ stop() {}, where() {}, noLook() {}, isNoLook: () => false, sound() {}, isSound: () => true });
  const real = describeRegistry([...apps, phoneApp]);
  const p = demoPlan('Call Mum', real, { app: null, workflows: [] });
  assert.deepEqual(p.plan.map((s) => s.tool), ['messages__openChat', 'say'], JSON.stringify(p));
  assert.equal(p.plan[1].params.text, "I can't call yet. I've opened Mum's chat.");
  // the Calls app's shape (calls branch d8623fc): call {who} and callBack, beside the Phone settings app
  const act = (describe, properties = {}, required) => ({ describe, doing: describe, hint: describe, params: { type: 'object', properties, ...(required ? { required } : {}) }, async run() {}, verify: () => true });
  const calls = { id: 'calls', name: 'Calls', async mount() {}, read: () => '', place: () => ({}), state: () => ({}), async seed() {}, async reset() {}, actions: { call: act('Call a person', { who: { type: 'string' } }, ['who']), missed: act('Read missed calls'), hangUp: act('Hang up'), callBack: act('Call back', { who: { type: 'string' } }) } };
  const registry = createRegistry(); for (const a of [phoneApp, calls]) registry.register(a);
  for (const said of ['Call Mum', 'Ring Mum', 'Call Sam']) {
    const steps = demoPlan(said, describeRegistry([...apps, phoneApp, calls]), { app: null, workflows: [] }).plan;
    assert.deepEqual(steps.map((s) => s.tool), ['calls__call'], said);
    assert.equal(registry.resolve(steps[0].tool)?.app?.id, 'calls', `${said}: the step resolves to the installed app`);
    assert.equal(steps[0].params.who, said.split(' ')[1]);
  }
});

test('speed: "speak at N percent" and "N times faster" set the nearest voice step, up to 500 percent; the cloud voice only up to 125', async () => {
  const { STEPS } = await import('../public/apps/look/index.js');
  const { cloudAt } = await import('../public/voice/tts-cache.js');
  assert.deepEqual(STEPS.rate.values, [0.75, 1, 1.15, 1.25, 1.5, 2, 2.5, 3, 4, 5]);
  assert.equal(STEPS.rate.words(1), 'normal speed');
  assert.equal(STEPS.rate.words(2.5), '250 percent');
  for (const [said, percent] of [['Speak at 300 percent', 300], ['voice to 250%', 250], ['three times faster', 300], ['speak 5 times faster', 500],
    ['set the voice to 180 percent', 200], ['twice as fast', 200]]) assert.equal(tool(said), `look__setVoice{"percent":${percent}}`, said);
  assert.equal(tool('speak faster'), 'look__voiceFaster{}');
  assert.match(tool('text Sam three times faster'), /^messages__openChat/, 'content is never a setting');
  assert.deepEqual([0.75, 1, 1.15, 1.25, 1.5, 5].map(cloudAt), [true, true, true, true, false, false]);
});

test('the lead 15:50: "what can I do" is everything, "who am I" describes the person, friends get a warm answer', async () => {
  const said = (s) => demoPlan(s, reg, { app: null, workflows: [] }).plan.map((x) => x.params.text).join(' ');
  for (const s of ['what can you do', 'What can I do for me']) assert.equal(said(s), 'Everything. Just tell me what you need.', s);
  const who = said('Who am I?');
  assert.match(who, /Mum and Sam/); assert.match(who, /book club/i);
  assert.doesNotMatch(who, /you (?:asked|did|moved|sent)|I (?:did|moved|sent)/i, 'about the person, never what Murmur did');
  for (const s of ['How can I find friends?', 'how can I make friends', 'how do I meet new friends']) {
    const a = said(s); assert.match(a, /Book club/, s); assert.doesNotMatch(a, /can'?t/i, s);
  }
  const spoken = [];
  const agent = createAgent({ registry: createRegistry(), bus: createBus(), ctxFor: () => ({}), planOpts: { offline: true }, speak: async (t) => { spoken.push(t); } });
  await agent.hear('What can I do?');
  assert.deepEqual(spoken, ['Everything. Just tell me what you need.'], 'the reserved word too, never a list');
});
