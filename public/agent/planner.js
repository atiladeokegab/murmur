// The planner, browser side: POST /api/plan (Gemini when the server has a key, else the server's demo
// provider), and the same demo provider right here when the server cannot be reached or is slow. Whatever comes
// back is validated again against the live registry: the runner trusts only its own check.
import { validatePlan } from './plan.js';
import { demoPlan } from './demo-plan.js';

/** Demo first: words the demo planner knows run at once, with no network. Only the rest wait for the model, this long. */
export const BUDGET_MS = 2500;
export const MISSED = "I didn't catch how to do that.";

export async function planUtterance(utterance, apps, context = {}, { fetch = globalThis.fetch, offline = false, budget = BUDGET_MS } = {}) {
  const p = demoPlan(utterance, apps, context);
  const v = validatePlan(p.plan, apps, { dryRun: p.kind === 'teach' });
  const local = { kind: p.kind, ...v, say: p.say || (!v.steps.length && v.dropped.find((d) => d.say)?.say) || undefined, provider: 'demo' };
  // A refusal never goes out either: the demo planner's answer is the answer.
  if (offline || typeof fetch !== 'function' || local.steps.length || local.kind === 'refuse') return local;
  const remote = (async () => {
    try {
      const r = await fetch('/api/plan', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ utterance, apps, context }),
        signal: AbortSignal.timeout(budget),
      });
      if (!r.ok) return null;
      const j = await r.json();
      const w = validatePlan(j.steps, apps, { dryRun: j.kind === 'teach' });
      return { kind: j.kind, steps: w.steps, dropped: [...(j.dropped || []), ...w.dropped], say: j.say, provider: j.provider, model: j.model };
    } catch { return null; } // offline: the demo plan
  })();
  const r = await remote;
  if (r && (r.steps.length || r.say)) return r;
  return { ...local, say: local.kind === 'refuse' ? local.say : MISSED };
}
