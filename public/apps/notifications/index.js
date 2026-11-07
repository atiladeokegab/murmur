// Notifications on the phone: the latest few, read out loud (who, what, when), and "open it" or "reply" goes to that chat.
// Every person comes from CONTACTS, every line and driver is invented (event data rule). Nothing is gated: reading is the person's own.
// shortcut: the list is a fixed seed in memory, newest first; feed it from the other apps' events if it must stay live.
import { CONTACTS } from '../../lib/tiles.js';

const SEED = [
  { who: 'Uber', app: 'uber', when: 'a minute ago', what: 'Your driver Kofi is 2 minutes away in a grey Toyota.' },
  { id: 'mum', who: CONTACTS.mum.name, app: 'messages', when: '4 minutes ago', what: 'Are you still coming for dinner on Sunday?' },
  { id: 'sam', who: CONTACTS.sam.name, app: 'messages', when: '12 minutes ago', what: 'Running ten minutes late, save me a seat.' },
  { id: 'priya', who: CONTACTS.priya.name, app: 'whatsapp', when: '25 minutes ago', what: 'Are we still on for the beach on Saturday? I can drive.' },
  { who: 'Calendar', app: 'calendar', when: '40 minutes ago', what: `Book club with ${CONTACTS.chloe.name} at 6 pm today.` },
  { id: 'mum', who: CONTACTS.mum.name, app: 'messages', when: 'an hour ago', what: "Don't forget your coat, it's cold out." },
];
// What arrives while the demo runs, one by one after start: a banner over whatever app is open, said in one line.
export const ARRIVING = [
  { id: 'sam', who: CONTACTS.sam.name, app: 'messages', what: 'Are you coming tonight?' },
  { id: 'mum', who: CONTACTS.mum.name, app: 'messages', what: 'Call me when you get a minute, love.' },
];
export const env = { after: (ms, fn) => setTimeout(fn, ms), times: [20000, 55000] }; // tests swap these
const MAX = 3;
const clean = (who) => String(who || '').trim().replace(/^(?:my|the)\s+/i, '').replace(/'s$/i, '').toLowerCase();

// The 1 to 3 newest, from one sender when one is named; nothing from them says so and reads the newest instead.
export function pick(list, who) {
  const w = clean(who), from = w ? list.filter((n) => n.who.toLowerCase() === w || n.app === w) : list;
  const shown = (from.length ? from : list).slice(0, MAX);
  const line = shown.map((n) => `${n.who}, ${n.when}: ${n.what}`).join(' ');
  const head = !w ? `You have ${list.length} notifications. The latest:` : from.length ? `From ${shown[0].who}:` : `Nothing from ${who.trim()}. The latest:`;
  return { shown, line: `${head} ${line} Say open it, or reply.` };
}

const fresh = () => ({ list: SEED.map((n) => ({ ...n })), last: null, note: '', said: false });
let s = fresh(), root = null, os = null, body = null;
const q = (sel) => root && root.querySelector(sel);

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
// A new one: on top of the list, a banner dropped from the top of the phone (so /stage shows it), and one spoken line.
// It becomes the last one, so "reply" or "open it" goes to that chat.
export function arrive(n) {
  const x = { ...n, when: 'just now' };
  s.list.unshift(x); s.last = x; render();
  const doc = root?.ownerDocument;
  if (doc?.body) {
    doc.getElementById('notif-banner')?.remove();
    const b = doc.createElement('div');
    b.id = 'notif-banner'; b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;top:max(0.5rem,env(safe-area-inset-top));left:0.5rem;right:0.5rem;z-index:2147483000;padding:0.75rem 1rem;' +
      'border-radius:1rem;background:Canvas;color:CanvasText;border:1px solid GrayText;box-shadow:0 0.5rem 1.5rem rgb(0 0 0 / 0.35);font-size:1rem;line-height:1.35';
    const who = doc.createElement('b'); who.textContent = `${x.who} · ${x.app === 'whatsapp' ? 'WhatsApp' : 'Messages'}`;
    b.append(who, doc.createElement('br'), x.what);
    doc.body.append(b);
    env.after(6000, () => b.remove());
  }
  os?.say?.(`${x.who}: ${x.what}`);
  return x;
}
function readOut(e) {
  const r = pick(s.list, q('#notif-from')?.value);
  s.last = r.shown[0]; s.note = r.line; s.said = true; render();
  if (e?.isTrusted) os?.say?.(s.note); // a person's tap speaks; the agent's run says it
}
function render() {
  if (!body) return;
  const had = root.contains(root.ownerDocument.activeElement) && root.ownerDocument.activeElement.id;
  const from = q('#notif-from')?.value || '';
  body.replaceChildren(
    el('p', { className: 'app-done', 'aria-live': 'polite' }, s.note),
    el('label', { htmlFor: 'notif-from' }, 'From (leave empty for all)'),
    el('input', { id: 'notif-from', type: 'text', value: from, autocomplete: 'off' }),
    el('button', { type: 'button', id: 'notif-read', className: 'app-btn primary', onclick: readOut }, 'Read the latest'),
    el('ol', { className: 'app-list', 'aria-label': 'Notifications, newest first' },
      s.list.map((n) => el('li', { 'aria-current': n === s.last ? 'true' : 'false' }, el('b', {}, n.who), ` · ${n.when}: ${n.what}`))));
  if (had) q(`#${had}`)?.focus();
}

export default {
  id: 'notifications',
  name: 'Notifications',
  async mount(r, o) {
    root = r; os = o; root.append(el('h2', { id: 'notif-h' }, 'Notifications'), body = el('div', { className: 'app-body' })); render();
    // The demo's arrivals, only on a real phone: never under a test browser (webdriver) or with ?notify=0.
    const live = typeof location !== 'undefined' && !globalThis.navigator?.webdriver && !/[?&]notify=0\b/.test(location.search);
    if (live) ARRIVING.forEach((n, i) => env.after(env.times[i], () => arrive(n)));
  },
  async seed() { render(); },
  async reset() { s = fresh(); if (q('#notif-from')) q('#notif-from').value = ''; render(); },
  state: () => ({ ...s, list: s.list.map((n) => ({ ...n })), last: s.last && { ...s.last } }),
  read: () => s.note || pick(s.list).line,
  place: () => ({ where: 'Notifications', item: s.last?.who || null, next: s.last ? 'open it or reply' : 'read the latest' }),
  actions: {
    check: {
      describe: 'Read the latest 1 to 3 notifications out loud: who, what and when. who: only from that person or app',
      say: 'check my notifications',
      doing: 'Reading', // shared with Messages: the boot voice warm says each fixed line once, under a daily cap
      params: { type: 'object', properties: { who: { type: 'string', description: 'A name as said, "Mum", "Sam", "Uber"; none is everyone' } } },
      gate: null,
      hint: 'Read the latest is a button under the Notifications heading',
      async run(p, ctx) {
        const box = q('#notif-from');
        if (p.who) { await ctx.tap(box); await ctx.type(box, String(p.who).trim()); } else box.value = '';
        await ctx.tap(q('#notif-read'));
        await ctx.say(s.note);
      },
      verify: (st) => st.said || 'The notifications were not read.',
    },
  },
};
