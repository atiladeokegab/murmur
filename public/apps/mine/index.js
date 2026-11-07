// Mine on the Murmur SDK (spec §3.3, §3.5): your workflows, each read in plain words; run, explain, delete.
// The store is the agent layer's (the toolkit skill registry): os.workflows { list(), remove(name), run(name) }.
// Without it (tests, before the agent lands) Mine keeps its seed in memory.
import * as Mi from './model.js';

let s = Mi.fresh();
let root = null, os = null;
const q = (sel) => root && root.querySelector(sel);
const describeOf = (st) => os?.registry?.get?.(st.app)?.actions?.[st.action]?.describe || '';
const gateOf = (st) => os?.registry?.get?.(st.app)?.actions?.[st.action]?.gate || null;

async function refresh() {
  if (os?.workflows?.list) {
    try { s.workflows = await os.workflows.list(); } catch { /* keep what we had; the list is re-read next time */ }
  }
  render();
}

const named = (p) => Mi.find(s, p.name);

const app = {
  id: 'mine',
  name: 'Mine',
  seed() { s = Mi.fresh(); render(); },
  reset() { s = Mi.fresh(); refresh(); },
  state: () => structuredClone(s),
  read: () => Mi.read(s),
  place: () => Mi.place(s),
  mount(el, osApi) { root = el; os = osApi; refresh(); },
  refresh,

  actions: {
    explain: {
      describe: "Reading what's in it",
      params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      gate: null,
      hint: 'Each saved workflow is a heading; What is in it is the first button under it',
      async run(p, ctx) {
        const w = named(p);
        if (!w) return { fail: `You have nothing saved as ${p.name}.` };
        await ctx.tap(q(`[data-explain="${w.name}"]`));
        return { say: Mi.explain(w, describeOf) };
      },
      verify: (st, p) => !!Mi.find(st, p.name) && st.explained === Mi.find(st, p.name).name,
    },
    run: {
      describe: 'Running it',
      params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      gate: null, // each step keeps its own gate when it runs
      hint: 'Run it is the second button under the workflow',
      async run(p, ctx) {
        const w = named(p);
        if (!w) return { fail: `You have nothing saved as ${p.name}.` };
        await ctx.tap(q(`[data-run="${w.name}"]`));
      },
      verify: (st, p) => !!Mi.find(st, p.name) && st.lastRun === Mi.find(st, p.name).name,
    },
    delete: {
      describe: 'Deleting it',
      params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      gate: 'delete',
      hint: 'Delete is the last button under the workflow; I ask first',
      readback: (st, p = {}) => { const w = Mi.find(st, p.name); return w ? `Delete ${w.name}? ${Mi.explain(w)}` : `Delete ${p.name}?`; },
      async run(p, ctx) {
        const w = named(p);
        if (!w) return { fail: `You have nothing saved as ${p.name}.` };
        await ctx.tap(q(`[data-delete="${w.name}"]`));
        await removing;
      },
      verify: (st, p) => !!String(p.name || '').trim() && !Mi.find(st, p.name),
    },
  },
};
export default app;

// ---------- the screen ----------
let removing = Promise.resolve();
function h(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const button = (text, props = {}) => h('button', { type: 'button', className: 'app-btn', ...props }, text);

function render() {
  if (!root || typeof document === 'undefined') return;
  root.replaceChildren(h('section', { className: 'app', ariaLabel: 'Mine' },
    h('h2', { className: 'app-h' }, 'Mine'),
    h('p', { className: 'app-place' }, Mi.read(s)),
    s.workflows.map((w) => h('section', { className: 'app-card', ariaLabel: w.name },
      h('h3', { className: 'app-h3' }, w.name),
      h('ol', { className: 'app-sentences', ariaLabel: `${w.name}, step by step` },
        w.steps.map((st, i) => h('li', { tabIndex: 0 }, h('span', { className: 'sr' }, `Step ${i + 1} of ${w.steps.length}: `), Mi.stepWords(st, describeOf(st))))),
      button(`What's in ${w.name}`, { dataset: { explain: w.name }, onclick: () => { s.selected = s.explained = w.name; os?.say?.(Mi.explain(w, describeOf)); } }),
      button(`Run ${w.name}`, { dataset: { run: w.name }, className: 'app-btn primary', onclick: () => {
        s.selected = s.lastRun = w.name;
        os?.workflows?.run?.(w.name);
      } }),
      button(`Delete ${w.name}`, { dataset: { delete: w.name }, onclick: () => { removing = onDelete(w); } }),
    )),
  ));
}

async function onDelete(w) {
  if (os?.confirm && !(await os.confirm({ gate: 'delete', readback: app.actions.delete.readback(s, { name: w.name }) }))) return;
  if (os?.workflows?.remove) { try { await os.workflows.remove(w.name); } catch { return; } }
  Mi.remove(s, w.name);
  render();
}
