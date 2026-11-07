import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus, createRegistry, createCtx, controlName, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import bank from '../public/apps/bank/index.js';
import * as M from '../public/apps/bank/model.js';
import appIds from '../public/apps/apps.js';
import { createRunner, createGates } from '../public/agent/runner.js';
import { attachMemory, observationOf } from '../public/agent/memory.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

const example = JSON.parse(readFileSync(new URL('../public/apps/bank/state.example.json', import.meta.url)));
const source = readFileSync(new URL('../public/apps/bank/index.js', import.meta.url), 'utf8') + readFileSync(new URL('../public/apps/bank/model.js', import.meta.url), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));

// One phone with only Bank on it. answers: the runner's ask-first sheet; hand: os.confirm for a person's own tap.
// Like the shell (public/os/shell.js), os.confirm answers yes at once while the agent's ctx.tap is pressing.
async function phone({ answers = [], hand = [], picks = [], saved = null, approach = null, sheet = null } = {}) {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(bank);
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const real = appKv('bank', port);
  let broken = false; // breakSave(): every later save rejects, as a full quota does
  const kv = { ...real, set: async (k, v) => { if (broken) throw new Error('QuotaExceededError'); return real.set(k, v); } };
  const asked = [], taps = [], spoken = [];
  let agentPress = false;
  const confirm = async ({ gate, readback }) => {
    if (agentPress) return true;
    asked.push({ gate, readback, byHand: true });
    await sheet?.(root); // what happens on the screen while the sheet is open
    return hand.shift() ?? false;
  };
  if (saved) await kv.set('state', saved);
  const root = await mountApp(bank, doc.body, { kv, bus, confirm, say: async (t) => { spoken.push(t); } });
  if (!saved) await bank.reset();
  const ask = async ({ gate, readback }) => { asked.push({ gate, readback }); return answers.shift() ?? false; };
  const choose = async ({ choices }) => { const i = choices.indexOf(picks.shift()); return i < 0 ? null : i; };
  const ctxFor = (app) => {
    const ctx = createCtx({ app, root, bus, kv, cursor: { async moveTo(el, n) { taps.push(n); await approach?.(el, root); }, hide() {} }, ask, choose, signal: new AbortController().signal });
    const tap = ctx.tap;
    ctx.tap = async (...a) => { agentPress = true; try { await tap(...a); } finally { agentPress = false; } };
    return ctx;
  };
  const run = (name, params = {}) => runAction({ registry, name: `bank__${name}`, params, bus, ctxFor });
  // As the agent's runner does (public/agent/runner.js): a gated action's resolve first, then runAction; null is "Not paid."
  const runResolved = async (name, params) => {
    const p = await bank.actions[name].resolve(params, ctxFor(bank));
    return p ? run(name, p) : { ok: false, cancelled: true, reason: 'Not paid.' };
  };
  const said = () => bus.log.filter((e) => e.name === 'say').map((e) => e.payload?.text ?? e.text);
  const button = (text) => [...root.all()].find((n) => n.tagName === 'BUTTON' && controlName(n).startsWith(text));
  const press = async (text) => { const b = button(text); assert.ok(b, `no button "${text}"`); b.click(); await tick(); await tick(); };
  return { breakSave: () => { broken = true; }, stored: () => real.get('state'), root, bus, run, runResolved, said, asked, taps, spoken, ctxFor, port, button, press, s: () => bank.state() };
}

test('bank: on the board, seeded state is exactly state.example.json, field names pinned', async () => {
  assert.ok(appIds.includes('bank'));
  const { s } = await phone();
  assert.deepEqual(s(), example);
  assert.deepEqual(Object.keys(s()).sort(), ['balance', 'cardFrozen', 'draft', 'lastPaid', 'payees', 'screen', 'transactions']);
  assert.deepEqual(s().payees.map((p) => p.name), ['Mum', 'Sam', 'Landlord']);
  assert.equal(s().balance, 124050);
});

