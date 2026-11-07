// Bank on the Murmur SDK (os/contract.md): a simulated "Murmur Bank" with invented people and money.
// The agent presses the same controls a person does. Pay always asks first: the runner's gate for the agent,
// os.confirm (with the fingerprint) for a person's own tap. Nothing here talks to the Librarian.
import * as M from './model.js';

let s = M.fresh();
let root = null, os = null, body = null, busy = null; // busy: the last money or card change, settled after its save
let shownScreen = null; // the screen last drawn, so render knows when the screen changed
let approved = null; // the plan the agent's yes covers, fixed before it presses Pay: { plan, note }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const STALE = "That isn't what you agreed to, so nothing was paid.";
const q = (sel) => root && root.querySelector(sel);
const persist = () => Promise.resolve(os?.kv?.set('state', s));
const save = () => { persist().catch(() => {}); }; // screens and drafts only: losing one loses no money
/** A money or card change: kept only once it is saved; a failed save puts everything back. '' = done, else why not. */
async function commit(change, failed) {
  const before = structuredClone(s);
  const why = change();
  if (why) return why;
  try { await persist(); } catch { s = before; render(); return failed; }
  render();
  return '';
}
const pence = (amount) => Math.round(Number(amount) * 100);
const typed = (p) => (p % 100 ? (p / 100).toFixed(2) : String(p / 100));

// fresh: reopen even when already there, so a form starts empty (a person's half-made selection never leaks in).
async function toScreen(ctx, screen, opener, fresh = false) {
  if (s.screen === screen && !fresh) return;
  if (s.screen !== 'home') await ctx.tap(q('#bank-back'));
  if (opener) await ctx.tap(q(opener));
}

