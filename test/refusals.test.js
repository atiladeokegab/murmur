// The pre-review's bypasses (T-1046): each case went through before its fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hear } from '../public/agent/words.js';
import { demoPlan } from '../public/agent/demo-plan.js';

const app = (id, name, acts) => ({ id, name, actions: acts.map(([n, props]) => ({ name: n, params: { type: 'object', properties: props } })) });
const S = { type: 'string' }, N = { type: 'number' };
const apps = [app('messages', 'Messages', [['openChat', { who: S }], ['reply', { text: S }], ['send', {}], ['read', {}]]),
  app('writer', 'Writer', [['dictate', { text: S }]]), app('bank', 'Bank', [['balance', {}], ['payPerson', { who: S, amount: N }]]),
  app('travel', 'Travel', [['hold', { flight: S }]])];
const kind = (u) => demoPlan(u, apps).kind;
const refused = (list) => { for (const u of list) assert.equal(kind(u), 'refuse', u); };
const sent = (list) => { for (const u of list) assert.equal(demoPlan(u, apps).plan.at(-1)?.tool, 'messages__send', u); };

test('credentials written as digits never go, in a message or a note', () => {
  refused(['Text Sam 20-00-00 41234567', 'Text Mum my card is 4111 1111 1111 1111', 'Text Mum my card is 4111-1111-1111-1111',
    'Text Sam my IBAN is GB29NWBK60161331926819', 'Tell Sam: GB29 NWBK 6016 1331 9268 19', 'Text Sam 41234567', 'Note 20-00-00']);
  sent(["Text Sam I'm ten minutes late", 'Text Sam see you at 10:30', 'Text Mum call me on 07700 900123',
    'Text Sam the party is on 07-11-26', 'Text Sam: the date 07-11-26 works', 'Tell Mum the 07-11-26 is fine']);
});

test('money verbs are refused before any provider; the phone Bank keeps its own words', () => {
  refused(['Wire 200 pounds to John', 'Transfer £50 to Sam', 'Send £200 to my landlord', 'Pay Sam 50 euros', 'Log into my bank', 'My IBAN is GB29NWBK60161331926819',
    'Move £20 to Sam', 'Move £50 to my ISA']);
  for (const u of ['Pay Sam 20 pounds', 'Pay Sam twenty pounds', 'Send Sam £20']) assert.equal(demoPlan(u, apps).plan[0]?.tool, 'bank__payPerson', u);
  assert.equal(demoPlan('Pay Sam 20 pounds', apps.filter((a) => a.id !== 'bank')).kind, 'refuse');
  sent(["Text Sam I'll pay you 20 pounds"]);
});

test('the natural stops are stop; "hold on" never holds a flight; a stop inside a message is content', () => {
  for (const u of ['No, stop!', 'No no stop', 'No, no, stop.', 'Just stop', 'Oh stop', 'Pause', 'Silence', 'Enough already', 'Stop the reading', 'Hold on'])
    assert.deepEqual(hear(u).words, [{ kind: 'stop' }], u);
  assert.deepEqual(hear('Hold on', { gate: { gate: 'pay', openedAt: 0, readback: 'held for 24 hours' }, now: 9999 }).words, [{ kind: 'stop' }]);
  assert.notEqual(demoPlan('Hold on', apps).plan[0]?.tool, 'travel__hold');
  for (const u of ['Tell Sam stop by later', 'Text Mum shut up I love you']) assert.deepEqual(hear(u).words, [], u);
  sent(['Tell Sam stop by later']);
});

test('a second request rides behind a message across a colon, a full stop and "and"', () => {
  refused(['Tell Sam: hi. Then check my Barclays balance', 'Text Sam: hi, and check my Barclays balance',
    'Text Sam hi and move £100 from my Barclays', 'Text Sam hi, then wire 200 pounds to John', 'Text Sam: see you. Also log into Barclays']);
  sent(['Tell Sam: I switched from Monzo', 'Tell Sam: Mum and I switched from Monzo', 'Tell Sam: I moved to Monzo, then went home',
    'Tell Sam: Pay £20 tomorrow.', 'Text Sam: Transfer £20 tomorrow.', 'Text Mum: Tell me about my cancer.']);
});

test('a symptom or a diagnosis is never stored', () => {
  refused(['Note that I have diabetes', 'Write down: my blood pressure is high', 'Remember I have asthma', 'Note my symptoms: fever and cough',
    'Write down: I take 50 mg of sertraline', 'Note my condition is getting worse', 'Note I was diagnosed today', 'Remember my medication']);
  for (const u of ['Note Sam is a pain in the neck', "Write down: I'm sick of the rain"]) assert.notEqual(kind(u), 'refuse', u);
  sent(['Text Mum I have a cough', 'Text Mum: my symptoms are better']);
});
