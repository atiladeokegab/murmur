// Calendar on the Murmur SDK (os/contract.md): what's on, add, move, invite (asks first).
import * as C from './model.js';

let s = C.fresh();
let root = null, os = null, body = null;
let note = { ok: false, text: '' }; // what the last move said: "Wednesday's free. Moved. Tell Mum?" or the clash
const q = (sel) => root && root.querySelector(sel);
const save = () => os?.kv?.set('state', s);
const personOf = (who) => Object.keys(C.PEOPLE).find((x) => C.PEOPLE[x].toLowerCase() === String(who || '').trim().toLowerCase());

/** The one event the params mean, asking "Lunch with Mum or Lunch with Sam?" when two match. */
async function which(p, ctx) {
  const r = C.resolve(s, p);
  if (r.ask) {
    const pick = await ctx.choose(r.ask.question, r.ask.choices.map((c) => ({ label: c.label, id: c.params.id })));
    if (!pick) throw new Error('Nothing chosen.');
    return pick.id;
  }
  if (r.none) throw new Error(r.none);
  return r.id;
}
async function pick(ctx, id) {
  const e = C.event(s, id);
  if (s.showing !== e.day) await ctx.tap(q(`[data-day="${e.day}"]`));
  if (s.selected !== id) await ctx.tap(q(`[data-event="${id}"]`));
}
/** After a choice, verify reads the event the person picked (s.selected), as long as the words fit it. */
const chosen = (st, p) => {
  const e = C.event(st, p.id || st.selected);
  return e && (p.id || C.find(st, p.what).some((x) => x.id === e.id)) ? e : null;
};

const app = {
  id: 'calendar',
  name: 'Calendar',
  async mount(r, o) {
    root = r; os = o;
    const saved = await os.kv?.get('state');
    if (saved?.events) s = saved;
    root.append(el('h2', { id: 'calendar-h' }, 'Calendar'), body = el('div', { className: 'app-body' }));
    render();
  },
  async seed() { await save(); render(); },
  async reset() { s = C.fresh(); note = { ok: false, text: '' }; await save(); render(); },
  state: () => structuredClone(s),
  read: () => C.read(s),
  place: () => C.place(s),

  actions: {
    whatsOn: {
      describe: "Say what's on for a day of this week, today if none is given",
      doing: "Checking what's on",
      params: { type: 'object', properties: { day: { type: 'string', description: 'A weekday, today or tomorrow' } } },
      gate: null,
      hint: 'The days of the week are buttons after the plans',
      async run(p, ctx) {
        const d = C.dayOf(p.day || 'today', s.today);
        if (!d) throw new Error(`I don't know ${p.day}.`);
        await ctx.tap(q(`[data-day="${d}"]`));
        await ctx.say(C.whatsOn(s, d));
      },
      verify: (st, p) => st.showing === C.dayOf(p.day || 'today', st.today) || "That day didn't open.",
    },
    add: {
      describe: 'Add a plan to the calendar on a day and at a time',
      doing: 'Adding it',
      params: { type: 'object', properties: { title: { type: 'string' }, day: { type: 'string' }, time: { type: 'string', description: '24-hour HH:MM, 12:00 if not said' } }, required: ['title', 'day'] },
      gate: null,
      hint: 'Add a plan is at the end: what, which day, what time, then Add',
      async run(p, ctx) {
        for (const [id, v] of [['#cal-title', p.title], ['#cal-day', p.day], ['#cal-time', p.time || '12:00']]) { await ctx.tap(q(id)); await ctx.type(q(id), v); }
        await ctx.tap(q('#cal-add'));
        const e = C.event(s, s.selected);
        if (!e) throw new Error('I need what, the day and a time like 13:00.');
        await ctx.say(`Added. ${C.line(e)}`);
      },
      verify: (st, p) => st.events.some((e) => e.title === String(p.title).trim() && e.day === C.dayOf(p.day, st.today) && e.time === (p.time || '12:00')) || "It didn't go in.",
    },
    move: {
      describe: 'Move a plan to another day, and a new time if given',
      doing: 'Moving it',
      params: { type: 'object', properties: { what: { type: 'string', description: 'The plan, as said' }, to: { type: 'string', description: 'A weekday, today or tomorrow' }, time: { type: 'string' } }, required: ['what', 'to'] },
      gate: null,
      hint: 'Choose the plan under its day, then the day to move it to',
      async run(p, ctx) {
        const id = await which(p, ctx);
        const to = C.dayOf(p.to, s.today);
        if (!to) throw new Error(`I don't know ${p.to}.`);
        await pick(ctx, id);
        if (p.time) { await ctx.tap(q('#cal-move-time')); await ctx.type(q('#cal-move-time'), p.time); }
        await ctx.tap(q(`[data-move="${to}"]`));
        if (!note.ok) throw new Error(note.text);
        await ctx.say(note.text);
      },
      verify: (st, p) => { const e = chosen(st, p); return (!!e && e.day === C.dayOf(p.to, st.today) && (!p.time || e.time === p.time)) || "It didn't move."; },
    },
    invite: {
      describe: 'Send someone an invite to a plan',
      doing: 'Inviting',
      params: { type: 'object', properties: { what: { type: 'string' }, who: { type: 'string', enum: Object.values(C.PEOPLE) } }, required: ['what', 'who'] },
      gate: 'send',
      hint: 'Choose the plan, then type the name in Invite who, then Send invite',
      readback: (st, p = {}) => { const list = C.find(st, p.what); return list.length === 1 ? `Send ${p.who} an invite: ${C.line(list[0])}` : `Send ${p.who} an invite to ${p.what}.`; },
      async run(p, ctx) {
        const id = await which(p, ctx);
        await pick(ctx, id);
        await ctx.tap(q('#cal-who')); await ctx.type(q('#cal-who'), p.who);
        await ctx.tap(q('#cal-invite'));
      },
      verify: (st, p) => { const e = chosen(st, p), k = personOf(p.who); return (!!e && !!k && e.invited.includes(k)) || 'The invite did not go.'; },
    },
  },
};
export default app;

