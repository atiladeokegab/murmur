// Places: how far, the way there, what's nearby and what's open, by voice. Read-only: no gates. Contract: os/contract.md.
// Invented places only. "Now" is fixed at Monday 09:00, like Calendar, so the demo and the eval always hear the same day.
// Short by default ("A 10-minute walk."); the co-designer's longer answer comes on "tell me more" through `more`.
const NOW = '09:00';
// open/close: 24-hour "HH:MM"; null for a place with no hours. bus: null when it is close enough to walk.
const PLACES = [
  { id: 'shopping', name: 'the shopping centre', words: ['shopping', 'shops', 'mall'], metres: 800, walk: 10, bus: { n: '24', mins: 4, every: 8 },
    route: ['left out of the door', 'straight on for 400 metres', 'cross at the lights', "it's on your right"], open: '09:00', close: '20:00' },
  { id: 'library', name: 'the library', words: ['library'], metres: 600, walk: 8, bus: { n: '24', mins: 3, every: 8 },
    route: ['right out of the door', 'second left onto the high street', 'past the post box', "it's the building with the ramp, on your left"], open: '10:00', close: '17:00' },
  { id: 'station', name: 'the station', words: ['station', 'train'], metres: 1200, walk: 15, bus: { n: '7', mins: 5, every: 10 },
    route: ['left out of the door', 'straight on to the end of the road', 'cross at the zebra crossing', 'follow the railings for 300 metres', 'the entrance is ahead, with step-free access'], open: '05:00', close: '24:00' },
  { id: 'pharmacy', name: 'the pharmacy', words: ['pharmacy', 'chemist'], metres: 300, walk: 4, bus: null,
    route: ['left out of the door', 'straight on for 300 metres', "it's on your left, after the bakery smell"], open: '09:00', close: '18:00' },
  { id: 'mum', name: "Mum's house", words: ['mum', 'mom', 'mother'], metres: 2400, walk: 30, bus: { n: '12', mins: 9, every: 15 },
    route: ['right out of the door', 'take bus 12 from the stop outside', 'get off at the fourth stop', 'second door on the left'], open: null, close: null },
  { id: 'park', name: 'the park', words: ['park'], metres: 450, walk: 6, bus: null,
    route: ['right out of the door', 'straight on for 450 metres', 'the gate is on your right, by the bench'], open: '07:00', close: '21:00' },
  { id: 'cafe', name: 'the café on the corner', words: ['cafe', 'coffee'], metres: 150, walk: 2, bus: null,
    route: ['left out of the door', 'walk to the corner', 'the door is on your right'], open: '07:30', close: '17:00' },
];

let root = null, places = [], open = null, view = 'list';

// ---------- plain helpers (pure: verify and more use them on state) ----------
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/'s\b/g, '').replace(/[^a-z ]/g, ' ')
  .replace(/\b(the|a|my)\b/g, ' ').replace(/\s+/g, ' ').trim();
