// Travel: find flights, pick one, hold it (gate: pay, simulated; nothing is charged). Invented airlines.
// shortcut: offline results for London to Lisbon only; swap findFlights' source for Gemini grounded search when the key lands.
import { controls, h, placeLine, swap, money, style } from '../shop/ui.js';

const ROUTES = {
  'london-lisbon': { from: 'London', to: 'Lisbon', flights: [
    { id: 'NL204', time: '06:55', spoken: 'six fifty-five', airline: 'Northline', airport: 'Gatwick', stops: 0, hours: 'two hours forty-five', price: 7200 },
    { id: 'TA311', time: '09:40', spoken: 'nine forty', airline: 'Tagus Air', airport: 'Heathrow', stops: 0, hours: 'two hours fifty', price: 8800 },
    { id: 'AT118', time: '14:20', spoken: 'two twenty', airline: 'Atlantica', airport: 'Stansted', stops: 1, hours: 'five hours ten, one stop in Porto', price: 6100 },
  ] },
};
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export function dateForDay(day, now = new Date(), next = false) {
  const target = DAYS.indexOf(String(day).toLowerCase());
  if (target < 0) return null;
  const today = new Date(now);
  const from = (today.getUTCDay() + 6) % 7;
  let offset = (target - from + 7) % 7;
  if (next && offset === 0) offset = 7;
  today.setUTCHours(0, 0, 0, 0);
  today.setUTCDate(today.getUTCDate() + offset);
  return today.toISOString().slice(0, 10);
}
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9:]+/g, ' ').trim();
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const SIM = 'Simulated fares for the demo. Nothing is booked or charged.';
const sentence = (f) => `${f.airline} at ${f.spoken} from ${f.airport}, ${f.stops ? f.hours : `direct, ${f.hours}`}, ${money(f.price)}.`;

// "9:40", "the 9:40", "940", "nine forty", "the second", "2" -> a flight in the results.
const POINTER = /^(it|that|this|that one|this one|the one|the same one|this flight|that flight)$/;
function pickOf(q, flights) {
  const n = norm(q);
  const ord = ['first', 'second', 'third'].findIndex((w) => n.includes(w));
  if (ord >= 0) return flights[ord];
  if (/^\d$/.test(n)) return flights[Number(n) - 1];
  if (/cheap/.test(n)) return flights.reduce((a, f) => (f.price < a.price ? f : a));
  if (/earliest|morning/.test(n)) return flights[0];
  if (/latest|afternoon|\blast\b/.test(n)) return flights.at(-1);
  if (/direct|non ?stop/.test(n)) return flights.find((f) => !f.stops);
  const digits = n.replace(/\D/g, '');
  return flights.find((f) => (digits.length >= 3 && f.time.replace(/\D/g, '').replace(/^0/, '') === digits.replace(/^0/, ''))
    || n.includes(f.spoken) || n.includes(norm(f.airline)) || n === norm(f.id));
}

