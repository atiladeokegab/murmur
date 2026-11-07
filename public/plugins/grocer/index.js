// Corner Grocer: an invented corner shop's app, written to os/contract.md and never listed in apps.js.
// It reaches Murmur only as a plug-in (sdk/plugin.js). Shared app.css classes only: no colours or sizes here.
const SHOP = [
  { item: 'milk', pence: 120 }, { item: 'bread', pence: 150 }, { item: 'eggs', pence: 210 }, { item: 'bananas', pence: 90 },
  { item: 'apples', pence: 180 }, { item: 'tea', pence: 250 }, { item: 'cheese', pence: 320 }, { item: 'rice', pence: 140 },
];
const USUAL = ['milk', 'bread', 'eggs', 'bananas'];
const find = (s) => { const t = String(s || '').toLowerCase(); return SHOP.find((x) => t.includes(x.item) || t.includes(x.item.replace(/e?s$/, ''))) || null; };
const money = (p) => `£${(p / 100).toFixed(2)}`;
const words = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const sells = `I sell ${words(SHOP.map((x) => x.item))}.`;

let root = null, kv = null, os = null;
let list, addBox, addBtn, totalLine, orderBtn, line;
const removers = new Map();
let basket = [], order = null, draft = '', note = '';

function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (k.startsWith('aria-') || k === 'for') n.setAttribute(k, v); else n[k] = v;
  for (const k of kids) n.append(k);
  return n;
}
const total = () => basket.reduce((s, i) => s + SHOP.find((x) => x.item === i).pence, 0);
const readback = () => `Order your basket: ${words(basket)}, ${money(total())}, delivered by 6 pm. Pay?`;
const save = () => Promise.all([kv.set('basket', basket), kv.set('order', order)]);
const tell = (e) => { if (e?.isTrusted && line.textContent) os?.say?.(line.textContent); };
function render() {
  if (addBox.value !== draft) addBox.value = draft;
  removers.clear();
  list.replaceChildren(...basket.map((i) => {
    const b = el('button', { type: 'button', className: 'app-btn quiet', textContent: `Remove ${i}` });
    b.addEventListener('click', async (e) => {
      const had = root.ownerDocument.activeElement === b, at = basket.indexOf(i);
      // Delete always asks, a person's own tap too (contract §7); the agent's press was already asked. No confirm, no change.
      if (!(os?.confirm && await os.confirm({ gate: 'delete', readback: `Take ${i} out of your basket?` }))) return;
      basket = basket.filter((x) => x !== i); note = `Took ${i} out.`;
      await save(); render(); tell(e);
      // the pressed button is gone: keep the person's place on the next item, else the total
      if (had) (removers.get(basket[at]) || removers.get(basket[at - 1]) || totalLine).focus();
    });
    removers.set(i, b);
    return el('li', { className: 'app-card' }, el('span', { className: 'app-title', textContent: `${i[0].toUpperCase()}${i.slice(1)}, ${money(SHOP.find((x) => x.item === i).pence)}` }), b);
  }));
  totalLine.textContent = basket.length ? `${basket.length} items, ${money(total())}.` : 'Your basket is empty.';
  line.textContent = note || (order ? `Your order of ${money(order.total)} comes by 6 pm.` : '');
  orderBtn.disabled = !basket.length;
}