/** Each spoken name to one payee id; two matches ask, as in "Sam or Samira?". Returns { ids, asked }. */
async function whoIs(ctx, whos, settled = []) {
  const ids = []; let asked = false;
  for (const [i, w] of whos.entries()) {
    const r = M.resolve(s, w, settled[i]);
    if (r.none) throw new Error(r.none);
    let id = r.id;
    if (r.ask) {
      const pick = await ctx.choose(r.ask.question, r.ask.choices);
      if (!pick) throw new Error('No one chosen.');
      id = pick.id; asked = true;
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids, asked };
}

/**
 * Open a fresh form, fill it and press Pay. `agreed` is the readback the person said yes to; Pay is pressed only
 * when the form would move exactly that. When a name was only settled after the gate, ask again with the exact words.
 */
async function fillAndPay(ctx, mode, opener, { ids, asked }, total, note, agreed) {
  const d = { mode, to: ids, amount: typed(total), note: note || '' };
  if (asked) {
    agreed = M.readback(M.planOf(s, d));
    if (!(await ctx.confirm('pay', agreed))) throw new Error('Not paid.');
  }
  await toScreen(ctx, mode, opener, true);
  for (const id of ids) if (!s.draft.to.includes(id)) await ctx.tap(q(`[data-payee="${id}"]`));
  const amount = q('#bank-amount');
  await ctx.tap(amount); await ctx.type(amount, d.amount);
  if (note) { const n = q('#bank-note'); await ctx.tap(n); await ctx.type(n, note); }
  if (M.readback(M.planOf(s)) !== agreed || (mode === 'pay' && s.draft.note !== d.note)) throw new Error(STALE);
  // Fixed now: the form can still change while the cursor travels to Pay, so the click checks against this.
  approved = { plan: M.planOf(s, d), note: d.note };
  busy = null;
  try {
    await ctx.tap(q('#bank-pay'));
    const why = await busy; // the click's handler awaits os.confirm and the save; settle it before the runner verifies
    if (busy === null) throw new Error(STALE); // the Pay pressed was not the live one
    if (why) throw new Error(why);
  } finally { approved = null; }
}

/**
 * The runner calls this before the gate, on params not yet validated, so the one confirm names the exact person.
 * null (no one chosen) cancels with "Not paid."; an unknown name passes through so run fails in words.
 */
async function settle(ctx, whos) {
  const ids = [], names = [];
  if (!Array.isArray(whos)) return { none: true };
  for (const w of whos) {
    const r = M.resolve(s, w);
    if (r.none) return { none: true };
    const pick = r.ask ? await ctx.choose(r.ask.question, r.ask.choices) : { label: M.payee(s, r.id).name, id: r.id };
    if (!pick) return null;
    ids.push(pick.id); names.push(pick.label);
  }
  return { ids, names };
}
const ID = { type: 'string', description: 'Leave out: the app sets it after asking who' };

const paidTo = (st, whos, ids = []) => {
  const lp = st.lastPaid;
  if (!lp || lp.cancelled) return false;
  return whos.length === lp.to.length && whos.every((w, i) => M.candidates(st, w, ids[i]).some((c) => lp.to.includes(c.id)));
};

const app = {
  id: 'bank',
  name: 'Bank',
  async mount(r, o) {
    root = r; os = o;
    const saved = await os.kv?.get('state');
    if (saved && Number.isInteger(saved.balance)) s = saved;
    root.append(el('h2', { id: 'bank-h' }, 'Bank'), body = el('div', { className: 'app-body' }));
    render();
  },
  async seed() { if (!Number.isInteger(s?.balance)) s = M.fresh(); await persist(); render(); },
  async reset() { s = M.fresh(); await persist(); render(); },
  state: () => structuredClone(s),
  read: () => M.read(s),
  place: () => M.place(s),

  actions: {
    balance: {
      describe: 'Say how much money is in the account',
      doing: 'Reading your balance',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Hear your balance is the first button under the Bank heading',
      async run(p, ctx) {
        await toScreen(ctx, 'balance', '#bank-balance');
        await ctx.say(`Your balance is ${M.spoken(s.balance)}.`);
      },
      verify: (st) => st.screen === 'balance' || 'The balance did not open.',
    },
    recent: {
      describe: 'Read the last three payments in and out',
      doing: 'Reading recent payments',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Recent payments is the second button under the Bank heading',
      async run(p, ctx) {
        await toScreen(ctx, 'recent', '#bank-recent');
        for (const t of M.recent(s)) await ctx.say(M.txWords(t));
      },
      verify: (st) => st.screen === 'recent' || 'Recent payments did not open.',
    },
    payPerson: {
      describe: 'Pay one of your payees an amount in pounds',
      doing: 'Paying',
      params: { type: 'object', properties: {
        who: { type: 'string', description: 'The name as said: Mum, Sam or Landlord' },
        amount: { type: 'number', description: 'Pounds, for example 20 or 12.50' },
        note: { type: 'string', description: 'What it is for, if they said' },
        id: ID,
      }, required: ['who', 'amount'] },
      gate: 'pay',
      hint: 'Pay someone is the third button; choose the person, write the amount, then Pay',
      async resolve(p, ctx) { const r = await settle(ctx, [p.who]); return r && (r.none ? p : { ...p, who: r.names[0], id: r.ids[0] }); },
      readback: (st, p) => M.readbackFor(st, [p.who], pence(p.amount), 'pay', [p.id]),
      async run(p, ctx) {
        if (!(pence(p.amount) > 0)) throw new Error('The amount must be more than nothing.');
        const who = await whoIs(ctx, [p.who], [p.id]);
        await fillAndPay(ctx, 'pay', '#bank-pay-open', who, pence(p.amount), p.note, app.actions.payPerson.readback(s, p));
      },
      verify: (st, p) => (paidTo(st, [p.who], [p.id]) && st.lastPaid.total === pence(p.amount)) || 'It did not pay.',
    },
    splitBill: {
      describe: 'Split a bill total equally and pay each person their share',
      doing: 'Splitting the bill',
      params: { type: 'object', properties: {
        who: { type: 'array', items: { type: 'string' }, description: 'The names as said' },
        total: { type: 'number', description: 'The whole bill in pounds' },
        ids: { type: 'array', items: ID },
      }, required: ['who', 'total'] },
      gate: 'pay',
      hint: 'Split a bill is the fourth button; choose everyone who shares it, write the total, then Pay',
      async resolve(p, ctx) { const r = await settle(ctx, p.who); return r && (r.none ? p : { ...p, who: r.names, ids: r.ids }); },
      readback: (st, p) => M.readbackFor(st, p.who, pence(p.total), 'split', p.ids),
      async run(p, ctx) {
        if (!p.who.length) throw new Error('Say who shares the bill.');
        if (!(pence(p.total) > 0)) throw new Error('The total must be more than nothing.');
        const who = await whoIs(ctx, p.who, p.ids);
        await fillAndPay(ctx, 'split', '#bank-split-open', who, pence(p.total), '', app.actions.splitBill.readback(s, p));
      },
      verify: (st, p) => (paidTo(st, p.who, p.ids) && st.lastPaid.total === pence(p.total)) || 'It did not pay everyone.',
    },
    freezeCard: {
      describe: 'Freeze the bank card so nobody can use it',
      doing: 'Freezing your card',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Freeze card is the last button under the Bank heading',
      readback: () => `Freezing your ${M.CARD}.`,
      async run(p, ctx) {
        await ctx.say(app.actions.freezeCard.readback());
        await toScreen(ctx, 'home');
        if (s.cardFrozen) return;
        await ctx.tap(q('#bank-freeze'));
        const why = await busy;
        if (why) throw new Error(why);
      },
      verify: (st) => st.cardFrozen === true || 'The card is not frozen.',
      async undo(ctx) {
        await toScreen(ctx, 'home');
        if (!s.cardFrozen) return;
        await ctx.tap(q('#bank-freeze'));
        const why = await busy;
        if (why) throw new Error(why);
      },
    },
  },
};
export default app;

// A person's own tap on Pay asks through os.confirm (the shell adds the fingerprint). When the agent pressed it,
// the runner already asked and os.confirm answers yes at once. No os.confirm: nothing moves.
// The plan is fixed at the click: a form changed since the agent's check, or while the sheet is open, pays nothing.
async function payTap(btn) {
  const plan = M.planOf(s), note = s.draft.note, wanted = approved;
  if (!plan.length) return 'Choose who to pay and how much.';
  if (btn?.isConnected === false || (wanted && !same(wanted, { plan, note }))) return STALE;
  const yes = os?.confirm ? os.confirm({ gate: 'pay', readback: M.readback(plan) }) : false; // called before any await
  if ((await yes) !== true) return 'Not paid.'; // only a literal yes pays
  const why = await commit(() => (same(M.planOf(s), plan) && s.draft.note === note ? M.pay(s, Date.now(), plan, note) : STALE),
    "I couldn't save it, so nothing was paid.");
  if (!wanted) os?.say?.(why || M.paidWords(s)); // a person's own tap hears the result on the shell's one voice line
  if (!why) setTimeout(render, M.CANCEL_MS + 50)?.unref?.(); // the Cancel button goes after 8 s
  return why;
}

// ---------- the screen ----------
function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('aria-') || k.startsWith('data-') || k === 'for') n.setAttribute(k, String(v));
    else if (k === 'onclick') n.addEventListener('click', v);
    else n[k] = v;
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const button = (text, props = {}) => el('button', { type: 'button', className: 'app-btn', ...props }, text);
const go = (screen) => () => { s.screen = screen; save(); render(); };
const back = () => button('Back to your account', { id: 'bank-back', onclick: go('home') });
const speakIfPerson = (e, text) => { if (e.isTrusted) os?.say?.(text); };

