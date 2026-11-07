import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus, createRegistry, createCtx, controlName, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import bank from '../public/apps/bank/index.js';
import * as M from '../public/apps/bank/model.js';
import appIds from '../public/apps/apps.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

const example = JSON.parse(readFileSync(new URL('../public/apps/bank/state.example.json', import.meta.url)));
const source = readFileSync(new URL('../public/apps/bank/index.js', import.meta.url), 'utf8') + readFileSync(new URL('../public/apps/bank/model.js', import.meta.url), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));

// One phone with only Bank on it. answers: the runner's ask-first sheet; hand: os.confirm for a person's own tap.
// Like the shell (public/os/shell.js), os.confirm answers yes at once while the agent's ctx.tap is pressing.
async function phone({ answers = [], hand = [], picks = [] } = {}) {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(bank);
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const kv = appKv('bank', port);
  const asked = [], taps = [], spoken = [];
  let agentPress = false;
  const confirm = async ({ gate, readback }) => {
    if (agentPress) return true;
    asked.push({ gate, readback, byHand: true });
    return hand.shift() ?? false;
  };
  const root = await mountApp(bank, doc.body, { kv, bus, confirm, say: async (t) => { spoken.push(t); } });
  await bank.reset();
  const ask = async ({ gate, readback }) => { asked.push({ gate, readback }); return answers.shift() ?? false; };
  const choose = async ({ choices }) => { const i = choices.indexOf(picks.shift()); return i < 0 ? null : i; };
  const ctxFor = (app) => {
    const ctx = createCtx({ app, root, bus, kv, cursor: { async moveTo(el, n) { taps.push(n); }, hide() {} }, ask, choose, signal: new AbortController().signal });
    const tap = ctx.tap;
    ctx.tap = async (...a) => { agentPress = true; try { await tap(...a); } finally { agentPress = false; } };
    return ctx;
  };
  const run = (name, params = {}) => runAction({ registry, name: `bank__${name}`, params, bus, ctxFor });
  const said = () => bus.log.filter((e) => e.name === 'say').map((e) => e.payload?.text ?? e.text);
  const button = (text) => [...root.all()].find((n) => n.tagName === 'BUTTON' && controlName(n).startsWith(text));
  const press = async (text) => { const b = button(text); assert.ok(b, `no button "${text}"`); b.click(); await tick(); await tick(); };
  return { root, bus, run, said, asked, taps, spoken, ctxFor, port, button, press, s: () => bank.state() };
}

test('bank: on the board, seeded state is exactly state.example.json, field names pinned', async () => {
  assert.ok(appIds.includes('bank'));
  const { s } = await phone();
  assert.deepEqual(s(), example);
  assert.deepEqual(Object.keys(s()).sort(), ['balance', 'cardFrozen', 'draft', 'lastPaid', 'payees', 'screen', 'transactions']);
  assert.deepEqual(s().payees.map((p) => p.name), ['Mum', 'Sam', 'Samira', 'Landlord']);
  assert.equal(s().balance, 124050);
});

test('bank: the contract shape; only pay and split are gated, both with a readback', () => {
  for (const [k, a] of Object.entries(bank.actions)) {
    assert.ok(a.describe && a.doing && a.hint && a.params?.type === 'object' && a.run && a.verify, k);
    assert.ok(a.doing.split(' ').length >= 1 && a.doing.split(' ').length <= 5, k);
  }
  assert.deepEqual(Object.entries(bank.actions).filter(([, a]) => a.gate).map(([k, a]) => [k, a.gate]), [['payPerson', 'pay'], ['splitBill', 'pay']]);
  assert.equal(bank.actions.freezeCard.gate, null);
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

test('pay Samira £20: the gate reads "Pay Samira £20. From Murmur Bank." and the money moves once', async () => {
  const { run, asked, taps, s, bus } = await phone({ answers: [true] });
  const r = await run('payPerson', { who: 'Samira', amount: 20, note: 'Lunch' });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(asked, [{ gate: 'pay', readback: 'Pay Samira £20. From Murmur Bank.' }]);
  assert.equal(s().balance, 124050 - 2000);
  assert.deepEqual(s().lastPaid, { to: ['samira'], pence: [2000], total: 2000, tx: ['t5'], cancelled: false });
  assert.equal(s().transactions.at(-1).note, 'Lunch');
  assert.deepEqual(taps, ['Pay someone', 'Samira', 'Amount in pounds', 'What it is for, if you like', 'Pay Samira £20']);
  assert.equal(bank.read(), 'Paid Samira twenty pounds. Your balance is one thousand, two hundred and twenty pounds and fifty pence.');
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

test('"Sam" asks "Sam or Samira?", then reads the exact payee back; a No there moves nothing', async () => {
  const ok = await phone({ answers: [true, true], picks: ['Sam'] });
  assert.equal((await ok.run('payPerson', { who: 'Sam', amount: 20 })).ok, true);
  assert.deepEqual(ok.asked.map((a) => a.readback), ['Pay Sam or Samira £20. From Murmur Bank.', 'Pay Sam £20. From Murmur Bank.']);
  assert.deepEqual(ok.bus.log.filter((e) => e.name === 'ask').map((e) => e.payload?.question ?? e.question), ['Sam or Samira?']);
  assert.deepEqual(ok.s().lastPaid.to, ['sam']);

  const no = await phone({ answers: [true, false], picks: ['Samira'] });
  const r = await no.run('payPerson', { who: 'Sam', amount: 20 });
  assert.equal(r.ok, false); assert.equal(r.reason, 'Not paid.');
  assert.equal(no.s().balance, 124050);

  const none = await phone({ answers: [true], picks: [] });
  assert.equal((await none.run('payPerson', { who: 'Sam', amount: 20 })).reason, 'No one chosen.');
  assert.equal(none.s().balance, 124050);
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

test('undo is "cancel within 8 s": the Cancel button gives the money back; after 8 s it is gone', async () => {
  const { run, ctxFor, s, button } = await phone({ answers: [true] });
  await run('payPerson', { who: 'Mum', amount: 20 });
  assert.ok(button('Cancel this payment'));
  await bank.actions.payPerson.undo(ctxFor(bank));
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
