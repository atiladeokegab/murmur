// The runner (spec §3.2, os/contract.md §5): a plan is a task; every app step goes through the SDK's
// runAction, so validate, gate, run and verify happen in one place and cannot be skipped. The runner owns
// the task: its id, the pacing between steps, Stop, undo, the done line and task:done.
import { runAction } from '../sdk/run.js';

const CHANGES = (name) => !/^(read|open|show|list|next|whats|find|track|where|search|today|balance|recent)/i.test(name);
const DOUBLE = new Set(['stop', 'get', 'run', 'set', 'put', 'shop', 'plan', 'drop', 'swap']);

/** "Open a chat" -> "Opening a chat"; for apps that left out `doing`. */
export function gerund(describe) {
  const [verb, ...rest] = String(describe || '').split(' ');
  const v = verb.toLowerCase();
  let g = DOUBLE.has(v) ? v + v.at(-1) + 'ing' : /[^e]e$/.test(v) && v !== 'be' ? v.slice(0, -1) + 'ing' : v + 'ing';
  g = g.charAt(0).toUpperCase() + g.slice(1);
  return [g, ...rest].join(' ');
}

const PAST = { send: 'sent', pay: 'paid', call: 'called', delete: 'deleted' };
export const UNDO_MS = 8000;
export const BEAT_MS = 700; // the lead's bar: never more than 700 ms of silence in a task

/** Wrap the bus so every event of this task carries its id (contract §6). */
const tagged = (bus, task) => ({ ...bus, emit: (name, p = {}) => bus.emit(name, { task, ...p }), on: bus.on, log: bus.log });

/**
 * @param {object} o
 * @param {{get(id), resolve(name)}} o.registry  the SDK registry
 * @param {object} o.bus                         the SDK bus
 * @param {(app, hooks)=>object} o.ctxFor        the shell's ctx factory; hooks = {bus, ask, choose, speak, signal}
 * @param {object} o.gates                       createGates(...): its ask goes into ctx
 * @param {(q)=>Promise<number|null>} o.choose   the choice sheet ("Sam or Samira?")
 * @param {(text, signal)=>Promise} o.speak      the voice
 * @param {(step, task)=>Promise<boolean>} [o.builtin]  Murmur's own tools (open_app, say, ...); true = done
 * @param {(step)=>'ask'|'just'|'teach'} [o.agency]
 */
