// The Writer on the Murmur SDK (spec §3.3): chapters, read the last page, where am I, dictate, change, carry on.
// shortcut: the book is seed data held in memory; persist it through os.kv once the SDK's kv lands.
import * as W from './model.js';
import { sentences } from '../../lib/notes.js';

let s = W.fresh();
let root = null, os = null;
let reading = Promise.resolve();
const q = (sel) => root && root.querySelector(sel);
const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (t) => new RegExp(`\\b${esc(t)}\\b`, 'i');

const app = {
  id: 'writer',
  name: 'The Writer',
  seed() { s = W.fresh(); render(); },
  reset() { s = W.fresh(); render(); },
  state: () => structuredClone(s),
  read: () => W.read(s),
  place: () => W.place(s),
  mount(el, osApi) { root = el; os = osApi; render(); },

  actions: {
    openChapter: {
      describe: 'Opening the chapter',
      params: { type: 'object', properties: { n: { type: 'integer', minimum: 1 } }, required: ['n'] },
      gate: null,
      hint: 'The chapters are buttons under the book title',
      async run(p, ctx) {
        const b = q(`[data-chapter="${p.n}"]`);
        if (!b) return { fail: `There's no chapter ${p.n}. The book has ${s.chapters.length}.` };
        await ctx.tap(b);
      },
      verify: (st, p) => st.chapter === p.n - 1,
    },
    readLastPage: {
      describe: 'Reading the last page',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Read the last page is the first button under the chapter heading',
      async run(p, ctx) { await ctx.tap(q('#wr-last')); await reading; },
      verify: (st) => st.chapter === st.chapters.length - 1 && st.readFrom === W.lastPageStart(st) && st.sentence >= st.readFrom,
    },
    where: {
      describe: 'Finding your place',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Where am I is the button after Carry on; your place is also the line under the chapter heading',
      async run(p, ctx) { await ctx.tap(q('#wr-where')); return { say: W.where(s) }; },
      verify: (st) => st.lastSaid === W.where(st),
    },
    carryOn: {
      describe: 'Carrying on',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Carry on is the button after Read the last page',
      async run(p, ctx) { await ctx.tap(q('#wr-carry')); await reading; },
      verify: (st) => st.readFrom != null && st.sentence >= st.readFrom,
    },
    dictate: {
      describe: 'Writing it down',
      params: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      gate: null,
      hint: 'The writing box is near the end, with Add to the chapter right after it',
      async run(p, ctx) {
        const box = q('#wr-text');
        await ctx.tap(box); await ctx.type(box, p.text); await ctx.tap(q('#wr-add'));
      },
      verify: (st, p) => !!String(p.text).trim() && st.chapters[st.chapter].text.endsWith(String(p.text).trim()),
    },
    change: {
      describe: 'Changing a word',
      params: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
      gate: null,
      hint: 'Change a word has two boxes, the word and the new word, then Change',
      async run(p, ctx) {
        await ctx.type(q('#wr-from'), p.from); await ctx.type(q('#wr-to'), p.to); await ctx.tap(q('#wr-change'));
        if (!s.changed) return { fail: `I can't find ${p.from} in this chapter.` };
        return { say: sentences(W.current(s).text)[s.sentence] };
      },
      verify: (st, p) => !!st.changed && st.changed.chapter === st.chapter && st.changed.to === p.to
        && words(p.to).test(sentences(st.chapters[st.chapter].text)[st.changed.sentence] || ''),
    },
    newChapter: {
      describe: 'Starting a new chapter',
      params: { type: 'object', properties: { title: { type: 'string' } } },
      gate: null,
      hint: 'New chapter is the last button, after the chapter list',
      async run(p, ctx) { if (p.title) await ctx.type(q('#wr-title'), p.title); await ctx.tap(q('#wr-new')); },
      verify: (st, p) => st.chapter === st.chapters.length - 1 && st.chapters[st.chapter].text === ''
        && (!p.title || st.chapters[st.chapter].title === String(p.title).trim()),
    },
  },
};
export default app;