/** "the shopping centre", "shops", "Mum's", "cafe" -> the place; null if none. */
export function findPlace(list, said) {
  const q = norm(said);
  if (!q) return null;
  return list.find((p) => norm(p.name) === q) ?? list.find((p) => p.words.some((w) => q.split(' ').includes(w))) ?? null;
}
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export function spoken(t) {
  const [h, m] = t.split(':').map(Number);
  if (h % 24 === 0 && !m) return 'midnight';
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}
const dist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(/\.0$/, '')} kilometres` : `${m} metres`);
const nearest = (list) => list.slice().sort((a, b) => a.metres - b.metres).slice(0, 3);

export function farLine(p) {
  return `A ${p.walk}-minute walk${p.walk > 20 && p.bus ? `, or ${p.bus.mins} minutes on bus ${p.bus.n}` : ''}.`;
}
export const routeLine = (p) => `${cap(p.route.join(', '))}.`;
export function hoursLine(p, now = NOW) {
  if (!p.open) return `${cap(p.name)} has no opening hours.`;
  const t = mins(now);
  if (t >= mins(p.open) && t < mins(p.close)) return `Open now, until ${spoken(p.close)}.`;
  return `Closed now. Opens at ${spoken(p.open)}.`;
}
export const nearbyLine = (list) => `Nearest: ${nearest(list).map((p) => `${p.name}, ${p.walk} minutes`).join('; ')}.`;
/** The co-designer's longer answer: distance, walking time, the bus, and the route. */
export function moreLine(p) {
  return [`${cap(dist(p.metres))}.`, `Walking: ${p.walk} minutes at your usual pace.`,
    p.bus ? `Bus ${p.bus.n} from the stop outside: ${p.bus.mins} minutes, every ${p.bus.every} minutes.` : "No bus: it's close enough to walk.",
    `Route: ${p.route.join(', ')}.`].join(' ');
}
const hoursMore = (p) => (p.open ? `Open ${spoken(p.open)} to ${spoken(p.close)} every day. ${moreLine(p)}` : `${hoursLine(p)} ${moreLine(p)}`);
const nearbyMore = (list) => nearest(list).map((p) => `${cap(p.name)}: ${dist(p.metres)}, ${p.walk} minutes' walk. ${hoursLine(p)}`).join(' ');

// ---------- the screen ----------
function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (k.startsWith('aria-') || k === 'for' || k === 'role') n.setAttribute(k, v); else n[k] = v;
  for (const k of kids) n.append(k);
  return n;
}
const $ = (id) => root.querySelector(`#${id}`);
function btn(id, text, onClick, why) {
  const b = el('button', { type: 'button', id, className: 'app-btn' }, el('span', { className: 'app-title', textContent: text }));
  if (why) b.append(el('span', { className: 'app-why', textContent: why }));
  b.addEventListener('click', onClick);
  return b;
}
const cur = () => places.find((p) => p.id === open) ?? null;
const go = (id, v) => { open = id; view = v; render(); };
const items = (lines) => el('ul', { className: 'app-list' }, ...lines.map((t) => el('li', { className: 'app-place', textContent: t })));

function render() {
  const p = cur();
  let body;
  if (p) {
    const facts = view === 'route' ? el('ol', { id: 'places-route', className: 'app-list' }, ...p.route.map((s) => el('li', { className: 'app-place', textContent: `${cap(s)}.` })))
      : view === 'hours' ? items([hoursLine(p), p.open ? `${spoken(p.open)} to ${spoken(p.close)}, every day.` : 'Ring first.'])
        : items([farLine(p), `${cap(dist(p.metres))}.`, p.bus ? `Bus ${p.bus.n}: ${p.bus.mins} minutes, every ${p.bus.every} minutes.` : 'No bus needed.']);
    body = [el('h3', { id: 'places-place-h', className: 'app-h', tabIndex: -1, textContent: cap(p.name) }), facts,
      btn('places-far', 'How far', () => go(p.id, 'far')),
      btn('places-way', 'Route', () => go(p.id, 'route')),
      btn('places-hours', 'Opening hours', () => go(p.id, 'hours')),
      btn('places-back', 'All places', () => go(null, 'list'))];
  } else {
    const list = view === 'nearby' ? nearest(places) : places;
    body = [el('h3', { id: 'places-list-h', className: 'app-h3', tabIndex: -1, textContent: view === 'nearby' ? 'Nearest three' : 'All places' }),
      el('ul', { id: 'places-list', className: 'app-list' }, ...list.map((x) => el('li', {}, btn(`places-${x.id}`, cap(x.name), () => go(x.id, 'far'), farLine(x)))))];
  }
  $('places-body').replaceChildren(...body);
}

