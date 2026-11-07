// Your look: text, colours, voice, who speaks, how much Murmur does, and what Murmur remembers.
// An app on the contract (os/contract.md). Each row applies on touch and says itself; each row is a voice action.
// Text size, colours and voice speed live in the toolkit's ability profile (public/look.js); the rest in this app's kv.
import { readLook, writeLook, applyLook } from '../../look.js';

export const STEPS = {
  size: { label: 'Text', more: 'bigger', less: 'smaller', values: [100, 150, 200, 300, 400], words: (v) => `${v} percent` },
  rate: { label: 'Voice', more: 'faster', less: 'slower', values: [0.75, 1, 1.15, 1.25, 1.5, 2], words: (v) => (v === 1 ? 'normal speed' : `${v} times`) },
};
export const CHOICES = {
  theme: { label: 'Colours', options: { dark: 'Dark', light: 'Light', yellow: 'Yellow on black' } },
  speaker: { label: 'Who speaks', options: { murmur: 'Murmur', reader: 'My screen reader' } },
  agency: { label: 'How much Murmur does', options: { ask: 'Ask me', just: 'Just do it', teach: 'Teach me' } },
};
const DEFAULTS = { size: 100, rate: 1.15, theme: 'dark', speaker: 'murmur', agency: 'ask', learning: true };

let root = null, kv = null, os = null, toolkit = null;
let look = { ...DEFAULTS }, known = null, lastChange = null, pending = Promise.resolve();
const listeners = new Set();
const btn = {};

/** The settings the shell, the voice and the agent read. */
export const settings = () => ({ ...look });
/** Called with the settings after every change. Returns an unsubscribe. */
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * One voice, never both. Reader mode: the sentence goes only to the one role=status region, which is live.
 * Murmur mode: Murmur speaks, and the region shows the words with live off, so a screen reader never doubles it.
 */
export async function routeSay(text, { speak, status, signal } = {}) {
  if (status) { status.setAttribute('aria-live', look.speaker === 'reader' ? 'polite' : 'off'); status.textContent = text; }
  if (look.speaker !== 'reader' && speak) await speak(text, signal);
}

function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'dataset') Object.assign(n.dataset, v); else if (k.startsWith('aria-') || k === 'role') n.setAttribute(k, v); else n[k] = v;
  }
  for (const k of kids) n.append(k);
  return n;
}

// The toolkit: the host's if it passed one, else our own on the same localStorage. Never fatal.
async function lib() {
  if (toolkit) return toolkit;
  if (os.librarian && os.datastore) return (toolkit = { librarian: os.librarian, datastore: os.datastore }); // both, or our own
  try {
    const [{ createToolkit }, { browserKV }] = await Promise.all([import('../../vendor/toolkit/index.js'), import('../../ports/browser-kv.js')]);
    toolkit = createToolkit({ kv: browserKV() });
    await toolkit.datastore.runMigrations();
  } catch { toolkit = { librarian: null, datastore: null }; }
  return toolkit;
}

function apply() {
  const html = root.ownerDocument.documentElement;
  if (html) {
    if (!/[?&]zoom=/.test(globalThis.location?.search || '')) applyLook(look); // ?zoom= is for captures
    html.dataset.size = String(look.size); // look.css tightens padding above 300%
    html.dataset.speaker = look.speaker;
    html.dataset.agency = look.agency;
  }
  for (const fn of listeners) { try { fn(settings()); } catch (e) { console.error(e); } }
}

function render() {
  for (const [key, s] of Object.entries(STEPS)) {
    const i = s.values.indexOf(look[key]), now = s.words(look[key]);
    for (const dir of ['more', 'less']) {
      const b = btn[`${key}-${dir}`];
      b.textContent = `${s.label}: ${s[dir]}. Now ${now}`;
      b.setAttribute('aria-disabled', String(dir === 'more' ? i === s.values.length - 1 : i === 0));
    }
  }
  for (const [key, c] of Object.entries(CHOICES)) {
    for (const v of Object.keys(c.options)) btn[`${key}-${v}`].setAttribute('aria-pressed', String(look[key] === v));
  }
  btn.learning.textContent = look.learning ? 'Learning: on. Stop learning' : 'Learning: stopped. Start learning again';
  btn.learning.setAttribute('aria-pressed', String(!look.learning));
  btn.known.replaceChildren(...(known || []).map((k, n) => el('li', { textContent: k.words, dataset: { n: String(n + 1) } })));
}

