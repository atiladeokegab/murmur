// The Writer on the Murmur SDK (os/contract.md): chapters, read the last page, where am I, dictate, change, carry on.
// The book is saved on the phone through the app's kv.
import * as W from './model.js';
import { sentences } from '../../lib/notes.js';

let s = W.fresh();
let root = null, os = null, body = null;
let lis = []; // the sentence items of the open chapter, for the amber highlight
const q = (sel) => root && root.querySelector(sel);
const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (t) => new RegExp(`\\b${esc(t)}\\b`, 'i');
const save = () => os?.kv?.set('state', s);

/** Reads on from s.sentence, one sentence at a time; on Stop, s.sentence stays where the person was. */
async function readOn(say) {
  const all = sentences(W.current(s).text);
  for (let i = s.sentence; i < all.length; i++) {
    s.sentence = i;
    lis.forEach((li, k) => { li.className = k === i ? 'is-current' : ''; });
    lis[i]?.scrollIntoView?.({ block: 'center' });
    const place = q('#wr-place'); if (place) place.textContent = W.where(s);
    save();
    await say(all[i]);
  }
}
const personReads = (e) => { if (e.isTrusted) readOn(async (t) => { if ((await os.say?.(t)) === false) throw new Error("Stopped."); }).catch(() => {}); };

