// Maps, as a demo app on the phone: directions home and how far a place is. Read-only: no gates.
// The name is text only, Murmur's own look. Every place is invented, around Stratford.
import { controls, h, placeLine, swap, style } from '../shop/ui.js';

const PLACES = {
  home: { name: 'Home', at: '14 Larkspur Row', miles: 'nine tenths of a mile', walk: 'eighteen minutes',
    route: ['Head north on Station Approach.', 'Left onto Fennel Street, past the market.', 'Right onto Larkspur Row. Home is on the left.'] },
  market: { name: 'Fennel Street Market', at: 'Fennel Street', miles: 'half a mile', walk: 'ten minutes',
    route: ['Head north on Station Approach.', 'Left onto Fennel Street. The market is on your right.'] },
  library: { name: 'Quayside Library', at: '2 Quayside Walk', miles: 'a mile and a half', walk: 'thirty minutes',
    route: ['Head east along the canal path.', 'Cross the footbridge.', 'The library is at the end of Quayside Walk.'] },
  westfield: { name: 'Westfield shopping centre', at: 'the Westfield end of the High Street', miles: 'about a third of a mile', walk: 'about eight minutes', bus: 'two stops on the bus',
    route: ['Head south on Station Approach.', 'Cross at the lights onto the High Street.', 'Westfield is ahead, through the glass doors.'] },
  gym: { name: 'the gym', at: 'Orchard Yard', miles: 'a third of a mile', walk: 'seven minutes',
    route: ['Head south on Station Approach.', 'Right into Orchard Yard. The gym is at the back.'] },
};
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]+/g, ' ').trim();
/** "home", "the market", "Quayside Library", "the gym" -> a place key, else null. */
export function placeOf(q) {
  const n = norm(q).replace(/^(?:the|my) /, '');
  if (!n || /^(home|my house|house)$/.test(n)) return 'home';
  return Object.keys(PLACES).find((k) => k === n || norm(PLACES[k].name).replace(/^the /, '').includes(n) || n.includes(k)) || null;
}
const known = () => `I know home, ${Object.values(PLACES).slice(1).map((p) => p.name).join(', ')}.`;

export function createMaps() {
  let root = null, body = null, doc = null, ui = null, s = {};
  const fresh = () => ({ view: 'home', place: null, mode: null });
  const on = {
    route(k) { s.place = k; s.mode = 'route'; s.view = 'place'; render(); },
    far(k) { s.place = k; s.mode = 'far'; s.view = 'place'; render(); },
    back() { s.view = 'home'; render(); },
  };

  function render() {
    if (!root) return;
    ui.clear();
    const E = (t, p, ...k) => h(doc, t, p, ...k);
    const kids = [placeLine(doc, app.place().where, 'Maps')];
    if (s.view === 'home') kids.push(E('p', {}, 'You are at Stratford station.'),
      E('ul', {}, Object.entries(PLACES).map(([k, p]) => E('li', {}, E('span', {}, p.name[0].toUpperCase() + p.name.slice(1)),
        ui.btn('route', `Directions to ${p.name}`, on.route, { arg: k }), ui.btn('far', `How far is ${p.name}`, on.far, { arg: k })))));
    else {
      const p = PLACES[s.place];
      kids.push(E('p', {}, `${p.name[0].toUpperCase() + p.name.slice(1)}: ${p.miles}, ${p.walk} on foot.`));
      if (s.mode === 'route') kids.push(E('ol', {}, p.route.map((r) => E('li', {}, r))));
      kids.push(ui.btn('back', 'Back to places', on.back));
    }
    swap(body, kids);
  }

  const go = (mode) => async (p, ctx) => {
    const k = placeOf(p.place);
    if (!k) throw new Error(`I don't have ${p.place} on the map. ${known()}`);
    if (s.view !== 'home') await ctx.tap(ui.find('back'));
    await ctx.tap(ui.find(mode, k));
  };
  const app = {
    id: 'maps', name: 'Maps',
    async mount(el) {
      root = el; doc = el.ownerDocument; ui = controls(doc); style(doc);
      body = h(doc, 'div', { className: 'm-app-body' });
      root.append(h(doc, 'h2', { id: 'maps-h', textContent: 'Maps' }), body);
      render();
    },
    read() {
      if (s.view !== 'place') return `Maps. You are at Stratford station. ${known()}`;
      const p = PLACES[s.place], name = p.name[0].toUpperCase() + p.name.slice(1);
      return s.mode === 'route' ? `${name} is ${p.walk} on foot. ${p.route.join(' ')}` : `${name} is ${p.miles} away, ${p.walk} on foot${p.bus ? `, or ${p.bus}` : ''}.`;
    },
    place() {
      if (s.view === 'place') return { where: PLACES[s.place].name, item: s.mode === 'route' ? 'the route' : 'the distance', n: 1, of: 1, next: null };
      return { where: 'Maps', item: 'places', n: 1, of: Object.keys(PLACES).length, next: 'directions' };
    },
    state() { return structuredClone(s); },
    async seed() { s = fresh(); render(); },
    async reset() { await app.seed(); },
    actions: {
      directions: {
        describe: 'Walking directions to a place, home by default', doing: 'Finding the way',
        params: { type: 'object', properties: { place: { type: 'string' } } }, gate: null,
        hint: 'Each place has a Directions button',
        run: go('route'),
        verify(st, p) { return (st.view === 'place' && st.mode === 'route' && st.place === placeOf(p.place)) || 'The route is not showing.'; },
      },
      howFar: {
        describe: 'How far away a place is', doing: 'Checking how far it is',
        params: { type: 'object', properties: { place: { type: 'string' } }, required: ['place'] }, gate: null,
        hint: 'Each place has a How far button',
        run: go('far'),
        verify(st, p) { return (st.view === 'place' && st.mode === 'far' && st.place === placeOf(p.place)) || 'The distance is not showing.'; },
      },
    },
  };
  for (const x of Object.values(app.actions)) x.done ??= () => app.read();
  s = fresh();
  return app;
}

export default createMaps();