async function save(change, sentence) {
  lastChange = change;
  await kv.set('look', look);
  const { librarian } = await lib();
  if (librarian && (change.row === 'size' || change.row === 'rate' || change.row === 'theme')) {
    try { await writeLook(librarian, look); } catch { /* the kv copy still holds it */ }
  }
  if (librarian && change.row === 'learning') { try { await librarian.setMemoryPaused(!look.learning); } catch { /* said below either way */ } }
  apply();
  render();
  if (!byAgent) await os.say(sentence);
}

function step(key, dir) {
  const s = STEPS[key], i = s.values.indexOf(look[key]);
  const j = dir === 'more' ? i + 1 : i - 1;
  if (j < 0 || j >= s.values.length) return os.say(`${s.label} is already ${s.words(look[key])}, the ${dir === 'more' ? 'most' : 'least'} it goes.`);
  const from = look[key];
  look[key] = s.values[j];
  return save({ row: key, from, to: look[key] }, `${s.label}: ${s[dir]}. Now ${s.words(look[key])}.`);
}

function choose(key, v) {
  const from = look[key];
  look[key] = v;
  const said = key === 'speaker'
    ? (v === 'reader' ? 'Who speaks: your screen reader. I will stay quiet and write here.' : 'Who speaks: Murmur. I will talk again.')
    : `${CHOICES[key].label}: ${CHOICES[key].options[v]}.`;
  return save({ row: key, from, to: v }, said);
}

// What Murmur knows, in plain words: the Librarian's memories first, then the task log grouped by app.
// The log holds only which app and when (spec §3.4), so that is all this can say.
const PARTS = [[5, 'at night'], [12, 'in the morning'], [17, 'in the afternoon'], [22, 'in the evening'], [24, 'at night']];
const partOf = (t) => PARTS.find(([h]) => new Date(t).getHours() < h)[1];
const logKey = (e) => e.data?.app || e.data?.tile || e.type;
async function loadKnown() {
  const { librarian, datastore } = await lib();
  const out = [];
  try {
    const { memories } = await librarian.listMemories({ status: 'active' });
    for (const m of memories.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))) if (m.text) out.push({ kind: 'memory', id: m.id, words: `${m.text}.`.replace(/[.;]+\.$/, '.') });
  } catch { /* no Librarian: nothing remembered */ }
  try {
    const groups = new Map();
    for (const e of (await datastore.get('mine.episodicLog'))?.entries || []) {
      const k = logKey(e), g = groups.get(k) || { n: 0, parts: {}, t: 0 };
      g.n++; g.t = Math.max(g.t, e.t); const p = partOf(e.t); g.parts[p] = (g.parts[p] || 0) + 1;
      groups.set(k, g);
    }
    for (const [k, g] of [...groups].sort((a, b) => b[1].t - a[1].t)) {
      const part = Object.entries(g.parts).sort((a, b) => b[1] - a[1])[0][0];
      const name = k.charAt(0).toUpperCase() + k.slice(1);
      out.push({ kind: 'log', key: k, words: `${name}: ${g.n === 1 ? 'once' : `${g.n} times`}, mostly ${part}.` });
    }
  } catch { /* nothing logged */ }
  known = out;
}

async function tell() {
  await loadKnown();
  render();
  if (!known.length) return os.say('I know nothing about you yet. I only ever keep which app you used and when.');
  await os.say(`I know ${known.length === 1 ? 'one thing' : `${known.length} things`}. Say forget that to remove the first.`);
  for (const k of known) await os.say(k.words);
}

async function forget() {
  if (known === null) await loadKnown();
  const k = known[0];
  if (!k) { lastChange = { row: 'forget', item: null }; return os.say('There is nothing to forget.'); }
  const { librarian, datastore } = await lib();
  if (k.kind === 'memory') await librarian.deleteMemory(k.id);
  else await datastore.patch('mine.episodicLog', (log) => ({ ...log, entries: log.entries.filter((e) => logKey(e) !== k.key) }));
  await loadKnown();
  lastChange = { row: 'forget', item: k.words };
  render();
  await os.say(`Forgotten: ${k.words}`);
}

// The person's tap and the agent's tap land here alike; `pending` lets an action wait for the work to finish.
const on = (b, fn) => b.addEventListener('click', () => { pending = pending.then(fn, fn); });

