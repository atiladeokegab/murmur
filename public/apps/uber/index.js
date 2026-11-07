// Uber, as a demo app on the phone: how far a car is, and a car home (gate: pay, simulated; nothing is booked or charged).
// The name is text only: no logo, no brand colour, Murmur's own look. Every place, price and driver is invented.
import { controls, h, placeLine, swap, money, style } from '../shop/ui.js';

const HOME = '14 Larkspur Row, Stratford';
const CAR = { mins: 6, spoken: 'six', price: 1420, trip: 'eighteen minutes', driver: 'Dami', car: 'a grey hatchback, plate MU26 RFR' };
const SIM = 'Simulated for the demo. Nothing is booked or charged.';

export function createUber() {
  let root = null, body = null, doc = null, ui = null, s = {}, confirm = null, booking = null;
  const fresh = () => ({ view: 'home', eta: null, booked: null });

  async function book() {
    if (confirm && !(await confirm({ gate: 'pay', readback: app.actions.bookHome.readback(s) }))) return;
    s.eta = CAR.mins; s.booked = { ...CAR, to: HOME }; s.view = 'booked'; render();
  }
  const on = {
    cars() { s.eta = CAR.mins; s.view = 'cars'; render(); },
    book() { booking = book(); return booking; },
    back() { s.view = 'home'; render(); },
  };

  function render() {
    if (!root) return;
    ui.clear();
    const E = (t, p, ...k) => h(doc, t, p, ...k);
    const kids = [placeLine(doc, app.place().where, 'Uber')];
    if (s.view === 'home') kids.push(E('p', {}, `Home: ${HOME}.`), ui.btn('cars', 'Cars near you', on.cars), ui.btn('book', 'Book a car home', on.book, { main: true }));
    else if (s.view === 'cars') kids.push(E('p', {}, app.read()), ui.btn('book', 'Book a car home', on.book, { main: true }), ui.btn('back', 'Back', on.back));
    else kids.push(E('p', {}, app.read()), ui.btn('back', 'Back', on.back));
    kids.push(E('p', { className: 'm-app-sim' }, SIM));
    swap(body, kids);
  }

  const app = {
    id: 'uber', name: 'Uber',
    async mount(el, os = {}) {
      root = el; confirm = os.confirm || null; doc = el.ownerDocument; ui = controls(doc); style(doc);
      body = h(doc, 'div', { className: 'm-app-body' });
      root.append(h(doc, 'h2', { id: 'uber-h', textContent: 'Uber' }), body);
      render();
    },
    read() {
      if (s.view === 'booked') return `Booked: ${s.booked.driver} in ${s.booked.car}, ${s.booked.spoken} minutes away. Home in about ${s.booked.trip}. Nothing is charged.`;
      if (s.view === 'cars') return `The nearest car is ${CAR.spoken} minutes away. A car home is about ${money(CAR.price)}, ${CAR.trip}.`;
      return 'Uber. Ask how far a car is, or book a car home.';
    },
    place() {
      if (s.view === 'cars') return { where: 'Cars near you', item: 'the nearest car', n: 1, of: 1, next: 'bookHome' };
      if (s.view === 'booked') return { where: 'Car booked', item: s.booked.driver, n: 1, of: 1, next: null };
      return { where: 'Uber', item: 'home', n: 1, of: 1, next: 'howFar' };
    },
    state() { return structuredClone(s); },
    async seed() { s = fresh(); render(); },
    async reset() { await app.seed(); },
    actions: {
      howFar: {
        describe: 'How far away the nearest car is', doing: 'Checking the cars near you',
        params: { type: 'object', properties: {} }, gate: null,
        hint: 'Cars near you is the first button',
        async run(p, ctx) { if (s.view !== 'home') await ctx.tap(ui.find('back')); await ctx.tap(ui.find('cars')); },
        verify(st) { return (st.view === 'cars' && st.eta === CAR.mins) || 'The cars are not showing.'; },
      },
      bookHome: {
        describe: 'Book a car home', doing: 'Booking a car home',
        params: { type: 'object', properties: {} }, gate: 'pay',
        hint: 'Book a car home is the large button',
        readback() { return `A car home to ${HOME}, about ${money(CAR.price)}, arriving in ${CAR.spoken} minutes.`; },
        async run(p, ctx) {
          if (s.view === 'booked') await ctx.tap(ui.find('back'));
          await ctx.tap(ui.find('book'));
          await booking; // the click's handler awaits os.confirm; settle it before the runner verifies
        },
        verify(st) { return (st.view === 'booked' && !!st.booked) || 'The car is not booked.'; },
      },
    },
  };
  for (const x of Object.values(app.actions)) x.done ??= () => app.read();
  s = fresh();
  return app;
}

export default createUber();
