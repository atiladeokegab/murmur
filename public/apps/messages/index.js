// Messages on the Murmur SDK (os/contract.md). The agent presses the same controls a person does.
import * as M from './model.js';
import { replaceWord, sentences } from '../../lib/notes.js';

let s = M.fresh();
let root = null, os = null, body = null;
let items = []; // the <li> of the message being read, for the amber highlight
const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const q = (sel) => root && root.querySelector(sel);
const save = () => os?.kv?.set('state', s);

/** Reads what the Read button started, one sentence at a time, the current one in amber. */
async function speakItems(say) {
  const list = s.reading?.items || [];
  for (let i = 0; i < list.length; i++) {
    s.reading.at = i;
    items.forEach((li, k) => { li.className = k === i ? 'is-current' : ''; });
    await say(list[i]);
  }
}

const app = {
  id: 'messages',
  name: 'Messages',
  async mount(r, o) {
    root = r; os = o;
    const saved = await os.kv?.get('state');
    if (saved?.chats) s = saved;
    root.append(el('h2', { id: 'messages-h' }, 'Messages'), body = el('div', { className: 'app-body' }));
    render();
  },
  async seed() { if (!s?.chats) s = M.fresh(); await save(); render(); },
  async reset() { s = M.fresh(); await save(); render(); },
  state: () => structuredClone(s),
  read: () => M.read(s),
  place: () => M.place(s),

  actions: {
    openChat: {
      describe: 'Open the chat with a person',
      doing: 'Opening the chat',
      params: { type: 'object', properties: { who: { type: 'string', description: 'The name as said' }, id: { type: 'string', enum: ['mum', 'sam', 'samira'] } } },
      gate: null,
      hint: 'Your chats are buttons under the Messages heading',
      async run(p, ctx) {
        let r = M.resolve(s, p);
        if (r.ask) {
          const pick = await ctx.choose(r.ask.question, r.ask.choices.map((c) => ({ label: c.label, id: c.params.id })));
          if (!pick) throw new Error('No one chosen.');
          r = { id: pick.id };
        }
        if (r.none) throw new Error(r.none);
        if (s.currentChat && s.currentChat !== r.id) await ctx.tap(q('#msg-back'));
        if (s.currentChat !== r.id) await ctx.tap(q(`[data-chat="${r.id}"]`));
      },
      verify: (st, p) => {
        const ok = p.id ? [p.id] : M.candidates(st, p.who).map((c) => c.id);
        return (!!st.currentChat && ok.includes(st.currentChat)) || `The chat with ${p.who || p.id} didn't open.`;
      },
    },
    read: {
      describe: 'Read the new message in the open chat, sentence by sentence',
      doing: 'Reading',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Read is the first button in the chat; each sentence is its own item after the chat',
      async run(p, ctx) {
        await ctx.tap(q('#msg-read'));
        await speakItems((t) => ctx.say(t));
      },
      verify: (st) => (!!st.currentChat && st.reading?.chat === st.currentChat) || 'Nothing was read.',
    },
    reply: {
      describe: 'Write a reply in the open chat',
      doing: 'Writing your reply',
      params: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      gate: null,
      hint: 'The reply box is after the chat, with Send right under it',
      async run(p, ctx) { const box = q('#msg-draft'); await ctx.tap(box); await ctx.type(box, p.text); },
      verify: (st, p) => (!!st.currentChat && st.draft === p.text) || 'The reply box did not take it.',
    },
    replace: {
      describe: 'Change one word in the reply to another',
      doing: 'Changing the word',
      params: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
      gate: null,
      hint: 'Change the word in the reply box; the changed word is underlined',
      async run(p, ctx) {
        const r = replaceWord(s.draft, p.from, p.to);
        if (!r.changed) throw new Error(`I can't find ${p.from} in your reply.`);
        const box = q('#msg-draft');
        await ctx.tap(box);
        await ctx.type(box, r.text);
        q('mark.changed')?.scrollIntoView?.({ block: 'center' });
        await ctx.say(sentences(r.text)[r.index]);
      },
      verify: (st, p) => (!!st.changed && new RegExp(`\\b${esc(p.to)}\\b`, 'i').test(st.changed.to)
        && new RegExp(`\\b${esc(p.from)}\\b`, 'i').test(st.changed.from)) || `${p.from} wasn't changed.`,
    },
    send: {
      describe: 'Send the reply',
      doing: 'Sending',
      params: { type: 'object', properties: {} },
      gate: 'send',
      hint: 'Send is the button right after the reply box',
      readback: (st) => `Send '${String(st.draft || 'nothing yet').trim().replace(/[.!]+$/, '')}' to ${M.chatOf(st)?.name || 'no one'}?`,
      done: () => (s.lastSent ? `Sent to ${M.chatOf(s, s.lastSent.to)?.name}.` : M.read(s)),
      async run(p, ctx) { await ctx.tap(q('#msg-send')); await sending; },
      verify: (st) => (!!st.draft && st.lastSent?.text === st.draft && st.lastSent.to === st.currentChat) || 'It did not send.',
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
  for (const k of kids.flat()) if (k != null && k !== false) n.append(typeof k === 'number' ? String(k) : k);
  return n;
}
// Inline styles here, not app.css (build-murmur's): .app-btn's 1rem side padding is 64 px at 400%, and the board's
// `li + li` top rule would put a line on every row but the first.
const PAD = 'padding-inline: clamp(0.25rem, 4vw, 1rem)';
const ROW = 'border-top: 0';
const button = (text, props = {}) => el('button', { type: 'button', className: 'app-btn', style: PAD, ...props }, text);

function render() {
  if (!body) return;
  const c = M.chatOf(s);
  body.replaceChildren(c ? chatView(c) : listView());
}

function listView() {
  return el('ul', { className: 'app-list', 'aria-label': 'Your chats' }, s.chats.map((c) => el('li', { style: ROW },
    button([el('b', { className: 'app-title' }, c.name), el('span', { className: 'sr' }, '.'), el('span', { className: 'app-why' }, ` ${c.unread ? 'New: ' : ''}${c.messages.at(-1).text}`)], { 'data-chat': c.id, onclick: () => { M.open(s, c.id); save(); render(); } }))));
}

function sentenceList(label, all, { changed = null, current = -1, keep = false } = {}) {
  const lis = all.map((t, i) => {
    const li = el('li', { tabIndex: 0, className: i === current ? 'is-current' : '', style: ROW });
    const isChanged = changed && changed.sentence === i;
    li.append(el('span', { className: 'sr' }, `Sentence ${i + 1} of ${all.length}${isChanged ? ', changed' : ''}: `));
    if (isChanged) {
      const words = t.split(/\s+/);
      words.forEach((w, k) => li.append(k === changed.word ? el('mark', { className: 'changed' }, w) : w, k < words.length - 1 ? ' ' : ''));
    } else li.append(t);
    return li;
  });
  if (keep) items = lis;
  return el('ol', { className: 'app-sentences', 'aria-label': label }, lis);
}

function chatView(c) {
  const who = M.possessive(c.name);
  const at = s.reading && s.reading.chat === c.id ? s.reading.at : -1;
  const text = s.reading && s.reading.chat === c.id ? s.reading.items : [];
  const box = el('textarea', { id: 'msg-draft', className: 'app-field', rows: 3 });
  box.value = M.sent(s) ? '' : s.draft;
  box.addEventListener('input', () => { M.setDraft(s, box.value); save(); renderDraft(); });
  return el('div', {},
    el('h3', { className: 'app-h3' }, `${who} chat`),
    button(`Read ${who} message`, { id: 'msg-read', onclick: (e) => {
      // A person's tap reads aloud here; the agent's tap only starts it, and its run reads through ctx.say.
      M.startReading(s); save(); render();
      if (e.isTrusted) speakItems(async (t) => { if ((await os.say?.(t)) === false) throw new Error("Stopped."); }).catch(() => {});
    } }),
    el('ol', { className: 'app-chat', 'aria-label': 'The chat' }, c.messages.map((m) => el('li', { className: m.from === 'me' ? 'me' : 'them', style: m.from === 'me' ? null : ROW },
      el('span', { className: 'app-who' }, m.from === 'me' ? 'You: ' : `${c.name}: `), m.text))),
    text.length ? el('h4', { className: 'app-h3' }, `${who} message, sentence by sentence`) : null,
    text.length ? sentenceList(`${who} message`, text, { current: at, keep: true }) : null,
    el('h4', { className: 'app-h3' }, 'Your reply'),
    el('label', { for: 'msg-draft', className: 'app-label', style: 'display: block; margin-block: 0.25rem 0.375rem' }, 'Your reply, edit it here'),
    box,
    button(M.sent(s) ? 'Sent' : 'Send', { id: 'msg-send', className: 'app-btn primary', onclick: () => { sending = sendAsked(); } }),
    button('Back to your chats', { id: 'msg-back', style: `${PAD}; border-color: var(--c-quiet)`, onclick: () => { s.currentChat = null; save(); render(); } }),
    // Last on the screen: it grows while you type, and nothing under it may move (layout shift).
    el('h4', { className: 'app-h3' }, 'Your reply, sentence by sentence'),
    el('div', { id: 'msg-reply' }, draftView()),
  );
}

// Send always asks, a person's own tap too: a mis-tap by someone who can't see is the risk. The shell's
// confirm says yes at once when the agent pressed it (the runner already asked).
// No confirm on the mount, no send.
let sending = Promise.resolve();
async function sendAsked() {
  if (!s.draft || M.sent(s)) return;
  const yes = os?.confirm ? await os.confirm({ gate: 'send', readback: app.actions.send.readback(s) }) : false;
  if (yes && M.send(s)) { save(); render(); }
}

function draftView() {
  if (M.sent(s)) return el('p', { className: 'app-done' }, `Sent: ${s.lastSent.text}`);
  if (!s.draft) return el('p', { className: 'app-why' }, 'No reply yet.');
  return sentenceList('Your reply', sentences(s.draft), { changed: s.changed });
}
function renderDraft() { q('#msg-reply')?.replaceChildren(draftView()); }
