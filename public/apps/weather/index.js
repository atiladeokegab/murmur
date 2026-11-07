// Weather: the glance out of the window, by voice. Read-only: no gates. Contract: os/contract.md.
// An invented forecast, no real service. "Now" is fixed at Monday 09:00, like Calendar, so the demo and the eval hear the same sky.
// Short by default ("Dry, 12 degrees. Rain from 3."); "tell me more" gives the three-hourly forecast and the wind.
const NOW = 9;
const DAYS = {
  today: { slots: [[9, 'dry', 12], [12, 'cloudy', 14], [15, 'light rain', 12], [18, 'rain', 10], [21, 'dry', 8]],
    wind: 'from the south-west, 15 miles an hour, gusting 25 after 3' },
  tomorrow: { slots: [[9, 'sunny', 10], [12, 'sunny', 15], [15, 'sunny', 16], [18, 'clear', 12], [21, 'clear', 9]],
    wind: 'light, from the west, 5 miles an hour' },
};
// Each period: which day, and which hours of it.
const PERIODS = {
  today: { label: 'Today', day: 'today', from: NOW, to: 23 },
  afternoon: { label: 'This afternoon', day: 'today', from: 12, to: 17 },
  tonight: { label: 'Tonight', day: 'today', from: 18, to: 23 },
  tomorrow: { label: 'Tomorrow', day: 'tomorrow', from: 0, to: 23 },
};
const wet = (c) => /rain|shower|drizzle/.test(c);

let root = null, shown = 'today';

// ---------- plain helpers (pure: verify and more use them) ----------
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
/** "this afternoon", "tomorrow", "now", "", "tonight" -> a period key. Anything else is today. */
export function whenOf(s) {
  const q = String(s ?? '').toLowerCase();
  if (/tomorrow/.test(q)) return 'tomorrow';
  if (/afternoon/.test(q)) return 'afternoon';
  if (/tonight|evening/.test(q)) return 'tonight';
  return 'today';
}
const hour = (h) => `${h % 12 || 12}`; // "Rain from 3": how a person says it
const clock = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
const slotsOf = (key) => { const p = PERIODS[key]; return DAYS[p.day].slots.filter(([h]) => h >= p.from && h <= p.to); };
function rainLine(key) {
  const s = slotsOf(key), i = s.findIndex(([, c]) => wet(c));
  if (i < 0) return key === 'tomorrow' || key === 'today' ? 'Dry all day.' : `Dry ${PERIODS[key].label.toLowerCase()}.`;
  if (i > 0) return `Rain from ${hour(s[i][0])}.`;
  const dry = s.find(([, c], j) => j > 0 && !wet(c));
  return dry ? `Dry from ${hour(dry[0])}.` : 'Rain all evening.';
}
/** The short answer: what it is like, the temperature, and when rain comes. */
export function forecastLine(key) {
  const s = slotsOf(key), [, c, t] = s[0];
  const temp = key === 'today' ? `${t} degrees` : `up to ${Math.max(...s.map((x) => x[2]))} degrees`;
  return `${cap(c)}, ${temp}. ${rainLine(key)}`;
}
export function coatLine(key) {
  const s = slotsOf(key), i = s.findIndex(([, c]) => wet(c));
  if (i === 0) return "Yes, a light one: it's raining.";
  if (i > 0) return `Yes, a light one: rain from ${hour(s[i][0])}.`;
  const hi = Math.max(...s.map((x) => x[2]));
  return hi < 10 ? `Yes, a warm one: it stays under ${hi + 1} degrees.` : `No: dry, up to ${hi} degrees.`;
}
export function rainAnswer(key) {
  const r = rainLine(key);
  return /^Rain from/.test(r) ? `Yes. ${r}` : /^Dry from/.test(r) ? `Yes, it's raining now. ${r}` : `No. ${r}`;
}
/** The longer answer: every three hours, then the wind. */
export function moreLine(key) {
  const p = PERIODS[key];
  return `${slotsOf(key).map(([h, c, t]) => `${clock(h)}: ${c}, ${t} degrees.`).join(' ')} Wind ${DAYS[p.day].wind}.`;
}

