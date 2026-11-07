// The runner (spec §3.2): one action at a time through ctx, then verify or stop. Gated actions never run
// without a `confirm` event on the bus whose result is yes. Everything it does is a bus event, so the work
// panel, the inside view, narration and memory all read the same story.

const CHANGES = (name) => !/^(read|open|show|list|next|whats|find|track|where|search|today)/i.test(name);
const DOUBLE = new Set(['stop', 'get', 'run', 'set', 'put', 'shop', 'plan', 'drop', 'swap']);

/** "Open a chat" -> "Opening a chat"; "Change a word" -> "Changing a word". */
export function gerund(describe) {
  const [verb, ...rest] = String(describe || '').split(' ');
  const v = verb.toLowerCase();
  let g = DOUBLE.has(v) ? v + v.at(-1) + 'ing' : /[^e]e$/.test(v) && v !== 'be' ? v.slice(0, -1) + 'ing' : v + 'ing';
  g = g.charAt(0).toUpperCase() + g.slice(1);
  return [g, ...rest].join(' ');
}

const PAST = { send: 'sent', pay: 'paid', call: 'called', delete: 'deleted' };
export const UNDO_MS = 8000;
export const BEAT_MS = 1500;

/**
 * @param {object} o
 * @param {(id:string)=>object} o.app       the live app by id (the SDK registry)
 * @param {{emit:Function}} o.bus
 * @param {(app)=>object} o.ctxFor          the SDK's ctx for an app: tap, type, say, confirm, kv
 * @param {object} o.gates                  createGates(...)
 * @param {(step)=>Promise<boolean>} [o.builtin]  Murmur's own tools (open_app, say, ...); true = done
 * @param {()=>'ask'|'just'|'teach'} [o.agency]
 */
export function createRunner({ app, bus, ctxFor, gates, builtin = async () => false, agency = () => 'ask',
  clock = { now: () => Date.now() }, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let current = null;   // { stopped, takenOver, nudge }
  let lastUndo = null;  // { app, action, params, until, label }
  let failed = null;    // { utterance, steps } from the failed step on
  const history = [];   // finished tasks: [{ utterance, steps }], newest last; workflows read this

  const label = (a, x, p) => (typeof x?.label === 'function' ? x.label(p) : gerund(x?.describe || a));

  async function beat(ms) {
    let done;
    const p = new Promise((r) => { done = r; });
    current.nudge = done;
    await Promise.race([p, sleep(ms)]);
    current.nudge = null;
  }

  async function teachStep(x, a, step) {
    bus.emit('say', { text: x.hint || gerund(x.describe) });
    const until = clock.now() + 60000;
    while (!current.stopped && clock.now() < until) {
      if (x.verify(a.state(), step.params)) return true;
      await sleep(300);
    }
    return false;
  }

  async function run({ utterance = '', steps = [] }) {
    if (current) { current.stopped = true; current.nudge?.(); }
    const task = current = { stopped: false, takenOver: false, nudge: null };
    const t0 = clock.now();
    const doneSteps = [];
    let status = 'done', lastApp = null, gatedRan = null, line = '';
    failed = null;
    bus.emit('task:start', { utterance, plan: steps.map(({ tool, params, gate }) => ({ tool, params, gate })) });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (task.stopped) { status = task.takenOver ? 'taken-over' : 'stopped'; break; }
      const s0 = clock.now();
      if (!step.app) { // Murmur's own tool
        bus.emit('step:start', { tool: step.tool, action: step.tool, params: step.params, label: step.label || '' });
        const ok = await builtin(step);
        if (ok === false) { bus.emit('step:failed', { tool: step.tool, reason: 'not done' }); status = 'failed'; break; }
        bus.emit('step:verified', { tool: step.tool, ms: clock.now() - s0 });
        doneSteps.push(step);
        continue;
      }
      const a = app(step.app);
      const x = a?.actions?.[step.action];
      if (!x) { bus.emit('step:failed', { tool: step.tool, reason: 'missing' }); status = 'failed'; break; }
      lastApp = a;
      const mode = agency(step);
      const text = label(step.action, x, step.params);

      if (x.gate) {
        const readback = typeof x.readback === 'function' ? x.readback(a.state(), step.params) : a.read();
        const result = await gates.ask({ gate: x.gate, readback, label: text });
        if (task.stopped && result !== 'yes') { status = task.takenOver ? 'taken-over' : 'stopped'; break; }
        if (result !== 'yes') { status = 'cancelled'; line = `Not ${PAST[x.gate] || 'done'}.`; break; }
      } else if (mode === 'ask' && CHANGES(step.action) && i > 0) { // a spoken task is the yes for its first step
        bus.emit('step:next', { tool: step.tool, label: text });
        await beat(BEAT_MS);
        if (task.stopped) { status = task.takenOver ? 'taken-over' : 'stopped'; break; }
      }

      bus.emit('step:start', { tool: step.tool, app: step.app, action: step.action, params: step.params, label: text, gate: x.gate || null });
      let ok = false, reason = '';
      try {
        if (mode === 'teach' && !x.gate) ok = await teachStep(x, a, step);
        else { await x.run(step.params, ctxFor(a)); ok = !!x.verify(a.state(), step.params); }
        if (!ok) reason = typeof x.why === 'function' ? x.why(a.state(), step.params) : `${text} didn't work.`;
      } catch (e) {
        if (e && e.ask) { bus.emit('say', { text: e.ask }); status = 'asked'; bus.emit('step:failed', { tool: step.tool, reason: 'ask' }); break; }
        reason = `${text} didn't work.`;
      }
      if (!ok && task.stopped) { status = task.takenOver ? 'taken-over' : 'stopped'; break; }
      if (!ok) {
        bus.emit('step:failed', { tool: step.tool, reason });
        failed = { utterance, steps: steps.slice(i) };
        status = 'failed';
        line = `${reason} Try again, I'll do it, or stop.`;
        break;
      }
      bus.emit('step:verified', { tool: step.tool, ms: clock.now() - s0 });
      doneSteps.push(step);
      if (x.gate) gatedRan = x.gate;
      if (typeof x.undo === 'function' && !x.gate) lastUndo = { app: a, action: x, params: step.params, label: text, until: 0 };
      else if (x.gate) lastUndo = null; // a gated step is final: nothing before it may be undone
    }

    if (status === 'stopped' && gatedRan) line = `Already ${PAST[gatedRan]}.`;
    else if (status === 'stopped') line = 'Stopped.';
    if (status === 'done' && lastApp) line = (() => { const last = steps.at(-1); const x = lastApp.actions[last.action]; return typeof x?.done === 'function' ? x.done(lastApp.state(), last.params) : lastApp.read(); })();
    const ms = clock.now() - t0;
    if (status === 'done' && lastUndo) { lastUndo.until = clock.now() + UNDO_MS; bus.emit('undo:offer', { label: lastUndo.label, until: lastUndo.until }); }
    else lastUndo = null;
    if (doneSteps.length && status === 'done') history.push({ utterance, at: clock.now(), steps: doneSteps.map(({ tool, app, action, params, gate }) => ({ tool, app, action, params, gate })) });
    if (current === task) current = null;
    bus.emit('task:done', { ms, status, line, apps: [...new Set(steps.filter((s) => s.app).map((s) => s.app))],
      actions: doneSteps.map((s) => s.tool), success: status === 'done' });
    return { status, ms, line };
  }

  return {
    run,
    history,
    get busy() { return !!current; },
    stop() { if (current) { current.stopped = true; current.nudge?.(); } gates.cancel('stop'); },
    takeOver() { if (current) { current.stopped = true; current.takenOver = true; current.nudge?.(); } },
    nudge() { current?.nudge?.(); },
    async undo() {
      const u = lastUndo;
      if (!u || clock.now() > u.until) { bus.emit('say', { text: 'Nothing to undo.' }); return false; }
      lastUndo = null;
      await u.action.undo(ctxFor(u.app), u.params);
      bus.emit('undo:done', { label: u.label });
      bus.emit('say', { text: 'Undone.' });
      return true;
    },
    retry() { return failed ? run(failed) : Promise.resolve({ status: 'nothing' }); },
  };
}

