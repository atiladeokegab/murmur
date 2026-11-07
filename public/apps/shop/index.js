// Shop: order your usual, reorder, add to basket, pay (gate: pay, fingerprint), track.
// Simulated shops, invented names. No card data anywhere: paying is a fingerprint plus a record.
import { controls, h, placeLine, swap, memKV, money, spokenTime, style } from './ui.js';

const SHOPS = {
  'demo-cafe': { name: 'Demo Café', menu: {
    'flat-white': { name: 'Flat white', price: 320 }, 'oat-latte': { name: 'Oat latte', price: 360 },
    tea: { name: 'Breakfast tea', price: 250 }, croissant: { name: 'Croissant', price: 280 } } },
  'hill-street': { name: 'Hill Street Roasters', menu: {
    beans: { name: 'House beans, 250 grams', price: 1100 }, espresso: { name: 'Espresso', price: 240 },
    'banana-bread': { name: 'Banana bread', price: 300 } } },
};
const USUAL = { 'demo-cafe': { items: [{ shop: 'demo-cafe', id: 'flat-white', qty: 1 }], count: 6 },
  'hill-street': { items: [{ shop: 'hill-street', id: 'beans', qty: 1 }], count: 2 } };
const PAST = [{ id: 1, shop: 'hill-street', items: [{ shop: 'hill-street', id: 'espresso', qty: 1 }, { shop: 'hill-street', id: 'banana-bread', qty: 1 }],
  total: 540, readyAt: null, status: 'collected' }];
