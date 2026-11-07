import test from 'node:test';
import assert from 'node:assert/strict';
import { hear } from '../public/agent/words.js';
import { validatePlan, describeRegistry, toolsFor, cantLine } from '../public/agent/plan.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { stubShop } from './agent-fixtures.js';
import messages from '../public/apps/messages/index.js';
import calendar from '../public/apps/calendar/index.js';

const kinds = (t, o) => hear(t, o).words.map((w) => w.kind);

test('reserved words are the OS\'s, matched before anything else', () => {
  assert.deepEqual(kinds('stop'), ['stop']);
  assert.deepEqual(kinds('Stop. Where am I?'), ['stop', 'where']);
  assert.deepEqual(kinds('stop where am i'), ['stop', 'where']);
  assert.deepEqual(kinds('Undo that'), ['undo']);
  assert.deepEqual(kinds('carry on'), ['carry_on']);
  assert.deepEqual(kinds('again'), ['again']);
  assert.deepEqual(kinds("I'll do it"), ['take_over']);
  assert.deepEqual(kinds('I’ll do it.'), ['take_over']);
  assert.deepEqual(kinds('um, stop please'), ['stop']);
});

test('a reserved word inside content is content', () => {
  for (const t of ['tell Mum to stop worrying', 'stop worrying', 'send Mum I will carry on', 'again and again I said', 'where am I meeting Sam']) {
    const h = hear(t);
    assert.deepEqual(h.words, [], t);
    assert.equal(h.rest, t);
  }
  const h = hear('Stop, tell Mum I am okay now');
  assert.deepEqual(h.words.map((w) => w.kind), ['stop']);
  assert.equal(h.rest, 'tell Mum I am okay now');
});

test('confirm words: yes, send, pay, call only; never ok or mm; not in the first 0.5 s', () => {
  const gate = { gate: 'send', openedAt: 1000 };
  assert.deepEqual(hear('send', { gate, now: 2000 }).words, [{ kind: 'confirm', word: 'send' }]);
  assert.deepEqual(hear('yes', { gate, now: 2000 }).words, [{ kind: 'confirm', word: 'yes' }]);
  assert.deepEqual(hear('Yes, send it.', { gate, now: 2000 }).words[0], { kind: 'confirm', word: 'yes' });
  assert.deepEqual(hear('ok', { gate, now: 2000 }).words, []);
  assert.deepEqual(hear('mm', { gate, now: 2000 }).words, []);
  assert.deepEqual(hear('yes', { gate, now: 1400 }).words, [{ kind: 'ignored', reason: 'early' }]);
  assert.deepEqual(hear('pay', { gate, now: 2000 }).words, [{ kind: 'ignored', reason: 'wrong-word' }]);
  assert.deepEqual(hear('pay', { gate: { gate: 'pay', openedAt: 0 }, now: 900 }).words, [{ kind: 'confirm', word: 'pay' }]);
  assert.deepEqual(kinds('no', { gate, now: 2000 }), ['deny']);
  assert.deepEqual(kinds('stop', { gate, now: 2000 }), ['stop']);
  // With no gate open, a confirm word is content: "send" plans a send, which opens its own gate.
  assert.deepEqual(hear('send').words, []);
  assert.deepEqual(hear('yes').words, []);
});

const apps = describeRegistry([messages, stubShop(), calendar]);

test('the tool list is generated from the registry, gates marked', () => {
  const tools = toolsFor(apps);
  const names = tools.map((t) => t.name);
  assert.ok(names.includes('messages__openChat') && names.includes('shop__pay') && names.includes('open_app'));
  assert.ok(!names.some((n) => /delete|bank/.test(n)));
  const send = tools.find((t) => t.name === 'messages__send');
  assert.match(send.description, /asks the person first: send/);
  assert.equal(tools.find((t) => t.name === 'messages__reply').parameters.properties.text.type, 'STRING');
});

test('plans are validated: unknown tools and params dropped, and said in the app\'s words', () => {
  const { steps, dropped } = validatePlan([
    { tool: 'messages__openChat', params: { who: 'Sam', colour: 'red' } },
    { tool: 'messages__delete', params: {} },
    { tool: 'bank__transfer', params: { amount: 100 } },
    { tool: 'messages__reply', params: { text: 42 } },
    { tool: 'messages__send' },
  ], apps);
  assert.deepEqual(steps.map((s) => s.tool), ['messages__openChat', 'messages__send']);
  assert.deepEqual(steps[0].params, { who: 'Sam' });
  assert.equal(steps[1].gate, 'send');
  assert.deepEqual(dropped.map((d) => d.reason), ['dropped params colour', 'unknown action', 'unknown app', 'missing text']);
  assert.equal(dropped[1].say, "I can't do that in Messages. I can open the chat with a person, read the new message in the open chat, or write a reply in the open chat.");
  assert.equal(cantLine(apps[0]), dropped[1].say);
  assert.equal(dropped[2].say, "That app isn't here yet. I'm starting to bring it over from your phone now.");
});

