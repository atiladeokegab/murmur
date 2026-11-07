// Calendar on the Murmur SDK (spec §3.3): what's on, add, move, invite (asks first).
import * as C from './model.js';

let s = C.fresh();
let root = null, os = null;
let lastSay = '';
const q = (sel) => root && root.querySelector(sel);

async function pick(ctx, id) {
  const e = C.event(s, id);
  await ctx.tap(q(`[data-day="${e.day}"]`));
  await ctx.tap(q(`[data-event="${id}"]`));
}

const app = {
  id: 'calendar',
  name: 'Calendar',
  seed() { s = C.fresh(); render(); },
  reset() { s = C.fresh(); render(); },
  state: () => structuredClone(s),
  read: () => C.read(s),
  place: () => C.place(s),
  mount(el, osApi) { root = el; os = osApi; render(); },

  actions: {
    whatsOn: {
      describe: "Checking what's on",
      params: { type: 'object', properties: { day: { type: 'string', enum: C.DAYS } } },
      gate: null,
      hint: 'The days of the week are buttons after the plans',
      async run(p, ctx) {
        const d = C.dayOf(p.day || s.today);
        if (!d) return { fail: `I don't know ${p.day}.` };
        await ctx.tap(q(`[data-day="${d}"]`));
        return { say: C.whatsOn(s, d) };
      },
      verify: (st, p) => st.showing === C.dayOf(p.day || st.today),
    },
    add: {
      describe: 'Adding it',
      params: { type: 'object', properties: { title: { type: 'string' }, day: { type: 'string', enum: C.DAYS }, time: { type: 'string', pattern: '^\\d{2}:\\d{2}$' } }, required: ['title', 'day', 'time'] },
      gate: null,
      hint: 'Add a plan is at the end: what, which day, what time, then Add',
      async run(p, ctx) {
        await ctx.type(q('#cal-title'), p.title);
        await ctx.type(q('#cal-day'), C.dayOf(p.day) || p.day);
        await ctx.type(q('#cal-time'), p.time);
        await ctx.tap(q('#cal-add'));
        if (!s.selected) return { fail: 'I need what, the day and the time.' };
        return { say: `Added. ${C.line(C.event(s, s.selected))}` };
      },
      verify: (st, p) => st.events.some((e) => e.title === String(p.title).trim() && e.day === C.dayOf(p.day) && e.time === p.time),
    },
    move: {
      describe: 'Moving it',
      params: { type: 'object', properties: { what: { type: 'string' }, id: { type: 'string' }, to: { type: 'string', enum: C.DAYS }, time: { type: 'string' } }, required: ['to'] },
      gate: null,
      hint: 'Choose the plan under its day, then the day to move it to',
      async run(p, ctx) {
        const r = C.resolve(s, p);
        if (r.ask) return { ask: r.ask };
        if (r.none) return { fail: r.none };
        const to = C.dayOf(p.to);
        if (!to) return { fail: `I don't know ${p.to}.` };
        if (p.time) await ctx.type(q('#cal-move-time'), p.time);
        await pick(ctx, r.id);
        lastSay = '';
        await ctx.tap(q(`[data-move="${to}"]`));
        return lastSay.startsWith(to) ? { say: lastSay } : { fail: lastSay };
      },
      verify: (st, p) => { const r = C.resolve(st, p); const e = r.id && C.event(st, r.id); return !!e && e.day === C.dayOf(p.to) && (!p.time || e.time === p.time); },
      undo: null,
    },
    invite: {
      describe: 'Inviting',
      params: { type: 'object', properties: { what: { type: 'string' }, id: { type: 'string' }, who: { type: 'string', enum: Object.values(C.PEOPLE) } }, required: ['who'] },
      gate: 'send',
      hint: 'Choose the plan, then Invite and the name, then Send invite',
      readback: (st, p = {}) => { const r = C.resolve(st, p); const e = r.id && C.event(st, r.id); return e ? `Send ${p.who} an invite: ${C.line(e)}` : `Invite ${p.who}.`; },
      async run(p, ctx) {
        const r = C.resolve(s, p);
        if (r.ask) return { ask: r.ask };
        if (r.none) return { fail: r.none };
        await pick(ctx, r.id);
        await ctx.type(q('#cal-who'), p.who);
        await ctx.tap(q('#cal-invite'));
        return { say: `Invite sent to ${p.who}.` };
      },
      verify: (st, p) => { const r = C.resolve(st, p); const e = r.id && C.event(st, r.id); const k = Object.keys(C.PEOPLE).find((x) => C.PEOPLE[x].toLowerCase() === String(p.who).toLowerCase()); return !!e && !!k && e.invited.includes(k); },
    },
  },
};
export default app;