function render() {
  if (!body) return;
  const view = { balance: balanceView, recent: recentView, pay: formView, split: formView, paid: paidView }[s.screen] || homeView;
  const a = root.ownerDocument.activeElement, had = !!a && root.contains(a), moved = shownScreen !== s.screen;
  const payee = a?.getAttribute?.('data-payee');
  body.replaceChildren(view());
  shownScreen = s.screen;
  if (!had) return;
  // The focused control was just replaced: the same control on the same screen, else the new screen's heading.
  const kept = !moved && ((a.id && body.querySelector(`#${a.id}`)) || (payee && body.querySelector(`[data-payee="${payee}"]`)));
  const h = kept || body.querySelector('h3') || root.querySelector('h2');
  if (!kept) h.tabIndex = -1;
  h.focus();
}

function homeView() {
  return el('div', { className: 'app-body' },
    el('p', { className: 'app-title' }, `Murmur Bank. Balance ${M.shown(s.balance)}`),
    el('p', { className: 'app-why' }, `Your ${M.CARD} is ${s.cardFrozen ? 'frozen' : 'on'}.`),
    button('Hear your balance', { id: 'bank-balance', onclick: (e) => { go('balance')(); speakIfPerson(e, M.read(s)); } }),
    button('Recent payments', { id: 'bank-recent', onclick: (e) => { go('recent')(); speakIfPerson(e, M.read(s)); } }),
    button('Pay someone', { id: 'bank-pay-open', onclick: () => { M.openForm(s, 'pay'); save(); render(); } }),
    button('Split a bill', { id: 'bank-split-open', onclick: () => { M.openForm(s, 'split'); save(); render(); } }),
    button(`${s.cardFrozen ? 'Unfreeze' : 'Freeze'} ${M.CARD}`, { id: 'bank-freeze', 'aria-pressed': s.cardFrozen,
      onclick: () => { busy = commit(() => { s.cardFrozen = !s.cardFrozen; return ''; }, "I couldn't save it, so your card didn't change."); } }),
  );
}

