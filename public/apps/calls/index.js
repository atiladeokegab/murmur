// Calls on the Murmur SDK (os/contract.md). Simulated: no line is ever dialled, and nobody picks up.
// Id "calls": "phone" is the shell's own settings app (public/os/phone.js). Invented people only (CONTACTS).
import { CONTACTS } from '../../lib/tiles.js';

export const RING_MS = 2000;
const MISSED = [{ who: 'mum', ago: 'twenty minutes ago' }, { who: 'sam', ago: 'an hour ago' }, { who: 'mum', ago: 'yesterday' }];
const fresh = () => ({ missed: structuredClone(MISSED), status: 'idle', with: null, heard: false });
let s = fresh();
let root = null, os = null, body = null, timer = null, ringing = Promise.resolve(), endRing = () => {};
const q = (sel) => root && root.querySelector(sel);
const nameOf = (id) => CONTACTS[id]?.name || id;

/** A spoken name to a contact id, or null. */
export function who(said) {
  const w = String(said || '').trim().toLowerCase().replace(/'s$/, '');
  return Object.keys(CONTACTS).find((id) => id === w || CONTACTS[id].name.toLowerCase() === w) || null;
}
const backTo = (p = {}) => (p.who ? who(p.who) : s.missed[0]?.who) || null;
const noAnswer = (id) => `${nameOf(id)} isn't picking up. Say 'text ${nameOf(id)}' to send a message.`;
const missedWords = (st) => {
  const n = st.missed.length;
  if (!n) return 'No missed calls.';
  return [`${['No', 'One', 'Two', 'Three', 'Four'][n] || n} missed call${n === 1 ? '' : 's'}.`, ...st.missed.map((m) => `${nameOf(m.who)}, ${m.ago}.`)].join(' ');
};
const calledOk = (st, id) => (!!id && ['calling', 'noanswer'].includes(st.status) && st.with === id) || `The call to ${nameOf(id) || 'them'} didn't start.`;

const app = {
  id: 'calls',
  name: 'Calls',
  async mount(r, o) {
    root = r; os = o;
    root.append(el('h2', { id: 'calls-h' }, 'Calls'), body = el('div', { className: 'app-body' }));
    render();
  },
  async seed() { render(); },
  async reset() { hangUp(); s = fresh(); render(); },
  state: () => structuredClone(s),
  read: () => (s.status === 'calling' ? `Calling ${nameOf(s.with)}.` : s.status === 'noanswer' ? noAnswer(s.with) : `Calls. ${missedWords(s)}`),
  place: () => (s.status === 'idle' ? { where: 'Calls', item: 'missed calls', next: 'callBack' } : { where: `Call with ${nameOf(s.with)}`, next: 'hangUp' }),

  actions: {
    call: {
      describe: 'Call a person',
      doing: 'Calling',
      say: 'Call Mum',
      params: { type: 'object', properties: { who: { type: 'string', description: 'The name as said' } }, required: ['who'] },
      gate: 'call',
      hint: 'Each person has a Call button under the Calls heading',
      readback: (st, p) => `Call ${nameOf(who(p.who)) || p.who}?`,
      async run(p, ctx) {
        const id = who(p.who);
        if (!id) throw new Error(`${p.who} isn't in your contacts.`);
        await ctx.tap(q(`[data-call="${id}"]`));
        await ringing;
        if (s.status === 'noanswer') await ctx.say(noAnswer(id));
      },
      verify: (st, p) => calledOk(st, who(p.who)),
    },
    missed: {
      describe: 'Read who called: the missed calls',
      doing: 'Reading missed calls',
      say: 'Who called',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Read missed calls is the button under the heading',
      async run(p, ctx) { await ctx.tap(q('#calls-read')); await ctx.say(missedWords(s)); },
      verify: (st) => st.heard === true || 'The missed calls were not read.',
    },
    hangUp: {
      describe: 'Hang up the call',
      doing: 'Hanging up',
      say: 'Hang up',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Hang up is the first button while a call is on',
      async run(p, ctx) {
        if (s.status === 'idle') throw new Error('There is no call to hang up.');
        await ctx.tap(q('#calls-hangup'));
      },
      verify: (st) => st.status === 'idle' || 'The call is still on.',
    },
    callBack: {
      describe: 'Call back the last person who called, or the named one',
      doing: 'Calling back',
      say: 'Call her back',
      params: { type: 'object', properties: { who: { type: 'string', description: 'The name as said; empty means the last missed call' } } },
      gate: 'call',
      hint: 'Each missed call is a button that calls that person back',
      readback: (st, p) => (backTo(p) ? `Call ${nameOf(backTo(p))} back?` : 'Call back? There are no missed calls.'),
      async run(p, ctx) {
        const id = backTo(p);
        if (!id) throw new Error(p.who ? `${p.who} didn't call.` : 'No missed calls.');
        await ctx.tap(q(`[data-back="${id}"]`));
        await ringing;
        if (s.status === 'noanswer') await ctx.say(noAnswer(id));
      },
      verify: (st, p) => calledOk(st, backTo(p)),
    },
  },
};
export default app;

// ---------- the call ----------
// A call always asks, a person's own tap too: a mis-dial by someone who can't see is the risk. The shell's
// os.confirm says yes at once when the agent pressed it (the runner already asked). No confirm, no call.
async function callAsked(id, back) {
  if (s.status !== 'idle') return;
  const readback = back ? app.actions.callBack.readback(s, { who: id }) : app.actions.call.readback(s, { who: id });
  if (!(os?.confirm && (await os.confirm({ gate: 'call', readback })))) return;
  s.status = 'calling'; s.with = id; render('#calls-hangup');
  await new Promise((done) => { endRing = done; timer = setTimeout(() => { s.status = 'noanswer'; render('#calls-hangup'); done(); }, RING_MS); });
}
function hangUp() { clearTimeout(timer); endRing(); s.status = 'idle'; s.with = null; }

// ---------- the screen ----------
function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role') n.setAttribute(k, String(v));
    else if (k === 'onclick') n.addEventListener('click', v);
    else n[k] = v;
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const PAD = 'padding-inline: clamp(0.25rem, 4vw, 1rem)'; // as Messages: 1rem side padding is 64 px at 400%
const button = (text, props = {}) => el('button', { type: 'button', className: 'app-btn', style: PAD, ...props }, text);

function render(focus) {
  if (!body) return;
  body.replaceChildren(s.status === 'idle' ? idleView() : callView());
  if (focus && root.contains(root.ownerDocument.activeElement)) q(focus)?.focus?.();
}

function callView() {
  return el('div', {},
    el('p', { className: 'app-done', role: 'status' }, s.status === 'calling' ? `Calling ${nameOf(s.with)}…` : noAnswer(s.with)),
    button('Hang up', { id: 'calls-hangup', className: 'app-btn primary', onclick: () => { hangUp(); render('#calls-h'); } }));
}

function idleView() {
  return el('div', {},
    button('Read missed calls', { id: 'calls-read', onclick: (e) => {
      s.heard = true; // a person's tap reads aloud here; the agent's run reads through ctx.say
      if (e.isTrusted) os?.say?.(missedWords(s));
    } }),
    el('h3', { className: 'app-h3' }, 'Missed calls'),
    s.missed.length ? el('ul', { className: 'app-list', 'aria-label': 'Missed calls' }, s.missed.map((m, i) => el('li', { style: 'border-top: 0' },
      button([el('b', { className: 'app-title' }, nameOf(m.who)), el('span', { className: 'app-why' }, ` ${m.ago}. Call back`)],
        // the first row for a person is the one "call back" presses
        { ...(s.missed.findIndex((x) => x.who === m.who) === i && { 'data-back': m.who }), onclick: () => { ringing = callAsked(m.who, true); } }))))
      : el('p', { className: 'app-why' }, 'No missed calls.'),
    el('h3', { className: 'app-h3' }, 'People'),
    el('ul', { className: 'app-list', 'aria-label': 'People' }, Object.keys(CONTACTS).map((id) => el('li', { style: 'border-top: 0' },
      button(`Call ${nameOf(id)}`, { 'data-call': id, onclick: () => { ringing = callAsked(id, false); } })))));
}
