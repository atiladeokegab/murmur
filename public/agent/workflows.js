// Workflows (spec §3.5): a recorded plan saved as a toolkit Skill (saveSkill), so the skill registry is the store.
// Save, run, explain, edit, and slots: "save that as message someone" makes the recipient a slot asked at run.

const SLOT = '$who';
const WHO = ['name', 'contact', 'who', 'person', 'to', 'recipient'];
const PEOPLE_ACTIONS = /^(openchat|open|call|invite)$/i;
const CHAIN_GAP_MS = 5 * 60000;

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const key = (s) => String(s || '').trim().toLowerCase().replace(/^my\s+/, '');

/** The steps "that" means: the last run of tasks in the same app, a few minutes apart, since the last save. */
export function lastChain(history, since = 0) {
  const tasks = history.filter((t) => (t.at ?? Infinity) >= since && t.steps.some((s) => s.app));
  if (!tasks.length) return [];
  const last = tasks.at(-1), app = last.steps.find((s) => s.app).app;
  const chain = [last];
  for (let i = tasks.length - 2; i >= 0; i--) {
    const t = tasks[i];
    if (!t.steps.some((s) => s.app === app) || (chain[0].at ?? 0) - (t.at ?? 0) > CHAIN_GAP_MS) break;
    chain.unshift(t);
  }
  return chain.flatMap((t) => t.steps.filter((s) => s.app));
}

export function createWorkflows({ librarian, describe = (s) => s.tool }) {
  async function all() {
    return ((await librarian.listSkills?.()) || []).filter((s) => s.murmur && s.source !== 'builtin');
  }
  async function find(name) {
    const k = key(name);
    return (await all()).find((w) => key(w.name) === k) || null;
  }
  const explainSteps = (steps) => {
    const words = steps.map((s, i) => (i ? lowerFirst(describe(s)) : describe(s)));
    return words.length > 1 ? `${words.slice(0, -1).join(', then ')}, then ${words.at(-1)}.` : `${words[0] || 'Nothing'}.`;
  };
  async function store(name, steps) {
    const text = explainSteps(steps);
    const res = await librarian.saveSkill({
      name, description: `Murmur tile: ${text}`, supportAreas: ['vision'], siteRelevance: ['all'], murmur: true, body: text,
      recipe: { adapters: [], actions: steps.map((s) => ({ name: s.tool, prompt: describe(s), tool: s.tool, app: s.app, action: s.action, params: s.params, gate: s.gate || null })) },
    });
    return res.saved ? { name, steps, text } : null;
  }
  const stepsOf = (w) => (w?.recipe?.actions || []).map(({ tool, app, action, params, gate }) => ({ tool, app, action, params: { ...params }, gate }));

  return {
    all,
    find,
    /** Mine's Delete (behind its delete gate): true when there was one to remove. */
    async remove(name) { const w = await find(name); if (!w) return false; await librarian.deleteSkill(w.name); return true; },
    explainSteps,
    /** Save steps under a name. With slot, the first person in it becomes "Who?" at run time. */
    async save(name, steps, { slot = false } = {}) {
      if (!steps.length) return null;
      const out = steps.map((s) => ({ ...s, params: { ...s.params } }));
      if (slot) {
        const s = out.find((x) => PEOPLE_ACTIONS.test(x.action) && Object.keys(x.params).some((k) => WHO.includes(k.toLowerCase())));
        if (s) { const k = Object.keys(s.params).find((p) => WHO.includes(p.toLowerCase())); s.params[k] = SLOT; }
      }
      // A slot workflow is a template: it never carries the old send. A saved send still asks at every run.
      return store(name, out);
    },
    /** The steps to run, with any slot filled by ask(question) -> answer. Null when there is no such tile. */
    async plan(name, ask = async () => '') {
      const w = await find(name);
      if (!w) return null;
      const steps = stepsOf(w);
      for (const s of steps) for (const [k, v] of Object.entries(s.params)) {
        if (v === SLOT) { const who = String(await ask('Who?') || '').trim(); if (!who) return null; s.params[k] = who.replace(/^./, (c) => c.toUpperCase()).replace(/[.!?]+$/, ''); }
      }
      return { name: w.name, steps };
    },
    async explain(name) {
      const w = await find(name);
      return w ? `${w.name}: ${explainSteps(stepsOf(w))}` : `There's no tile called ${name}.`;
    },
    /** "Change my morning: drop the weather" removes the first step that mentions the word. */
    async edit(name, drop) {
      const w = await find(name);
      if (!w) return `There's no tile called ${name}.`;
      const d = key(drop).replace(/^the\s+/, '');
      const steps = stepsOf(w);
      const i = steps.findIndex((s) => `${s.tool} ${describe(s)} ${JSON.stringify(s.params)}`.toLowerCase().includes(d));
      if (i < 0) return `${w.name} has no ${drop} step.`;
      steps.splice(i, 1);
      if (!steps.length) { await librarian.deleteSkill?.(w.name); return `${w.name} is empty now, so I removed it.`; }
      const saved = await store(w.name, steps);
      return `${w.name}: ${saved.text}`;
    },
  };
}