/**
 * Gates (spec §3.2, §3.7): the ask-first sheet. ask() resolves 'yes' only on a confirm word or the Yes button,
 * never in the first 0.5 s, and for pay (or a risky send or call) only after the fingerprint matched.
 */
export function createGates({ bus, clock = { now: () => Date.now() }, fingerprint = async () => false, risky = () => false, grace = 500 }) {
  let open = null; // { gate, readback, openedAt, resolve, checking }
  return {
    get current() { return open && { gate: open.gate, openedAt: open.openedAt }; },
    ask({ gate, readback, label }) {
      if (open) open.resolve('no');
      const question = { send: 'Send it?', pay: 'Pay?', call: 'Call?', delete: 'Delete it?' }[gate] || 'Do it?';
      return new Promise((resolve) => {
        open = { gate, readback, openedAt: clock.now(), checking: false,
          resolve: (r) => { const g = open; open = null; bus.emit('confirm', { gate, readback, result: r, ...(g?.print !== undefined ? { fingerprint: g.print } : {}) }); resolve(r); } };
        bus.emit('gate:open', { gate, readback, question, label });
        bus.emit('say', { text: `${readback} ${question}` });
      });
    },
    /** A confirm word (already checked by hear()) or the Yes button. */
    async yes({ button = false } = {}) {
      const g = open;
      if (!g || g.checking) return false;
      if (!button && clock.now() - g.openedAt < grace) return false;
      if (g.gate === 'pay' || risky(g.gate)) {
        g.checking = true;
        bus.emit('say', { text: 'Check your fingerprint.' });
        let ok = false;
        try { ok = await fingerprint(); } catch { ok = false; }
        g.checking = false;
        g.print = ok;
        if (open !== g) return false;
        if (!ok) { bus.emit('say', { text: 'Not you, or not read. Try again, or No.' }); bus.emit('fingerprint', { ok: false }); return false; }
        bus.emit('fingerprint', { ok: true });
      }
      g.resolve('yes');
      return true;
    },
    no() { if (open) { open.resolve('no'); return true; } return false; },
    cancel(why = 'no') { if (open) open.resolve(why); },
  };
}
