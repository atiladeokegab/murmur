// The phone's side of the GUI-to-MCP adapter: a remote:run from the room bus runs one app action through the
// agent's runner, so the controls are pressed on screen and every gate (send, pay, call, delete) still asks here:
// the readback, the person's yes, and the fingerprint for pay. No answer in time is a No. Fail closed.
import { validatePlan, describeRegistry } from '../agent/plan.js';

export const ANSWER_MS = 45000; // a gate's yes (and a fingerprint) must come within this; the MCP side waits a little longer

export function createRemoteRun({ agent, registry, answerMs = ANSWER_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  return async function run({ id, tool, params }) {
    const { steps, dropped } = validatePlan([{ tool, params }], describeRegistry(registry));
    const step = steps[0];
    if (!step?.app) return { id, ok: false, status: 'rejected', reason: dropped[0]?.reason || 'unknown tool' };
    let timedOut = false;
    const timer = step.gate ? setTimer(() => { timedOut = true; agent.no(); }, answerMs) : null; // silence is a No
    let r;
    // the utterance must never contain the word send: a spoken "send ..." counts as the yes for a send gate (runner setSaid)
    try { r = await agent.runner.run({ utterance: `MCP: ${tool}`, steps: [step] }); }
    finally { if (timer) clearTimer(timer); }
    const status = r.status === 'done' ? 'verified' : timedOut ? 'timed out' : r.status === 'cancelled' ? 'declined' : r.status;
    let read = '';
    try { read = registry.get(step.app)?.read?.() || ''; } catch { /* no reading */ }
    return { id, ok: status === 'verified', status, gate: step.gate, line: r.line || '', read: String(read).slice(0, 600) };
  };
}