// ---------- the screen ----------
function h(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const button = (text, props = {}) => h('button', { type: 'button', className: 'app-btn', ...props }, text);
const field = (id, label, props = {}) => [h('label', { htmlFor: id, className: 'app-label' }, label), h('input', { id, className: 'app-field', autocomplete: 'off', ...props })];

function render() {
  if (!root || typeof document === 'undefined') return;
  const ch = W.current(s), all = sentences(ch.text);
  const text = h('textarea', { id: 'wr-text', className: 'app-field', rows: 3 });
  root.replaceChildren(h('section', { className: 'app', ariaLabel: 'The Writer' },
    h('h2', { className: 'app-h' }, `Chapter ${s.chapter + 1}: ${ch.title}`),
    h('p', { className: 'app-place', id: 'wr-place' }, W.where(s)),
    button('Read the last page', { id: 'wr-last', className: 'app-btn primary', onclick: () => { W.startLastPage(s); reading = readOn(); } }),
    button('Carry on', { id: 'wr-carry', onclick: () => { W.startCarryOn(s); reading = readOn(); } }),
    button('Where am I', { id: 'wr-where', onclick: () => { s.lastSaid = W.where(s); os?.say?.(s.lastSaid); } }),
    h('ol', { className: 'app-sentences', id: 'wr-sentences', ariaLabel: `Chapter ${s.chapter + 1}, sentence by sentence` },
      all.map((t, i) => {
        const changed = s.changed && s.changed.chapter === s.chapter && s.changed.sentence === i;
        const li = h('li', { tabIndex: 0, className: i === s.sentence && s.readFrom != null ? 'is-current' : '' },
          h('span', { className: 'sr' }, `Sentence ${i + 1} of ${all.length}${changed ? ', changed' : ''}: `));
        if (changed) {
          const m = t.match(words(s.changed.to));
          li.append(t.slice(0, m.index), h('strong', { className: 'app-changed' }, m[0]), t.slice(m.index + m[0].length));
        } else li.append(t);
        return li;
      })),
    h('h3', { className: 'app-h3' }, 'Write'),
    h('label', { htmlFor: 'wr-text', className: 'app-label' }, 'Dictate or type the next sentences'),
    text,
    button('Add to the chapter', { id: 'wr-add', onclick: () => { if (W.dictate(s, text.value)) { text.value = ''; render(); } } }),
    h('h3', { className: 'app-h3' }, 'Change a word'),
    ...field('wr-from', 'The word'),
    ...field('wr-to', 'The new word'),
    button('Change', { id: 'wr-change', onclick: () => {
      s.changed = null;
      if (W.change(s, q('#wr-from').value, q('#wr-to').value)) render();
    } }),
    h('h3', { className: 'app-h3' }, `${s.title}: chapters`),
    h('ul', { className: 'app-list' }, s.chapters.map((c, i) => h('li', {},
      button(`Chapter ${i + 1}: ${c.title}`, { dataset: { chapter: i + 1 }, ariaCurrent: i === s.chapter ? 'true' : null,
        onclick: () => { W.openChapter(s, i + 1); render(); } })))),
    ...field('wr-title', 'New chapter title (optional)'),
    button('New chapter', { id: 'wr-new', onclick: () => { W.newChapter(s, q('#wr-title').value); render(); } }),
  ));
}

async function readOn() {
  render();
  const all = sentences(W.current(s).text);
  for (let i = s.sentence; i < all.length; i++) {
    s.sentence = i;
    q('#wr-sentences li.is-current')?.classList.remove('is-current');
    const li = q(`#wr-sentences li:nth-child(${i + 1})`);
    li?.classList.add('is-current');
    li?.scrollIntoView?.({ block: 'start' });
    const place = q('#wr-place'); if (place) place.textContent = W.where(s);
    if (await os?.say?.(all[i]) === false) break; // false: the person said stop; s.sentence stays where they were
  }
}
