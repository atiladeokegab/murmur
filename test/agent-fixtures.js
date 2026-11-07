// A phone for the agent tests: the real SDK (bus, registry, ctx, runAction), the real apps where they exist
// (Messages, Calendar, hello), and a small Shop stub on the same contract, all mounted into the fake DOM.
import { createBus, createRegistry, createCtx, appKv, mountApp } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import messages from '../public/apps/messages/index.js';
import calendar from '../public/apps/calendar/index.js';
import hello from '../public/apps/hello/index.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

/** A shop on the contract: Order your usual, then Pay behind the pay gate. Buttons a person could press. */
export function stubShop() {
  let s = { basket: [], orders: [] }, root = null;
  const btn = (id, text, onclick) => { const b = root.ownerDocument.createElement('button'); b.id = id; b.textContent = text; b.addEventListener('click', onclick); root.append(b); };
  return {
    id: 'shop', name: 'Shop',
    mount(r) {
      root = r;
      const h = r.ownerDocument.createElement('h2'); h.textContent = 'Shop'; r.append(h);
      btn('shop-usual', 'Order your usual', () => { s.basket = [{ name: 'flat white', quantity: 1 }]; });
      btn('shop-pay', 'Pay', () => { s.orders.push({ items: s.basket, total: 3.2 }); s.basket = []; });
    },
    seed() { s = { basket: [], orders: [] }; }, reset() { this.seed(); },
    read() { return s.orders.length ? 'Paid. Ready at ten past.' : `Basket: ${s.basket.map((i) => i.name).join(', ') || 'empty'}.`; },
    place() { return { where: 'Shop' }; },
    state() { return structuredClone(s); },
    actions: {
      orderUsual: { describe: 'Order your usual', doing: 'Ordering your usual', hint: 'Order your usual is the first button',
        params: { type: 'object', properties: { shop: { type: 'string' } } },
        async run(p, ctx) { await ctx.tap(root.querySelector('#shop-usual')); },
        verify: (st) => st.basket.length > 0 || 'The basket is empty.' },
      pay: { describe: 'Pay for the basket', doing: 'Paying', gate: 'pay', hint: 'Pay is the last button',
        params: { type: 'object', properties: {} },
        readback: () => 'Flat white, Demo Café, £3.20.',
        async run(p, ctx) { await ctx.tap(root.querySelector('#shop-pay')); },
        verify: (st) => st.orders.length > 0 || 'It did not pay.' },
    },
  };
}

/** A memory kv for the toolkit (same contract as public/ports/browser-kv.js). */
export function memoryKV() {
  const m = new Map();
  return {
    async get(a, k) { return structuredClone(m.get(`${a}:${k}`)); },
    async set(a, k, v) { if (v === undefined) m.delete(`${a}:${k}`); else m.set(`${a}:${k}`, structuredClone(v)); },
    async getAll(a) { const o = {}; for (const [k, v] of m) if (k.startsWith(`${a}:`)) o[k.slice(a.length + 1)] = structuredClone(v); return o; },
  };
}

/**
 * Mount the apps and give back what createAgent needs. `patch` replaces an app's actions (a broken reply box).
 * @returns {{ bus, registry, ctxFor, taps, state(id), apps }}
 */
export async function phone({ patch = {} } = {}) {
  const doc = fakeDocument();
  const bus = createBus();
  const registry = createRegistry();
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const apps = [messages, calendar, hello, stubShop()].map((a) => (patch[a.id] ? { ...a, actions: { ...a.actions, ...patch[a.id](a.actions) } } : a));
  const roots = {}, taps = [];
  for (const app of apps) {
    registry.register(app);
    roots[app.id] = await mountApp(app, doc.body, { kv: appKv(app.id, port), bus, say: () => {} });
    await app.reset();
  }
  const cursor = { async moveTo(el, name) { taps.push(name); }, hide() {} };
  const ctxFor = (app, hooks) => createCtx({ app, root: roots[app.id], kv: appKv(app.id, port), cursor, ...hooks });
  return { doc, bus, registry, ctxFor, taps, apps, state: (id) => registry.get(id).state() };
}
