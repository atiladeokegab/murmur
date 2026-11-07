// The Inside view's model: bus events in, five columns and the day's tally out. Pure, so node tests it.
// Event shapes are os/contract.md §6. Relayed events arrive as { type: name, ...payload }.

export const COLUMNS = ['Heard', 'Plan', 'Actions', 'Asked', 'Memory'];

export function createTally() {
  const t = { tasks: 0, verified: 0, failed: 0, asked: 0, bypassed: 0, modelCalls: 0 };
  const cols = Object.fromEntries(COLUMNS.map((c) => [c, []]));
  let step = null;     // the Actions row of the step:start in flight
  let heard = false;   // a `heard` came since the last task:start
  const last = (c) => cols[c][cols[c].length - 1];

  function add(e) {
    if (!e || typeof e.type !== 'string') return;
    switch (e.type) {
      case 'heard':
        heard = true;
        cols.Heard.push({ text: e.text ?? '', raw: e.raw ?? null, path: e.path ?? null, ms: e.ms ?? null });
        break;
      case 'task:start':
        t.tasks++; step = null;
        if (!heard) cols.Heard.push({ text: e.utterance ?? '', raw: null, path: null, ms: null });
        heard = false;
        cols.Plan.push({ plan: Array.isArray(e.plan) ? e.plan : [], dropped: [], provider: e.provider ?? null });
        if (e.provider === 'gemini') t.modelCalls++; // the contract has no model-call event; only an optional provider tag
        break;
      case 'step:start':
        step = { action: e.action, app: e.app ?? null, label: e.label ?? '', params: e.params ?? {}, gate: e.gate ?? null,
          n: e.n ?? null, of: e.of ?? null, control: null, result: 'running', ms: null, reason: null, yes: false };
        cols.Actions.push(step);
        if (e.dropped?.length) {
          if (!last('Plan')) cols.Plan.push({ plan: [], dropped: [], provider: null });
          last('Plan').dropped.push(...e.dropped.map((k) => `${e.action}.${k}`));
        }
        break;
      case 'tap':
        if (step) step.control = step.control ? `${step.control}, ${e.control}` : e.control;
        break;
      case 'confirm':
        t.asked++;
        // Only a yes for this step's own gate, after its step:start, lets a gated step through.
        if (step && step.gate && e.gate === step.gate && e.result === true) step.yes = true;
        cols.Asked.push({ app: e.app ?? null, gate: e.gate ?? null, readback: e.readback ?? '', result: e.result ?? null });
        break;
      case 'step:verified':
        t.verified++;
        if (step) {
          step.result = 'verified'; step.ms = e.ms ?? null;
          if (step.gate && !step.yes) t.bypassed++; // must stay 0
        }
        step = null;
        break;
      case 'step:failed':
        t.failed++;
        if (step) { step.result = 'failed'; step.ms = e.ms ?? null; step.reason = e.reason ?? ''; }
        step = null;
        break;
      case 'memory': {
        const kind = ['observation', 'proposal', 'workflow'].find((k) => e[k] != null) ?? 'observation';
        cols.Memory.push({ kind, fields: e[kind] ?? {} });
        break;
      }
      case 'task:done': step = null; break;
      default: break;
    }
  }
  return { add, tally: () => ({ ...t }), columns: () => cols };
}
