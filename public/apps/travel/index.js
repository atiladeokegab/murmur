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
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9:]+/g, ' ').trim();
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const sentence = (f) => `${f.airline} at ${f.spoken} from ${f.airport}, ${f.stops ? f.hours : `direct, ${f.hours}`}, ${money(f.price)}.`;

// "9:40", "the 9:40", "940", "nine forty", "the second", "2" -> a flight in the results.
function pickOf(q, flights) {
  const n = norm(q);
  const ord = ['first', 'second', 'third'].findIndex((w) => n.includes(w));
  if (ord >= 0) return flights[ord];
  if (/^\d$/.test(n)) return flights[Number(n) - 1];
  const digits = n.replace(/\D/g, '');
  return flights.find((f) => (digits.length >= 3 && f.time.replace(/\D/g, '').replace(/^0/, '') === digits.replace(/^0/, ''))
    || n.includes(f.spoken) || n.includes(norm(f.airline)) || n === norm(f.id));
}

export function createTravel() {
  let root = null, body = null, doc = null, ui = null, s = {};
  const fresh = () => ({ view: 'search', query: null, results: [], selected: null, held: null });
  const sel = () => s.results.find((f) => f.id === s.selected);

  // A person's own tap on Hold is their yes (contract §7); the agent's tap comes after the runner's gate.
  const on = {
    search(key) {
      const [route, day] = key.split('|');
      s.query = { from: ROUTES[route].from, to: ROUTES[route].to, day };
      s.results = structuredClone(ROUTES[route].flights);
      s.selected = null; s.view = 'results'; render();
    },
    pick(id) { s.selected = id; s.view = 'flight'; render(); },
    hold() { if (!sel()) return; s.held = { ...sel(), day: s.query.day, ref: `MUR-${sel().id}` }; s.view = 'held'; render(); },
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
    swap(body, kids);
  }

  const app = {
    id: 'travel', name: 'Travel',
    async mount(el) {
      root = el; doc = el.ownerDocument; ui = controls(doc); style(doc);
      body = h(doc, 'div', { className: 'm-app-body' });
      root.append(h(doc, 'h2', { id: 'travel-h', textContent: 'Travel' }), body);
      render();
    },
    read() {
      if (s.view === 'held') return `Held: ${s.held.airline}, ${cap(s.held.day)} at ${s.held.spoken}, for 24 hours. Nothing is charged.`;
      if (s.view === 'flight') return sentence(sel());
      if (s.view === 'results') return `Three flights ${cap(s.query.day)}. ${s.results.map(sentence).join(' ')}`;
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
          await ctx.tap(ui.find('search', `london-lisbon|${day}`));
        },
        verify(st, p) { return (st.view === 'results' && st.results.length === 3 && norm(p.day || 'friday').includes(st.query.day)) || 'The flights are not showing.'; },
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
        params: { type: 'object', properties: {} },
        gate: 'pay',
        hint: 'Hold this flight is the large button under the flight',
        readback(st) { const f = st.results.find((x) => x.id === st.selected); return `${f.airline}, ${cap(st.query.day)} at ${f.spoken} from ${f.airport} to ${st.query.to}, ${money(f.price)}, held for 24 hours.`; },
        async run(p, ctx) {
          if (!sel()) throw new Error('Pick a flight first.');
          await ctx.tap(ui.find('hold'));
        },
        verify(st) { return (st.view === 'held' && !!st.held && st.held.id === st.selected) || 'The flight is not held.'; },
      },
    },
  };
  s = fresh();
  return app;
}

export default createTravel();