export function createRunner({ registry, bus, ctxFor, gates, choose = async () => null, speak = async () => {},
  builtin = async () => false, agency = () => 'ask',
  clock = { now: () => Date.now() }, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let current = null;   // { id, controller, stopped, takenOver, nudge }
  let lastUndo = null;  // { app, action, name, params, until }
  let failed = null;    // { utterance, steps } from the failed step on
  let seq = 0;
  const history = [];   // finished tasks: [{ utterance, at, steps }], newest last; workflows read this

  const hooks = (task) => ({ bus: task.bus, ask: gates.ask, choose, signal: task.controller.signal,
    speak: Object.assign((text, signal, o) => speak(text, signal, o), { records: true }) });
  const say = async (task, text, o) => {
    if (!text) return;
    // speak puts a line on the record when it starts, so a held or dropped line is never on it
    try { await speak(text, task.controller.signal, { ...o, said: () => task.bus.emit('say', { text }) }); } catch { /* stopped mid-sentence */ }
  };

  async function beat(task, ms) {
    let done;
    const p = new Promise((r) => { done = r; });
    task.nudge = done;
    await Promise.race([p, sleep(ms)]);
    task.nudge = null;
  }

  /** Teach me: say the hint, then wait for the person's own taps to make verify pass. */
  async function teachStep(task, a, x, step, base) {
    task.bus.emit('step:start', { ...base, label: x.doing || gerund(x.describe), params: step.params, gate: null, dropped: [] });
    await say(task, x.hint || x.doing || gerund(x.describe));
    const t0 = clock.now(), until = t0 + 60000;
    while (!task.stopped && clock.now() < until) {
      if (await x.verify(a.state(), step.params) === true) { task.bus.emit('step:verified', { ...base, ms: clock.now() - t0 }); return { ok: true }; }
      await sleep(300);
    }
    const r = task.stopped ? { ok: false, stopped: true, reason: 'Stopped.' } : { ok: false, reason: `${x.doing || x.describe}: not done yet.` };
    task.bus.emit('step:failed', { ...base, reason: r.reason, stopped: !!r.stopped });
    return r;
  }

  async function run({ utterance = '', steps = [], plan = {} }) {
    if (current) halt(current);
    const id = `t-${clock.now()}${seq++ ? '-' + seq : ''}`;
    const task = current = { id, bus: tagged(bus, id), controller: new AbortController(), stopped: false, takenOver: false, nudge: null };
    const t0 = clock.now();
    const doneSteps = [];
    const of = steps.length;
    let status = 'done', lastApp = null, gatedRan = null, line = '', reason = '', madeUndo = null, more = '';
    failed = null;
    task.bus.emit('task:start', { utterance, plan: steps.map(({ tool, params }) => ({ name: tool, params })), ...plan });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i], n = i + 1;
      let stepEnded = false;
      if (task.stopped) { status = task.takenOver ? 'taken-over' : 'stopped'; break; }
      const s0 = clock.now();
      if (!step.app) { // Murmur's own tool
        task.bus.emit('step:start', { action: step.tool, app: null, n, of, label: step.label || '', params: step.params, gate: null, dropped: [] });
        const ok = await builtin(step, task);
        if (ok === false) {
          reason = 'Not done.'; task.bus.emit('step:failed', { action: step.tool, n, of, reason }); status = 'failed';
          failed = { utterance, steps: steps.slice(i) }; line = "That didn't work. Try again, or stop."; break;
        }
        task.bus.emit('step:verified', { action: step.tool, n, of, ms: clock.now() - s0 });
        doneSteps.push(step); more = '';
        continue;
      }
      const a = registry.get(step.app);
      const x = a?.actions?.[step.action];
      if (!x) { reason = "I can't do that here."; task.bus.emit('step:failed', { action: step.tool, n, of, reason }); status = 'failed'; break; }
      lastApp = a;
      const mode = agency(step);
      if (!x.gate) {
        // Just do it: the step earcon and the panel carry each step, and the voice keeps to questions and the result
        // (the lead's 6 s bar). Ask and Teach still say every step.
        // The line starts with the tap, never before it: speech is queued, so the step does not wait for it.
        // Ask mode: a step's line is dropped once the step is done (a late "Text bigger" after "Text 150 percent."),
        // and before a gate's readback, which says the text anyway ("Writing your reply" then "... Send it?").
        const next = steps[i + 1], readbackNext = !!(next?.app && registry.get(next.app)?.actions?.[next.action]?.gate);
        if (mode === 'teach') say(task, x.doing || gerund(x.describe)); // Teach waits for the person anyway
        else if (mode === 'ask' && !readbackNext) say(task, x.doing || gerund(x.describe), { narration: true, stale: () => stepEnded });
        // a spoken task is the yes for its first step; later changing steps get a beat to say stop, unless a gate
        // later in the plan asks anyway (the send's "Send it?" is the moment to say no, so typing starts at once)
        const gateAhead = steps.slice(i + 1).some((s) => s.app && registry.get(s.app)?.actions?.[s.action]?.gate);
        if (mode === 'ask' && CHANGES(step.action) && i > 0 && !gateAhead) await beat(task, BEAT_MS);
        if (task.stopped) { status = task.takenOver ? 'taken-over' : 'stopped'; break; }
      }

      // A gated action may resolve who it is for first ("Sam or Samira?"), so the one confirm reads the exact name.
      let params = step.params;
      if (x.gate && typeof x.resolve === 'function') {
        try { params = await x.resolve(params, ctxFor(a, hooks(task))); } catch { params = null; } // Stop rejects with AbortError
        if (!params || task.stopped) { status = task.stopped ? 'stopped' : 'cancelled'; line = reason = task.stopped ? '' : `Not ${PAST[x.gate] || 'done'}.`; break; }
      }
      const r = mode === 'teach' && !x.gate
        ? await teachStep(task, a, x, step, { action: step.tool, app: a.id, n, of })
        : await runAction({ registry, name: step.tool, params, bus: task.bus, ctxFor: (app) => ctxFor(app, hooks(task)), n, of });
      stepEnded = true;
      if (!r.ok) {
        if (r.stopped || task.stopped) status = task.takenOver ? 'taken-over' : 'stopped';
        else if (r.cancelled) { status = 'cancelled'; line = reason = r.reason; }
        else {
          status = 'failed'; reason = r.reason;
          failed = { utterance, steps: steps.slice(i) };
          line = `${r.reason} Try again, I'll do it, or stop.`;
        }
        break;
      }
      doneSteps.push(step);
      more = r.more || ''; // the last step's longer answer, for "tell me more"
      if (x.gate) { gatedRan = x.gate; lastUndo = null; } // a gated step is final: nothing before it may be undone
      else if (typeof x.undo === 'function') madeUndo = lastUndo = { app: a, action: x, name: step.tool, label: `Undo ${(x.doing || gerund(x.describe)).toLowerCase()}`, params: r.params || step.params, until: 0 };
    }

    if (status === 'stopped' || status === 'taken-over') { reason = 'Stopped.'; line = gatedRan ? `Already ${PAST[gatedRan]}.` : status === 'stopped' ? 'Stopped.' : ''; }
    if (status === 'done' && lastApp) {
      const last = steps.at(-1);
      const x = last.app && lastApp.actions[last.action];
      // Short words: the app's own done line, else "Sent." or "Done." (the app already said what it read).
      line = typeof x?.done === 'function' ? x.done(lastApp.state(), last.params)
        : gatedRan ? `${PAST[gatedRan][0].toUpperCase()}${PAST[gatedRan].slice(1)}.` : CHANGES(last.action) ? 'Done.' : '';
    }
    const ms = clock.now() - t0;
    // A read-only, refused or No'd task keeps the last change undoable, still 8 s from that change.
    if (madeUndo && lastUndo === madeUndo) { if (status === 'done') lastUndo.until = clock.now() + UNDO_MS; else lastUndo = null; }
    if (doneSteps.length && status === 'done') history.push({ utterance, at: clock.now(), steps: doneSteps.map(({ tool, app, action, params, gate }) => ({ tool, app, action, params, gate })) });
    if (current === task) current = null;
    // the live Undo rides on every task:done (its own until, not reset), so the panel keeps its Undo button
    const live = lastUndo && (lastUndo === madeUndo || clock.now() <= lastUndo.until) ? lastUndo : null;
    task.bus.emit('task:done', { ms, ok: status === 'done', ...(status === 'done' ? {} : { reason }), line,
      ...(live ? { undo: { label: live.label, until: live.until } } : {}) });
    // the done line is said after the task ends: Stop has nothing left to stop
    if (line) { try { await speak(line, undefined, { said: () => task.bus.emit('say', { text: line }) }); } catch { /* hushed */ } }
    return { status, ms, line, task: id, actions: doneSteps.map((s) => s.tool), more: status === 'done' ? more : '' };
  }

  function halt(task) { task.stopped = true; task.controller.abort(); task.nudge?.(); }

  return {
    run,
    history,
    get busy() { return !!current; },
    get task() { return current?.id || null; },
    stop() { if (current) halt(current); gates.cancel('stop'); },
    takeOver() { if (current) { current.takenOver = true; halt(current); } gates.cancel('stop'); },
    nudge() { current?.nudge?.(); },
    async undo() {
      const u = lastUndo;
      const said = (text) => speak(text, undefined, { said: () => bus.emit('say', { text }) });
      if (!u || clock.now() > u.until) { await said('Nothing to undo.'); return false; }
      lastUndo = null;
      const task = { bus, controller: new AbortController() };
      let ok = true;
      try { await u.action.undo(ctxFor(u.app, hooks(task)), u.params); } catch { ok = false; }
      bus.emit('undo', { action: u.name, ok });
      await said(ok ? 'Undone.' : "That didn't undo.");
      return ok;
    },
    retry() { return failed ? run(failed) : Promise.resolve({ status: 'nothing' }); },
  };
}