test('bank: the contract shape; only pay and split are gated, both with a readback', () => {
  for (const [k, a] of Object.entries(bank.actions)) {
    assert.ok(a.describe && a.doing && a.hint && a.params?.type === 'object' && a.run && a.verify, k);
    assert.ok(a.doing.split(' ').length >= 1 && a.doing.split(' ').length <= 5, k);
  }
  assert.deepEqual(Object.entries(bank.actions).filter(([, a]) => a.gate).map(([k, a]) => [k, a.gate]), [['payPerson', 'pay'], ['splitBill', 'pay']]);
  assert.equal(bank.actions.freezeCard.gate, null);
  assert.ok(!bank.actions.payPerson.undo && !bank.actions.splitBill.undo, 'gated actions have no undo (contract §8)');
  assert.equal(bank.actions.freezeCard.readback(), 'Freezing your card ending 4821.');
});

test('money is spoken naturally', () => {
  assert.equal(M.spoken(2000), 'twenty pounds');
  assert.equal(M.spoken(124050), 'one thousand, two hundred and forty pounds and fifty pence');
  assert.equal(M.spoken(100), 'one pound');
  assert.equal(M.spoken(5), 'five pence');
  assert.equal(M.spoken(-85000), 'eight hundred and fifty pounds');
  assert.equal(M.spoken(100500), 'one thousand and five pounds');
  assert.equal(M.shown(124050), '£1,240.50');
  assert.equal(M.shown(2000), '£20');
  assert.equal(M.toPence('12.5'), 1250);
  assert.equal(M.toPence('£20'), 2000);
  assert.equal(M.toPence('abc'), null);
  assert.equal(M.toPence('0'), null);
  assert.deepEqual(M.shares(6101, 2), [3051, 3050]);
});

test('balance and recent: press the real buttons and say it in words', async () => {
  const { run, said, taps, s } = await phone();
  assert.equal((await run('balance')).ok, true);
  assert.equal(s().screen, 'balance');
  assert.ok(said().includes('Your balance is one thousand, two hundred and forty pounds and fifty pence.'));
  const rr = await run('recent'); assert.equal(rr.ok, true, rr.reason);
  assert.deepEqual(said().slice(-3), [
    'Today, you paid Corner Café three pounds and eighty-five pence.',
    'Today, Sam paid you fifteen pounds for Pizza.',
    'Yesterday, you paid Green Street Grocer twelve pounds and forty pence.',
  ]);
  assert.deepEqual(taps, ['Hear your balance', 'Back to your account', 'Recent payments']);
  assert.match(bank.read(), /^Recent payments\. Today, you paid Corner Café/);
});

test('pay Sam £20: the gate reads "Pay Sam £20. From Murmur Bank." and the money moves once', async () => {
  const { run, asked, taps, s, bus } = await phone({ answers: [true] });
  const r = await run('payPerson', { who: 'Sam', amount: 20, note: 'Lunch' });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(asked, [{ gate: 'pay', readback: 'Pay Sam £20. From Murmur Bank.' }]);
  assert.equal(s().balance, 124050 - 2000);
  assert.deepEqual(s().lastPaid, { to: ['sam'], pence: [2000], total: 2000, tx: ['t5'], cancelled: false });
  assert.equal(s().transactions.at(-1).note, 'Lunch');
  assert.deepEqual(taps, ['Pay someone', 'Sam', 'Amount in pounds', 'What it is for, if you like', 'Pay Sam £20']);
  assert.equal(bank.read(), 'Paid Sam twenty pounds. Your balance is one thousand, two hundred and twenty pounds and fifty pence.');
  assert.equal(bus.log.filter((e) => e.name === 'confirm').length, 1);
});

test('a No on pay moves no money', async () => {
  const { run, s } = await phone({ answers: [false] });
  const before = s();
  const r = await run('payPerson', { who: 'Mum', amount: 20 });
  assert.equal(r.ok, false); assert.equal(r.cancelled, true); assert.equal(r.reason, 'Not paid.');
  assert.equal(s().balance, before.balance);
  assert.deepEqual(s().transactions, before.transactions);
  assert.equal(s().lastPaid, null);
});