function balanceView() {
  return el('div', { className: 'app-body' },
    el('h3', { className: 'app-h3' }, 'Your balance'),
    el('p', { className: 'app-done' }, M.shown(s.balance)),
    back());
}

function recentView() {
  return el('div', { className: 'app-body' },
    el('h3', { className: 'app-h3' }, 'Recent payments, newest first'),
    el('ol', { className: 'app-chat', 'aria-label': 'Recent payments' },
      M.recent(s).map((t) => el('li', { className: t.pence < 0 ? 'me' : 'them' }, M.txWords(t, M.shown)))),
    back());
}

function formView() {
  const split = s.screen === 'split', d = s.draft;
  const amount = el('input', { id: 'bank-amount', className: 'app-field', inputMode: 'decimal', autocomplete: 'off' });
  amount.value = d.amount;
  amount.addEventListener('input', () => { d.amount = amount.value; save(); renderPay(); });
  const note = split ? null : el('input', { id: 'bank-note', className: 'app-field', autocomplete: 'off' });
  if (note) { note.value = d.note; note.addEventListener('input', () => { d.note = note.value; save(); }); }
  return el('div', { className: 'app-body' },
    el('h3', { className: 'app-h3' }, split ? 'Split a bill' : 'Pay someone'),
    el('p', { className: 'app-why' }, split ? 'Choose everyone who shares it. Each is paid an equal share.' : 'Choose who to pay.'),
    el('ul', { className: 'app-list', 'aria-label': split ? 'Who shares it' : 'Who to pay' }, s.payees.map((p) => el('li', {},
      button(p.name, { 'data-payee': p.id, 'aria-pressed': d.to.includes(p.id), onclick: () => { M.pick(s, p.id); save(); render(); } })))),
    el('label', { for: 'bank-amount', className: 'app-label' }, split ? 'Bill total in pounds' : 'Amount in pounds'),
    amount,
    note && el('label', { for: 'bank-note', className: 'app-label' }, 'What it is for, if you like'),
    note,
    el('div', { id: 'bank-pay-slot' }, payButton()),
    back());
}
function payButton() {
  const plan = M.planOf(s);
  const label = plan.length ? M.readback(plan).replace(/\. From Murmur Bank\.$/, '') : 'Pay';
  return button(label, { id: 'bank-pay', className: 'app-btn primary', disabled: !plan.length, onclick: (e) => { busy = payTap(e.currentTarget); } });
}
function renderPay() { q('#bank-pay-slot')?.replaceChildren(payButton()); }

function paidView() {
  const live = M.canCancel(s);
  return el('div', { className: 'app-body' },
    el('h3', { className: 'app-h3' }, s.lastPaid?.cancelled ? 'Cancelled' : 'Paid'),
    el('p', { className: 'app-done' }, M.paidWords(s, M.shown)),
    live && button('Cancel this payment', { id: 'bank-cancel', onclick: () => { busy = commit(() => (M.cancel(s) ? '' : 'Too late to cancel.'), "I couldn't save it, so the payment stands."); } }),
    live && el('p', { className: 'app-why' }, 'You can cancel for 8 seconds.'),
    back());
}