// ---------- the screen ----------
function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('aria-') || k.startsWith('data-') || k === 'for') n.setAttribute(k, String(v));
    else if (k === 'onclick') n.addEventListener('click', v);
    else n[k] = v;
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(typeof k === 'number' ? String(k) : k);
  return n;
}
const button = (text, props = {}) => el('button', { type: 'button', className: 'app-btn', ...props }, text);
const field = (id, label, props = {}) => [el('label', { for: id, className: 'app-label' }, label), el('input', { id, className: 'app-field', autocomplete: 'off', ...props })];

function render() {
  if (!body) return;
  const sel = C.event(s, s.selected);
  const list = C.byDay(s, s.showing);
  body.replaceChildren(...[
    el('h3', { className: 'app-h3' }, s.showing === s.today ? 'Today' : s.showing),
    el('p', { className: 'app-place' }, C.whatsOn(s, s.showing)),
    el('ul', { className: 'app-list', 'aria-label': 'Plans' }, list.map((e) => el('li', {},
      button(`${e.title}, at ${C.spokenTime(e.time)}`, { 'data-event': e.id, 'aria-pressed': String(e.id === s.selected), onclick: () => { s.selected = e.id; save(); render(); } })))),
    sel && el('div', { className: 'app-card' },
      el('h4', { className: 'app-h3' }, `Chosen: ${C.line(sel)}`),
      note.text ? el('p', { className: 'app-done' }, note.text) : null,
      ...field('cal-move-time', 'New time, if it changes, like 13:00'),
      el('p', { className: 'app-label' }, 'Move it to'),
      el('ul', { className: 'app-days', 'aria-label': 'Move it to' }, C.DAYS.filter((d) => d !== sel.day).map((d) => el('li', {},
        button(d, { 'data-move': d, onclick: (ev) => {
          const r = C.move(s, sel.id, d, q('#cal-move-time').value || undefined);
          note = { ok: !!r.say, text: r.say || r.fail };
          save(); render();
          if (ev.isTrusted) os.say?.(note.text);
        } })))),
      ...field('cal-who', 'Invite who'),
      button('Send invite', { id: 'cal-invite', className: 'app-btn primary', onclick: () => {
        // A person's own tap is their yes (contract §7); the agent is gated by the runner before it taps.
        if (C.invite(s, sel.id, q('#cal-who').value)) { save(); render(); }
      } })),
    el('h3', { className: 'app-h3' }, 'The week'),
    el('ul', { className: 'app-days', 'aria-label': 'The week' }, C.DAYS.map((d) => el('li', {},
      button(d === s.today ? `${d}, today` : d, { 'data-day': d, 'aria-pressed': String(d === s.showing),
        onclick: () => { s.showing = d; s.selected = null; note = { ok: false, text: '' }; save(); render(); } })))),
    el('h3', { className: 'app-h3' }, 'Add a plan'),
    ...field('cal-title', 'What'),
    ...field('cal-day', 'Which day'),
    ...field('cal-time', 'What time, like 13:00', { inputMode: 'numeric' }),
    button('Add', { id: 'cal-add', onclick: () => {
      s.selected = null;
      C.add(s, { title: q('#cal-title').value, day: q('#cal-day').value, time: q('#cal-time').value || undefined });
      save(); render();
    } }),
  ].filter(Boolean));
}