// ---------- the app ----------
const placeParam = { type: 'object', properties: { place: { type: 'string', description: "The place as the person said it, like the shopping centre or Mum's house" } }, required: ['place'] };
function pick(said) {
  const p = findPlace(places, said);
  if (!p) throw new Error(`I don't know ${said}. Try ${places.slice(0, 3).map((x) => x.name).join(', ')}.`);
  return p;
}
// Opens the place, then presses the button for what was asked. The person and the agent use the same door.
async function show(ctx, said, buttonId) {
  const p = pick(said);
  if (open !== p.id) { if (open) await ctx.tap($('places-back')); await ctx.tap($(`places-${p.id}`)); }
  await ctx.tap($(buttonId));
  return p;
}
const shows = (v) => (s, p) => {
  const x = findPlace(s.places, p.place);
  return (x && s.open === x.id && s.view === v) || `Places isn't showing ${x ? x.name : p.place}.`;
};

const app = {
  id: 'places',
  name: 'Places',

  async mount(r) {
    root = r;
    root.append(el('h2', { id: 'places-h', textContent: 'Places' }),
      btn('places-nearby', "What's nearby", () => go(null, 'nearby')),
      el('div', { id: 'places-body', className: 'app-body' }));
    places = PLACES.map((p) => ({ ...p }));
    render();
  },

  read() {
    const p = cur();
    if (!p) return view === 'nearby' ? nearbyLine(places) : `${places.map((x) => x.name).join(', ')}.`;
    return `${cap(p.name)}. ${view === 'route' ? routeLine(p) : view === 'hours' ? hoursLine(p) : farLine(p)}`;
  },
  place() {
    const p = cur();
    if (p) return { where: cap(p.name), item: view === 'route' ? 'the route' : view === 'hours' ? 'opening hours' : 'how far', next: view === 'route' ? 'hours' : 'route' };
    return { where: view === 'nearby' ? 'Places, nearby' : 'Places', item: places[0]?.name, n: 1, of: view === 'nearby' ? 3 : places.length, next: 'how far' };
  },
  state() {
    return { now: NOW, open, view, places: places.map((p) => ({ ...p, words: p.words.slice(), route: p.route.slice(), bus: p.bus && { ...p.bus } })), nearby: nearest(places).map((p) => p.id) };
  },
  async seed() { places = PLACES.map((p) => ({ ...p })); render(); }, // fixed data, nothing stored
  async reset() { open = null; view = 'list'; await this.seed(); },

  actions: {
    howFar: {
      describe: 'Say how far a place is, as walking time',
      doing: 'Finding how far',
      hint: 'Pick the place from the list. How far is the first button.',
      params: placeParam,
      async run(p, ctx) { const x = await show(ctx, p.place, 'places-far'); await ctx.say(farLine(x)); },
      verify: shows('far'),
      more: (s, p) => { const x = findPlace(s.places, p.place); return x ? moreLine(x) : ''; },
    },
    route: {
      describe: 'Say the walking route to a place, step by step',
      doing: 'Finding the route',
      hint: 'Pick the place from the list, then Route is the second button.',
      params: placeParam,
      async run(p, ctx) { const x = await show(ctx, p.place, 'places-way'); await ctx.say(routeLine(x)); },
      verify: shows('route'),
      more: (s, p) => { const x = findPlace(s.places, p.place); return x ? moreLine(x) : ''; },
    },
    nearby: {
      describe: "Say what's nearby: the three nearest places",
      doing: "Finding what's nearby",
      hint: "What's nearby is the first button under the heading.",
      params: { type: 'object', properties: {} },
      async run(p, ctx) { await ctx.tap($('places-nearby')); await ctx.say(nearbyLine(places)); },
      verify: (s) => (s.open === null && s.view === 'nearby') || "Places isn't showing what's nearby.",
      more: (s) => nearbyMore(s.places),
    },
    hours: {
      describe: 'Say whether a place is open now, and its opening hours',
      doing: 'Checking opening hours',
      hint: 'Pick the place from the list, then Opening hours is the third button.',
      params: placeParam,
      async run(p, ctx) { const x = await show(ctx, p.place, 'places-hours'); await ctx.say(hoursLine(x)); },
      verify: shows('hours'),
      more: (s, p) => { const x = findPlace(s.places, p.place); return x ? hoursMore(x) : ''; },
    },
  },
};
export default app;