export function createTravel({ now = () => new Date() } = {}) {
  let root = null, body = null, doc = null, ui = null, s = {}, confirm = null, holding = null, requestedDate = null, lastSearch = null;
  const fresh = () => ({ view: 'search', query: null, results: [], selected: null, held: null });
  const sel = () => s.results.find((f) => f.id === s.selected);
  // The flight a hold means: the one named ("book the 9:40"), else the one open. Thrown words are spoken.
  const target = (st, p) => {
    const list = () => `There's the ${st.results.map((x) => x.time).join(', the ')}.`;
    const named = p.flight && st.results.length ? pickOf(p.flight, st.results) : null;
    if (named) return named;
    // Only a pointer ("it", "that one") means the open flight; any other name not on the list is refused, never a silent fallback.
    if (named === undefined && !POINTER.test(norm(p.flight))) throw new Error(`The ${p.flight.replace(/^the /i, '')} isn't on the list. ${list()}`);
    const f = st.results.find((x) => x.id === st.selected);
    if (f) return f;
    throw new Error(st.results.length ? `Which flight? ${list()}` : 'Find the flights first.');
  };

  // Hold is a pay gate (spec §3.7): a person's own tap asks through os.confirm (fingerprint included);
  // when the agent pressed it, the runner already asked and os.confirm answers yes at once.
  async function hold() {
    if (!sel()) return;
    if (confirm && !(await confirm({ gate: 'pay', readback: app.actions.hold.readback(s) }))) return;
    if (!sel()) return;
    s.held = { ...sel(), day: s.query.day, ref: `MUR-${sel().id}` }; s.view = 'held'; render();
  }
  const on = {
    search(key) {
      const [route, day] = key.split('|');
      s.query = { from: ROUTES[route].from, to: ROUTES[route].to, day, date: requestedDate || dateForDay(day, now()) };
      s.results = structuredClone(ROUTES[route].flights);
      s.selected = null; s.view = 'results'; render();
    },
    pick(id) { s.selected = id; s.view = 'flight'; render(); },
    hold() { holding = hold(); return holding; },
    back() { s.view = s.results.length ? 'results' : 'search'; s.selected = s.view === 'results' ? null : s.selected; render(); },
    newSearch() { s.view = 'search'; render(); },
  };

  function render() {
    if (!root) return;
    ui.clear();
    const E = (t, p, ...k) => h(doc, t, p, ...k);
    const kids = [placeLine(doc, app.place().where, 'Travel')];
    if (s.view === 'search') kids.push(E('p', {}, 'Flights from London to Lisbon.'),
      E('ul', {}, DAYS.slice(4).map((d) => E('li', {}, E('span', {}, cap(d)), ui.btn('search', `Find flights on ${cap(d)}`, on.search, { arg: `london-lisbon|${d}` })))));
    else if (s.view === 'results') kids.push(E('ul', {}, s.results.map((f) => E('li', {}, E('span', {}, sentence(f)), ui.btn('pick', `Pick the ${f.time}, ${f.airline}`, on.pick, { arg: f.id })))),
      ui.btn('newSearch', 'New search', on.newSearch));
    else if (s.view === 'flight') kids.push(E('p', {}, sentence(sel())), ui.btn('hold', 'Hold this flight', on.hold, { main: true }), ui.btn('back', 'Back to the flights', on.back));
    else kids.push(E('p', {}, app.read()), ui.btn('back', 'Back to the flights', on.back));
    if (s.view !== 'held') kids.push(E('p', { className: 'm-app-sim' }, SIM));
    swap(body, kids);
  }

  const app = {
    id: 'travel', name: 'Travel',
    async mount(el, os = {}) {
      root = el; confirm = os.confirm || null; doc = el.ownerDocument; ui = controls(doc); style(doc);
      body = h(doc, 'div', { className: 'm-app-body' });
      root.append(h(doc, 'h2', { id: 'travel-h', textContent: 'Travel' }), body);
      render();
    },
    read() {
      if (s.view === 'held') return `Held: ${s.held.airline}, ${cap(s.held.day)} at ${s.held.spoken}, for 24 hours. Nothing is charged.`;
      if (s.view === 'flight') return sentence(sel());
      if (s.view === 'results') return `Three flights ${cap(s.query.day)}. ${s.results.map(sentence).join(' ')} ${SIM}`;
      return 'Travel. Ask for flights from London to Lisbon.';
    },
    place() {
      if (s.view === 'results') return { where: `Flights to ${s.query.to}, ${cap(s.query.day)}`, item: 'the flights', n: 1, of: s.results.length, next: 'pick' };
      if (s.view === 'flight') return { where: `The ${sel().time} to ${s.query.to}`, item: 'one flight', n: s.results.indexOf(sel()) + 1, of: s.results.length, next: 'hold' };
      if (s.view === 'held') return { where: 'Flight held', item: s.held.ref, n: 1, of: 1, next: null };
      return { where: 'Travel', item: 'search', n: 1, of: 1, next: 'findFlights' };
    },
    state() { return structuredClone(s); },
    async seed() { s = fresh(); render(); },
    async reset() { await app.seed(); },
    actions: {
      findFlights: {
        describe: 'Find flights', doing: 'Finding flights',
        params: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, day: { type: 'string' } }, required: ['to'] },
        gate: null,
        hint: 'Each day has a Find flights button',
        async run(p, ctx) {
          const from = norm(p.from || 'london'), to = norm(p.to);
          const day = DAYS.find((d) => norm(p.day || 'friday').includes(d));
          if (!from.includes('london') || !to.includes('lisbon')) throw new Error('I can only find flights from London to Lisbon today.');
          if (!day || DAYS.indexOf(day) < 4) throw new Error('I have Friday, Saturday and Sunday. Which day?');
          if (s.view === 'flight' || s.view === 'held') await ctx.tap(ui.find('back'));
          if (s.view === 'results') await ctx.tap(ui.find('newSearch'));
          requestedDate = dateForDay(day, now(), /\bnext\b/i.test(p.day || ''));
          lastSearch = { day, date: requestedDate };
          try { await ctx.tap(ui.find('search', `london-lisbon|${day}`)); }
          finally { requestedDate = null; }
        },
        verify(st, p) {
          const day = DAYS.find((d) => norm(p.day || 'friday').includes(d));
          const date = lastSearch?.day === day ? lastSearch.date : null;
          return (st.view === 'results' && st.results.length === 3 && st.query.day === day && st.query.date === date) || 'The flights are not showing for that date.';
        },
      },
      pick: {
        describe: 'Pick one of the flights found', doing: 'Picking the flight',
        params: { type: 'object', properties: { flight: { type: 'string' } }, required: ['flight'] },
        gate: null,
        hint: 'Each flight has a Pick button after its price',
        async run(p, ctx) {
          if (!s.results.length) throw new Error('Find the flights first.');
          const f = pickOf(p.flight, s.results);
          if (!f) throw new Error(`There's no ${p.flight}. There's the ${s.results.map((x) => x.time).join(', the ')}.`);
          if (s.view !== 'results') await ctx.tap(ui.find('back'));
          await ctx.tap(ui.find('pick', f.id));
        },
        verify(st, p) { const f = pickOf(p.flight, st.results); return (!!f && st.selected === f.id && st.view === 'flight') || 'That flight is not open.'; },
      },
      hold: {
        describe: 'Hold the picked flight for 24 hours', doing: 'Holding the flight',
        params: { type: 'object', properties: { flight: { type: 'string' } } },
        gate: 'pay',
        hint: 'Hold this flight is the large button under the flight',
        readback(st, p = {}) { const f = target(st, p); return `${f.airline}, ${cap(st.query.day)} at ${f.spoken} from ${f.airport} to ${st.query.to}, ${money(f.price)}, held for 24 hours.`; },
        async run(p, ctx) {
          const f = target(s, p);
          if (s.selected !== f.id || s.view !== 'flight') {
            if (s.view !== 'results') await ctx.tap(ui.find('back'));
            await ctx.tap(ui.find('pick', f.id));
          }
          await ctx.tap(ui.find('hold'));
          await holding; // the click's handler awaits os.confirm; settle it before the runner verifies
        },
        verify(st, p = {}) { const f = p.flight && pickOf(p.flight, st.results); return (st.view === 'held' && !!st.held && st.held.id === (f ? f.id : st.selected)) || 'The flight is not held.'; },
      },
    },
  };
  // The runner speaks done(); say what the step found or left (the flights, the bus, the basket), not just "Done."
  for (const x of Object.values(app.actions)) x.done ??= () => app.read();
  s = fresh();
  return app;
}

export default createTravel();
