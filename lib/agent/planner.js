// The planner, server side: Gemini with the registry as its tools when GEMINI_API_KEY is set, else the demo
// provider. Either way the plan is validated against the same schemas before it leaves. Content is never logged.
import { toolsFor, validatePlan, BUILTINS } from '../../public/agent/plan.js';
import { demoPlan } from '../../public/agent/demo-plan.js';
import { PERSONA, MODEL } from '../gemini.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

const RULES = `Turn what the person said into tool calls, in order. Use only the tools given.
Fix dictation words, never meaning. Put message text exactly as the person wants it sent.
Never plan banking, health or government tasks: call say with a one-line refusal.
For "how do I ..." questions plan the steps as if doing them; the phone will explain rather than run them.
If you need to know something first, call ask. If the request fits no tool, call say with one short sentence.`;

/** Accept only the serialisable registry shape the browser sends; anything else is dropped. */
export function cleanApps(apps) {
  if (!Array.isArray(apps)) return [];
  const id = (s) => typeof s === 'string' && /^[a-z][a-z0-9_-]{0,31}$/i.test(s);
  return apps.slice(0, 20).filter((a) => id(a?.id)).map((a) => ({
    id: a.id, name: String(a.name || a.id).slice(0, 40),
    actions: (Array.isArray(a.actions) ? a.actions : []).slice(0, 20).filter((x) => id(x?.name)).map((x) => ({
      name: x.name, describe: String(x.describe || x.name).slice(0, 120),
      params: x.params && typeof x.params === 'object' ? x.params : { type: 'object', properties: {} },
      gate: ['send', 'pay', 'call', 'delete'].includes(x.gate) ? x.gate : null, hint: String(x.hint || '').slice(0, 200),
    })),
  }));
}

async function gemini(key, utterance, apps, context) {
  const res = await fetch(`${API}/${MODEL}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${PERSONA}\n${RULES}` }] },
      contents: [{ role: 'user', parts: [{ text: `Open app: ${String(context.app || 'the board').slice(0, 30)}.\nPerson said: """${utterance}"""` }] }],
      tools: [{ functionDeclarations: toolsFor(apps) }],
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
      generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const parts = (await res.json()).candidates?.[0]?.content?.parts || [];
  const plan = parts.filter((p) => p.functionCall).map((p) => ({ tool: p.functionCall.name, params: p.functionCall.args || {} }));
  if (!plan.length) throw new Error('no plan');
  const teach = /^\s*how (do|can|would|should) i\b/i.test(utterance);
  const only = plan.length === 1 && plan[0].tool === 'say';
  return only ? { kind: /bank|health|government/i.test(plan[0].params.text || '') ? 'refuse' : 'unknown', plan: [], say: String(plan[0].params.text || '').slice(0, 200) }
    : { kind: teach ? 'teach' : 'task', plan };
}

/**
 * @returns {{ kind, steps, dropped, say?, provider: 'gemini'|'demo' }}
 */
export async function plan({ key = '', utterance, apps, context = {} }) {
  const text = String(utterance || '').slice(0, 600);
  let out, provider = 'demo';
  if (key) {
    try { out = await gemini(key, text, apps, context); provider = 'gemini'; }
    catch (e) { console.warn(`[plan] gemini failed (${e.name}: ${String(e.message).slice(0, 40)}); demo plan`); }
  }
  out ||= demoPlan(text, apps, context);
  const { steps, dropped } = validatePlan(out.plan, apps, { dryRun: out.kind === 'teach' });
  const say = out.say || (!steps.length && dropped.find((d) => d.say)?.say) || undefined;
  return { kind: out.kind, steps, dropped, ...(say ? { say } : {}), provider };
}

export { BUILTINS };
