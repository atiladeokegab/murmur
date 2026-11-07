// Deliveroo, as a demo app on the phone: your usual from Pasta Corner, and order it (gate: pay, simulated; nothing is charged).
// The name is text only: no logo, no brand colour, Murmur's own look. The restaurant, dishes and prices are invented.
import { controls, h, placeLine, swap, money, style } from '../shop/ui.js';

const USUAL = { shop: 'Pasta Corner', items: ['Penne arrabbiata', 'Garlic bread'], total: 1450, mins: 30, spoken: 'thirty' };
const SIM = 'Simulated for the demo. Nothing is ordered or charged.';
const said = () => `${USUAL.items.join(' and ')} from ${USUAL.shop}, ${money(USUAL.total)} with delivery`;

export function createDeliveroo() {
  let root = null, body = null, doc = null, ui = null, s = {}, confirm = null, ordering = null;
  const fresh = () => ({ view: 'home', usual: null, ordered: null });

  async function order() {
    if (!s.usual) return;
    if (confirm && !(await confirm({ gate: 'pay', readback: app.actions.order.readback(s) }))) return;
    s.ordered = { ...USUAL }; s.view = 'ordered'; render();
  }
  const on = {
    usual() { s.usual = structuredClone(USUAL); s.view = 'usual'; render(); },
    order() { ordering = order(); return ordering; },
    back() { s.view = 'home'; render(); },
  };

  function render() {
    if (!root) return;
    ui.clear();
    const E = (t, p, ...k) => h(doc, t, p, ...k);
    const kids = [placeLine(doc, app.place().where, 'Deliveroo')];
    if (s.view === 'home') kids.push(E('p', {}, 'Your usual is from Pasta Corner.'), ui.btn('usual', 'Your usual', on.usual, { main: true }));
    else if (s.view === 'usual') kids.push(E('ul', {}, USUAL.items.map((i) => E('li', {}, i))), E('p', {}, `${money(USUAL.total)} with delivery.`),
      ui.btn('order', `Order it, ${money(USUAL.total)}`, on.order, { main: true }), ui.btn('back', 'Back', on.back));
    else kids.push(E('p', {}, app.read()), ui.btn('back', 'Back', on.back));
    kids.push(E('p', { className: 'm-app-sim' }, SIM));
    swap(body, kids);
  }

  const app = {
    id: 'deliveroo', name: 'Deliveroo',
    async mount(el, os = {}) {
      root = el; confirm = os.confirm || null; doc = el.ownerDocument; ui = controls(doc); style(doc);
      body = h(doc, 'div', { className: 'm-app-body' });
      root.append(h(doc, 'h2', { id: 'deliveroo-h', textContent: 'Deliveroo' }), body);
      render();
    },
    read() {
      if (s.view === 'ordered') return `Ordered from ${USUAL.shop}. Arriving in about ${USUAL.spoken} minutes. Nothing is charged.`;
      if (s.view === 'usual') return `Your usual: ${said()}.`;
      return 'Deliveroo. Ask for your usual.';
    },
    place() {
      if (s.view === 'usual') return { where: 'Your usual', item: USUAL.shop, n: 1, of: 1, next: 'order' };
      if (s.view === 'ordered') return { where: 'Order placed', item: USUAL.shop, n: 1, of: 1, next: null };
      return { where: 'Deliveroo', item: 'home', n: 1, of: 1, next: 'usual' };
    },
    state() { return structuredClone(s); },
    async seed() { s = fresh(); render(); },
    async reset() { await app.seed(); },
    actions: {
      usual: {
        describe: 'Show my usual order from Pasta Corner', doing: 'Finding your usual',
        params: { type: 'object', properties: {} }, gate: null,
        hint: 'Your usual is the large button',
        async run(p, ctx) { if (s.view !== 'home') await ctx.tap(ui.find('back')); await ctx.tap(ui.find('usual')); },
        verify(st) { return (st.view === 'usual' && !!st.usual) || 'Your usual is not showing.'; },
      },
      order: {
        describe: 'Order my usual from Pasta Corner', doing: 'Ordering your usual',
        params: { type: 'object', properties: {} }, gate: 'pay',
        hint: 'Order it is the large button under your usual',
        readback() { return `${said()}.`; },
        async run(p, ctx) {
          if (s.view !== 'usual') { if (s.view !== 'home') await ctx.tap(ui.find('back')); await ctx.tap(ui.find('usual')); }
          await ctx.tap(ui.find('order'));
          await ordering; // the click's handler awaits os.confirm; settle it before the runner verifies
        },
        verify(st) { return (st.view === 'ordered' && !!st.ordered) || 'It is not ordered.'; },
      },
    },
  };
  for (const x of Object.values(app.actions)) x.done ??= () => app.read();
  s = fresh();
  return app;
}

export default createDeliveroo();
