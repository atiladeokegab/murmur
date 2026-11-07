// Transit: next bus, directions to a saved place, when to leave. A simulated timetable that starts at seed().
import { controls, h, placeLine, swap, minutes, num, spokenTime, style } from '../shop/ui.js';

const STOPS = { library: 'the stop by the library', market: 'the stop on Market Street' };
// first: minutes after seed() of the first bus; every: minutes between buses.
const ROUTES = {
  25: { stop: 'library', toward: 'Station Road', first: 4, every: 12 },
  8: { stop: 'market', toward: 'Elm Park', first: 9, every: 20 },
};
const PLACES = {
  work: { name: 'Work', route: 25, walk: 3, stops: 6, ride: 14, off: 'Station Road', end: 'Work is a minute from the stop.' },
  mum: { name: "Mum's", route: 8, walk: 5, stops: 9, ride: 22, off: 'Elm Park', end: "Mum's is the blue door opposite." },
  library: { name: 'The library', route: null, walk: 6, end: 'Walk down Hill Street; the library is on your left.' },
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const placeOf = (q) => { const n = norm(q).replace(/^(to |my )+/, '').replace(/ s$/, ''); return Object.keys(PLACES).find((k) => n && (k === n || norm(PLACES[k].name).startsWith(n) || n.includes(k))) || null; };
const routeOf = (q) => (q == null || q === '' ? null : ROUTES[String(q).replace(/\D/g, '')] ? String(q).replace(/\D/g, '') : undefined);

export function createTransit({ now = () => Date.now() } = {}) {
  let root = null, body = null, doc = null, ui = null, s = {};
  const fresh = () => ({ view: 'home', seededAt: now(), shown: null });
  
  // Minutes until route r's next bus that you can still reach after walking `walk` minutes.
  function next(r, walk = 0) {
    const R = ROUTES[r], t = (now() - s.seededAt) / 60e3 + walk;
    const k = Math.max(0, Math.ceil((t - R.first) / R.every));
    const at = s.seededAt + (R.first + k * R.every) * 60e3;
    return { route: r, at, inMin: Math.max(0, Math.round((at - now()) / 60e3)) };
  }

  function line() {
    const sh = s.shown;
    if (!sh) return 'Transit. Ask for the next bus, or directions to Work, Mum\'s or the library.';
    if (s.view === 'next') { const n = next(sh.route); return `The ${sh.route} leaves ${minutes(n.inMin)} from ${STOPS[ROUTES[sh.route].stop]}.`; }
    const P = PLACES[sh.place];
    if (s.view === 'directions') return steps(sh.place).join(' ');
    if (!P.route) return `Leave whenever you like; it's a ${num(P.walk)} minute walk.`;
    const n = next(P.route, P.walk), leave = Math.max(0, n.inMin - P.walk);
    const arrive = new Date(n.at + P.ride * 60e3);
    return `${leave === 0 ? 'Leave now' : `Leave ${minutes(leave)}`} to catch the ${P.route} at ${spokenTime(new Date(n.at))}. You'll be at ${P.name.toLowerCase()} by ${spokenTime(arrive)}.`;
  }

  function steps(place) {
    const P = PLACES[place];
    if (!P.route) return [`It's a ${num(P.walk)} minute walk.`, P.end];
    const R = ROUTES[P.route];
    return [`Walk ${num(P.walk)} minutes to ${STOPS[R.stop]}.`, `Take the ${P.route} toward ${R.toward}, ${num(P.stops)} stops.`, `Get off at ${P.off}.`, P.end];
  }

  function show(view, shown) { s.view = view; s.shown = shown; render(); }
  const on = {
    next(r) { show('next', { route: r }); },
    directions(p) { show('directions', { place: p }); },
    leave(p) { show('leave', { place: p }); },
    back() { show('home', null); },
  };

  function render() {
    if (!root) return;
    ui.clear();
    const E = (t, p, ...k) => h(doc, t, p, ...k);
    const kids = [placeLine(doc, app.place().where, 'Transit')];
    if (s.view === 'home') {
      kids.push(E('h3', {}, 'Next bus'),
        E('ul', {}, Object.entries(ROUTES).map(([r, R]) => E('li', {}, E('span', {}, `The ${r} from ${STOPS[R.stop]}, ${minutes(next(r).inMin)}`), ui.btn('next', `When does the ${r} leave`, on.next, { arg: r })))),
        E('h3', {}, 'Saved places'),
        E('ul', {}, Object.entries(PLACES).map(([k, P]) => E('li', {}, E('span', {}, P.name),
          ui.btn('directions', `Directions to ${P.name}`, on.directions, { arg: k }), ui.btn('leave', `When to leave for ${P.name}`, on.leave, { arg: k })))));
    } else {
      kids.push(s.view === 'directions' ? E('ol', {}, steps(s.shown.place).map((t) => E('li', {}, t))) : E('p', {}, line()),
        ui.btn('back', 'Back to Transit', on.back));
    }
    swap(body, kids);
  }

  const go = async (ctx, act, arg) => { if (s.view !== 'home') await ctx.tap(ui.find('back')); await ctx.tap(ui.find(act, arg)); };
  const needPlace = (p) => { const k = placeOf(p.place); if (!k) throw new Error(`I don't have that place saved. I know Work, Mum's and the library.`); return k; };

  const app = {
    id: 'transit', name: 'Transit',
    async mount(el) {
      root = el; doc = el.ownerDocument; ui = controls(doc); style(doc);
      body = h(doc, 'div', { className: 'm-app-body' });
      root.append(h(doc, 'h2', { id: 'transit-h', textContent: 'Transit' }), body);
      render();
    },
    read: line,
    place() {
      const sh = s.shown;
      if (s.view === 'next') return { where: `Next ${sh.route}`, item: 'departure', n: 1, of: 1, next: null };
      if (s.view === 'directions') return { where: `Directions to ${PLACES[sh.place].name}`, item: 'the steps', n: 1, of: steps(sh.place).length, next: null };
      if (s.view === 'leave') return { where: `When to leave for ${PLACES[sh.place].name}`, item: 'leaving time', n: 1, of: 1, next: null };
      return { where: 'Transit', item: 'next buses', n: 1, of: 2, next: 'nextBus' };
    },
    state() {
      const routes = Object.fromEntries(Object.keys(ROUTES).map((r) => [r, { ...ROUTES[r], stopName: STOPS[ROUTES[r].stop], nextInMin: next(r).inMin }]));
      return structuredClone({ view: s.view, shown: s.shown, routes, places: Object.keys(PLACES), said: line() });
    },
    async seed() { s = fresh(); render(); },
    async reset() { await app.seed(); },
    actions: {
      nextBus: {
        describe: 'Find the next bus', doing: 'Finding the next bus',
        params: { type: 'object', properties: { route: { type: 'string' }, place: { type: 'string' } } },
        gate: null,
        hint: 'Each bus has a Next button under Next bus',
        async run(p, ctx) {
          let r = routeOf(p.route);
          if (r === undefined) throw new Error(`No ${p.route} stops near you. There's the 25 and the 8.`);
          if (!r && p.place) r = PLACES[needPlace(p)].route;
          if (!r) r = '25';
          await go(ctx, 'next', String(r));
        },
        verify(st, p) { return (st.view === 'next' && (!routeOf(p.route) || st.shown.route === routeOf(p.route))) || 'The bus times are not showing.'; },
      },
      directions: {
        describe: 'Get directions to a saved place', doing: 'Getting directions',
        params: { type: 'object', properties: { place: { type: 'string' } }, required: ['place'] },
        gate: null,
        hint: 'Directions is the first button beside each saved place',
        async run(p, ctx) { await go(ctx, 'directions', needPlace(p)); },
        verify(st, p) { return (st.view === 'directions' && st.shown.place === placeOf(p.place)) || 'The directions are not showing.'; },
      },
      whenToLeave: {
        describe: 'Work out when to leave for a saved place', doing: 'Working out when to leave',
        params: { type: 'object', properties: { place: { type: 'string' } }, required: ['place'] },
        gate: null,
        hint: 'When to leave is the second button beside each saved place',
        async run(p, ctx) { await go(ctx, 'leave', needPlace(p)); },
        verify(st, p) { return (st.view === 'leave' && st.shown.place === placeOf(p.place)) || 'The leaving time is not showing.'; },
      },
    },
  };
  // The runner speaks done(); say what the step found or left (the flights, the bus, the basket), not just "Done."
  for (const x of Object.values(app.actions)) x.done ??= () => app.read();
  s = fresh();
  return app;
}

export default createTransit();