const app = {
  id: 'writer',
  name: 'The Writer',
  async mount(r, o) {
    root = r; os = o;
    const saved = await os.kv?.get('state');
    if (saved?.chapters) s = saved;
    root.append(el('h2', { id: 'writer-h' }, 'The Writer'), body = el('div', { className: 'app-body' }));
    render();
  },
  async seed() { await save(); render(); },
  async reset() { s = W.fresh(); await save(); render(); },
  // current is derived, for the eval and the agent: chapter and sentence counted from 1, and the open chapter's text.
  state: () => ({ ...structuredClone(s), current: { chapter: s.chapter + 1, title: W.current(s).title, sentence: s.sentence + 1, of: W.count(s), text: W.current(s).text } }),
  read: () => W.read(s),
  place: () => W.place(s),

  actions: {
    openChapter: {
      describe: 'Open a chapter of the book by its number',
      doing: 'Opening the chapter',
      params: { type: 'object', properties: { n: { type: 'integer', minimum: 1 } }, required: ['n'] },
      gate: null,
      hint: 'The chapters are buttons near the end, under the book title',
      async run(p, ctx) {
        const b = q(`[data-chapter="${p.n}"]`);
        if (!b) throw new Error(`There's no chapter ${p.n}. The book has ${s.chapters.length}.`);
        await ctx.tap(b);
      },
      verify: (st, p) => st.chapter === p.n - 1 || `Chapter ${p.n} didn't open.`,
      done: (st, p) => `Chapter ${p.n}.`,
    },
    readLastPage: {
      describe: 'Read the last page of the book aloud, sentence by sentence',
      doing: 'Reading the last page',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Read the last page is the first button under the heading',
      async run(p, ctx) { await ctx.tap(q('#wr-last')); await readOn((t) => ctx.say(t)); },
      verify: (st) => (st.chapter === st.chapters.length - 1 && st.readFrom === W.lastPageStart(st) && st.sentence >= st.readFrom) || 'The last page did not open.',
    },
    where: {
      describe: 'Say where you are in the book: chapter, sentence and what that part is about',
      doing: 'Finding your place',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Where am I is the third button; your place is also the line under the heading',
      async run(p, ctx) { await ctx.tap(q('#wr-where')); await ctx.say(W.where(s)); },
      verify: (st) => st.lastSaid === W.where(st) || 'I lost the place.',
    },
    carryOn: {
      describe: 'Carry on reading from where you stopped',
      doing: 'Carrying on',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Carry on is the second button',
      async run(p, ctx) { await ctx.tap(q('#wr-carry')); await readOn((t) => ctx.say(t)); },
      verify: (st) => (st.readFrom != null && st.sentence >= st.readFrom) || 'Reading did not carry on.',
      done: () => '', // it just read aloud; nothing to add
    },
    dictate: {
      describe: 'Add dictated sentences to the end of the open chapter',
      doing: 'Writing it down',
      params: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      gate: null,
      hint: 'The writing box is after the chapter, with Add to the chapter right after it',
      async run(p, ctx) {
        const box = q('#wr-text');
        await ctx.tap(box); await ctx.type(box, p.text); await ctx.tap(q('#wr-add'));
      },
      verify: (st, p) => (!!String(p.text).trim() && st.chapters[st.chapter].text.endsWith(String(p.text).trim())) || 'It did not go in.',
      done: () => 'Added.',
      async undo(ctx) { await ctx.tap(q('#wr-undo')); },
    },
    change: {
      describe: 'Change one word in the open chapter to another, nearest where you are',
      doing: 'Changing the word',
      params: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
      gate: null,
      hint: 'Change a word has two boxes, the word and the new word, then Change',
      async run(p, ctx) {
        await ctx.tap(q('#wr-from')); await ctx.type(q('#wr-from'), p.from);
        await ctx.tap(q('#wr-to')); await ctx.type(q('#wr-to'), p.to);
        await ctx.tap(q('#wr-change'));
        if (!s.changed) throw new Error(`I can't find ${p.from} in this chapter.`);
        await ctx.say(sentences(W.current(s).text)[s.sentence]);
      },
      verify: (st, p) => (!!st.changed && st.changed.chapter === st.chapter && st.changed.to === p.to
        && words(p.to).test(sentences(st.chapters[st.chapter].text)[st.changed.sentence] || '')) || `${p.from} wasn't changed.`,
      done: () => 'Changed.',
      async undo(ctx) { await ctx.tap(q('#wr-undo')); },
    },
    newChapter: {
      describe: 'Start a new, empty chapter at the end of the book',
      doing: 'Starting a new chapter',
      params: { type: 'object', properties: { title: { type: 'string' } } },
      gate: null,
      hint: 'New chapter is the last button, after its title box',
      async run(p, ctx) {
        if (p.title) { await ctx.tap(q('#wr-title')); await ctx.type(q('#wr-title'), p.title); }
        await ctx.tap(q('#wr-new'));
      },
      verify: (st, p) => (st.chapter === st.chapters.length - 1 && st.chapters[st.chapter].text === ''
        && (!p.title || st.chapters[st.chapter].title === String(p.title).trim())) || 'No new chapter.',
      done: (st) => `Chapter ${st.chapters.length} started.`,
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
const button = (text, props = {}) => el('button', { type: 'button', className: 'app-btn', ...props }, text);
const field = (id, label) => [el('label', { for: id, className: 'app-label' }, label), el('input', { id, className: 'app-field', autocomplete: 'off' })];

function render() {
  if (!body) return;
  const ch = W.current(s), all = sentences(ch.text);
  const text = el('textarea', { id: 'wr-text', className: 'app-field', rows: 3 });
  lis = all.map((t, i) => {
    const changed = s.changed && s.changed.chapter === s.chapter && s.changed.sentence === i;
    const li = el('li', { tabIndex: 0, className: i === s.sentence && s.readFrom != null ? 'is-current' : '' },
      el('span', { className: 'sr' }, `Sentence ${i + 1} of ${all.length}${changed ? ', changed' : ''}: `));
    const m = changed && t.match(words(s.changed.to));
    if (m) li.append(t.slice(0, m.index), el('mark', { className: 'changed' }, m[0]), t.slice(m.index + m[0].length));
    else li.append(t);
    return li;
  });
  body.replaceChildren(...[
    el('h3', { className: 'app-h3' }, `Chapter ${s.chapter + 1}: ${ch.title}`),
    el('p', { className: 'app-place', id: 'wr-place' }, W.where(s)),
    button('Read the last page', { id: 'wr-last', className: 'app-btn primary', onclick: (e) => { W.startLastPage(s); save(); render(); personReads(e); } }),
    button('Carry on', { id: 'wr-carry', onclick: (e) => { W.startCarryOn(s); save(); render(); personReads(e); } }),
    button('Where am I', { id: 'wr-where', onclick: (e) => { s.lastSaid = W.where(s); save(); if (e.isTrusted) os.say?.(s.lastSaid); } }),
    el('ol', { className: 'app-sentences', id: 'wr-sentences', 'aria-label': `Chapter ${s.chapter + 1}, sentence by sentence` }, lis),
    el('h3', { className: 'app-h3' }, 'Write'),
    el('label', { for: 'wr-text', className: 'app-label' }, 'Dictate or type the next sentences'),
    text,
    button('Add to the chapter', { id: 'wr-add', onclick: () => { if (W.dictate(s, text.value)) { save(); render(); } } }),
    s.undo && button('Undo the last change', { id: 'wr-undo', onclick: () => { if (W.undo(s)) { save(); render(); } } }),
    el('h3', { className: 'app-h3' }, 'Change a word'),
    ...field('wr-from', 'The word'),
    ...field('wr-to', 'The new word'),
    button('Change', { id: 'wr-change', onclick: () => {
      s.changed = null;
      if (W.change(s, q('#wr-from').value, q('#wr-to').value)) { save(); render(); }
    } }),
    el('h3', { className: 'app-h3' }, `${s.title}: chapters`),
    el('ul', { className: 'app-list' }, s.chapters.map((c, i) => el('li', {},
      button(`Chapter ${i + 1}: ${c.title}`, { 'data-chapter': i + 1, 'aria-current': i === s.chapter ? 'true' : null,
        onclick: () => { W.openChapter(s, i + 1); save(); render(); } })))),
    ...field('wr-title', 'New chapter title, if you want one'),
    button('New chapter', { id: 'wr-new', onclick: () => { W.newChapter(s, q('#wr-title').value); save(); render(); } }),
  ].filter(Boolean));
}
