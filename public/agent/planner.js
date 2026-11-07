// The planner, browser side: POST /api/plan (Gemini when the server has a key, else the server's demo
// provider), and the same demo provider right here when the server cannot be reached. Whatever comes back is
// validated again against the live registry: the runner trusts only its own check.
import { validatePlan } from './plan.js';
import { demoPlan } from './demo-plan.js';

export async function planUtterance(utterance, apps, context = {}, { fetch = globalThis.fetch, offline = false } = {}) {
  if (!offline && typeof fetch === 'function') {
    try {
      const r = await fetch('/api/plan', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ utterance, apps, context }),
        signal: AbortSignal.timeout(20000), // the server tries up to three models, 6 s each
      });
      if (r.ok) {
        const j = await r.json();
        const v = validatePlan(j.steps, apps, { dryRun: j.kind === 'teach' });
        return { kind: j.kind, steps: v.steps, dropped: [...(j.dropped || []), ...v.dropped], say: j.say, provider: j.provider, model: j.model };
      }
    } catch { /* offline: the demo provider below */ }
  }
  const p = demoPlan(utterance, apps, context);
  const v = validatePlan(p.plan, apps, { dryRun: p.kind === 'teach' });
  return { kind: p.kind, ...v, say: p.say || (!v.steps.length && v.dropped.find((d) => d.say)?.say) || undefined, provider: 'demo' };
}