// ---------- the screen ----------
function h(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const button = (text, props = {}) => h('button', { type: 'button', className: 'app-btn', ...props }, text);
const field = (id, label, props = {}) => [h('label', { htmlFor: id, className: 'app-label' }, label), h('input', { id, className: 'app-field', autocomplete: 'off', ...props })];

function render() {
  if (!root || typeof document === 'undefined') return;
  const sel = C.event(s, s.selected);
  const list = C.byDay(s, s.showing);
  root.replaceChildren(h('section', { className: 'app', ariaLabel: 'Calendar' },
    h('h2', { className: 'app-h' }, s.showing === s.today ? 'Calendar: today' : `Calendar: ${s.showing}`),
    h('p', { className: 'app-place' }, C.whatsOn(s, s.showing)),
    h('ul', { className: 'app-list', ariaLabel: 'Plans' }, list.map((e) => h('li', {},
      button('', { dataset: { event: e.id }, ariaPressed: String(e.id === s.selected), onclick: () => { s.selected = e.id; render(); } },
        h('span', { className: 'app-title' }, e.title), h('span', { className: 'app-why' }, `at ${C.spokenTime(e.time)}`))))),
    sel && h('section', { className: 'app-card', ariaLabel: 'Chosen plan' },
      h('h3', { className: 'app-h3' }, C.line(sel)),
      h('h4', { className: 'app-h3' }, 'Move it to'),
      ...field('cal-move-time', 'New time (optional, like 13:00)'),
      h('ul', { className: 'app-days' }, C.DAYS.filter((d) => d !== sel.day).map((d) => h('li', {},
        button(d, { dataset: { move: d }, onclick: () => {
          const r = C.move(s, sel.id, d, q('#cal-move-time').value || undefined);
          lastSay = r.say || r.fail;
          render(); os?.say?.(lastSay);
        } })))),
      ...field('cal-who', 'Invite who'),
      button('Send invite', { id: 'cal-invite', className: 'app-btn primary', onclick: onInvite })),
    h('h3', { className: 'app-h3' }, 'The week'),
    h('ul', { className: 'app-days' }, C.DAYS.map((d) => h('li', {},
      button(d === s.today ? `${d}, today` : d, { dataset: { day: d }, ariaPressed: String(d === s.showing),
        onclick: () => { s.showing = d; s.selected = null; render(); } })))),
    h('h3', { className: 'app-h3' }, 'Add a plan'),
    ...field('cal-title', 'What'),
    ...field('cal-day', 'Which day'),
    ...field('cal-time', 'What time, like 13:00', { inputMode: 'numeric' }),
    button('Add', { id: 'cal-add', onclick: () => {
      s.selected = null;
      C.add(s, { title: q('#cal-title').value, day: q('#cal-day').value, time: q('#cal-time').value });
      render();
    } }),
  ));
}

async function onInvite() {
  const sel = C.event(s, s.selected), who = q('#cal-who').value;
  if (!sel || !who) return;
  const readback = app.actions.invite.readback(s, { id: sel.id, who });
  if (os?.confirm && !(await os.confirm({ gate: 'send', readback }))) return;
  if (C.invite(s, sel.id, who)) render();
}
