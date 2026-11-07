// Northline Taxis: an invented taxi company's app, written to os/contract.md and never listed in apps.js.
// It reaches Murmur only as a plug-in (sdk/plugin.js). Shared app.css classes only: no colours or sizes here.
const PLACES = [
  { name: 'Home', words: ['home', 'house'], price: 14, eta: 6 },
  { name: 'Work', words: ['work', 'office'], price: 11, eta: 5 },
  { name: 'the Station', words: ['station', 'train'], price: 9, eta: 4 },
  { name: 'the Airport', words: ['airport', 'plane'], price: 38, eta: 9 },
];
const place = (to) => { const t = String(to || '').toLowerCase(); return PLACES.find((p) => p.words.some((w) => t.includes(w))) || null; };
const known = 'I can take you Home, to Work, to the Station or to the Airport.';
const fare = (p, when) => `a taxi to ${p.name}${when ? ` at ${when}` : ''}, £${p.price}, ${when ? 'booked ahead' : `arriving in ${p.eta} minutes`}`;

let root = null, kv = null, os = null;
let toBox, whenBox, quoteBtn, bookBtn, trackBtn, cancelBtn, line, trip;
let to = '', when = '', quote = null, booking = null, note = '';

function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (k.startsWith('aria-') || k === 'for') n.setAttribute(k, v); else n[k] = v;
  for (const k of kids) n.append(k);
  return n;
}
const save = () => kv.set('booking', booking);
function render() {
  if (toBox.value !== to) toBox.value = to;
  if (whenBox.value !== when) whenBox.value = when;
  line.textContent = note || (quote ? `To ${quote.name}: £${quote.price}, arriving in ${quote.eta} minutes.` : 'Say or type where you are going.');
  trip.textContent = booking ? `Your taxi to ${booking.name} is booked${booking.when ? ` for ${booking.when}` : `, arriving in ${booking.eta} minutes`}.` : 'No taxi booked.';
  trackBtn.disabled = cancelBtn.disabled = !booking;
}

