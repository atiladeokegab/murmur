// Your apps: the popular apps from your phone, in Murmur's own look, under one board tile (os/contract.md).
// Names are text only: no logos, no brand colours. Every person, show and amount is invented.
// Book and order go through the pay gate, reply through the send gate; nothing leaves the phone.
// shortcut: state lives in memory, so a reload starts each app over; keep it in kv if that matters.
export const APPS = {
  spotify: { name: 'Spotify', kind: 'player', items: ['Golden Hour by Lena Marsh', 'Rain Song by The Quiet Hours', 'Northern Lights by Ada Vale'] },
  podcasts: { name: 'Podcasts', kind: 'player', items: ['Slow News, episode 12', 'The Garden Hour, episode 3', 'Small Questions, episode 40'] },
  audible: { name: 'Audible', kind: 'player', items: ['The Long Road, chapter 7', 'The Long Road, chapter 8', 'The Long Road, chapter 9'] },
  sounds: { name: 'BBC Sounds', kind: 'player', items: ['Morning Radio', 'The Afternoon Show', 'Evening Jazz'] },
  netflix: { name: 'Netflix', kind: 'watch', items: ['Harbour Lights, episode 4', 'Harbour Lights, episode 5', 'Harbour Lights, episode 6'] },
  youtube: { name: 'YouTube', kind: 'watch', items: ['How to fold a paper crane', 'A walk round Kew in spring', 'Ten-minute stretch'] },
  uber: { name: 'Uber', kind: 'ride' },
  deliveroo: { name: 'Deliveroo', kind: 'food' },
  whatsapp: { name: 'WhatsApp', kind: 'chat', items: [['Priya', 'Are we still on for Saturday?'], ['Tomas', 'I sent you the photos.']] },
  instagram: { name: 'Instagram', kind: 'feed', items: [['Priya', 'A walk by the sea this morning'], ['Tomas', 'First loaf of bread, a bit flat']] },
  maps: { name: 'Maps', kind: 'map' },
};
const RIDE = { mins: 6, price: 1450, to: 'Home' }, FOOD = { what: 'Spaghetti and a lemonade', from: 'Pasta Corner', price: 1280 };
const money = (p) => `£${(p / 100).toFixed(2)}`;

const fresh = () => ({ open: null, at: {}, paused: {}, playing: null, said: null, read: {}, replies: [], booked: null, ordered: null, note: '' });
let s = fresh();
let root = null, os = null, body = null;
const q = (sel) => root && root.querySelector(sel);
const tell = (e, text) => { if (e?.isTrusted) os?.say?.(text); }; // a person's tap speaks here; the agent's run speaks through ctx.say
const nowOf = (id) => APPS[id].items[s.at[id] || 0];

// What each control does, for a hand tap and the agent alike; it returns the line to say.
const DO = {
  play: (id) => { s.playing = id; s.paused[id] = false; return `Playing ${nowOf(id)}.`; },
  pause: (id) => { s.paused[id] = true; return `Paused ${APPS[id].name}.`; },
  next: (id) => { s.at[id] = ((s.at[id] || 0) + 1) % APPS[id].items.length; s.playing = id; s.paused[id] = false; return `Playing ${nowOf(id)}.`; },
  playing: (id) => { s.said = `playing:${id}`; return s.playing === id && !s.paused[id] ? `Playing ${nowOf(id)}.` : `Nothing is playing on ${APPS[id].name}. Next up is ${nowOf(id)}.`; },
  far: () => { s.said = 'far'; return `A car is ${RIDE.mins} minutes away. A ride home is about ${money(RIDE.price)}.`; },
  usual: () => { s.said = 'usual'; return `Your usual is ${FOOD.what} from ${FOOD.from}, ${money(FOOD.price)}.`; },
  read: (id) => { s.read[id] = true; return APPS[id].items.map(([who, t]) => `${who}: ${t}`).join(' '); },
  home: () => { s.said = 'home'; return 'Home is 18 minutes on foot: down the High Street, left at the library, then second right.'; },
  howFar: () => { s.said = 'howfar'; return 'Home is 1.4 kilometres away, about 18 minutes on foot.'; },
};
const RB = {
  book: () => `Book a ride to ${RIDE.to}, ${money(RIDE.price)}?`,
  order: () => `Order ${FOOD.what} from ${FOOD.from}, ${money(FOOD.price)}?`,
  reply: (id, p) => `Reply to ${APPS[id].items[0][0]} on ${APPS[id].name}: "${p?.text ?? q('#ya-reply-text')?.value ?? ''}"?`,
};
const GATED = {
  book: { gate: 'pay', go: () => { s.booked = { ...RIDE }; return `Booked. Your car is ${RIDE.mins} minutes away. That's invented money.`; } },
  order: { gate: 'pay', go: () => { s.ordered = { ...FOOD }; return `Ordered ${FOOD.what} from ${FOOD.from}. That's invented money.`; } },
  reply: { gate: 'send', go: (id, p) => { s.replies.push({ app: id, to: APPS[id].items[0][0], text: p.text }); return `Sent to ${APPS[id].items[0][0]}.`; } },
};
const CONTROLS = { player: ['play', 'pause', 'next', 'playing'], watch: ['next', 'pause'], ride: ['far', 'book'], food: ['usual', 'order'], chat: ['read', 'reply'], feed: ['read', 'reply'], map: ['home', 'howFar'] };
// Step lines are shared, not per app: the boot voice warm says each fixed line once, under a daily character cap.
const DOING = { play: 'Pressing Play', pause: 'Pausing', next: 'Playing the next one', playing: "Checking what's playing", far: 'Checking for a car', book: 'Booking the ride', usual: 'Finding your usual', order: 'Ordering', read: 'Reading the newest', reply: 'Sending your reply', home: 'Finding the way home', howFar: 'Checking how far' };
const LABEL = { play: 'Play', pause: 'Pause', next: 'Next', playing: "What's playing", far: 'How far is a car', book: 'Book a ride home', usual: 'My usual', order: 'Order my usual', read: 'Read new', reply: 'Send reply', home: 'Directions home', howFar: 'How far is home' };

