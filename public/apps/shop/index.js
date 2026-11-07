// Shop: order your usual, reorder, add to basket, pay (gate: pay, fingerprint), track.
// Simulated shops, invented names. No card data anywhere: paying is a fingerprint plus a record.
import { btn, esc, find, memKV, money, spokenTime, style, wire } from './ui.js';

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
function findItem(q, inShop) {
  const n = norm(q);
  for (const shop of inShop ? [inShop] : Object.keys(SHOPS))
    for (const [id, it] of Object.entries(SHOPS[shop].menu)) if (norm(it.name).includes(n) || n.includes(norm(it.name))) return { shop, id };
  return null;
}

export function createShop({ now = () => Date.now() } = {}) {
  let root = null, os = {}, kv = memKV(), armed = false;
  let s = {};

  const fresh = () => ({ view: 'shop', shop: 'demo-cafe', basket: [], usual: structuredClone(USUAL),
    orders: structuredClone(PAST), lastSaid: '' });
  const save = () => kv.set('shop', 'usual', s.usual).catch(() => {}); // only ids and counts; never prices or payment
  const render = () => { if (root) { root.innerHTML = html(); } };
  const lastOrder = () => s.orders.at(-1);
  const toShop = async (ctx) => { if (s.view !== 'shop') await ctx.tap(find(root, 'back')); };

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

  function doPay() {
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

  const handlers = {
    usual(shop) { const u = s.usual[shop]; if (u) { s.basket = []; addLines(structuredClone(u.items)); } },
    reorder() { const o = lastOrder(); if (o) addLines(structuredClone(o.items)); },
    add(key) { const [shop, id] = key.split('/'); addLines([{ shop, id, qty: 1 }]); },
    remove(id) { s.basket = s.basket.filter((l) => l.id !== id); render(); },
    // By hand the OS asks first; when the agent taps Pay the runner has already asked (armed).
    async pay() {
      if (!s.basket.length) return;
      if (!armed) {
        const ok = await os.confirm?.({ gate: 'pay', readback: app.actions.pay.readback(s) });
        if (!ok) return;
      }
      armed = false;
      doPay();
    },
    track() { s.view = 'track'; render(); },
    back() { s.view = 'shop'; render(); },
  };

  function html() {
    const o = lastOrder();
    if (s.view === 'track' && o) {
      return `<section class="m-app" aria-labelledby="shop-h"><h1 id="shop-h" tabindex="-1">Your order</h1>
        <p class="m-app-place">${esc(app.place().where)}</p>
        <p>${esc(say(o.items))}.</p><p role="status">${esc(trackLine(o))}</p>${btn('back', 'Back to the shops')}</section>`;
    }
    const shops = Object.entries(SHOPS).map(([id, sh]) => {
      const u = s.usual[id];
      return `<h2>${esc(sh.name)}</h2>${u ? `<p>${btn('usual', `Your usual: ${say(u.items)}`, id)}</p>` : ''}
        <ul>${Object.entries(sh.menu).map(([iid, it]) => `<li><span>${esc(it.name)}, ${money(it.price)}</span>${btn('add', `Add ${it.name}`, `${id}/${iid}`)}</li>`).join('')}</ul>`;
    }).join('');
    const basket = s.basket.length
      ? `<ul>${s.basket.map((l) => `<li><span>${l.qty} × ${esc(item(l).name)}</span>${btn('remove', `Remove ${item(l).name}`, l.id)}</li>`).join('')}</ul>
         <p class="m-app-total">Total ${money(total(s.basket))}</p>
         <button type="button" class="m-app-btn" data-act="pay" data-main>Pay ${money(total(s.basket))} with your fingerprint</button>`
      : '<p>Your basket is empty.</p>';
    return `<section class="m-app" aria-labelledby="shop-h"><h1 id="shop-h" tabindex="-1">Shop</h1>
      <p class="m-app-place">${esc(app.place().where)}</p>
      <h2>Basket</h2>${basket}
      ${o ? `<p>${btn('reorder', `Reorder last: ${say(o.items)}`)}</p>` : ''}
      ${o && o.status === 'preparing' ? `<p>${btn('track', 'Track your order')}</p>` : ''}
      ${shops}</section>`;
  }

  function trackLine(o) {
    if (o.status !== 'preparing') return 'Collected.';
    const ready = new Date(o.readyAt);
    return now() >= o.readyAt ? 'Ready now.' : `Ready at ${spokenTime(ready)}.`;
  }

  const app = {
    id: 'shop', name: 'Shop',
    mount(el, theOs = {}) {
      root = el; os = theOs; kv = theOs.kv || kv;
      style(el.ownerDocument);
      wire(root, handlers);
      kv.get('shop', 'usual').then((u) => { if (u) { s.usual = u; render(); } }).catch(() => {});
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
    seed() { s = fresh(); armed = false; return save().then(render); },
    reset() { return app.seed(); },
    actions: {
      orderUsual: {
        describe: 'Order your usual',
        params: { type: 'object', properties: { shop: { type: 'string' } } },
        gate: null,
        hint: 'Your usual is the first button under each shop name',
        async run(p, ctx) {
          const shop = shopOf(p.shop);
          if (!shop) throw new Error(`I don't know that shop. There's ${Object.values(SHOPS).map((x) => x.name).join(' and ')}.`);
          if (!s.usual[shop]) throw new Error(`You don't have a usual at ${SHOPS[shop].name} yet.`);
          await toShop(ctx);
          await ctx.tap(find(root, 'usual', shop));
        },
        verify(st, p) { const shop = shopOf(p.shop); return !!shop && same(st.basket, st.usual[shop]?.items || [{}]); },
      },
      reorderLast: {
        describe: 'Reorder your last order',
        params: { type: 'object', properties: {} },
        gate: null,
        hint: 'Reorder last is under the basket',
        async run(p, ctx) {
          if (!lastOrder()) throw new Error('There is no last order yet.');
          await toShop(ctx);
          await ctx.tap(find(root, 'reorder'));
        },
        verify(st) { return st.basket.length > 0 && same(st.basket, st.orders.at(-1).items); },
      },
      addToBasket: {
        describe: 'Add to your basket',
        params: { type: 'object', properties: { item: { type: 'string' }, shop: { type: 'string' } }, required: ['item'] },
        gate: null,
        hint: 'Each item has its own Add button, after its price',
        async run(p, ctx) {
          const f = findItem(p.item, p.shop ? shopOf(p.shop) : null);
          if (!f) throw new Error(`I can't find ${p.item} in the shops.`);
          await toShop(ctx);
          await ctx.tap(find(root, 'add', `${f.shop}/${f.id}`));
        },
        verify(st, p) { const f = findItem(p.item, p.shop ? shopOf(p.shop) : null); return !!f && st.basket.some((l) => l.shop === f.shop && l.id === f.id); },
      },
      pay: {
        describe: 'Pay for your basket',
        params: { type: 'object', properties: {} },
        gate: 'pay',
        hint: 'Pay is the large button under the basket total',
        // What leaves the phone, read from state, never from the model: "Flat white, Demo Café, £3.20."
        readback(st = s) { return `${say(st.basket)}.`; },
        async run(p, ctx) {
          if (!s.basket.length) throw new Error('Your basket is empty.');
          armed = true;
          try { await ctx.tap(find(root, 'pay')); } finally { armed = false; }
        },
        verify(st) { const o = st.orders.at(-1); return st.basket.length === 0 && o?.status === 'preparing' && st.view === 'track'; },
      },
      track: {
        describe: 'Track your order',
        params: { type: 'object', properties: {} },
        gate: null,
        hint: 'Track your order is under the basket',
        async run(p, ctx) {
          if (lastOrder()?.status !== 'preparing') throw new Error('Nothing is on its way.');
          if (s.view !== 'track') await ctx.tap(find(root, 'track'));
        },
        verify(st) { return st.view === 'track'; },
      },
    },
  };
  s = fresh();
  return app;
}

export default createShop();