const app = {
  id: 'taxi',
  name: 'Northline Taxis',

  async mount(r, o) {
    root = r; os = o; kv = o.kv;
    toBox = el('input', { id: 'taxi-to', type: 'text', className: 'app-field', autocomplete: 'off' });
    toBox.addEventListener('input', () => { to = toBox.value; quote = null; note = ''; });
    whenBox = el('input', { id: 'taxi-when', type: 'text', className: 'app-field', autocomplete: 'off' });
    whenBox.addEventListener('input', () => { when = whenBox.value; });
    quoteBtn = el('button', { type: 'button', id: 'taxi-quote', className: 'app-btn', textContent: 'Get a price' });
    quoteBtn.addEventListener('click', () => {
      const p = place(to);
      quote = p; note = p ? '' : `I don't know ${to || 'that place'}. ${known}`;
      render();
    });
    bookBtn = el('button', { type: 'button', id: 'taxi-book', className: 'app-btn primary', textContent: 'Book and pay' });
    bookBtn.addEventListener('click', async () => {
      const p = place(to);
      if (!p) { note = `I don't know ${to || 'that place'}. ${known}`; render(); return; }
      // The person's own tap asks through the shell (contract §7); the agent's press was already asked. No confirm, no booking.
      if (!(os?.confirm && await os.confirm({ gate: 'pay', readback: `Book ${fare(p, when)}. Pay?` }))) return;
      booking = { name: p.name, price: p.price, eta: p.eta, when: when || null, ref: `NL${100 + p.price + p.eta}` };
      quote = p; note = '';
      await save(); render();
    });
    trackBtn = el('button', { type: 'button', id: 'taxi-track', className: 'app-btn', textContent: 'Track my taxi' });
    trackBtn.addEventListener('click', async () => {
      if (!booking) return;
      booking = { ...booking, eta: Math.max(0, booking.eta - 2), tracked: true };
      note = booking.eta ? `Your driver is ${booking.eta} minutes away.` : 'Your taxi is outside.';
      await save(); render();
    });
    cancelBtn = el('button', { type: 'button', id: 'taxi-cancel', className: 'app-btn quiet', textContent: 'Cancel my taxi' });
    cancelBtn.addEventListener('click', async () => {
      if (!booking) return;
      if (!(os?.confirm && await os.confirm({ gate: 'delete', readback: `Cancel your taxi to ${booking.name}?` }))) return;
      note = `Cancelled your taxi to ${booking.name}. You were not charged.`;
      booking = null;
      await save(); render();
    });
    line = el('p', { id: 'taxi-line', className: 'app-done' });
    trip = el('p', { id: 'taxi-trip', className: 'app-why' });
    root.append(
      el('h2', { id: 'taxi-h', textContent: 'Northline Taxis' }),
      el('label', { for: 'taxi-to', className: 'app-label', textContent: 'Where to?' }), toBox,
      el('label', { for: 'taxi-when', className: 'app-label', textContent: 'When? Leave empty for now' }), whenBox,
      quoteBtn, line, bookBtn,
      el('div', { className: 'app-card' }, trip, trackBtn, cancelBtn));
    booking = (await kv.get('booking')) || null;
    render();
  },

  read() {
    if (note) return `Northline Taxis. ${note}`;
    if (booking) return `Northline Taxis. Your taxi to ${booking.name} is booked, £${booking.price}.`;
    return quote ? `Northline Taxis. To ${quote.name}: £${quote.price}, arriving in ${quote.eta} minutes.` : `Northline Taxis. Where to? ${known}`;
  },
  place() {
    return booking ? { where: 'Northline Taxis', item: `your taxi to ${booking.name}`, next: 'track' }
      : { where: 'Northline Taxis', item: quote ? `a price to ${quote.name}` : 'where to', next: quote ? 'book' : 'quote' };
  },
  state() {
    return { to, when, quote: quote && { to: quote.name, price: quote.price, eta: quote.eta }, booking: booking && { ...booking }, note };
  },
  // Idempotent: a fresh screen, but a booked taxi survives a reload. reset() is the demo wipe.
  async seed() { to = ''; when = ''; quote = null; note = ''; render(); },
  async reset() { booking = null; await save(); await this.seed(); },

  actions: {
    quote: {
      describe: 'Get the price and wait for a taxi to a place',
      doing: 'Getting a taxi price',
      hint: 'Type where you are going, then Get a price.',
      params: { type: 'object', properties: { to: { type: 'string', description: 'Where to: Home, Work, the Station or the Airport' } }, required: ['to'] },
      async run(p, ctx) {
        await ctx.tap(toBox, 'Where to?');
        await ctx.type(toBox, p.to);
        await ctx.tap(quoteBtn);
      },
      verify: (s, p) => (s.quote !== null && s.quote.to === place(p.to)?.name) || `I don't know ${p.to}. ${known}`,
    },
    book: {
      describe: 'Book and pay for a taxi to a place, now or at a time',
      doing: 'Booking your taxi',
      gate: 'pay',
      hint: 'Type where you are going, then Book and pay.',
      params: { type: 'object', properties: {
        to: { type: 'string', description: 'Where to: Home, Work, the Station or the Airport' },
        when: { type: 'string', description: 'A time like 18:00. Leave out for now' } }, required: ['to'] },
      readback: (s, p) => { const x = place(p.to); return x ? `Book ${fare(x, p.when)}. Pay?` : `I don't know ${p.to}. ${known}`; },
      async run(p, ctx) {
        if (!place(p.to)) throw new Error(`I don't know ${p.to}. ${known}`);
        await ctx.tap(toBox, 'Where to?');
        await ctx.type(toBox, p.to);
        await ctx.tap(whenBox, 'When?');
        await ctx.type(whenBox, p.when || '');
        await ctx.tap(bookBtn);
      },
      verify: (s, p) => (s.booking !== null && s.booking.name === place(p.to)?.name) || 'The taxi did not book.',
    },
    track: {
      describe: 'Say where the booked taxi is now',
      doing: 'Tracking your taxi',
      hint: 'Track my taxi is in the box under Book and pay.',
      params: { type: 'object', properties: {} },
      async run(p, ctx) {
        if (!booking) throw new Error('No taxi is booked.');
        await ctx.tap(trackBtn);
        await ctx.say(note);
      },
      verify: (s) => (s.booking !== null && s.booking.tracked === true) || 'No taxi is booked.',
    },
    cancel: {
      describe: 'Cancel the booked taxi',
      doing: 'Cancelling your taxi',
      gate: 'delete',
      hint: 'Cancel my taxi is the last button.',
      params: { type: 'object', properties: {} },
      readback: (s) => (s.booking ? `Cancel your taxi to ${s.booking.name}?` : 'No taxi is booked.'),
      async run(p, ctx) {
        if (!booking) throw new Error('No taxi is booked.');
        await ctx.tap(cancelBtn);
      },
      verify: (s) => s.booking === null || 'The taxi is still booked.',
    },
  },
};
export default app;