async function press(e, id, c) {
  if (GATED[c]) {
    const text = q('#ya-reply-text')?.value || '';
    if (c === 'reply' && !text.trim()) { s.note = 'Write a reply first.'; render(); return; }
    if (!(await os?.confirm?.({ gate: GATED[c].gate, readback: RB[c](id, { text }) }))) { s.note = 'Not done.'; render(); return; }
    s.note = GATED[c].go(id, { text });
  } else s.note = DO[c](id);
  render(); tell(e, s.note);
}

const app = {
  id: 'yourapps',
  name: 'Your apps',
  async mount(r, o) { root = r; os = o; root.append(el('h2', { id: 'yourapps-h' }, 'Your apps'), body = el('div', { className: 'app-body' })); render(); },
  async seed() { render(); },
  async reset() { s = fresh(); render(); },
  state: () => structuredClone(s),
  read: () => (s.open ? `${APPS[s.open].name}. ${s.note || ''}`.trim() : `Your apps from your phone: ${Object.values(APPS).map((a) => a.name).join(', ')}.`),
  place: () => ({ where: s.open ? APPS[s.open].name : 'Your apps', item: s.open ? APPS[s.open].name : 'your apps', next: s.open ? CONTROLS[APPS[s.open].kind][0] : 'open' }),
  actions: {},
};

const said = (id, c) => ({
  play: `Play ${APPS[id].name}`, pause: `Pause ${APPS[id].name}`, next: APPS[id].kind === 'watch' ? `Play the next one on ${APPS[id].name}` : `Next on ${APPS[id].name}`,
  playing: `What's playing on ${APPS[id].name}`, far: 'How far is an Uber', book: 'Book an Uber home', usual: 'What is my usual on Deliveroo', order: 'Order my usual on Deliveroo',
  read: `Read my new ${APPS[id].kind === 'feed' ? 'posts' : 'messages'} on ${APPS[id].name}`, reply: `Reply on ${APPS[id].name} saying on my way`, home: 'Directions home on Maps', howFar: 'How far is home on Maps',
}[c]);
const describe = (id, c) => ({
  play: `Play music or audio on ${APPS[id].name}`, pause: `Pause ${APPS[id].name}`, next: `Play the next one on ${APPS[id].name}`, playing: `Say what is playing on ${APPS[id].name}`,
  far: 'Say how far away an Uber car is, and the price home', book: 'Book an Uber ride home (asks first, invented money)', usual: 'Say my usual Deliveroo order',
  order: 'Order my usual on Deliveroo (asks first, invented money)', read: `Read my new ${APPS[id].kind === 'feed' ? 'posts' : 'messages'} on ${APPS[id].name}`,
  reply: `Reply to the newest ${APPS[id].name} ${APPS[id].kind === 'feed' ? 'post' : 'message'} (asks first)`, home: 'Get directions home on Maps', howFar: 'Say how far home is on Maps',
}[c]);
const verifyOf = (id, c) => (st, p) => ({
  play: st.playing === id && !st.paused[id], pause: !!st.paused[id], next: st.playing === id && !st.paused[id], playing: st.said === `playing:${id}`,
  far: st.said === 'far', book: !!st.booked, usual: st.said === 'usual', order: !!st.ordered, read: !!st.read[id],
  reply: st.replies.some((r) => r.app === id && r.text === p.text), home: st.said === 'home', howFar: st.said === 'howfar',
}[c]) || `${APPS[id].name} did not do that.`;