const PREP_MIN = 8; // ready time: now plus this, up to the next five minutes

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const item = (l) => SHOPS[l.shop].menu[l.id];
const total = (lines) => lines.reduce((t, l) => t + item(l).price * l.qty, 0);
const same = (a, b) => JSON.stringify(a.map((l) => [l.shop, l.id, l.qty])) === JSON.stringify(b.map((l) => [l.shop, l.id, l.qty]));
function say(lines) {
  if (!lines.length) return 'nothing';
  const parts = lines.map((l) => (l.qty > 1 ? `${l.qty} ${item(l).name.toLowerCase()}` : item(l).name));
  const words = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1).toLowerCase()}` : parts[0];
  return `${words}, ${SHOPS[lines[0].shop].name}, ${money(total(lines))}`;
}
function shopOf(q) {
  const n = norm(q);
  if (!n) return 'demo-cafe';
  return Object.keys(SHOPS).find((id) => norm(SHOPS[id].name).includes(n) || n.includes(norm(SHOPS[id].name).split(' ')[0])) || null;
}
// A named shop must be one we know: an unknown one finds nothing rather than falling back to every shop.
const itemFor = (p) => { const shop = p.shop ? shopOf(p.shop) : null; return p.shop && !shop ? null : findItem(p.item, shop); };
function findItem(q, inShop) {
  const n = norm(q);
  for (const shop of inShop ? [inShop] : Object.keys(SHOPS))
    for (const [id, it] of Object.entries(SHOPS[shop].menu)) if (norm(it.name).includes(n) || n.includes(norm(it.name))) return { shop, id };
  return null;
}

export function createShop({ now = () => Date.now() } = {}) {
  let root = null, body = null, doc = null, ui = null, kv = memKV(), s = {}, confirm = null, paying = null;

  const fresh = () => ({ view: 'shop', shop: 'demo-cafe', basket: [], usual: structuredClone(USUAL), orders: structuredClone(PAST) });
  const save = () => kv.set('usual', s.usual).catch(() => {}); // only ids and counts; never prices or payment
  const lastOrder = () => s.orders.at(-1);

  function addLines(lines) {
    for (const l of lines) {
      if (s.basket.length && s.basket[0].shop !== l.shop) s.basket = []; // one shop per basket
      const have = s.basket.find((b) => b.id === l.id);
      if (have) have.qty += l.qty; else s.basket.push({ ...l });
      s.shop = l.shop;
    }
    s.view = 'shop';
    render();
  }

  // Pay always needs the fingerprint (spec §3.7): a person's own tap asks through os.confirm, which checks it;
  // when the agent pressed Pay, the runner already asked and os.confirm answers yes at once.
  async function pay() {
    if (!s.basket.length) return;
    if (confirm && !(await confirm({ gate: 'pay', readback: app.actions.pay.readback(s) }))) return;
    if (!s.basket.length) return;
    const t = new Date(now() + PREP_MIN * 60e3);
    t.setSeconds(0, 0); t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5);
    const lines = s.basket, shop = lines[0].shop;
    s.orders.push({ id: s.orders.length + 1, shop, items: lines, total: total(lines), readyAt: t.getTime(), status: 'preparing' });
    const u = s.usual[shop];
    if (u && same(u.items, lines)) u.count += 1;
    else if (!u) s.usual[shop] = { items: structuredClone(lines), count: 1 };
    s.basket = [];
    s.view = 'track';
    save();
    render();
  }

  const on = {
    usual(shop) { const u = s.usual[shop]; if (u) { s.basket = []; addLines(structuredClone(u.items)); } },
    reorder() { const o = lastOrder(); if (o) addLines(structuredClone(o.items)); },
    add(key) { const [shop, id] = key.split('/'); addLines([{ shop, id, qty: 1 }]); },
    remove(id) { s.basket = s.basket.filter((l) => l.id !== id); render(); },
    pay() { paying = pay(); return paying; }, track() { s.view = 'track'; render(); }, back() { s.view = 'shop'; render(); },
  };

  function trackLine(o) {
    if (o.status !== 'preparing') return 'Collected.';
    return now() >= o.readyAt ? 'Ready now.' : `Ready at ${spokenTime(new Date(o.readyAt))}.`;
  }

  function render() {
    if (!root) return;
    ui.clear();
    const E = (t, p, ...k) => h(doc, t, p, ...k), o = lastOrder();
    const kids = [placeLine(doc, app.place().where, 'Shop')];
    if (s.view === 'track' && o) {
      kids.push(E('p', {}, `${say(o.items)}.`), E('p', {}, trackLine(o)), ui.btn('back', 'Back to the shops', on.back));
    } else {
      kids.push(E('h3', {}, 'Basket'));
      if (s.basket.length) {
        kids.push(E('ul', {}, s.basket.map((l) => E('li', {}, E('span', {}, `${l.qty} × ${item(l).name}`), ui.btn('remove', `Remove ${item(l).name}`, on.remove, { arg: l.id })))),
          E('p', { className: 'm-app-total' }, `Total ${money(total(s.basket))}`),
          ui.btn('pay', `Pay ${money(total(s.basket))} with your fingerprint`, on.pay, { main: true }));
      } else kids.push(E('p', {}, 'Your basket is empty.'));
      if (o) kids.push(E('p', {}, ui.btn('reorder', `Reorder last: ${say(o.items)}`, on.reorder)));
      if (o?.status === 'preparing') kids.push(E('p', {}, ui.btn('track', 'Track your order', on.track)));
      for (const [id, sh] of Object.entries(SHOPS)) {
        const u = s.usual[id];
        kids.push(E('h3', {}, sh.name), u && E('p', {}, ui.btn('usual', `Your usual: ${say(u.items)}`, on.usual, { arg: id })),
          E('ul', {}, Object.entries(sh.menu).map(([iid, it]) => E('li', {}, E('span', {}, `${it.name}, ${money(it.price)}`), ui.btn('add', `Add ${it.name}`, on.add, { arg: `${id}/${iid}` })))));
      }
    }
    swap(body, kids);
  }

  const tap = (ctx, act, arg) => ctx.tap(ui.find(act, arg));
  const toShop = async (ctx) => { if (s.view !== 'shop') await tap(ctx, 'back'); };

  const app = {
    id: 'shop', name: 'Shop',
    async mount(el, os = {}) {
      root = el; doc = el.ownerDocument; ui = controls(doc); kv = os.kv || kv; confirm = os.confirm || null;
      style(doc);
      body = h(doc, 'div', { className: 'm-app-body' });
      root.append(h(doc, 'h2', { id: 'shop-h', textContent: 'Shop' }), body);
      const u = await kv.get('usual').catch(() => null);
      if (u) s.usual = u;
      render();
    },
    read() {
      const o = lastOrder();
      if (s.view === 'track' && o) return `${o.status === 'preparing' ? 'Paid. ' : ''}${trackLine(o)}`;
      if (s.basket.length) return `Basket: ${say(s.basket)}.`;
      const u = s.usual['demo-cafe'];
      return `Shop. Your basket is empty.${u ? ` Your usual is ${say(u.items)}.` : ''}`;
    },
    place() {
      if (s.view === 'track') return { where: 'Your order', item: 'tracking', n: 1, of: 1, next: null };
      if (s.basket.length) return { where: `Shop, ${SHOPS[s.shop].name}`, item: 'your basket', n: s.basket.length, of: s.basket.length, next: 'pay' };
      return { where: 'Shop', item: 'the shops', n: 1, of: Object.keys(SHOPS).length, next: 'orderUsual' };
    },
    state() { return structuredClone({ ...s, basketTotal: total(s.basket) }); },
    async seed() { s = fresh(); await save(); render(); },
    async reset() { await kv.set('usual', undefined).catch(() => {}); await app.seed(); },
    actions: {
      orderUsual: {
        describe: 'Order your usual', doing: 'Ordering your usual',
        params: { type: 'object', properties: { shop: { type: 'string', description: 'Demo Café or Hill Street Roasters' } } },
        gate: null,
        hint: 'Your usual is the first button under each shop name',
        async run(p, ctx) {
          const shop = shopOf(p.shop);
          if (!shop) throw new Error(`I don't know that shop. There's ${Object.values(SHOPS).map((x) => x.name).join(' and ')}.`);
          if (!s.usual[shop]) throw new Error(`You don't have a usual at ${SHOPS[shop].name} yet.`);
          await toShop(ctx);
          await tap(ctx, 'usual', shop);
        },
        verify(st, p) { const shop = shopOf(p.shop); return (!!shop && same(st.basket, st.usual[shop]?.items || [{}])) || 'Your usual is not in the basket.'; },
      },
      reorderLast: {
        describe: 'Reorder your last order', doing: 'Reordering your last order',
        params: { type: 'object', properties: {} },
        gate: null,
        hint: 'Reorder last is under the basket',
        async run(p, ctx) {
          if (!lastOrder()) throw new Error('There is no last order yet.');
          await toShop(ctx);
          await tap(ctx, 'reorder');
        },
        verify(st) { return (st.basket.length > 0 && same(st.basket, st.orders.at(-1).items)) || 'The last order is not in the basket.'; },
      },
      addToBasket: {
        describe: 'Add an item to the basket', doing: 'Adding to your basket',
        params: { type: 'object', properties: { item: { type: 'string' }, shop: { type: 'string' } }, required: ['item'] },
        gate: null,
        hint: 'Each item has its own Add button, after its price',
        async run(p, ctx) {
          const f = itemFor(p);
          if (!f) throw new Error(`I can't find ${p.item} in Shop.`);
          await toShop(ctx);
          await tap(ctx, 'add', `${f.shop}/${f.id}`);
        },
        verify(st, p) { const f = itemFor(p); return (!!f && st.basket.some((l) => l.shop === f.shop && l.id === f.id)) || `${p.item} is not in the basket.`; },
      },
      pay: {
        describe: 'Pay for the basket', doing: 'Paying for your order',
        params: { type: 'object', properties: {} },
        gate: 'pay',
        hint: 'Pay is the large button under the basket total',
        // What leaves the phone, from state, never the model: "Flat white, Demo Café, £3.20."
        readback(st) { return `${say(st.basket)}.`; },
        async run(p, ctx) {
          if (!s.basket.length) throw new Error('Your basket is empty.');
          await tap(ctx, 'pay');
          await paying; // the click's handler awaits os.confirm; settle it before the runner verifies
        },
        verify(st) { return (st.basket.length === 0 && st.orders.at(-1)?.status === 'preparing' && st.view === 'track') || 'It did not pay.'; },
      },
      track: {
        describe: 'Track the order', doing: 'Tracking your order',
        params: { type: 'object', properties: {} },
        gate: null,
        hint: 'Track your order is under the basket',
        async run(p, ctx) {
          if (lastOrder()?.status !== 'preparing') throw new Error('Nothing is on its way.');
          if (s.view !== 'track') await tap(ctx, 'track');
        },
        verify(st) { return st.view === 'track' || 'The order is not showing.'; },
      },
    },
  };
  s = fresh();
  return app;
}

export default createShop();