// Every action presses a row's control through ctx, then waits for that row to apply.
// The agent's press keeps quiet: its done line says the change once ("Text 150 percent."). A tap by hand still hears it.
let byAgent = false;
const press = async (ctx, key) => { byAgent = true; try { await ctx.tap(btn[key]); await pending; } finally { byAgent = false; } };
// Undo: press the row's own controls until it is back where it was before the action ran (the same door).
const before = {};
async function pressTo(ctx, row, value) {
  for (let i = 0; i < 8 && look[row] !== value; i++) { // 8: more than any row has steps, so a stray value cannot loop
    if (STEPS[row]) { const v = STEPS[row].values; await press(ctx, `${row}-${v.indexOf(look[row]) < v.indexOf(value) ? 'more' : 'less'}`); }
    else await press(ctx, CHOICES[row] ? `${row}-${value}` : row); // learning is one toggle
  }
}
const undoable = (row, action) => ({
  ...action,
  async run(p, ctx) { before[row] = look[row]; await action.run(p, ctx); },
  async undo(ctx) { if (row in before) await pressTo(ctx, row, before[row]); },
  done: (s) => rowLine(row, s),
});
// The done line after a change says only that row ("Text 150 percent."): seconds count on stage.
function rowLine(row, s) {
  if (STEPS[row]) return `${STEPS[row].label} ${STEPS[row].words(s[row])}.`;
  if (row === 'learning') return s.learning ? 'Learning on.' : 'Learning stopped.';
  const words = CHOICES[row].options[s[row]];
  return row === 'speaker' ? `${words} speaks.` : `${CHOICES[row].label}: ${words.toLowerCase()}.`;
}
const stepper = (key, dir) => undoable(key, {
  describe: `Make the ${key === 'size' ? 'text' : 'voice'} ${STEPS[key][dir]}`,
  doing: `${key === 'size' ? 'Text' : 'Voice'} ${STEPS[key][dir]}`,
  hint: `${STEPS[key].label}: ${STEPS[key][dir]} is ${key === 'size' ? 'the first row' : 'the voice row'} in Your look.`,
  params: { type: 'object', properties: {} },
  async run(p, ctx) { await press(ctx, `${key}-${dir}`); },
  verify: (s) => (s.lastChange?.row === key && (dir === 'more' ? s.lastChange.to > s.lastChange.from : s.lastChange.to < s.lastChange.from))
    || `${STEPS[key].label} did not change.`,
});
const chooser = (key, param, describe, doing, hint) => undoable(key, {
  describe, doing, hint,
  params: { type: 'object', properties: { [param]: { type: 'string', enum: Object.keys(CHOICES[key].options) } }, required: [param] },
  async run(p, ctx) { await press(ctx, `${key}-${p[param]}`); },
  verify: (s, p) => s[key] === p[param] || `${CHOICES[key].label} did not change.`,
});

