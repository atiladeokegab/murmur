// Clock on the Murmur SDK (os/contract.md): one timer, one alarm, and the time. Nothing here is gated: the timer
// and alarm are the person's own, and nothing leaves the phone.
// shortcut: the timer and alarm live in memory, so a reload drops them; keep them in kv if that matters.
import { play, buzz } from '../../sound/index.js';

// The clock's hands; tests swap them for a fake clock and a spy on the earcon.
export const env = { now: () => Date.now(), after: (ms, fn) => setTimeout(fn, ms), cancel: (id) => clearTimeout(id), ding: () => { buzz('done'); play('done'); } };

const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90 };
const UNIT = { second: 1e3, sec: 1e3, minute: 6e4, min: 6e4, hour: 36e5, hr: 36e5 };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const adj = (label) => label.replace(/(\w)s\b/g, '$1'); // "your 10 minute timer"

/** "10 minutes", "an hour and a half", "half an hour", "90 seconds" -> ms, or 0 when it is not a length. */
export function lengthOf(said) {
  const t = String(said || '').toLowerCase().replace(/half an hour/g, '30 minutes').replace(/(\d+|\w+) and a half hours?|(\w+) hours? and a half/g,
    (x, a, b) => `${a || b} hours 30 minutes`);
  let ms = 0;
  for (const [, n, u] of t.matchAll(/(\d+(?:\.\d+)?|[a-z-]+(?:\s+(?:one|two|three|four|five|six|seven|eight|nine))?)\s+(second|sec|minute|min|hour|hr)s?\b/g)) {
    const v = /^\d/.test(n) ? Number(n) : n.split(/\s+/).reduce((s, w) => s + (NUM[w] ?? NaN), 0);
    if (v > 0) ms += v * UNIT[u];
  }
  return ms;
}
/** ms -> "10 minutes", "1 hour 30 minutes", "45 seconds". */
export function words(ms) {
  const s = Math.round(ms / 1e3), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h && plural(h, 'hour'), m && plural(m, 'minute'), (sec || !s) && plural(sec, 'second')].filter(Boolean).join(' ');
}
/** "7", "7 am", "7:30", "6.45 pm", "seven" -> { h, m } on the 24 h clock, or null. A bare hour is morning (wake me at 7). */
export function timeOf(said) {
  const m = String(said || '').toLowerCase().trim().match(/^(\d{1,2}|[a-z]+)(?:[:.](\d\d))?\s*(am|pm|a\.m\.|p\.m\.|in the morning|in the evening|tonight)?$/);
  if (!m) return null;
  const h = /^\d/.test(m[1]) ? Number(m[1]) : NUM[m[1]];
  const min = Number(m[2] || 0);
  if (!(h >= 0 && h <= 23 && min < 60)) return null;
  const pm = /p|evening|tonight/.test(m[3] || '');
  return { h: h < 12 && pm ? h + 12 : h === 12 && m[3] && !pm ? 0 : h, m: min };
}
export const clockWords = ({ h, m }) => `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;

const fresh = () => ({ timer: null, alarm: null, said: null, note: '' });
let s = fresh();
let root = null, os = null, body = null, timerId = null, alarmId = null;
const q = (sel) => root && root.querySelector(sel);
const leftWords = () => (s.timer ? `${words(Math.max(0, s.timer.ends - env.now()))} left on your ${adj(s.timer.label)} timer.` : 'No timer is running.');
const nowWords = () => { const d = new Date(env.now()); return `It's ${clockWords({ h: d.getHours(), m: d.getMinutes() })}.`; };
const tell = (e, text) => { if (e?.isTrusted) os?.say?.(text); }; // a person's tap speaks here; the agent's run speaks through ctx.say

function startTimer(ms) {
  env.cancel(timerId);
  const label = words(ms);
  s.timer = { ms, label, ends: env.now() + ms };
  timerId = env.after(ms, () => { s.timer = null; s.note = `Your ${adj(label)} timer is done.`; render(); env.ding(); os?.say?.(`Time's up. Your ${adj(label)} timer is done.`); });
}
function setAlarm(at) {
  env.cancel(alarmId);
  const d = new Date(env.now()); d.setHours(at.h, at.m, 0, 0);
  if (d.getTime() <= env.now()) d.setDate(d.getDate() + 1);
  s.alarm = { ...at, label: clockWords(at) };
  alarmId = env.after(d.getTime() - env.now(), () => { s.alarm = null; s.note = `Alarm: it's ${clockWords(at)}.`; render(); env.ding(); os?.say?.(`${at.h < 12 ? 'Good morning. ' : ''}It's ${clockWords(at)}.`); });
}