/**
 * Gates (spec §3.2, §3.7): the ask-first sheet. Its ask() is the `ask` handed to ctx, so ctx.confirm records
 * the result on the bus. It resolves true only on a confirm word or the Yes button, never in the first
 * 0.5 s, and for pay (or a risky send or call) only after the fingerprint matched.
 * @param {(sheet|null)=>void} [o.onChange]  the shell shows or hides the sheet: { gate, readback, question }
 */
export function createGates({ say = async () => {}, clock = { now: () => Date.now() }, fingerprint = async () => false,
  risky = () => false, grace = 500, onChange = () => {} }) {
  let open = null; // { gate, readback, openedAt, resolve, checking }
  return {
    get current() { return open && { gate: open.gate, openedAt: open.openedAt, readback: open.readback }; },
    ask({ gate, readback }) {
      if (open) open.resolve(false);
      // a travel hold is a pay gate whose readback says "held for 24 hours": the shell's sheet says Hold, so does the voice
      const question = gate === 'pay' && /\b(hold|held)\b/i.test(readback || '') ? 'Hold?'
        : { send: 'Send it?', pay: 'Pay?', call: 'Call?', delete: 'Delete it?' }[gate] || 'Do it?';
      return new Promise((resolve) => {
        const o = { gate, readback, openedAt: clock.now(), checking: false, ctl: new AbortController(),
          resolve: (r) => { o.ctl.abort(); open = null; onChange(null); resolve(r); } }; // Stop, No or a new ask withdraws the fingerprint prompt
        open = o;
        onChange({ gate, readback, question });
        say(/\?$/.test(readback) ? readback : `${readback} ${question}`); // "Send 'I'm late' to Sam?" is its own question
      });
    },
    /** A confirm word (already checked by hear()) or the Yes button. */
    async yes({ button = false } = {}) {
      const g = open;
      if (!g || g.checking) return false;
      if (!button && clock.now() - g.openedAt < grace) return false;
      if (g.gate === 'pay' || risky(g.gate)) {
        g.checking = true;
        await say('Check your fingerprint.');
        let ok = false;
        try { ok = !g.ctl.signal.aborted && !!(await fingerprint(g.ctl.signal)); } catch { ok = false; }
        g.checking = false;
        if (open !== g) return false;
        if (!ok) { g.resolve(false); return false; } // fails closed: the step is cancelled and says "Not paid." 
      }
      g.resolve(true);
      return true;
    },
    no() { if (open) { open.resolve(false); return true; } return false; },
    cancel() { if (open) open.resolve(false); },
  };
}
