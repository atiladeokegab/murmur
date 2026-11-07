// The Inside view's model: bus events in, five columns and the day's tally out. Pure, so node tests it.
// Event names are spec §8.1's; os/contract.md on main is the source of truth if they differ.

export const COLUMNS = ['Heard', 'Plan', 'Actions', 'Asked', 'Memory'];

export function createTally() {
  const t = { tasks: 0, verified: 0, failed: 0, asked: 0, bypassed: 0, modelCalls: 0 };
  const cols = Object.fromEntries(COLUMNS.map((c) => [c, []]));
  let step = null;          // the step:start in flight
  let confirmed = new Set(); // gates confirmed yes in this task

  function add(e) {
    if (!e || typeof e.type !== 'string') return;
    switch (e.type) {
      case 'task:start':
        t.tasks++; confirmed = new Set(); step = null;
        cols.Heard.push({ text: e.utterance ?? '', clean: e.heard ?? null, path: e.path ?? null, ms: e.ms ?? null });
        cols.Plan.push({ plan: Array.isArray(e.plan) ? e.plan : e.plan?.steps ?? [], dropped: e.dropped ?? e.plan?.dropped ?? [], provider: e.provider ?? e.plan?.provider ?? null });
        if ((e.provider ?? e.plan?.provider) === 'gemini') t.modelCalls++;
        break;
      case 'model': case 'model:call': t.modelCalls++; break;
      case 'step:start':
        step = { action: e.action, params: e.params, gate: e.gate ?? null, control: e.control ?? null, result: 'running', ms: null };
        cols.Actions.push(step);
        break;
      case 'step:verified':
        if (step) { step.result = 'verified'; step.ms = e.ms ?? null; }
        t.verified++;
        // A gated step that verified without a yes for its gate in this task is a bypass. Must stay 0.
        if (step?.gate && !confirmed.has(step.gate)) t.bypassed++;
        step = null;
        break;
      case 'step:failed':
        if (step) { step.result = 'failed'; step.reason = e.reason ?? ''; }
        t.failed++; step = null;
        break;
      case 'confirm':
        t.asked++;
        if (isYes(e.result)) confirmed.add(e.gate);
        cols.Asked.push({ gate: e.gate, readback: e.readback ?? '', result: e.result ?? null, fingerprint: e.fingerprint ?? null });
        break;
      case 'memory':
        cols.Memory.push(e.observation ? { kind: 'observation', fields: e.observation }
          : e.proposal ? { kind: 'proposal', fields: e.proposal } : { kind: 'workflow', fields: e.workflow ?? {} });
        break;
      case 'task:done': step = null; break;
      default: break;
    }
  }
  return { add, tally: () => ({ ...t }), columns: () => cols };
}

const isYes = (r) => r === true || r === 'yes' || r === 'ok' || r?.ok === true;