for (const [id, a] of Object.entries(APPS)) {
  app.actions[`${id}Open`] = { describe: `Open ${a.name}`, doing: 'Opening the app', say: `Open ${a.name}`, params: { type: 'object', properties: {} }, gate: null,
    hint: `${a.name} is in the list of your apps`,
    async run(p, ctx) { await ctx.tap(q(`#ya-${id}`)); await ctx.say(`${a.name} is open.`); }, verify: (st) => st.open === id || `${a.name} did not open.` };
  for (const c of CONTROLS[a.kind]) {
    const g = GATED[c];
    app.actions[`${id}${c[0].toUpperCase()}${c.slice(1)}`] = {
      describe: describe(id, c), doing: DOING[c], say: said(id, c), gate: g?.gate || null,
      params: c === 'reply' ? { type: 'object', properties: { text: { type: 'string', description: 'The reply, as said' } }, required: ['text'] } : { type: 'object', properties: {} },
      hint: `Open ${a.name}, then press ${LABEL[c]}`,
      ...(g && { readback: (st, p) => RB[c](id, p) }),
      async run(p, ctx) {
        if (s.open !== id) { await ctx.tap(q(`#ya-${id}`)); }
        if (c === 'reply') { const box = q('#ya-reply-text'); await ctx.tap(box); await ctx.type(box, p.text); }
        await ctx.tap(q(`#ya-${c}`));
        await ctx.say(s.note);
      },
      verify: verifyOf(id, c),
    };
  }
}
export default app;

// ---------- the screen ----------
function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role' || k === 'for') n.setAttribute(k, String(v));
    else if (k === 'onclick') n.addEventListener('click', v);
    else n[k] = v;
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const PAD = 'padding-inline: clamp(0.25rem, 4vw, 1rem)';
const button = (text, props = {}) => el('button', { type: 'button', className: 'app-btn', style: PAD, ...props }, text);

function render() {
  if (!body) return;
  const had = root.contains(root.ownerDocument.activeElement) && root.ownerDocument.activeElement.id;
  const keep = q('#ya-reply-text')?.value || '';
  const id = s.open, a = id && APPS[id];
  body.replaceChildren(el('div', {},
    el('p', { className: 'app-done', 'aria-live': 'polite' }, s.note),
    el('ul', { className: 'app-list', 'aria-label': 'Your apps' }, Object.entries(APPS).map(([k, x]) => el('li', {},
      button(x.name, { id: `ya-${k}`, 'aria-pressed': k === id, className: k === id ? 'app-btn primary' : 'app-btn', onclick: () => { s.open = k; s.note = ''; render(); } })))),
    a ? el('section', { 'aria-labelledby': 'ya-open-h' },
      el('h3', { className: 'app-h3', id: 'ya-open-h' }, a.name),
      a.items && a.kind !== 'chat' && a.kind !== 'feed' ? el('p', { className: 'app-why' }, s.playing === id && !s.paused[id] ? `Now playing: ${nowOf(id)}` : `Up next: ${nowOf(id)}`) : null,
      a.kind === 'chat' || a.kind === 'feed' ? el('ul', { className: 'app-list' }, a.items.map(([who, t]) => el('li', {}, `${who}: ${t}`))) : null,
      a.kind === 'ride' && s.booked ? el('p', { className: 'app-why' }, `Booked: a car to ${s.booked.to}, ${s.booked.mins} minutes away.`) : null,
      a.kind === 'food' && s.ordered ? el('p', { className: 'app-why' }, `Ordered: ${s.ordered.what}.`) : null,
      CONTROLS[a.kind].includes('reply') ? [el('label', { for: 'ya-reply-text', className: 'app-label' }, `Reply to ${a.items[0][0]}`), Object.assign(el('input', { id: 'ya-reply-text', className: 'app-field', type: 'text', autocomplete: 'off' }), { value: keep })] : null,
      CONTROLS[a.kind].map((c) => button(LABEL[c], { id: `ya-${c}`, className: GATED[c] ? 'app-btn primary' : 'app-btn', onclick: (e) => press(e, id, c) }))) : null));
  if (had) q(`#${had}`)?.focus();
}