const run = (t, ctx) => { const p = demoPlan(t, apps, ctx); return { ...p, ...validatePlan(p.plan, apps, { dryRun: p.kind === 'teach' }) }; };
const tools = (t, ctx) => run(t, ctx).steps.map((s) => `${s.tool}${Object.keys(s.params).length ? ' ' + JSON.stringify(s.params) : ''}`);

test('demo provider: Vertical 1 and its variants', () => {
  const want = ['messages__openChat {"who":"Sam"}', 'messages__reply {"text":"I\'m ten minutes late."}', 'messages__send'];
  assert.deepEqual(tools("Text Sam I'm ten minutes late"), want);
  assert.deepEqual(tools("text sam i'm ten minutes late."), ['messages__openChat {"who":"Sam"}', 'messages__reply {"text":"I\'m ten minutes late."}', 'messages__send']);
  assert.deepEqual(tools("Message Sam I'm ten minutes late"), want);
  assert.deepEqual(tools("Tell Sam that I'm ten minutes late"), want);
  assert.deepEqual(tools("Send Sam a message saying I'm ten minutes late"), want);
  assert.deepEqual(tools("Send a message to Sam saying I'm ten minutes late"), want);
  assert.deepEqual(tools('tell Mum to stop worrying'), ['messages__openChat {"who":"Mum"}', 'messages__reply {"text":"Stop worrying."}', 'messages__send']);
});

test('demo provider: the §6 demo script', () => {
  assert.deepEqual(tools("Read Mum's message"), ['messages__openChat {"who":"Mum"}', 'messages__read']);
  assert.deepEqual(tools('What did Mum say?'), ['messages__openChat {"who":"Mum"}', 'messages__read']);
  assert.deepEqual(tools("Reply: Tuesday's fine."), ['messages__reply {"text":"Tuesday\'s fine."}']);
  assert.deepEqual(tools('Change Tuesday to Wednesday', { app: 'messages' }), ['messages__replace {"from":"Tuesday","to":"Wednesday"}']);
  assert.deepEqual(tools('Send it.', { app: 'messages' }), ['messages__send']);
  assert.deepEqual(tools('Save that as Reply to Mum'), ['save_workflow {"name":"Reply to Mum","slot":false}']);
  assert.deepEqual(tools('save that as message someone'), ['save_workflow {"name":"Message someone","slot":true}']);
  assert.deepEqual(tools('Move lunch with Mum to Wednesday'), ['calendar__move {"event":"lunch with Mum","day":"Wednesday"}']);
  assert.deepEqual(tools('Do it: move lunch with Mum to Wednesday.'), ['calendar__move {"event":"lunch with Mum","day":"Wednesday"}']);
  assert.deepEqual(tools('Order my usual'), ['shop__orderUsual', 'shop__pay']);
  assert.deepEqual(tools('order my usual coffee'), ['shop__orderUsual', 'shop__pay']);
  const teach = run('How do I move a meeting?');
  assert.equal(teach.kind, 'teach');
  assert.deepEqual(teach.steps.map((s) => s.tool), ['calendar__move']);
  assert.deepEqual(tools('run my morning', { workflows: ['My morning'] }), ['run_workflow {"name":"my morning"}']);
  assert.deepEqual(tools("What's in my morning?"), ['explain {"name":"my morning"}']);
  assert.deepEqual(tools('Change my morning: drop the weather'), ['edit_workflow {"name":"my morning","drop":"weather"}']);
  assert.deepEqual(tools('open messages'), ['open_app {"app":"messages"}']);
});

test('demo provider: refusals and the unknown are said, never planned', () => {
  for (const t of ['check my bank balance', 'transfer money to Sam', 'book a doctor', 'renew my passport']) {
    const r = run(t);
    assert.equal(r.kind, 'refuse', t);
    assert.equal(r.steps.length, 0);
  }
  const u = run('what is the meaning of life');
  assert.equal(u.kind, 'unknown');
  assert.ok(u.say.length > 5);
  assert.equal(run('').say, 'Sorry, again?');
  assert.match(run('open the bank').say, /^I don't do banking/);
  assert.equal(run('open the camera').say, "I don't have Camera yet. I'm starting to bring it over from your phone now.");
  // An app missing from this phone is dropped by the validator, in words.
  assert.equal(run('next bus').dropped[0].say, "That app isn't here yet. I'm starting to bring it over from your phone now.");
});
