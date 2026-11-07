// The planner, server side: Gemini with the registry as its tools when GEMINI_API_KEY is set, else the demo
// provider. Either way the plan is validated against the same schemas before it leaves. Content is never logged.
import { toolsFor, validatePlan, BUILTINS } from '../../public/agent/plan.js';
import { demoPlan, refusal } from '../../public/agent/demo-plan.js';
import { PERSONA } from '../gemini.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
// Zeus 13:10: 3.8-flash is overloaded, 3.5-flash ignores schemas; flash-lite answers in ~1.4 s. Each gets 6 s.
// One model, one try: the phone waits 2.5 s at most (the lead's bar), so a second model would only burn quota.
export const MODELS = () => [process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'];
const TIMEOUT_MS = 2400;

const RULES = `Turn what the person said into steps, in order, each one of the tools below. Use only those tools.
Fix dictation words, never meaning. Pass names exactly as said (who: "Sam"); never choose an id the person did not say, the app asks if a name is ambiguous. Put message text exactly as the person wants it sent.
Never plan real banking (real bank names, sort codes, account or card numbers, PINs, logging in, savings, mortgages, loans, moving money between accounts), health or government tasks: call say with a one-line refusal. The phone's own Bank app holds invented money and is fine: use its tools for its balance, recent payments and paying a payee.
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

// JSON plans, not function calls: flash-lite timed out on tools (13:20, live key) but answers schemas fast.
function planSchema(tools) {
  return { type: 'OBJECT', properties: {
    steps: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      tool: { type: 'STRING', enum: tools.map((t) => t.name) },
      params: { type: 'STRING', description: 'The tool params as a JSON object, e.g. {"who":"Sam"}' },
    }, required: ['tool'] } },
    say: { type: 'STRING', description: 'Only when no tool fits or the request is refused: one short sentence' },
  }, required: ['steps'] };
}
const toolLines = (tools) => tools.map((t) => `- ${t.name}: ${t.description}. Params: ${JSON.stringify(Object.fromEntries(Object.entries(t.parameters?.properties || {}).map(([k, v]) => [k, v.enum ? v.enum.join('|') : v.type.toLowerCase()])))}${t.parameters?.required?.length ? ` (required: ${t.parameters.required.join(', ')})` : ''}`).join('\n');
const parseParams = (p) => { if (p && typeof p === 'object') return p; try { const o = JSON.parse(p || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };

async function gemini(key, model, utterance, apps, context) {
  const tools = toolsFor(apps);
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${PERSONA}\n${RULES}\nTools:\n${toolLines(tools)}` }] },
      contents: [{ role: 'user', parts: [{ text: `Open app: ${String(context.app || 'the board').slice(0, 30)}.\nPerson said: """${utterance}"""` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 500, responseMimeType: 'application/json', responseSchema: planSchema(tools) },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const parts = (await res.json()).candidates?.[0]?.content?.parts || [];
  let plan = parts.filter((p) => p.functionCall).map((p) => ({ tool: p.functionCall.name, params: p.functionCall.args || {} }));
  let said = '';
  if (!plan.length) {
    const j = JSON.parse(parts.map((p) => p.text || '').join('') || '{}');
    plan = (Array.isArray(j.steps) ? j.steps : []).map((x) => ({ tool: String(x.tool || ''), params: parseParams(x.params) }));
    said = typeof j.say === 'string' ? j.say : '';
  }
  if (!plan.length && !said) throw new Error('no plan');
  const teach = /^\s*how (do|can|would|should) i\b/i.test(utterance);
  const only = !plan.length || (plan.length === 1 && plan[0].tool === 'say');
  if (only) said ||= String(plan[0].params.text || '');
  return only ? { kind: /bank|money|health|government|medic/i.test(said) ? 'refuse' : 'unknown', plan: [], say: said.slice(0, 200) }
    : { kind: teach ? 'teach' : 'task', plan };
}

/**
 * @returns {{ kind, steps, dropped, say?, provider: 'gemini'|'demo', model?, tried? }}
 */
export async function plan({ key = '', utterance, apps, context = {} }) {
  const text = String(utterance || '').slice(0, 600);
  let out, provider = 'demo', model;
  const tried = [];
  const no = refusal(text, apps, context); // provider-independent: the model never sees a real-money request
  if (no) return { kind: no.kind, steps: [], dropped: [], say: no.say, provider: 'demo' };
  for (const m of key ? MODELS() : []) {
    tried.push(m);
    try { out = await gemini(key, m, text, apps, context); provider = 'gemini'; model = m; break; }
    catch (e) { console.warn(`[plan] ${m} failed (${e.name}: ${String(e.message).slice(0, 40)})`); }
  }
  out ||= demoPlan(text, apps, context);
  const { steps, dropped } = validatePlan(out.plan, apps, { dryRun: out.kind === 'teach' });
  const say = out.say || (!steps.length && dropped.find((d) => d.say)?.say) || undefined;
  return { kind: out.kind, steps, dropped, ...(say ? { say } : {}), provider, ...(model ? { model } : {}), ...(tried.length ? { tried } : {}) };
}

export { BUILTINS };