const app = {
  id: 'clock',
  name: 'Clock',
  async mount(r, o) {
    root = r; os = o;
    root.append(el('h2', { id: 'clock-h' }, 'Clock'), body = el('div', { className: 'app-body' }));
    render();
  },
  async seed() { render(); },
  async reset() { env.cancel(timerId); env.cancel(alarmId); s = fresh(); render(); },
  state: () => structuredClone(s),
  read: () => [s.timer ? leftWords() : 'No timer.', s.alarm ? `Alarm set for ${s.alarm.label}.` : 'No alarm.'].join(' '),
  place: () => ({ where: 'Clock', item: s.timer ? 'your timer' : 'the timer', next: s.timer ? 'timeLeft' : 'setTimer' }),

  actions: {
    setTimer: {
      describe: 'Set a timer for a length of time',
      doing: 'Setting the timer',
      say: 'Set a timer for 10 minutes',
      params: { type: 'object', properties: { length: { type: 'string', description: 'As said: "10 minutes", "half an hour"' } }, required: ['length'] },
      gate: null,
      hint: 'Type the length in the Timer box, then press Start timer',
      async run(p, ctx) {
        if (!lengthOf(p.length)) throw new Error(`I can't time "${p.length}". Say a length, like 10 minutes.`);
        const box = q('#clock-length');
        await ctx.tap(box); await ctx.type(box, p.length);
        await ctx.tap(q('#clock-start'));
        await ctx.say(`Timer set: ${s.timer.label}.`);
      },
      verify: (st, p) => (st.timer?.ms === lengthOf(p.length)) || 'The timer did not start.',
    },
    timeLeft: {
      describe: 'Say how long is left on the timer',
      doing: 'Checking the timer',
      say: 'How long is left?',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'How long is left is the button under the timer',
      async run(p, ctx) { await ctx.tap(q('#clock-left')); await ctx.say(leftWords()); },
      verify: (st) => st.said === 'left' || 'Nothing was said.',
    },
    cancelTimer: {
      describe: 'Cancel the timer',
      doing: 'Cancelling the timer',
      say: 'Cancel the timer',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Cancel timer is the button under the timer',
      async run(p, ctx) {
        if (!s.timer) throw new Error("There's no timer to cancel.");
        const label = s.timer.label;
        await ctx.tap(q('#clock-cancel'));
        await ctx.say(`Cancelled your ${adj(label)} timer.`);
      },
      verify: (st) => st.timer === null || 'The timer is still running.',
    },
    setAlarm: {
      describe: 'Set the alarm for a time of day',
      doing: 'Setting the alarm',
      say: 'Wake me at 7',
      params: { type: 'object', properties: { time: { type: 'string', description: 'As said: "7", "6:30 am"' } }, required: ['time'] },
      gate: null,
      hint: 'Type the time in the Alarm box, then press Set alarm',
      async run(p, ctx) {
        if (!timeOf(p.time)) throw new Error(`I can't set an alarm for "${p.time}". Say a time, like 7 am.`);
        const box = q('#clock-at');
        await ctx.tap(box); await ctx.type(box, p.time);
        await ctx.tap(q('#clock-alarm'));
        await ctx.say(`Alarm set for ${s.alarm.label}.`);
      },
      verify: (st, p) => (!!st.alarm && st.alarm.label === clockWords(timeOf(p.time))) || 'The alarm was not set.',
    },
    time: {
      describe: 'Say the time',
      doing: 'Checking the time',
      say: 'What time is it?',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'What time is it is the first button',
      async run(p, ctx) { await ctx.tap(q('#clock-now')); await ctx.say(nowWords()); },
      verify: (st) => st.said === 'time' || 'Nothing was said.',
    },
  },
};
export default app;

// ---------- the screen ----------
function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role' || k === 'for') n.setAttribute(k, String(v));
    else if (k === 'onclick') n.addEventListener('click', v);
    else n[k] = v;
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const PAD = 'padding-inline: clamp(0.25rem, 4vw, 1rem)'; // as Messages: 1rem side padding is 64 px at 400%
const button = (text, props = {}) => el('button', { type: 'button', className: 'app-btn', style: PAD, ...props }, text);
const field = (id, label, value = '') => {
  const f = el('input', { id, className: 'app-field', type: 'text', autocomplete: 'off' });
  f.value = value;
  return [el('label', { for: id, className: 'app-label' }, label), f];
};

function render() {
  if (!body) return;
  const had = root.contains(root.ownerDocument.activeElement) && root.ownerDocument.activeElement.id;
  const keep = { length: q('#clock-length')?.value || '', at: q('#clock-at')?.value || '' };
  body.replaceChildren(el('div', {},
    el('p', { className: 'app-done', role: 'status' }, s.note),
    button('What time is it', { id: 'clock-now', onclick: (e) => { s.said = 'time'; tell(e, nowWords()); } }),
    el('h3', { className: 'app-h3' }, 'Timer'),
    s.timer ? el('p', { className: 'app-why' }, `${adj(s.timer.label)} timer running.`) : null,
    s.timer ? null : field('clock-length', 'Timer length, like 10 minutes', keep.length),
    s.timer ? null : button('Start timer', { id: 'clock-start', className: 'app-btn primary', onclick: (e) => {
      const ms = lengthOf(q('#clock-length').value);
      if (!ms) { s.note = 'Type a length, like 10 minutes.'; render(); return; }
      startTimer(ms); s.note = `Timer set: ${s.timer.label}.`; render(); tell(e, s.note);
    } }),
    button('How long is left', { id: 'clock-left', onclick: (e) => { s.said = 'left'; tell(e, leftWords()); } }),
    s.timer ? button('Cancel timer', { id: 'clock-cancel', onclick: (e) => {
      const label = s.timer.label;
      env.cancel(timerId); s.timer = null; s.note = `Cancelled your ${adj(label)} timer.`; render(); tell(e, s.note);
    } }) : null,
    el('h3', { className: 'app-h3' }, 'Alarm'),
    el('p', { className: 'app-why' }, s.alarm ? `Alarm set for ${s.alarm.label}.` : 'No alarm.'),
    ...field('clock-at', 'Alarm time, like 7 am', keep.at),
    button('Set alarm', { id: 'clock-alarm', onclick: (e) => {
      const at = timeOf(q('#clock-at').value);
      if (!at) { s.note = 'Type a time, like 7 am.'; render(); return; }
      setAlarm(at); s.note = `Alarm set for ${s.alarm.label}.`; render(); tell(e, s.note);
    } }),
  ));
  if (had) (q(`#${had}`) || q('h2'))?.focus?.();
}