const app = {
  id: 'grocer',
  name: 'Corner Grocer',

  async mount(r, o) {
    root = r; os = o; kv = o.kv;
    list = el('ul', { id: 'grocer-basket', className: 'app-list', 'aria-label': 'Your basket' });
    addBox = el('input', { id: 'grocer-add', type: 'text', className: 'app-field', autocomplete: 'off' });
    addBox.addEventListener('input', () => { draft = addBox.value; });
    addBtn = el('button', { type: 'button', id: 'grocer-add-btn', className: 'app-btn', textContent: 'Add to basket' });
    addBtn.addEventListener('click', async (e) => {
      const x = find(draft);
      if (!x) { note = `We don't sell ${draft || 'that'}. ${sells}`; render(); tell(e); return; }
      if (!basket.includes(x.item)) basket = [...basket, x.item];
      note = `Added ${x.item}.`; draft = '';
      await save(); render(); tell(e);
    });
    orderBtn = el('button', { type: 'button', id: 'grocer-order', className: 'app-btn primary', textContent: 'Order and pay' });
    orderBtn.addEventListener('click', async (e) => {
      if (!basket.length) return;
      // The person's own tap asks through the shell (contract §7); the agent's press was already asked. No confirm, no order.
      if (!(os?.confirm && await os.confirm({ gate: 'pay', readback: readback() }))) return;
      order = { items: basket.slice(), total: total(), n: (order?.n || 0) + 1 };
      note = `Ordered. ${money(order.total)}, delivered by 6 pm.`;
      await save(); render(); tell(e);
    });
    totalLine = el('p', { id: 'grocer-total', className: 'app-why', tabIndex: -1 });
    line = el('p', { id: 'grocer-line', className: 'app-done' });   // the result; a hand tap says it through the shell's one voice, never a second live region
    root.append(
      el('h2', { id: 'grocer-h', textContent: 'Corner Grocer' }),
      el('p', { className: 'app-h3', textContent: 'Your usual basket' }), list, totalLine,
      el('label', { for: 'grocer-add', className: 'app-label', textContent: 'Add an item' }), addBox, addBtn,
      orderBtn, line);
    basket = (await kv.get('basket')) ?? USUAL.slice();
    order = (await kv.get('order')) ?? null;
    render();
  },

  read() {
    const b = basket.length ? `Your basket has ${words(basket)}, ${money(total())}.` : 'Your basket is empty.';
    return `Corner Grocer. ${note ? `${note} ` : ''}${b}`;
  },
  place() {
    return { where: 'Corner Grocer', item: 'your basket', n: basket.length, next: basket.length ? 'order' : 'add' };
  },
  state() {
    return { basket: basket.slice(), total: total(), order: order && { ...order, items: order.items.slice() }, draft, note };
  },
  // Idempotent: the usual basket when there is none; a placed order survives a reload. reset() is the demo wipe.
  async seed() { if (!(await kv.get('basket'))) basket = USUAL.slice(); draft = ''; note = ''; await save(); render(); },
  async reset() { basket = USUAL.slice(); order = null; await save(); await this.seed(); },

  actions: {
    basket: {
      describe: 'Read what is in the basket and what it costs',
      doing: 'Reading your basket',
      hint: 'Your basket is the list under the heading.',
      params: { type: 'object', properties: {} },
      async run(p, ctx) { await ctx.say(app.read()); },
      verify: () => true,
    },
    add: {
      describe: 'Add one item to the basket',
      doing: 'Adding to your basket',
      hint: 'Type the item under Add an item, then Add to basket.',
      params: { type: 'object', properties: { item: { type: 'string', description: 'One thing, like milk or tea' } }, required: ['item'] },
      async run(p, ctx) {
        await ctx.tap(addBox, 'Add an item');
        await ctx.type(addBox, p.item);
        await ctx.tap(addBtn);
      },
      verify: (s, p) => { const x = find(p.item); return (x !== null && s.basket.includes(x.item)) || `We don't sell ${p.item}. ${sells}`; },
    },
    remove: {
      describe: 'Take one item out of the basket',
      doing: 'Removing from your basket',
      gate: 'delete',
      readback: (s, p) => `Take ${find(p.item)?.item ?? p.item} out of your basket?`,
      hint: 'Each item in the basket has its own Remove button.',
      params: { type: 'object', properties: { item: { type: 'string', description: 'The item to take out' } }, required: ['item'] },
      async run(p, ctx) {
        const x = find(p.item);
        const b = x && removers.get(x.item);
        if (!b) throw new Error(`${p.item} is not in your basket.`);
        await ctx.tap(b);
      },
      verify: (s, p) => !s.basket.includes(find(p.item)?.item) || `${p.item} is still in your basket.`,
    },
    order: {
      describe: 'Order and pay for the basket, delivered today',
      doing: 'Ordering your shopping',
      gate: 'pay',
      hint: 'Order and pay is the big button under the basket.',
      params: { type: 'object', properties: {} },
      readback: (s) => (s.basket.length ? readback() : 'Your basket is empty.'),
      async run(p, ctx) {
        if (!basket.length) throw new Error('Your basket is empty.');
        await ctx.tap(orderBtn);
      },
      verify: (s) => (s.order !== null && s.order.total === s.total && s.order.items.join() === s.basket.join()) || 'The order did not go through.',
    },
  },
};
export default app;
