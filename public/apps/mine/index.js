// Mine on the Murmur SDK (os/contract.md; spec §3.5): your workflows, each read in plain words; run, explain, delete.
// The store is the agent's (public/agent/workflows.js, saved as toolkit skills). The shell hands it over as
// os.workflows { all(), remove(name) } and os.agent.runWorkflow(name) (os.hear(text) as a fallback). Without them (tests, before wiring) Mine keeps its seed.
import * as Mi from './model.js';

let s = Mi.fresh();
let root = null, os = null, body = null;
const q = (sel) => root && root.querySelector(sel);
const named = (p) => Mi.find(s, p.name);
// A saved skill's recipe.actions are { tool, app, action, params, gate }; Mine only needs app, action, params.
const fromSkill = (w) => ({ name: w.name, steps: (w.recipe?.actions || w.steps || []).map(({ app, action, params, gate }) => ({ app, action, params: params || {}, gate: gate || null })) });

async function refresh() {
  if (os?.workflows?.all) {
    try { s.workflows = (await os.workflows.all()).map(fromSkill); } catch { /* keep the last list; it is re-read on the next open */ }
  }
  render();
}

const app = {
  id: 'mine',
  name: 'Mine',
  async mount(r, o) {
    root = r; os = o;
    root.append(el('h2', { id: 'mine-h' }, 'Mine'), body = el('div', { className: 'app-body' }));
    // The bus only nudges a re-read of the store after a save; what Mine shows still comes from the store.
    // A proposal (contract memory event) is only shown here; the agent's sheet answers it.
    os.bus?.on?.('memory', (e) => {
      if (e.proposal) { s.proposals.push({ text: typeof e.proposal === 'string' ? e.proposal : e.proposal.text || e.proposal.question || '' }); render(); }
      if (e.workflow) refresh();
    });
    await refresh();
  },
  async seed() { if (!os?.workflows) s.workflows = s.workflows.length ? s.workflows : Mi.SEED(); await refresh(); },
  async reset() { s = Mi.fresh(os?.workflows ? [] : Mi.SEED()); await refresh(); },
  state: () => structuredClone(s),
  read: () => Mi.read(s),
  place: () => Mi.place(s),
  refresh,

  actions: {
    explain: {
      describe: 'Read the steps of a saved workflow in plain words',
      say: '',   // offline, "what's in" plans the agent's own explain, not Mine's
      doing: "Reading what's in it",
      params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      gate: null,
      hint: "Each saved workflow is a heading; What's in it is the first button after its steps",
      async run(p, ctx) {
        await refresh();
        const w = named(p);
        if (!w) throw new Error(`You have nothing saved as ${p.name}.`);
        await ctx.tap(q(`[data-explain="${w.name}"]`));
        await ctx.say(Mi.explain(w));
      },
      verify: (st, p) => (!!Mi.find(st, p.name) && st.explained === Mi.find(st, p.name).name) || `Nothing saved as ${p.name}.`,
      done: () => '', // it just said the steps
    },
    delete: {
      describe: 'Delete a saved workflow and its tile',
      say: '',
      doing: 'Deleting it',
      params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      gate: 'delete',
      hint: 'Delete is the last button after the steps; I ask first',
      readback: (st, p = {}) => `Delete '${Mi.find(st, p.name)?.name || p.name}'?`,
      async run(p, ctx) {
        await refresh();
        const w = named(p);
        if (!w) throw new Error(`You have nothing saved as ${p.name}.`);
        await ctx.tap(q(`[data-delete="${w.name}"]`));
        await removing;
      },
      verify: (st, p) => (!!String(p.name || '').trim() && !Mi.find(st, p.name)) || 'It is still there.',
    },
  },
};
export default app;

// ---------- the screen ----------
let removing = Promise.resolve();
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

function render() {
  if (!body) return;
  body.replaceChildren(...[
    el('p', { className: 'app-place' }, Mi.read(s)),
    s.proposals.length ? el('h3', { className: 'app-h3' }, 'Offered to you') : null,
    s.proposals.length ? el('ul', { className: 'app-list', 'aria-label': 'Offered to you' }, s.proposals.map((x) => el('li', {}, x.text))) : null,
    ...s.workflows.map((w) => el('div', { className: 'app-card' },
      el('h3', { className: 'app-h3' }, w.name),
      el('ol', { className: 'app-sentences', 'aria-label': `${w.name}, step by step` },
        w.steps.map((st, i) => el('li', { tabIndex: 0 }, el('span', { className: 'sr' }, `Step ${i + 1} of ${w.steps.length}: `), Mi.stepWords(st)))),
      button(`What's in ${w.name}`, { 'data-explain': w.name, onclick: (e) => {
        s.selected = s.explained = w.name; render();
        if (e.isTrusted) os.say?.(Mi.explain(w));
      } }),
      button(`Run ${w.name}`, { 'data-run': w.name, className: 'app-btn primary', onclick: (e) => {
        s.selected = s.lastRun = w.name; render();
        // A person's tap hands it to the agent as its own task, gates included; the agent's own tap must not nest one.
        if (e.isTrusted) (os?.agent?.runWorkflow ? os.agent.runWorkflow(w.name) : os?.hear?.(`run ${w.name}`))?.catch?.(() => {});
      } }),
      button(`Delete ${w.name}`, { 'data-delete': w.name, onclick: () => { removing = remove(w); } }),
    )),
  ].filter(Boolean));
}

// Delete always asks, a person's own tap too; the shell's confirm says yes at once for the agent's press.
// No confirm on the mount, no delete.
async function remove(w) {
  if (!os?.confirm || !(await os.confirm({ gate: 'delete', readback: app.actions.delete.readback(s, { name: w.name }) }))) return;
  if (os?.workflows?.remove) {
    try { await os.workflows.remove(w.name); } catch { return; } // a store that failed keeps the tile
    return refresh(); // the store is the truth; remove() is false when it was already gone
  }
  Mi.remove(s, w.name);
  render();
}
