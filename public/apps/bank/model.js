// Bank: the pure state. No DOM; the same code runs in the browser and in test/apps-bank.test.js.
// A simulated bank: invented people and invented money only. Money is held in whole pence.
// No card number is ever stored: the card is only ever "card ending 4821", and that lives in the words below.
export const CARD = 'card ending 4821';
export const CANCEL_MS = 8000;

export const seedPayees = () => [
  { id: 'mum', name: 'Mum' },
  { id: 'sam', name: 'Sam' },
  { id: 'samira', name: 'Samira' },
  { id: 'landlord', name: 'Landlord' },
];
// Oldest first; "recent" reads the last three, newest first.
export const seedTransactions = () => [
  { id: 't1', name: 'Landlord', pence: -85000, when: 'Monday', note: 'Rent' },
  { id: 't2', name: 'Green Street Grocer', pence: -1240, when: 'Yesterday', note: '' },
  { id: 't3', name: 'Sam', pence: 1500, when: 'Today', note: 'Pizza' },
  { id: 't4', name: 'Corner Café', pence: -385, when: 'Today', note: '' },
];

const draft0 = () => ({ mode: 'pay', to: [], amount: '', note: '' });
export const fresh = () => ({
  balance: 124050, payees: seedPayees(), transactions: seedTransactions(),
  screen: 'home', lastPaid: null, cardFrozen: false, draft: draft0(),
});

// ---------- money in words and on screen ----------
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const u100 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
const u1000 = (n) => {
  const h = Math.floor(n / 100), r = n % 100;
  return h ? `${ONES[h]} hundred${r ? ` and ${u100(r)}` : ''}` : u100(r);
};
/** 1240 → "one thousand, two hundred and forty". Up to 999,999 (plenty for an invented account). */
export function words(n) {
  const t = Math.floor(n / 1000), r = n % 1000;
  if (!t) return u1000(r);
  return `${u1000(t)} thousand${r ? (r < 100 ? ' and ' : ', ') + u1000(r) : ''}`;
}
/** 2000 → "twenty pounds"; 124050 → "one thousand, two hundred and forty pounds and fifty pence". */
export function spoken(pence) {
  const p = Math.abs(pence), lb = Math.floor(p / 100), pc = p % 100;
  const pounds = lb === 1 ? 'one pound' : `${words(lb)} pounds`;
  const pp = pc === 1 ? 'one penny' : `${words(pc)} pence`;
  if (!lb) return pp;
  return pc ? `${pounds} and ${pp}` : pounds;
}
/** 2000 → "£20"; 124050 → "£1,240.50". */
export const shown = (pence) => {
  const p = Math.abs(pence);
  return '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
};
/** "20", "20.5", "£20.50" → 2050 pence; anything else → null. */
export function toPence(v) {
  const m = /^\s*£?\s*(\d{1,6})(?:\.(\d{1,2}))?\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  const p = Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0'));
  return p > 0 ? p : null;
}

// ---------- who ----------
const norm = (s) => String(s || '').trim().toLowerCase();
export const payee = (s, id) => s.payees.find((p) => p.id === id) || null;
/** Every payee a spoken name could mean: "Sam" is Sam and Samira, so the caller must ask. */
export function candidates(s, who) {
  const w = norm(who);
  if (!w) return [];
  return s.payees.filter((p) => norm(p.name).startsWith(w));
}
/** { id } or { ask: { question, choices } } or { none }. */
export function resolve(s, who) {
  const list = candidates(s, who);
  if (list.length === 1) return { id: list[0].id };
  if (!list.length) return { none: `${who || 'That name'} isn't one of your payees.` };
  const names = list.map((p) => p.name);
  return { ask: { question: `${names.slice(0, -1).join(', ')} or ${names.at(-1)}?`, choices: list.map((p) => ({ label: p.name, id: p.id })) } };
}
const nameOf = (s, who) => {
  const list = candidates(s, who);
  return list.length ? list.map((p) => p.name).join(' or ') : who;
};

// ---------- a payment plan: [{ id, name, pence }] ----------
/** Split pence as evenly as whole pence allow; the first people take the odd pennies. */
export function shares(total, n) {
  const base = Math.floor(total / n), odd = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < odd ? 1 : 0));
}
export function planOf(s, d = s.draft) {
  const pence = toPence(d.amount);
  if (!pence || !d.to.length) return [];
  const each = d.mode === 'split' ? shares(pence, d.to.length) : [pence];
  return d.to.map((id, i) => ({ id, name: payee(s, id)?.name || id, pence: each[i] }));
}
const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] || '');
/** The exact words read before any money moves: "Pay Sam £20. From Murmur Bank." */
export const readback = (plan) => `Pay ${list(plan.map((p) => `${p.name} ${shown(p.pence)}`))}. From Murmur Bank.`;
/** The readback before the names are settled (the runner asks before run can ask "Sam or Samira?"). */
export function readbackFor(s, whos, pence, mode = 'pay') {
  const each = mode === 'split' ? shares(pence, whos.length) : [pence];
  return readback(whos.map((w, i) => ({ name: nameOf(s, w), pence: each[i] })));
}