// ---------- the screen ----------
function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (k.startsWith('aria-') || k === 'for' || k === 'role') n.setAttribute(k, v); else n[k] = v;
  for (const k of kids) n.append(k);
  return n;
}
const $ = (id) => root.querySelector(`#${id}`);
function render() {
  for (const k of Object.keys(PERIODS)) $(`weather-${k}`).setAttribute('aria-pressed', String(k === shown));
  const p = PERIODS[shown], lines = (cls, xs) => el('ul', { className: 'app-list' }, ...xs.map((t) => el('li', { className: cls, textContent: t })));
  $('weather-body').replaceChildren(
    el('h3', { id: 'weather-period-h', className: 'app-h3', tabIndex: -1, textContent: p.label }),
    lines('app-title', [forecastLine(shown), `Coat: ${coatLine(shown)}`]),
    lines('app-place', [...slotsOf(shown).map(([h, c, t]) => `${clock(h)}: ${c}, ${t} degrees.`), `Wind ${DAYS[p.day].wind}.`]));
}

// ---------- the app ----------
const whenParam = { type: 'object', properties: { when: { type: 'string', description: 'Today, this afternoon, tonight or tomorrow. Leave it out for today' } } };
async function show(ctx, when) { const k = whenOf(when); await ctx.tap($(`weather-${k}`)); return k; }
const shows = (s, p) => s.shown === whenOf(p.when) || `Weather shows ${s.shown}, not ${whenOf(p.when)}.`;

const app = {
  id: 'weather',
  name: 'Weather',

  async mount(r, os) {
    root = r;
    const bar = el('div', { className: 'app-list', role: 'group', 'aria-label': 'When' });
    for (const [k, p] of Object.entries(PERIODS)) {
      // 4vw side padding keeps "This afternoon" on one line at 400%, as in Messages.
      const b = el('button', { type: 'button', id: `weather-${k}`, className: 'app-btn', style: 'padding-inline: clamp(0.25rem, 4vw, 1rem)', textContent: p.label });
      b.addEventListener('click', (e) => { shown = k; render(); if (e?.isTrusted) os?.say?.(app.read()); }); // a person's own tap hears it too
      bar.append(b);
    }
    root.append(el('h2', { id: 'weather-h', textContent: 'Weather' }), bar, el('div', { id: 'weather-body', className: 'app-body' }));
    render();
  },

  read() { return `${PERIODS[shown].label}: ${forecastLine(shown)}`; },
  place() { return { where: `Weather, ${PERIODS[shown].label.toLowerCase()}`, item: forecastLine(shown), next: 'more' }; },
  state() { return { now: NOW, shown, periods: Object.keys(PERIODS) }; },
  async seed() { render(); }, // fixed forecast, nothing stored
  async reset() { shown = 'today'; await this.seed(); },

  actions: {
    forecast: {
      describe: 'Say the weather: today, this afternoon, tonight or tomorrow',
      doing: 'Checking the weather',
      hint: 'The times are buttons under the heading. Pick one to hear it.',
      params: whenParam,
      async run(p, ctx) { await ctx.say(forecastLine(await show(ctx, p.when))); },
      verify: shows,
      more: (s, p) => moreLine(whenOf(p.when)),
    },
    coat: {
      describe: 'Say whether the person needs a coat',
      doing: 'Checking for a coat',
      hint: 'Pick a time under the heading. The coat line is under the forecast.',
      params: whenParam,
      async run(p, ctx) { await ctx.say(coatLine(await show(ctx, p.when))); },
      verify: shows,
      more: (s, p) => moreLine(whenOf(p.when)),
    },
    rain: {
      describe: 'Say whether it will rain, and from when',
      doing: 'Checking for rain',
      hint: 'Pick a time under the heading. When rain comes is in the forecast.',
      params: whenParam,
      async run(p, ctx) { await ctx.say(rainAnswer(await show(ctx, p.when))); },
      verify: shows,
      more: (s, p) => moreLine(whenOf(p.when)),
    },
  },
};
export default app;
