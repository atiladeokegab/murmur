// Murmur's agent: hear -> reserved words -> plan -> run / verify / gate -> narrate -> remember.
// One entry point, agent.hear(text, { path }), for Live, Web Speech, the typed field and the eval alike.
// Speech is a direct call to `speak`; the bus `say` event only records it (contract rev 2).
import { hear as reserved } from './words.js';
import { describeRegistry } from './plan.js';
import { planUtterance } from './planner.js';
import { createRunner, createGates } from './runner.js';
import { createWorkflows, lastChain } from './workflows.js';
import { attachMemory } from './memory.js';
import { placeLine } from './narrate.js';

/**
 * @param {object} o
 * @param {any} o.registry           the SDK registry (array, map or list())
 * @param {{emit, on}} o.bus
 * @param {(app, hooks)=>object} o.ctxFor  the shell's ctx factory: createCtx({ app, root, kv, cursor, ...hooks })
 * @param {(text, signal)=>Promise} [o.speak]  the voice (route.js createVoice().say)
 * @param {(sheet|null)=>void} [o.onGate]      show or hide the ask-first sheet
 * @param {(choice|null)=>void} [o.onChoose]   show or hide the choice sheet: { question, choices }
 * @param {object} [o.librarian]     the toolkit Librarian (memory + skills)
 * @param {{ open?(id), current?(): string|null }} [o.os]  the shell: open an app, which one is open
 * @param {()=>Promise<boolean>} [o.fingerprint]  passkey.confirm
 * @param {(step)=>'ask'|'just'|'teach'} [o.agency]
 * @param {(gate)=>boolean} [o.risky]  send/call need the fingerprint too (screen just locked, earphone out)
 */