// ---------- changes (the controls call these) ----------
export function openForm(s, mode) { s.screen = mode; s.draft = { ...draft0(), mode }; s.lastPaid = null; }
export function pick(s, id) {
  const d = s.draft;
  if (d.mode === 'split') d.to = d.to.includes(id) ? d.to.filter((x) => x !== id) : [...d.to, id];
  else d.to = [id];
}
/** Moves the money. Returns '' when paid, else the reason in words. */
export function pay(s, now = Date.now()) {
  const plan = planOf(s);
  if (!plan.length) return 'Choose who to pay and how much.';
  const total = plan.reduce((a, p) => a + p.pence, 0);
  if (total > s.balance) return `That's more than your balance of ${spoken(s.balance)}.`;
  const ids = plan.map((p) => {
    const id = `t${s.transactions.length + 1}`;
    s.transactions.push({ id, name: p.name, pence: -p.pence, when: 'Today', note: s.draft.note || '', cancelUntil: now + CANCEL_MS });
    return id;
  });
  s.balance -= total;
  s.lastPaid = { to: plan.map((p) => p.id), pence: plan.map((p) => p.pence), total, tx: ids, cancelled: false };
  s.screen = 'paid';
  return '';
}
export const canCancel = (s, now = Date.now()) => !!s.lastPaid && !s.lastPaid.cancelled
  && s.lastPaid.tx.every((id) => (s.transactions.find((t) => t.id === id)?.cancelUntil || 0) > now);
/** Within 8 s, the money comes back. */
export function cancel(s, now = Date.now()) {
  if (!canCancel(s, now)) return false;
  for (const id of s.lastPaid.tx) s.transactions.find((t) => t.id === id).cancelled = true;
  s.balance += s.lastPaid.total;
  s.lastPaid.cancelled = true;
  return true;
}

// ---------- words for screen readers ----------
export const recent = (s) => s.transactions.filter((t) => !t.cancelled).slice(-3).reverse();
/** money: spoken for the voice and read(), shown for the screen. */
export const txWords = (t, money = spoken) => (t.pence < 0
  ? `${t.when}, you paid ${t.name} ${money(t.pence)}${t.note ? ` for ${t.note}` : ''}.`
  : `${t.when}, ${t.name} paid you ${money(t.pence)}${t.note ? ` for ${t.note}` : ''}.`);
export const paidWords = (s, money = spoken) => {
  const lp = s.lastPaid;
  if (!lp) return '';
  const who = list(lp.to.map((id, i) => `${payee(s, id)?.name} ${money(lp.pence[i])}`));
  return lp.cancelled ? `Cancelled. ${who} was not paid. The money is back.` : `Paid ${who}.`;
};

export function read(s) {
  const bal = `Your balance is ${spoken(s.balance)}.`;
  switch (s.screen) {
    case 'balance': return `Murmur Bank. ${bal}`;
    case 'recent': return `Recent payments. ${recent(s).map((t) => txWords(t)).join(' ')}`;
    case 'pay': case 'split': {
      const plan = planOf(s);
      const title = s.screen === 'split' ? 'Split a bill.' : 'Pay someone.';
      return plan.length ? `${title} Ready: ${readback(plan)}` : `${title} Choose who, then the amount.`;
    }
    case 'paid': return `${paidWords(s)} ${bal}`;
    default: return `Murmur Bank. ${bal} Your ${CARD} is ${s.cardFrozen ? 'frozen' : 'on'}.`;
  }
}

export function place(s) {
  const where = 'Murmur Bank';
  switch (s.screen) {
    case 'balance': return { where, item: 'your balance', n: 1, of: 1, next: 'recent' };
    case 'recent': return { where, item: 'recent payments', n: 1, of: recent(s).length, next: null };
    case 'pay': return { where: 'Pay someone', item: planOf(s).length ? 'the Pay button' : 'who to pay', n: 1, of: s.payees.length, next: 'payPerson' };
    case 'split': return { where: 'Split a bill', item: planOf(s).length ? 'the Pay button' : 'who shares it', n: 1, of: s.payees.length, next: 'splitBill' };
    case 'paid': return { where, item: s.lastPaid?.cancelled ? 'the cancelled payment' : 'the payment', n: 1, of: 1, next: null };
    default: return { where, item: 'your account', n: 1, of: 5, next: 'balance' };
  }
}
