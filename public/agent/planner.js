// The planner, browser side: POST /api/plan (Gemini when the server has a key, else the server's demo
// provider), and the same demo provider right here when the server cannot be reached or is slow. Whatever comes
// back is validated again against the live registry: the runner trusts only its own check.
import { validatePlan } from './plan.js';
import { demoPlan } from './demo-plan.js';

/** Past this, a demo plan that knows the words takes over; the task says so (provider 'demo', late 'gemini'). */
export const BUDGET_MS = 1200;

export async function planUtterance(utterance, apps, context = {}, { fetch = globalThis.fetch, offline = false, budget = BUDGET_MS } = {}) {
  const p = demoPlan(utterance, apps, context);
  const v = validatePlan(p.plan, apps, { dryRun: p.kind === 'teach' });
  const local = { kind: p.kind, ...v, say: p.say || (!v.steps.length && v.dropped.find((d) => d.say)?.say) || undefined, provider: 'demo' };
  if (offline || typeof fetch !== 'function') return local;
  const remote = (async () => {
    try {
      const r = await fetch('/api/plan', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ utterance, apps, context }),
        signal: AbortSignal.timeout(20000), // the server tries up to three models, 6 s each
      });
      if (!r.ok) return null;
      const j = await r.json();
      const w = validatePlan(j.steps, apps, { dryRun: j.kind === 'teach' });
      return { kind: j.kind, steps: w.steps, dropped: [...(j.dropped || []), ...w.dropped], say: j.say, provider: j.provider, model: j.model };
    } catch { return null; } // offline: the demo plan
  })();
  // The demo plan can't place these words: only the model can, so wait for it.
  if (!local.steps.length) return (await remote) || local;
  let timer;
  const late = new Promise((res) => { timer = setTimeout(() => res('late'), budget); });
  const r = await Promise.race([remote, late]);
  clearTimeout(timer);
  if (r && r !== 'late') return r;
  return r === 'late' ? { ...local, late: 'gemini' } : local;
}
