// Stub apps on the spec §3.3 contract, for the agent tests until build-apps lands the real ones.
// They press "controls" through ctx.tap like a real app, so the runner's cursor events are exercised.

export function stubMessages({ broken = false } = {}) {
  const chats = { Mum: ['Lunch on Tuesday?'], Sam: ['Where are you?'], Samira: ['Hi!'] };
  let s;
  const app = {
    id: 'messages', name: 'Messages',
    seed() { s = { open: null, draft: '', lastSent: null, sent: [] }; },
    reset() { this.seed(); },
    read() { return s.open ? `${s.open}'s chat. The last says: ${chats[s.open].at(-1)}` : 'Your chats: Mum, Sam, Samira.'; },
    place() { return { where: s.open ? `${s.open}'s chat` : 'Messages', item: s.draft ? 'your reply' : 'the last message' }; },
    state() { return structuredClone(s); },
    actions: {
      openChat: {
        describe: 'Open a chat', hint: 'Chats are in a list; each is a button with the name',
        params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        async run(p, ctx) { await ctx.tap({ id: `chat-${p.name}` }); if (chats[p.name]) s.open = p.name; },
        verify(st, p) { return st.open === p.name; },
        undo() { s.open = null; },
      },
      read: { describe: 'Read it', hint: 'The messages are under the heading', params: { type: 'object', properties: {} },
        async run(p, ctx) { await ctx.say(app.read()); }, verify(st) { return !!st.open; } },
      reply: {
        describe: 'Reply', hint: 'The reply box is under the last message',
        params: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        async run(p, ctx) { await ctx.tap({ id: 'reply' }); await ctx.type({ id: 'reply' }, p.text); s.draft = broken ? '' : p.text; },
        verify(st, p) { return st.draft === p.text; },
        undo() { s.draft = ''; },
      },
      replace: {
        describe: 'Change a word', hint: 'Say change, then the old word and the new one',
        params: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
        async run(p) { this._before = s.draft; s.draft = s.draft.replace(p.from, p.to); },
        verify(st, p) { return st.draft.includes(p.to); },
      },
      send: {
        describe: 'Send the reply', gate: 'send', hint: 'Send is the last button',
        params: { type: 'object', properties: {} },
        readback(st) { return `To ${st.open}: ${st.draft}`; },
        async run(p, ctx) { await ctx.tap({ id: 'send' }); s.lastSent = { to: s.open, text: s.draft }; s.sent.push(s.lastSent); },
        verify(st) { return st.lastSent?.text === st.draft && !!st.draft; },
      },
    },
  };
  app.seed();
  return app;
}

export function stubShop() {
  let s;
  return {
    id: 'shop', name: 'Shop',
    seed() { s = { basket: [], paid: false }; }, reset() { this.seed(); },
    read() { return s.paid ? 'Paid. Ready at ten past.' : `Basket: ${s.basket.join(', ') || 'empty'}.`; },
    place() { return { where: 'Shop' }; },
    state() { return structuredClone(s); },
    actions: {
      orderUsual: { describe: 'Order your usual', params: { type: 'object', properties: {} },
        async run() { s.basket = ['flat white']; }, verify(st) { return st.basket.length > 0; } },
      pay: { describe: 'Pay', gate: 'pay', params: { type: 'object', properties: {} },
        readback() { return 'Flat white, Demo Café, £3.20.'; },
        async run() { s.paid = true; }, verify(st) { return st.paid; } },
    },
    _init() { this.seed(); return this; },
  }._init();
}

export function stubCalendar() {
  let s;
  return {
    id: 'calendar', name: 'Calendar',
    seed() { s = { events: [{ title: 'lunch with Mum', day: 'Tuesday' }] }; }, reset() { this.seed(); },
    read() { return s.events.map((e) => `${e.title}, ${e.day}`).join('. '); },
    place() { return { where: 'Calendar' }; },
    state() { return structuredClone(s); },
    actions: {
      move: { describe: 'Move an event', hint: 'Open the event, then the day button',
        params: { type: 'object', properties: { event: { type: 'string' }, day: { type: 'string' } }, required: ['event', 'day'] },
        async run(p) { const e = s.events.find((x) => x.title.toLowerCase() === p.event.toLowerCase()); if (e) e.day = p.day; },
        verify(st, p) { return st.events.some((x) => x.title.toLowerCase() === p.event.toLowerCase() && x.day === p.day); } },
    },
    _init() { this.seed(); return this; },
  }._init();
}

/** A minimal bus: emit/on, plus the event log the tests read. */
export function testBus() {
  const subs = new Map(), log = [];
  return {
    log,
    emit(type, data = {}) { log.push({ type, ...data }); for (const f of subs.get(type) || []) f(data); for (const f of subs.get('*') || []) f({ type, ...data }); },
    on(type, f) { if (!subs.has(type)) subs.set(type, []); subs.get(type).push(f); return () => subs.set(type, subs.get(type).filter((g) => g !== f)); },
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
