// WhatsApp, by voice: read the new chats, reply with the send gate (as Messages does). Name is text only: no logo,
// no brand colour. Every person is invented; nothing leaves the phone. Contract: os/contract.md.
const fresh = () => ({
  open: null, draft: '', lastSent: null,
  chats: [
    { id: 'priya', name: 'Priya', unread: true, messages: [{ from: 'them', text: 'Are we still on for the beach on Saturday? I can drive.' }] },
    { id: 'tomas', name: 'Tomas', unread: true, messages: [{ from: 'them', text: 'I left your umbrella at the café. Grab it when you pass.' }] },
  ],
});
let s = fresh(), root = null, os = null, body = null, sending = Promise.resolve();
const q = (sel) => root && root.querySelector(sel);
const save = () => os?.kv?.set('state', s);
const chat = (id) => s.chats.find((c) => c.id === id);
const last = (c) => c.messages.at(-1).text;
const whoId = (who) => s.chats.find((c) => c.name.toLowerCase() === String(who || '').trim().toLowerCase())?.id;

const app = {
  id: 'whatsapp',
  name: 'WhatsApp',
  async mount(r, o) {
    root = r; os = o;
    const saved = await os?.kv?.get('state');
    if (saved?.chats) s = saved;
    root.append(el('h2', { id: 'wa-h' }, 'WhatsApp'), body = el('div', { className: 'app-body' }));
    render();
  },
  async seed() { s = fresh(); await save(); render(); },
  async reset() { s = fresh(); await save(); render(); },
  state: () => structuredClone(s),
  read: () => { const n = s.chats.filter((c) => c.unread); return n.length ? `${n.length} new: ${n.map((c) => `${c.name} wrote: ${last(c)}`).join(' ')}` : 'No new messages.'; },
  place: () => ({ where: s.open ? `WhatsApp, ${chat(s.open).name}` : 'WhatsApp', item: s.open ? 'the chat' : 'your chats', next: s.open ? 'reply' : 'readNew' }),

  actions: {
    readNew: {
      describe: 'Read the new WhatsApp messages, chat by chat ("read my new messages")',
      doing: 'Reading your new messages',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Each chat is a button under the WhatsApp heading; new ones say New',
      async run(p, ctx) {
        const news = s.chats.filter((c) => c.unread);
        if (!news.length) { await ctx.say('No new messages.'); return; }
        for (const c of news) { await ctx.tap(q(`[data-chat="${c.id}"]`)); await ctx.say(`${c.name}: ${last(c)}`); }
      },
      verify: (st) => st.chats.every((c) => !c.unread) || 'Some messages were not read.',
    },
    reply: {
      describe: 'Reply to a WhatsApp chat and send it ("reply to Priya: ...")',
      doing: 'Sending your reply',
      params: { type: 'object', properties: { who: { type: 'string', description: 'Priya or Tomas' }, text: { type: 'string' } }, required: ['who', 'text'] },
      gate: 'send',
      hint: 'Open the chat; the reply box has Send right under it',
      readback: (st, p) => `Send '${String(p.text).trim().replace(/[.!]+$/, '')}' to ${chat(whoId(p.who))?.name || p.who} on WhatsApp?`,
      async run(p, ctx) {
        const id = whoId(p.who);
        if (!id) throw new Error(`There's no chat with ${p.who}.`);
        if (s.open !== id) await ctx.tap(q(`[data-chat="${id}"]`));
        const box = q('#wa-draft'); await ctx.tap(box); await ctx.type(box, p.text);
        await ctx.tap(q('#wa-send')); await sending;
      },
      verify: (st, p) => (st.lastSent?.to === whoId(p.who) && st.lastSent.text === p.text) || 'It did not send.',
    },
  },
};
export default app;

// ---------- the screen ----------
function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('aria-') || k.startsWith('data-') || k === 'for') n.setAttribute(k, String(v));
    else if (k === 'onclick') n.addEventListener('click', v);
    else n[k] = v;
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const PAD = 'padding-inline: clamp(0.25rem, 4vw, 1rem)', ROW = 'border-top: 0';
const button = (text, props = {}) => el('button', { type: 'button', className: 'app-btn', style: PAD, ...props }, text);
const openChat = (id) => { s.open = id; chat(id).unread = false; s.draft = ''; save(); render(); };

function render() {
  if (!body) return;
  const c = s.open && chat(s.open);
  body.replaceChildren(...[el('ul', { className: 'app-list', 'aria-label': 'Your chats' }, s.chats.map((x) => el('li', { style: ROW },
    button([el('b', { className: 'app-title' }, x.name), el('span', { className: 'app-why' }, ` ${x.unread ? 'New: ' : ''}${last(x)}`)],
      { 'data-chat': x.id, 'aria-pressed': String(x.id === s.open), onclick: () => openChat(x.id) })))), c && chatView(c)].filter(Boolean));
}
function chatView(c) {
  const box = el('textarea', { id: 'wa-draft', className: 'app-field', rows: 3 });
  box.value = s.draft;
  box.addEventListener('input', () => { s.draft = box.value; save(); });
  return el('div', {},
    el('h3', { className: 'app-h3', id: 'wa-chat-h', tabIndex: -1 }, `Chat with ${c.name}`),
    el('ol', { className: 'app-chat', 'aria-label': 'The chat' }, c.messages.map((m) => el('li', { className: m.from === 'me' ? 'me' : 'them', style: ROW },
      el('span', { className: 'app-who' }, m.from === 'me' ? 'You: ' : `${c.name}: `), m.text))),
    el('label', { for: 'wa-draft', className: 'app-h3' }, 'Your reply'), box,
    button('Send', { id: 'wa-send', className: 'app-btn primary', onclick: () => { sending = sendAsked(c); } }));
}
// Send always asks, a person's own tap too, as in Messages; the shell says yes at once when the agent pressed it.
async function sendAsked(c) {
  const text = s.draft.trim();
  if (!text) return;
  const yes = os?.confirm ? await os.confirm({ gate: 'send', readback: `Send '${text}' to ${c.name} on WhatsApp?` }) : false;
  if (!yes) return;
  c.messages.push({ from: 'me', text: s.draft }); s.lastSent = { to: c.id, text: s.draft }; s.draft = ''; save(); render();
}
