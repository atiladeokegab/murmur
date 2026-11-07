// Messages on the Murmur SDK (spec §3.3). The agent presses the same controls a person does.
import * as M from './model.js';
import { replaceWord, sentences } from '../../lib/notes.js';

let s = M.fresh();
let root = null, os = null;
const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const q = (sel) => root && root.querySelector(sel);

const app = {
  id: 'messages',
  name: 'Messages',
  seed() { s = M.fresh(); render(); },
  reset() { s = M.fresh(); render(); },
  state: () => structuredClone(s),
  read: () => M.read(s),
  place: () => M.place(s),
  mount(el, osApi) { root = el; os = osApi; render(); },

  actions: {
    openChat: {
      describe: 'Opening the chat',
      params: { type: 'object', properties: { who: { type: 'string' }, id: { type: 'string' } } },
      gate: null,
      hint: 'Your chats are buttons under the Messages heading, newest first',
      async run(p, ctx) {
        const r = M.resolve(s, p);
        if (r.ask) return { ask: r.ask };
        if (r.none) return { fail: r.none };
        await ctx.tap(q(`[data-chat="${r.id}"]`));
      },
      verify: (st, p) => { const r = M.resolve(st, p); return !!r.id && st.open === r.id; },
    },
    read: {
      describe: 'Reading',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Read it is the first button in the chat; each sentence is its own item after it',
      async run(p, ctx) { await ctx.tap(q('#msg-read')); await reading; },
      verify: (st) => !!st.reading && st.reading.chat === st.open,
    },
    reply: {
      describe: 'Writing your reply',
      params: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      gate: null,
      hint: 'The reply box is under the last message',
      async run(p, ctx) { const box = q('#msg-draft'); await ctx.tap(box); await ctx.type(box, p.text); },
      verify: (st, p) => !!st.open && st.draft === p.text,
    },
    replace: {
      describe: 'Changing a word',
      params: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
      gate: null,
      hint: 'Change the word in the reply box; the changed word is underlined',
      async run(p, ctx) {
        const r = replaceWord(s.draft, p.from, p.to);
        if (!r.changed) return { fail: `I can't find ${p.from} in your reply.` };
        const box = q('#msg-draft');
        await ctx.tap(box);
        await ctx.type(box, r.text);
        return { say: sentences(r.text)[r.index] };
      },
      verify: (st, p) => !!st.changed && new RegExp(`\\b${esc(p.to)}\\b`, 'i').test(st.changed.to)
        && new RegExp(`\\b${esc(p.from)}\\b`, 'i').test(st.changed.from),
    },
    send: {
      describe: 'Sending',
      params: { type: 'object', properties: {} },
      gate: 'send',
      hint: 'Send is the button right after the reply box',
      readback: (st) => `Send to ${M.chatOf(st)?.name}: ${st.draft}`,
      async run(p, ctx) { await ctx.tap(q('#msg-send')); },
      verify: (st) => st.lastSent?.text === st.draft && st.lastSent.to === st.open,
    },
  },
};
export default app;

// ---------- the screen ----------
let reading = Promise.resolve();
function h(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const button = (text, props = {}) => h('button', { type: 'button', className: 'app-btn', ...props }, text);

function render() {
  if (!root || typeof document === 'undefined') return;
  const c = M.chatOf(s);
  root.replaceChildren(c ? chatView(c) : listView());
}

function listView() {
  return h('section', { className: 'app', ariaLabel: 'Messages' },
    h('h2', { className: 'app-h' }, 'Messages'),
    h('ul', { className: 'app-list' }, s.chats.map((c) => h('li', {},
      button('', { dataset: { chat: c.id }, onclick: () => { M.open(s, c.id); render(); os?.focus?.('#msg-read'); } },
        h('span', { className: 'app-title' }, c.name),
        h('span', { className: 'app-why' }, (c.unread ? 'New: ' : '') + c.messages.at(-1).text))))));
}

function sentenceList(label, text, { changed = null, current = -1, id } = {}) {
  const all = sentences(text);
  return h('ol', { className: 'app-sentences', ariaLabel: label, id }, all.map((t, i) => {
    const li = h('li', { tabIndex: 0, className: i === current ? 'is-current' : '' });
    const name = `Sentence ${i + 1} of ${all.length}${changed && changed.sentence === i ? ', changed' : ''}`;
    li.append(h('span', { className: 'sr' }, name + ': '));
    if (changed && changed.sentence === i) {
      const words = t.split(/\s+/);
      words.forEach((w, k) => li.append(k === changed.word ? h('strong', { className: 'app-changed' }, w) : w, k < words.length - 1 ? ' ' : ''));
    } else li.append(t);
    return li;
  }));
}

function chatView(c) {
  const items = M.readItems(s);
  const at = s.reading && s.reading.chat === c.id ? s.reading.at : -1;
  const box = h('textarea', { id: 'msg-draft', className: 'app-field', rows: 3, value: M.sent(s) ? '' : s.draft });
  box.addEventListener('input', () => { M.setDraft(s, box.value); renderDraft(); });
  return h('section', { className: 'app', ariaLabel: `${M.possessive(c.name)} chat` },
    h('h2', { className: 'app-h' }, `${M.possessive(c.name)} chat`),
    button('Back to your chats', { className: 'app-btn quiet', onclick: () => { s.open = null; render(); } }),
    button(`Read ${M.possessive(c.name)} message`, { id: 'msg-read', onclick: () => { reading = readAloud(); } }),
    h('h3', { className: 'app-h3' }, 'The chat'),
    h('ol', { className: 'app-chat' }, c.messages.map((m) => h('li', { className: m.from === 'me' ? 'me' : 'them' },
      h('span', { className: 'app-who' }, m.from === 'me' ? 'You' : c.name), ' ', m.text))),
    h('h3', { className: 'app-h3' }, `${possessive(c.name)} message, sentence by sentence`),
    sentenceList(`${M.possessive(c.name)} message`, items.map((x) => x.text).join(' '), { current: at, id: 'msg-items' }),
    h('h3', { className: 'app-h3', id: 'msg-reply-h' }, 'Your reply'),
    h('div', { id: 'msg-reply' }, draftView()),
    h('label', { htmlFor: 'msg-draft', className: 'app-label' }, 'Your reply, edit it here'),
    box,
    button(M.sent(s) ? 'Sent' : 'Send', { id: 'msg-send', className: 'app-btn primary', onclick: onSend }),
  );
}
const possessive = M.possessive;

function draftView() {
  if (M.sent(s)) return h('p', { className: 'app-done' }, `Sent: ${s.lastSent.text}`);
  if (!s.draft) return h('p', { className: 'app-why' }, 'No reply yet.');
  return sentenceList('Your reply', s.draft, { changed: s.changed });
}
function renderDraft() { const n = q('#msg-reply'); if (n) n.replaceChildren(draftView()); }

async function readAloud() {
  const items = M.startReading(s);
  render();
  for (let i = 0; i < items.length; i++) {
    s.reading.at = i;
    q('#msg-items li.is-current')?.classList.remove('is-current');
    q(`#msg-items li:nth-child(${i + 1})`)?.classList.add('is-current');
    if (await os?.say?.(items[i].text) === false) break; // false: the person said stop
  }
}

async function onSend() {
  if (M.sent(s) || !s.draft.trim()) return;
  // A person's own tap asks first too; the runner has already asked when the agent taps (os.confirm resolves true).
  if (os?.confirm && !(await os.confirm({ gate: 'send', readback: app.actions.send.readback(s) }))) return;
  M.send(s);
  render();
}
