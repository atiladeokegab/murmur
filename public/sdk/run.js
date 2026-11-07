// One step, the only way an app action runs: validate, announce, gate, run, verify. The agent's runner
// (public/agent/) owns plans, tasks, undo and memory; it calls this for every app action so gates and
// verify cannot be skipped.
import { validate } from './registry.js';

const NOT = { send: 'Not sent.', pay: 'Not paid.', call: 'Not called.', delete: 'Kept it.' };
const now = () => (globalThis.performance ? performance.now() : Date.now());

/**
 * @returns {Promise<{ok: boolean, reason?: string, cancelled?: boolean, stopped?: boolean, params?: object}>}
 */
export async function runAction({ registry, name, params, bus, ctxFor, n = 1, of = 1 }) {
  const r = registry.resolve(name);
  if (!r || r.builtin) {
    const reason = r ? `${name} is the agent's, not an app's.` : "I can't do that here.";
    bus.emit('step:failed', { action: name, reason, n, of });
    return { ok: false, reason };
  }
  const v = validate(r.schema, params);
  const base = { action: name, app: r.app.id, n, of };
  if (!v.ok) {
    const reason = `${r.app.name} needs ${v.errors.join('; ')}.`;
    bus.emit('step:failed', { ...base, reason });
    return { ok: false, reason };
  }
  const gate = r.action.gate ?? null;
  const t0 = now();
  bus.emit('step:start', { ...base, label: r.action.doing, params: v.params, gate, dropped: v.dropped });
  const ctx = ctxFor(r.app);
  let reason, stopped = false;
  try {
    if (gate) {
      const readback = r.action.readback ? r.action.readback(r.app.state(), v.params) : r.app.read();
      if (!(await ctx.confirm(gate, readback))) {
        bus.emit('step:failed', { ...base, reason: NOT[gate], cancelled: true });
        return { ok: false, reason: NOT[gate], cancelled: true };
      }
    }
    await r.action.run(v.params, ctx);
    const res = await r.action.verify(r.app.state(), v.params);
    if (res === true) {
      bus.emit('step:verified', { ...base, ms: Math.round(now() - t0) });
      bus.emit('place', { app: r.app.id, ...r.app.place() });
      return { ok: true, params: v.params };
    }
    reason = typeof res === 'string' ? res : `${r.app.name}: that didn't work.`;
  } catch (e) {
    stopped = e.name === 'AbortError';
    reason = stopped ? 'Stopped.' : e.message;
  }
  bus.emit('step:failed', { ...base, reason, stopped });
  return { ok: false, reason, stopped };
}