test('Sam is one payee now; two matching names still ask, and the early readback names both', () => {
  const s = M.fresh();
  assert.deepEqual(M.resolve(s, 'Sam'), { id: 'sam' });
  assert.match(M.resolve(s, 'Bob').none, /Bob isn't one of your payees/);
  s.payees.push({ id: 'samira', name: 'Samira' });
  const r = M.resolve(s, 'Sam');
  assert.equal(r.ask.question, 'Sam or Samira?');
  assert.deepEqual(r.ask.choices.map((c) => c.id), ['sam', 'samira']);
  assert.equal(M.readbackFor(s, ['Sam'], 2000), 'Pay Sam or Samira £20. From Murmur Bank.');
});

const withSamira = () => { const st = M.fresh(); st.payees.splice(2, 0, { id: 'samira', name: 'Samira' }); return st; };
const questions = (bus) => bus.log.filter((e) => e.name === 'ask').map((e) => e.payload?.question ?? e.question);

test('resolve before the gate: "Sam" with a Samira asks once, then one confirm reads the exact name', async () => {
  const { runResolved, asked, bus, s } = await phone({ saved: withSamira(), answers: [true], picks: ['Samira'] });
  const r = await runResolved('payPerson', { who: 'Sam', amount: 20 });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(questions(bus), ['Sam or Samira?']);
  assert.deepEqual(asked.map((a) => a.readback), ['Pay Samira £20. From Murmur Bank.'], 'one confirm, no second ask inside run');
  assert.deepEqual(s().lastPaid.to, ['samira']);
  assert.equal(s().balance, 124050 - 2000);
});

test('resolve: no one chosen cancels before any confirm; an exact or unknown name asks nothing', async () => {
  const none = await phone({ saved: withSamira(), answers: [true], picks: [] });
  assert.deepEqual(await none.runResolved('payPerson', { who: 'Sam', amount: 20 }), { ok: false, cancelled: true, reason: 'Not paid.' });
  assert.equal(none.asked.length, 0);
  assert.equal(none.s().balance, 124050);

  const seeded = await phone();
  const x = bank.actions.payPerson;
  assert.deepEqual(await x.resolve({ who: 'Sam', amount: 20 }, seeded.ctxFor(bank)), { who: 'Sam', amount: 20, id: 'sam' });
  assert.deepEqual(await x.resolve({ who: 'Bob', amount: 20 }, seeded.ctxFor(bank)), { who: 'Bob', amount: 20 }, 'run then fails in words');
  assert.equal(questions(seeded.bus).length, 0);
});

test('resolve for a split: each ambiguous name asked once, one confirm with every share', async () => {
  const { runResolved, asked, s } = await phone({ saved: withSamira(), answers: [true], picks: ['Sam'] });
  const r = await runResolved('splitBill', { who: ['Sam', 'Mum'], total: 30 });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(asked.map((a) => a.readback), ['Pay Sam £15 and Mum £15. From Murmur Bank.']);
  assert.deepEqual(s().lastPaid.to, ['sam', 'mum']);
});

test('a stale hand selection never leaks in: the agent pays exactly what it read back (Atlas P1)', async () => {
  const split = await phone({ answers: [true] });
  await split.press('Split a bill');
  await split.press('Mum');
  const r = await split.run('splitBill', { who: ['Landlord'], total: 100 });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(split.asked.map((a) => a.readback), ['Pay Landlord £100. From Murmur Bank.']);
  assert.deepEqual(split.s().lastPaid.to, ['landlord']);
  assert.deepEqual(split.s().lastPaid.pence, [10000]);
  assert.equal(split.s().balance, 124050 - 10000);

  const pay = await phone({ answers: [true] });
  await pay.press('Pay someone');
  await pay.press('Landlord');
  const note = pay.root.querySelector('#bank-note');
  note.value = 'Old note'; note.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal((await pay.run('payPerson', { who: 'Mum', amount: 5 })).ok, true);
  assert.deepEqual(pay.s().lastPaid.to, ['mum']);
  assert.equal(pay.s().transactions.at(-1).note, '', 'no stale note');
});

test('Pay is pressed only when the form moves exactly the readback: "Mum and Mum" stops before any money moves', async () => {
  const { run, asked, s, taps } = await phone({ answers: [true] });
  const r = await run('splitBill', { who: ['Mum', 'Mum'], total: 100 });
  assert.deepEqual(asked.map((a) => a.readback), ['Pay Mum £50 and Mum £50. From Murmur Bank.']);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "That isn't what you agreed to, so nothing was paid.");
  assert.equal(s().balance, 124050);
  assert.equal(s().lastPaid, null);
  assert.ok(!taps.some((x) => /^Pay Mum/.test(x)), 'Pay never pressed');
});

