// Travel: find flights, pick one, hold it (gate: pay, simulated; nothing is charged). Invented airlines.
// shortcut: offline results for London to Lisbon only; swap findFlights' source for Gemini grounded search when the key lands.
import { btn, esc, find, money, style, wire } from '../shop/ui.js';

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
  let root = null, os = {}, armed = false, s = {};
  const fresh = () => ({ view: 'search', query: null, results: [], selected: null, held: null });
  const render = () => { if (root) root.innerHTML = html(); };
  const sel = () => s.results.find((f) => f.id === s.selected);

  const handlers = {
    search(key) {
      const [route, day] = key.split('|');
      s.query = { from: ROUTES[route].from, to: ROUTES[route].to, day };
      s.results = structuredClone(ROUTES[route].flights);
      s.selected = null; s.view = 'results'; render();
    },
    pick(id) { s.selected = id; s.view = 'flight'; render(); },
    async hold() {
      if (!sel()) return;
      if (!armed) { const ok = await os.confirm?.({ gate: 'pay', readback: app.actions.hold.readback(s) }); if (!ok) return; }
      armed = false;
      s.held = { ...sel(), day: s.query.day, ref: `MUR-${sel().id}` };
      s.view = 'held'; render();
    },
    back() { s.view = s.results.length ? 'results' : 'search'; s.selected = null; render(); },
  };

  function html() {
    let body;
    if (s.view === 'search') body = `<p>Flights from London to Lisbon.</p><ul>${DAYS.slice(4).map((d) => `<li><span>${cap(d)}</span>${btn('search', `Find flights on ${cap(d)}`, `london-lisbon|${d}`)}</li>`).join('')}</ul>`;
    else if (s.view === 'results') body = `<ul>${s.results.map((f) => `<li><span>${esc(sentence(f))}</span>${btn('pick', `Pick the ${f.time}`, f.id)}</li>`).join('')}</ul>`;
    else if (s.view === 'flight') body = `<p>${esc(sentence(sel()))}</p><button type="button" class="m-app-btn" data-act="hold" data-main>Hold this flight</button>${btn('back', 'Back to the flights')}`;
    else body = `<p role="status">${esc(app.read())}</p>${btn('back', 'Back to the flights')}`;
    return `<section class="m-app" aria-labelledby="travel-h"><h1 id="travel-h" tabindex="-1">Travel</h1>
      <p class="m-app-place">${esc(app.place().where)}</p>${body}</section>`;
  }

  const app = {
    id: 'travel', name: 'Travel',
    mount(el, theOs = {}) { root = el; os = theOs; style(el.ownerDocument); wire(root, handlers); render(); },
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
    seed() { s = fresh(); armed = false; render(); },
    reset() { app.seed(); },
    actions: {
      findFlights: {
        describe: 'Find flights',
        params: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, day: { type: 'string' } }, required: ['to'] },
        gate: null,
        hint: 'Each day has a Find flights button',
        async run(p, ctx) {
          const from = norm(p.from || 'london'), to = norm(p.to);
          const day = DAYS.find((d) => norm(p.day || 'friday').includes(d));
          if (!from.includes('london') || !to.includes('lisbon')) throw new Error('I can only find flights from London to Lisbon today.');
          if (!day || DAYS.indexOf(day) < 4) throw new Error('I have Friday, Saturday and Sunday. Which day?');
          if (s.view !== 'search') { s.view = 'search'; render(); } // shortcut: no visible "new search" button yet; add one if Atlas asks
          await ctx.tap(find(root, 'search', `london-lisbon|${day}`));
        },
        verify(st, p) { return st.view === 'results' && st.results.length === 3 && norm(p.day || 'friday').includes(st.query.day); },
      },
      pick: {
        describe: 'Pick a flight',
        params: { type: 'object', properties: { flight: { type: 'string' } }, required: ['flight'] },
        gate: null,
        hint: 'Each flight has a Pick button after its price',
        async run(p, ctx) {
          if (!s.results.length) throw new Error('Find the flights first.');
          const f = pickOf(p.flight, s.results);
          if (!f) throw new Error(`There's no ${p.flight}. There's the ${s.results.map((x) => x.time).join(', the ')}.`);
          if (s.view !== 'results') await ctx.tap(find(root, 'back'));
          await ctx.tap(find(root, 'pick', f.id));
        },
        verify(st, p) { const f = pickOf(p.flight, st.results); return !!f && st.selected === f.id && st.view === 'flight'; },
      },
      hold: {
        describe: 'Hold the flight',
        params: { type: 'object', properties: {} },
        gate: 'pay',
        hint: 'Hold this flight is the large button under the flight',
        readback(st = s) { const f = st.results.find((x) => x.id === st.selected); return `${f.airline}, ${cap(st.query.day)} at ${f.spoken} from ${f.airport} to ${st.query.to}, ${money(f.price)}, held for 24 hours.`; },
        async run(p, ctx) {
          if (!sel()) throw new Error('Pick a flight first.');
          armed = true;
          try { await ctx.tap(find(root, 'hold')); } finally { armed = false; }
        },
        verify(st) { return st.view === 'held' && !!st.held && st.held.id === st.selected; },
      },
    },
  };
  s = fresh();
  return app;
}

export default createTravel();