export function createAgent({ registry, bus, ctxFor, librarian = null, os = {}, fingerprint = async () => false,
  agency = () => 'ask', risky = () => false, clock = { now: () => Date.now() }, sleep, plan = planUtterance, planOpts = {},
  speak = async () => {}, onGate = () => {}, onChoose = () => {} }) {
  const appsList = () => (Array.isArray(registry) ? registry : typeof registry?.list === 'function' ? registry.list() : Object.values(registry || {}));
  const app = (id) => (typeof registry?.get === 'function' ? registry.get(id) : appsList().find((a) => a.id === id));
  let lastSaid = '';
  const say = (text) => { if (!text) return Promise.resolve(); lastSaid = text; bus.emit('say', { text }); return Promise.resolve(speak(text)).catch(() => {}); };
  const describeStep = (s) => {
    const x = s.app && app(s.app)?.actions?.[s.action];
    if (!x) return s.tool;
    const vals = Object.values(s.params || {}).filter((v) => typeof v === 'string' && v !== '$who').map((v) => v.replace(/[.!?]+$/, ''));
    return vals.length ? `${x.describe} (${vals.join(', ')})` : x.describe;
  };
  let lastApp = null, savedAt = 0, offer = null, question = null, proposal = null, taskMode = null, choice = null;
  const current = () => os.current?.() || lastApp;

  bus.on('step:start', (e) => { if (e.app) lastApp = e.app; });
  bus.on('memory', (e) => { if (e.proposal) { proposal = e.proposal; say(`${e.proposal.text} Yes, not now, or never?`); } });

  const gates = createGates({ say, clock, fingerprint, risky, onChange: onGate });
  const memory = librarian ? attachMemory({ librarian, bus, clock }) : null;
  const workflows = librarian ? createWorkflows({ librarian, describe: describeStep }) : null;
  const ask = (q) => new Promise((resolve) => { question = resolve; say(q); });

  /** ctx.choose lands here: say the question, and the next thing heard (or a tap on the sheet) picks. */
  const choose = ({ question: q, choices }) => new Promise((resolve) => {
    if (choice) choice.resolve(null);
    choice = { choices, resolve: (i) => { choice = null; onChoose(null); resolve(i); } };
    onChoose({ question: q, choices });
    say(q);
  });
  const pickOf = (text, choices) => {
    const t = String(text).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const ord = ['first', 'second', 'third', 'fourth'].findIndex((w) => t.includes(w));
    if (ord >= 0 && ord < choices.length) return ord;
    const c = choices.map((x) => String(x).toLowerCase());
    const exact = c.indexOf(t);
    if (exact >= 0) return exact;
    const part = c.filter((x) => x.startsWith(t) || t.split(' ').includes(x));
    return part.length === 1 ? c.indexOf(part[0]) : -1;
  };

  const runner = createRunner({ registry, bus, ctxFor, gates, choose, speak, clock, ...(sleep ? { sleep } : {}),
    agency: (step) => taskMode || agency(step), builtin });

  async function builtin(step) {
    const p = step.params || {};
    switch (step.tool) {
      case 'open_app': if (!app(p.app)) return false; await os.open?.(p.app); lastApp = p.app; return true;
      case 'read_screen': { const a = app(current()); await say(a ? a.read() : "You're on the board."); return true; }
      case 'where': await where(); return true;
      case 'say': await say(p.text); return true;
      case 'ask': bus.emit('ask', { question: p.question, result: null }); await say(p.question); return true;
      case 'recall': say(memory ? await memory.recall() : 'Nothing yet.'); return true;
      case 'explain': say(workflows ? await workflows.explain(p.name) : 'No tiles yet.'); return true;
      case 'edit_workflow': say(workflows ? await workflows.edit(p.name, p.drop) : 'No tiles yet.'); return true;
      case 'save_workflow': {
        const steps = lastChain(runner.history, savedAt);
        if (!workflows || !steps.length) { say('Do it once first, then save it.'); return false; }
        const w = await workflows.save(p.name, steps, { slot: !!p.slot });
        if (!w) { say("That didn't save. Again?"); return false; }
        savedAt = clock.now() + 1;
        bus.emit('memory', { workflow: { name: w.name, steps: w.steps.map((s) => s.tool) } });
        say(`${w.text.replace(/\.$/, '')}. Saved as ${w.name}.`);
        return true;
      }
      case 'run_workflow': return false; // handled in hear(): it becomes its own task
      default: return false;
    }
  }

  async function runPlan(utterance, steps, mode = null) {
    taskMode = mode;
    try { return await runner.run({ utterance, steps }); } finally { taskMode = null; }
  }

  async function runWorkflow(name, utterance) {
    const w = workflows && await workflows.plan(name, ask);
    if (!w) { say(`There's no tile called ${name}.`); return { status: 'unknown' }; }
    return runPlan(utterance, w.steps);
  }

  async function where() {
    const a = app(current()), pl = a?.place?.();
    if (a && pl) bus.emit('place', { app: a.id, ...pl });
    await say(placeLine(pl));
  }

  async function reservedWord(w) {
    switch (w.kind) {
      case 'stop': choice?.resolve(null); runner.stop(); return;
      case 'take_over': choice?.resolve(null); runner.takeOver(); return;
      case 'where': await where(); return;
      case 'undo': await runner.undo(); return;
      case 'carry_on': {
        const a = app(current());
        const x = a && (a.actions.carryOn ? 'carryOn' : a.actions.resume ? 'resume' : null);
        if (x) await runPlan('carry on', [{ tool: `${a.id}__${x}`, app: a.id, action: x, params: {}, gate: null }]);
        else runner.nudge();
        return;
      }
      case 'again': await say(lastSaid); return;
      case 'confirm': await gates.yes(); return;
      case 'deny': gates.no(); return;
      case 'ignored': return; // an early yes, or the wrong confirm word: the sheet stays open
    }
  }

  /** Everything said or typed comes in here. */
  async function hear(text, { path = 'typed' } = {}) {
    bus.emit('heard', { text: String(text), path });
    const { words, rest } = reserved(text, { gate: gates.current, now: clock.now() });
    for (const w of words) await reservedWord(w);
    if (!rest) return { status: words.length ? 'reserved' : 'empty' };
    if (gates.current) { say(`${gates.current.gate === 'pay' ? 'Pay' : 'Yes'}, or no?`); return { status: 'gated' }; }

    if (choice) {
      const i = pickOf(rest, choice.choices);
      if (/^(no|none|neither|cancel)\b/i.test(rest)) { choice.resolve(null); return { status: 'chosen', pick: null }; }
      if (i < 0) { await say(`${choice.choices.slice(0, -1).join(', ')} or ${choice.choices.at(-1)}?`); return { status: 'asked' }; }
      const label = choice.choices[i];
      choice.resolve(i); return { status: 'chosen', pick: label };
    }
    if (question) { const q = question; question = null; q(rest); return { status: 'answered' }; }
    if (proposal && /^(yes|not now|no|never)\b/i.test(rest)) {
      const p = proposal; proposal = null;
      const a = /^never/i.test(rest) ? 'never' : /^yes/i.test(rest) ? 'yes' : 'not now';
      await memory?.respond(p.id, a);
      say(a === 'yes' ? 'Done.' : a === 'never' ? "I won't ask again." : 'Okay, not now.');
      return { status: 'proposal', answer: a };
    }
    if (offer && /^(?:yes|just\s+)?do it[.!]?$/i.test(rest)) {
      const o = offer; offer = null;
      if (o.steps.some((s) => !s.complete)) { say('Say it in full, and I\'ll do it.'); return { status: 'asked' }; }
      return runPlan(o.utterance, o.steps);
    }
    if (offer && /walk me through|teach me|show me|i'll do it myself|walk through/i.test(rest)) {
      const o = offer; offer = null;
      return runPlan(o.utterance, o.steps, 'teach');
    }
    offer = null;

    const context = { app: current(), workflows: workflows ? (await workflows.all()).map((w) => w.name) : [] };
    const p = await plan(rest, describeRegistry(appsList()), context, planOpts);
    if (!p.steps.length) { say(p.say || p.dropped.find((d) => d.say)?.say || "I can't do that one yet."); return { status: p.kind === 'refuse' ? 'refused' : 'unknown', say: p.say }; }
    const unsaid = p.dropped.find((d) => d.say);
    if (unsaid) say(unsaid.say);

    if (p.kind === 'teach') {
      const lines = p.steps.map((s) => { const x = s.app && app(s.app)?.actions?.[s.action]; return x?.hint || (x ? x.describe : s.tool); });
      const apps = [...new Set(p.steps.filter((s) => s.app).map((s) => app(s.app)?.name))];
      say(`${['Open ' + apps.join(' and '), ...lines].join(', then ')}. Shall I do it, or walk you through?`);
      const reg = describeRegistry(appsList());
      offer = { utterance: rest, steps: p.steps.map((s) => ({ ...s, complete: isComplete(s, reg) })) };
      return { status: 'taught', hints: lines };
    }
    const wf = p.steps.find((s) => s.tool === 'run_workflow');
    if (wf) return runWorkflow(wf.params.name, rest);
    return runPlan(rest, p.steps);
  }

  return {
    hear,
    runner, gates, memory, workflows,
    /** The Yes and No buttons on the ask-first sheet. */
    yes: () => gates.yes({ button: true }),
    no: () => gates.no(),
    /** A tap on the choice sheet. */
    pick: (i) => choice?.resolve(i),
    /** Android Back or the Stop bar: same as "stop". */
    stop: () => reservedWord({ kind: 'stop' }),
    /** Yes / Not now / Never on the proposal sheet. */
    respond: (id, answer) => { proposal = null; return memory?.respond(id, answer); },
    get offer() { return offer; },
  };
}

function isComplete(step, apps) {
  const a = apps.find((x) => x.id === step.app);
  const x = a?.actions.find((y) => y.name === step.action);
  return !x || (x.params?.required || []).every((k) => k in step.params);
}