const app = {
  id: 'look',
  name: 'Your look',

  async mount(r, host) {
    root = r; os = host; kv = host.kv;
    const head = root.ownerDocument.head;
    if (head && !head.querySelector('link[data-look]')) {
      head.append(el('link', { rel: 'stylesheet', href: new URL('look.css', import.meta.url).href, dataset: { look: '' } }));
    }
    const rows = [];
    for (const [key, s] of Object.entries(STEPS)) {
      for (const dir of ['more', 'less']) { btn[`${key}-${dir}`] = el('button', { type: 'button', id: `look-${key}-${dir}` }); on(btn[`${key}-${dir}`], () => step(key, dir)); }
      rows.push(el('div', { className: 'look-row', role: 'group', 'aria-label': s.label }, btn[`${key}-more`], btn[`${key}-less`]));
    }
    for (const [key, c] of Object.entries(CHOICES)) {
      const h = el('h3', { id: `look-${key}-h`, textContent: c.label });
      const opts = Object.entries(c.options).map(([v, words]) => {
        const b = btn[`${key}-${v}`] = el('button', { type: 'button', id: `look-${key}-${v}`, textContent: words });
        on(b, () => choose(key, v));
        return b;
      });
      rows.push(el('div', { className: 'look-row', role: 'group', 'aria-labelledby': h.id }, h, ...opts));
    }
    btn.learning = el('button', { type: 'button', id: 'look-learning' });
    on(btn.learning, () => { const from = look.learning; look.learning = !from;
      return save({ row: 'learning', from, to: look.learning }, look.learning ? 'Learning again. I will notice what you do most.' : 'Learning stopped. I will not remember anything new.'); });
    btn.tell = el('button', { type: 'button', id: 'look-tell', textContent: 'What do you know about me?' });
    on(btn.tell, tell);
    btn.forget = el('button', { type: 'button', id: 'look-forget', textContent: 'Forget that' });
    on(btn.forget, forget);
    btn.known = el('ol', { id: 'look-known', 'aria-label': 'What Murmur knows' });
    // Reading order: the visual rows, then memory.
    rows.push(el('div', { className: 'look-row', role: 'group', 'aria-label': 'Memory' }, btn.learning, btn.tell, btn.known, btn.forget));
    root.append(el('h2', { id: 'look-h', textContent: 'Your look' }), ...rows);
    look = { ...DEFAULTS, ...((await kv.get('look')) || {}) };
    const { librarian } = await lib();
    if (librarian) {
      try { // a fresh profile reads as light; seed it from ours (dark by default) instead, as public/app.js does
        if (!(await librarian.getProfile())?.fields?.needs?.length) await writeLook(librarian, look);
        Object.assign(look, await readLook(librarian));
      } catch { /* keep the kv copy */ }
    }
    apply();
    render();
  },

  read() {
    const parts = [`Text ${STEPS.size.words(look.size)}`, `colours ${CHOICES.theme.options[look.theme].toLowerCase()}`,
      `voice ${STEPS.rate.words(look.rate)}`, `${CHOICES.speaker.options[look.speaker].toLowerCase()} speaks`,
      `how much: ${CHOICES.agency.options[look.agency].toLowerCase()}`, look.learning ? 'learning on' : 'learning stopped'];
    return `Your look. ${parts.join(', ')}.`;
  },
  place() {
    return { where: 'Your look', item: lastChange ? (STEPS[lastChange.row] || CHOICES[lastChange.row])?.label || 'Memory' : 'Text', next: 'text bigger' };
  },
  state() {
    return { ...look, known: known && known.map((k) => k.words), lastChange: lastChange && { ...lastChange } };
  },
  async seed() {
    if (!(await kv.get('look'))) await kv.set('look', look);
    apply(); render();
  },
  async reset() {
    look = { ...DEFAULTS }; known = null; lastChange = null;
    await kv.set('look', undefined);
    const { librarian } = await lib();
    if (librarian) { try { await writeLook(librarian, look); await librarian.setMemoryPaused(false); } catch { /* kv reset still holds */ } }
    await this.seed();
  },

  actions: {
    textBigger: stepper('size', 'more'),
    textSmaller: stepper('size', 'less'),
    setText: undoable('size', {
      describe: 'Set the text size in percent',
      doing: 'Changing the text size',
      hint: 'Text: bigger and Text: smaller are the first row in Your look.',
      params: { type: 'object', properties: { percent: { type: 'integer', enum: STEPS.size.values } }, required: ['percent'] },
      async run(p, ctx) {
        const v = STEPS.size.values;
        while (look.size !== p.percent) await press(ctx, v.indexOf(look.size) < v.indexOf(p.percent) ? 'size-more' : 'size-less');
      },
      verify: (s, p) => s.size === p.percent || 'The text size did not change.',
    }),
    voiceFaster: stepper('rate', 'more'),
    voiceSlower: stepper('rate', 'less'),
    colours: chooser('theme', 'colours', 'Change the colours: dark, light, or yellow on black', 'Changing the colours', 'Colours is the third row in Your look.'),
    whoSpeaks: chooser('speaker', 'who', 'Choose who speaks: Murmur, or my screen reader', 'Choosing who speaks', 'Who speaks is after Colours in Your look.'),
    howMuch: chooser('agency', 'mode', 'Choose how much Murmur does: ask me, just do it, or teach me', 'Changing how much I do', 'How much Murmur does is after Who speaks.'),
    learning: undoable('learning', {
      describe: 'Stop learning, or start learning again',
      doing: 'Changing learning',
      hint: 'Stop learning is the first button under Memory, near the end of Your look.',
      params: { type: 'object', properties: { on: { type: 'boolean', description: 'false to stop learning' } }, required: ['on'] },
      async run(p, ctx) { if (look.learning !== p.on) await press(ctx, 'learning'); },
      verify: (s, p) => s.learning === p.on || 'Learning did not change.',
    }),
    whatYouKnow: {
      describe: 'Say what Murmur knows about me',
      doing: 'Reading what I know',
      hint: 'What do you know about me is under Memory, near the end of Your look.',
      params: { type: 'object', properties: {} },
      async run(p, ctx) { await press(ctx, 'tell'); },
      verify: (s) => Array.isArray(s.known) || 'I could not read my memory.',
    },
    forget: {
      describe: 'Forget the first thing Murmur knows about me',
      doing: 'Forgetting that',
      gate: 'delete',
      hint: 'Forget that is the last button in Your look.',
      params: { type: 'object', properties: {} },
      readback: (s) => (s.known?.length ? `Forget this: ${s.known[0]}` : 'Forget the last thing I learned about you?'),
      async run(p, ctx) { await press(ctx, 'forget'); },
      verify: (s) => (s.lastChange?.row === 'forget' && !!s.lastChange.item) || 'There was nothing to forget.',
    },
  },
};
export default app;
