// The bus: every layer talks through these events, and only these (os/contract.md §Bus).
// Payloads are plain JSON so the Inside view can relay them; emit() adds `t` (ms since epoch).
export const EVENTS = ['heard', 'task:start', 'step:start', 'tap', 'step:verified', 'step:failed',
  'confirm', 'ask', 'say', 'place', 'memory', 'undo', 'task:done'];

export function createBus({ keep = 500 } = {}) {
  const subs = new Map();
  const log = [];
  const known = (name) => { if (name !== '*' && !EVENTS.includes(name)) throw new Error(`bus: unknown event "${name}"`); };
  return {
    log, // the last `keep` events, oldest first: { name, ...payload, t }
    on(name, fn) {
      known(name);
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(fn);
      return () => subs.get(name).delete(fn);
    },
    emit(name, payload = {}) {
      known(name);
      if (name === '*') throw new Error('bus: cannot emit "*"');
      const ev = { ...payload, t: Date.now() };
      log.push({ name, ...ev });
      if (log.length > keep) log.shift();
      // A broken listener must never stop the runner.
      for (const fn of subs.get(name) || []) try { fn(ev); } catch (e) { console.error('bus listener', name, e); }
      for (const fn of subs.get('*') || []) try { fn(name, ev); } catch (e) { console.error('bus listener *', e); }
      return ev;
    },
  };
}