test('Prometheus (a): Mum picked by hand, then split £60 between Sam and Landlord pays exactly £30 and £30', async () => {
  const { press, run, asked, s } = await phone({ answers: [true] });
  await press('Split a bill');
  await press('Mum');
  const r = await run('splitBill', { who: ['Sam', 'Landlord'], total: 60 });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(asked.map((a) => a.readback), ['Pay Sam £30 and Landlord £30. From Murmur Bank.']);
  assert.deepEqual(s().lastPaid.to, ['sam', 'landlord']);
  assert.deepEqual(s().lastPaid.pence, [3000, 3000]);
  assert.equal(s().balance, 124050 - 6000);
});

test('Prometheus (b): a duplicate Sam fails before any money moves', async () => {
  const { run, s, taps } = await phone({ answers: [true] });
  const r = await run('splitBill', { who: ['Sam', 'Sam'], total: 60 });
  assert.equal(r.ok, false);
  assert.equal(s().balance, 124050);
  assert.equal(s().transactions.length, 4);
  assert.ok(!taps.some((x) => /^Pay Sam/.test(x)), 'Pay never pressed');
});

test('Prometheus (c): a failed save pays nothing, in memory or on disk, and says so', async () => {
  const p = await phone({ answers: [true] });
  p.breakSave();
  const r = await p.run('payPerson', { who: 'Mum', amount: 20 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "I couldn't save it, so nothing was paid.");
  assert.equal(p.s().balance, 124050);
  assert.equal(p.s().lastPaid, null);
  assert.equal(p.s().transactions.length, 4);
  assert.equal((await p.stored()).balance, 124050);

  const f = await phone();
  f.breakSave();
  const rf = await f.run('freezeCard');
  assert.equal(rf.ok, false);
  assert.equal(rf.reason, "I couldn't save it, so your card didn't change.");
  assert.equal(f.s().cardFrozen, false);
});

test('Prometheus (d): a task that touches Bank is finance and is never logged, mixed tasks too', async () => {
  assert.equal(observationOf({ apps: ['bank'], actions: ['bank__payPerson'] }).category, 'finance');
  const task = async (apps) => {
    const bus = createBus(), logged = [];
    attachMemory({ librarian: { logObservation: async (o) => { logged.push(o); return { logged: true }; } }, bus });
    bus.emit('task:start', { task: 't1', utterance: '', plan: [] });
    apps.forEach((app, i) => bus.emit('step:verified', { task: 't1', action: `${app}__x`, app, n: i + 1, of: apps.length, ms: 1 }));
    bus.emit('task:done', { task: 't1', ms: 1, ok: true });
    await tick(); await tick();
    return logged.length;
  };
  assert.equal(await task(['messages']), 1, 'the probe can see a log');
  assert.equal(await task(['bank']), 0);
  assert.equal(await task(['messages', 'bank']), 0);
  assert.equal(await task(['bank', 'messages']), 0);
});

test('Prometheus (e): a hand tap pays only on a literal true from os.confirm', async () => {
  for (const answer of [{ result: false }, 'yes', 1]) {
    const { press, root, s } = await phone({ hand: [answer] });
    await press('Pay someone'); await press('Mum');
    const amount = root.querySelector('#bank-amount');
    amount.value = '20'; amount.dispatchEvent(new Event('input', { bubbles: true }));
    await press('Pay Mum £20');
    assert.equal(s().balance, 124050, JSON.stringify(answer));
  }
});

test('split £61.01 between Mum and Landlord: one gate, odd penny to the first', async () => {
  const { run, asked, s } = await phone({ answers: [true] });
  const r = await run('splitBill', { who: ['Mum', 'Landlord'], total: 61.01 });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(asked.map((a) => a.readback), ['Pay Mum £30.51 and Landlord £30.50. From Murmur Bank.']);
  assert.equal(s().balance, 124050 - 6101);
  assert.deepEqual(s().lastPaid.pence, [3051, 3050]);
  assert.equal(bank.read().split('.')[0], 'Paid Mum thirty pounds and fifty-one pence and Landlord thirty pounds and fifty pence');
});

test('more than the balance fails in words and moves nothing', async () => {
  const { run, s } = await phone({ answers: [true] });
  const r = await run('payPerson', { who: 'Landlord', amount: 5000 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /more than your balance of one thousand, two hundred and forty pounds and fifty pence/);
  assert.equal(s().balance, 124050);
});

test('cancel within 8 s: the Cancel button gives the money back; after 8 s it is gone', async () => {
  const { run, press, s } = await phone({ answers: [true] });
  await run('payPerson', { who: 'Mum', amount: 20 });
  await press('Cancel this payment');
  assert.equal(s().balance, 124050);
  assert.equal(s().lastPaid.cancelled, true);
  assert.equal(bank.read().split('. ')[0], 'Cancelled');
  assert.equal(M.recent(s()).some((t) => t.cancelled), false, 'a cancelled payment is not read as recent');

  const st = M.fresh();
  st.draft = { mode: 'pay', to: ['mum'], amount: '5', note: '' };
  assert.equal(M.pay(st, 1000), '');
  assert.equal(M.cancel(st, 1000 + M.CANCEL_MS + 1), false, 'too late');
  assert.equal(st.balance, 124050 - 500);
  assert.equal(M.cancel(st, 1000 + M.CANCEL_MS - 1), true);
  assert.equal(st.balance, 124050);
});

const retype = (input, v) => { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); };

test('Prometheus: yes to "Pay Sam £20", then the amount becomes 30 while the cursor travels to Pay: nothing moves', async () => {
  let changed = false;
  const approach = (el, root) => { if (el.id === 'bank-pay' && !changed) { changed = true; retype(root.querySelector('#bank-amount'), '30'); } };
  const { run, s, stored } = await phone({ answers: [true], approach });
  const r = await run('payPerson', { who: 'Sam', amount: 20 });
  assert.ok(changed, 'the form really changed mid-approach');
  assert.equal(r.ok, false);
  assert.equal(r.reason, "That isn't what you agreed to, so nothing was paid.");
  assert.equal(s().balance, 124050); assert.equal(s().lastPaid, null);
  assert.equal((await stored()).balance, 124050);
});

test('by hand: a form changed while the sheet is open pays nothing; the result is said on the shell line', async () => {
  const sheet = (root) => retype(root.querySelector('#bank-amount'), '200');
  const { press, s, root, spoken, asked } = await phone({ hand: [true], sheet });
  await press('Pay someone'); await press('Mum');
  retype(root.querySelector('#bank-amount'), '20');
  await press('Pay Mum £20');
  assert.equal(asked[0].readback, 'Pay Mum £20. From Murmur Bank.');
  assert.equal(s().balance, 124050, 'the yes covered £20, the form said £200: nothing moves');
  assert.equal(s().lastPaid, null);
  assert.equal(spoken.at(-1), "That isn't what you agreed to, so nothing was paid.");
});

test('Atlas: a screen change keeps keyboard focus in Bank, and the paid screen adds no second live region', async () => {
  const { button, press, root, s, spoken } = await phone({ hand: [true] });
  const doc = root.ownerDocument;
  for (const [open, h] of [['Hear your balance', 'Your balance'], ['Back to your account', null], ['Pay someone', 'Pay someone']]) {
    button(open).focus(); await press(open);
    assert.ok(root.contains(doc.activeElement), `focus stayed in Bank after ${open}`);
    if (h) assert.equal(doc.activeElement.textContent, h);
  }
  await press('Mum'); retype(root.querySelector('#bank-amount'), '20');
  await press('Pay Mum £20');
  assert.equal(s().screen, 'paid');
  assert.equal([...root.all()].filter((n) => n.getAttribute?.('role') === 'status').length, 0, 'the shell owns the one live line');
  assert.deepEqual(spoken.at(-1), 'Paid Mum twenty pounds.');
});

test('by hand: tapping Pay asks through os.confirm with the same readback; a No pays nothing', async () => {
  const { press, asked, s, root } = await phone({ hand: [false, true] });
  await press('Pay someone');
  await press('Mum');
  const amount = root.querySelector('#bank-amount');
  amount.value = '20'; amount.dispatchEvent(new Event('input', { bubbles: true }));
  await press('Pay Mum £20');
  assert.equal(s().balance, 124050, 'a No pays nothing');
  await press('Pay Mum £20');
  assert.equal(s().balance, 122050);
  assert.deepEqual(asked, [
    { gate: 'pay', readback: 'Pay Mum £20. From Murmur Bank.', byHand: true },
    { gate: 'pay', readback: 'Pay Mum £20. From Murmur Bank.', byHand: true },
  ]);
});

test('freeze card: says it, presses Freeze, and undo unfreezes', async () => {
  const { run, said, ctxFor, s, button } = await phone();
  assert.equal((await run('freezeCard')).ok, true);
  assert.ok(said().includes('Freezing your card ending 4821.'));
  assert.equal(s().cardFrozen, true);
  assert.equal(button('Unfreeze').getAttribute('aria-pressed'), 'true');
  assert.match(bank.read(), /card ending 4821 is frozen/);
  await bank.actions.freezeCard.undo(ctxFor(bank));
  assert.equal(s().cardFrozen, false);
});

test('privacy: no card number stored or logged, and nothing goes to the Librarian', async () => {
  const { run, port, s } = await phone({ answers: [true] });
  await run('payPerson', { who: 'Mum', amount: 20 });
  const stored = JSON.stringify(await port.getAll('app.bank')) + JSON.stringify(s());
  assert.doesNotMatch(stored, /\b\d{15,19}\b|cvv|expiry|sort ?code|4821/i);
  assert.doesNotMatch(source, /console\.|\.librarian|fetch\(|aat:|bus\.emit/i);
});

test('every control is a real, named button, input or label; no literal colours', async () => {
  const { root, press } = await phone();
  for (const screen of [null, 'Pay someone']) {
    if (screen) await press(screen);
    for (const n of root.all()) if (n.tagName === 'BUTTON') assert.ok(controlName(n).length > 1);
  }
  assert.ok(root.querySelector('#bank-amount').labels.length === 1);
  assert.doesNotMatch(source, /#[0-9a-f]{3,6}\b|rgb\(|style\./i);
});

// The real runner and gates (public/agent/runner.js): resolve before the gate, one readback, the fingerprint.
async function agentRig({ samira = false, pick = null, answer }) {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(bank);
  const kv = appKv('bank', browserKV({ storage: fakeStorage(), prefix: 'murmur' }));
  if (samira) await kv.set('state', withSamira());
  const root = await mountApp(bank, doc.body, { kv, bus, confirm: async () => true, say: async () => {} });
  if (!samira) await bank.reset();
  const said = [];
  let t = 0; const clock = { now: () => (t += 1000) };
  const gates = createGates({ clock, fingerprint: async () => true, say: async (x) => { said.push(x); },
    onChange: (g) => { if (g) setImmediate(() => (answer ? gates.yes({ button: true }) : gates.no())); } });
  const choose = async ({ choices }) => { const i = choices.indexOf(pick); return i < 0 ? null : i; };
  const ctxFor = (app, h) => createCtx({ app, root, kv, cursor: { async moveTo() {}, hide() {} }, ...h });
  const runner = createRunner({ registry, bus, ctxFor, gates, choose, clock, sleep: async () => {} });
  const r = await runner.run({ utterance: 'Pay Sam twenty pounds', steps: [{ tool: 'bank__payPerson', app: 'bank', action: 'payPerson', params: { who: 'Sam', amount: 20 } }] });
  return { r, readbacks: said.filter((x) => /^Pay /.test(x)), questions: questions(bus), s: bank.state() };
}

test('agent: "Pay Sam twenty pounds" reads back once and pays; a No moves no money', async () => {
  const yes = await agentRig({ answer: true });
  assert.equal(yes.r.status, 'done', JSON.stringify(yes.r));
  assert.deepEqual(yes.readbacks, ['Pay Sam £20. From Murmur Bank. Pay?']);
  assert.deepEqual(yes.questions, []);
  assert.equal(yes.s.balance, 124050 - 2000);
  const no = await agentRig({ answer: false });
  assert.equal(no.r.status, 'cancelled'); assert.equal(no.r.line, 'Not paid.');
  assert.equal(no.s.balance, 124050);
});

test('agent: with a Samira, one "Sam or Samira?" then one exact readback; no pick pays nothing', async () => {
  const picked = await agentRig({ samira: true, pick: 'Samira', answer: true });
  assert.equal(picked.r.status, 'done', JSON.stringify(picked.r));
  assert.deepEqual(picked.questions, ['Sam or Samira?']);
  assert.deepEqual(picked.readbacks, ['Pay Samira £20. From Murmur Bank. Pay?']);
  assert.deepEqual(picked.s.lastPaid.to, ['samira']);
  const none = await agentRig({ samira: true, answer: true });
  assert.equal(none.r.line, 'Not paid.');
  assert.deepEqual(none.readbacks, []);
  assert.equal(none.s.balance, 124050);
});
