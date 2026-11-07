// Murmur's agent: hear -> reserved words -> plan -> run / verify / gate -> narrate -> remember.
// One entry point, agent.hear(text, { path }), for Live, Web Speech, the typed field and the eval alike.
// Speech is a direct call to `speak`; the bus `say` event only records it (contract rev 2).
import { hear as reserved } from './words.js';
import { describeRegistry, WORD_TOOLS } from './plan.js';
import { planUtterance } from './planner.js';
import { createRunner, createGates } from './runner.js';
import { createWorkflows, lastChain } from './workflows.js';
import { attachMemory } from './memory.js';
import { placeLine } from './narrate.js';
import { offerLine } from './offer.js';
import { phoneApp } from './phone-apps.js';
import { installToken } from './token.js';

if (globalThis.window) installToken(); // /api/* carries the device token from here on

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
 * @param {(signal)=>Promise<boolean>} [o.fingerprint]  passkey.confirm; the signal aborts when Stop or No withdraws the gate
 * @param {(step)=>'ask'|'just'|'teach'} [o.agency]
 * @param {()=>'short'|'detailed'} [o.answers]  Your look's Answers row: Detailed says a result's longer answer straight away
 * @param {(gate)=>boolean} [o.risky]  send/call need the fingerprint too (screen just locked, earphone out)
 * @param {()=>void} [o.onStop]  the shell's whole Stop (stopAll: audio, open sheets, a pending fingerprint): a said or typed Stop calls it
 * @param {()=>void} [o.onCut]   cut the line playing now (the shell's hush): Stop and Undo call it
 */
export const ACK = 'On it.';
export const NARRATION_HOLD_MS = 150; // a question this soon after a step starts replaces the step's line

export function createAgent({ registry, bus, ctxFor, librarian = null, os = {}, fingerprint = async () => false,
  agency = () => 'ask', answers = () => 'short', risky = () => false, clock = { now: () => Date.now() }, sleep, plan = planUtterance, planOpts = {},
  speak: rawSpeak = async () => {}, onGate = () => {}, onChoose = () => {}, onStop = () => {}, onCut = () => {} }) {
  const appsList = () => (Array.isArray(registry) ? registry : typeof registry?.list === 'function' ? registry.list() : Object.values(registry || {}));
  const app = (id) => (typeof registry?.get === 'function' ? registry.get(id) : appsList().find((a) => a.id === id));
  let movedAt = null; // when this agent last moved a Calendar event; a send or 2 minutes ends "tell Mum" about it
  let lastSaid = '', lastMore = ''; // lastMore: the last result's longer answer ("tell me more")
  // One voice, one line at a time: each line waits for the one before, so steps can act while a line is spoken.
  // Stop empties the queue (gen moves on), so nothing queued is said after it.
  // A step's narration ("Opening the chat") is dropped if a question is asked before it starts: it waits a short
  // hold when nothing else is being said, so "Sam or Samira?" 60 ms later is said whole, not after a clipped line.
  let chain = Promise.resolve(), gen = 0, pending = 0, asked = 0;
  const holds = new Set();
  let ackGo = null; // lets a held "On it." go at once, when no question can come first
  const hold = (ack) => new Promise((r) => { const t = setTimeout(done, NARRATION_HOLD_MS); function done() { clearTimeout(t); holds.delete(done); if (ackGo === done) ackGo = null; r(); } holds.add(done); if (ack) ackGo = done; });
  const releaseAck = () => ackGo?.();
  const speak = (text, signal, o) => {
    const g = gen, a = asked;
    const out = () => g !== gen || signal?.aborted || (o?.narration && (a !== asked || o.stale?.()));
    const start = () => { o?.said?.(); return rawSpeak(text, signal); }; // on the record when it is said, in the order heard
    // queued behind a line, the narration has already waited that line out: no hold, no silence between lines
    const go = (queued) => (out() ? false : o?.narration && !queued ? hold(o.ack).then(() => (out() ? false : start())) : start());
    const p = pending ? chain.then(() => go(true)) : Promise.resolve(go(false)); // nothing being said: start now, not a tick later
    pending++;
    chain = p.catch(() => {}).finally(() => { if (g === gen) pending--; });
    return p;
  };
  // Stop and Undo: drop the queue, cut the line playing now, and let the next line start at once, not after it.
  const hush = () => { gen++; pending = 0; chain = Promise.resolve(); try { onCut(); } catch { /* the shell's own */ } };
  const say = (text, o) => {
    if (!text) return Promise.resolve();
    const said = () => { lastSaid = text; bus.emit('say', { text }); };
    return Promise.resolve(speak(text, undefined, { ...o, said })).catch(() => {});
  };
  const sayQuestion = (q) => { asked++; for (const done of [...holds]) done(); return say(q); };
  const describeStep = (s) => {
    const x = s.app && app(s.app)?.actions?.[s.action];
    if (!x) return s.tool;
    const vals = Object.values(s.params || {}).filter((v) => typeof v === 'string' && v !== '$who').map((v) => v.replace(/[.!?]+$/, ''));
    return vals.length ? `${x.describe} (${vals.join(', ')})` : x.describe;
  };
  let lastApp = null, savedAt = 0, offer = null, question = null, proposal = null, taskMode = null, choice = null;
  const current = () => os.current?.() || lastApp;

  // A first step's question ("Sam or Samira?") comes within the same turn as its start; after that, "On it." goes.
  bus.on('step:start', (e) => { if (e.app) lastApp = e.app; if (ackGo) { if (e.app) setTimeout(releaseAck, 0); else releaseAck(); } }); // Murmur's own tools never ask
  bus.on('memory', (e) => { if (e.proposal) { proposal = e.proposal; say(`${e.proposal.text} Yes, not now, or never?`); } });

  const gates = createGates({ say: (t) => (t === 'Check your fingerprint.' ? say(t) : sayQuestion(t)), clock, fingerprint, risky, onChange: onGate });
  const memory = librarian ? attachMemory({ librarian, bus, clock }) : null;
  const workflows = librarian ? createWorkflows({ librarian, describe: describeStep }) : null;
  const ask = (q) => new Promise((resolve) => { question = resolve; sayQuestion(q); });

  /** ctx.choose lands here: say the question, and the next thing heard (or a tap on the sheet) picks. */
  const choose = ({ question: q, choices }) => new Promise((resolve) => {
    if (choice) choice.resolve(null);
    choice = { choices, resolve: (i) => { choice = null; onChoose(null); resolve(i); } };
    onChoose({ question: q, choices });
    sayQuestion(q);
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
      case 'open_app': if (!app(p.app)) return true; // model noise ("the board"): nothing to open, nothing failed
 await os.open?.(p.app); lastApp = p.app; return true;
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
      case 'list_workflows': {
        const all = workflows ? (await workflows.all()).map((w) => w.name) : [];
        await say(all.length ? `Your tiles: ${all.join(', ')}.` : 'No tiles yet. Do something, then say save that as a name.');
        return true;
      }
      case 'remove_workflow': {
        const w = workflows && (await workflows.all()).find((x) => x.name.toLowerCase() === String(p.name).toLowerCase());
        if (!w) { await say(`There's no tile called ${p.name}.`); return false; }
        if (!(await gates.ask({ gate: 'delete', readback: `Remove the ${w.name} tile.` }))) return false;
        return workflows.remove(w.name);
      }
      case 'go_home': if (!os.home) return false; await os.home(); return true;
      case 'sound': if (!os.sound) return false; await os.sound(!!p.on); await say(p.on ? 'Sounds on.' : 'Sounds off.'); return true;
      case 'install_app': { const r = await os.install?.(p.name); await say(r?.say || "I can't add apps here."); return !!r?.ok; }
      case 'remove_app': {
        // The agent's own delete gate asks, so a spoken yes or no answers it like any other gate.
        const r = await os.remove?.(p.name, { confirm: (readback) => gates.ask({ gate: 'delete', readback }) });
        await say(r?.say || "I can't remove apps here."); return !!(r?.ok || r?.cancelled); // a kept app is a choice, not a failure
      }
      case 'run_workflow': return false; // handled in hear(): it becomes its own task
      default: return false;
    }
  }

  /** A popular app the phone lacks, acted out: one line said, and /stage shows it opening and doing the task. */
  async function actOut(a, utterance) {
    const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms))), t0 = clock.now();
    bus.emit('app:open', { name: a.name });
    bus.emit('task:start', { utterance, plan: a.steps.map((name) => ({ name, params: {} })) });
    const said = say(a.line);
    for (const [i, label] of a.steps.entries()) {
      bus.emit('step:start', { action: 'open', app: null, n: i + 1, of: a.steps.length, label, params: {}, gate: null, dropped: [] });
      await wait(450);
      bus.emit('step:verified', { action: 'open', n: i + 1, of: a.steps.length, ms: 450 });
    } // shortcut: Stop does not cut these ticks short; they are a second or so, and nothing real happens in them
    await said;
    bus.emit('task:done', { ms: clock.now() - t0, ok: true, line: a.line });
    return { status: 'done', say: a.line };
  }

  async function runPlan(utterance, steps, mode = null, plan = {}) {
    taskMode = mode;
    try {
      const r = await runner.run({ utterance, steps, plan });
      // a send in the same plan already told them: clear, else a finished move arms "tell Mum" (Atlas, 6726f01)
      if (steps.some((x) => x.tool === 'messages__send')) movedAt = null;
      else if (r.status === 'done' && steps.some((x) => x.tool === 'calendar__move')) movedAt = clock.now();
      lastMore = r.more || '';
      if (lastMore && answers() === 'detailed') await say(lastMore);
      return r;
    } finally { taskMode = null; }
  }

  async function runWorkflow(name, utterance) {
    const w = workflows && await workflows.plan(name, ask);
    if (!w) { say(`There's no tile called ${name}.`); return { status: 'unknown' }; }
    return runPlan(utterance, w.steps);
  }

  async function where() {
    const a = app(current()), pl = a?.place?.();
    if (a && pl) bus.emit('place', { app: a.id, ...pl });
    await say(pl?.say || placeLine(pl)); // an app's own where-am-I sentence wins
  }

  async function reservedWord(w) {
    switch (w.kind) {
      case 'stop': if (!w.shell) try { onStop(); } catch { /* the shell's own */ } hush(); choice?.resolve(null); runner.stop(); return; // the shell's Stop button already ran stopAll
      case 'take_over': choice?.resolve(null); runner.takeOver(); return;
      case 'where': await where(); return;
      case 'undo': hush(); await runner.undo(); return; // "Undone." now, not after the stale lines
      case 'carry_on': {
        const a = app(current());
        const x = a && (a.actions.carryOn ? 'carryOn' : a.actions.resume ? 'resume' : null);
        if (x) await runPlan('carry on', [{ tool: `${a.id}__${x}`, app: a.id, action: x, params: {}, gate: null }]);
        else if (lastMore && !runner.busy) await say(lastMore); // "go on" after a result with more to say
        else runner.nudge();
        return;
      }
      case 'again': await say(lastSaid); return;
      case 'more': await say(lastMore || "That's all there is."); return;
      case 'offer': await say(offerLine(appsList(), os.current ? os.current() : lastApp)); return; // on the board, the board
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
    // A popular app the phone lacks ("play my liked songs on Spotify") is acted out before any planner can guess another app.
    const acted = phoneApp(rest);
    if (acted && !appsList().some((a) => [a.id, a.name?.toLowerCase()].includes(acted.name.toLowerCase()))) return actOut(acted, rest);

    // The first sound within 300 ms of the last word: the shell's heard earcon, then "On it." while the plan runs.
    // Held like a step's line, so a question that comes first ("Sam or Samira?") is the ack instead.
    say(ACK, { narration: true, ack: true });
    const p = await planFor(rest);
    slotAsk = p.asked || null;
    if (!p.steps.length || p.kind === 'teach') releaseAck();
    const lost = p.dropped.find((d) => d.reason === 'unknown app' && d.say);
    const coming = /bring it over from your phone/.test(p.say || lost?.say || '') && (p.say?.match(/^I don't have (.+?) yet\./)?.[1] || lost?.tool?.split('__')[0]);
    if (coming) bus.emit('app:import', { name: coming }); // Inside shows it coming over
    if (!p.steps.length) { await say(p.say || p.dropped.find((d) => d.say)?.say || "I can't do that one yet."); return { status: p.kind === 'refuse' ? 'refused' : 'unknown', say: p.say }; }
    const unsaid = p.dropped.find((d) => d.say);
    if (unsaid) say(unsaid.say);

    if (p.kind === 'teach') {
      const lines = p.steps.map((s) => { const x = s.app && app(s.app)?.actions?.[s.action]; return x?.hint || (x ? x.describe : s.tool); });
      const apps = [...new Set(p.steps.filter((s) => s.app).map((s) => app(s.app)?.name))];
      await say(`${['Open ' + apps.join(' and '), ...lines].join(', then ')}. Shall I do it, or walk you through?`);
      const reg = describeRegistry(appsList());
      offer = { utterance: rest, steps: p.steps.map((s) => ({ ...s, complete: isComplete(s, reg) })) };
      return { status: 'taught', hints: lines };
    }
    if (p.steps.length === 1 && WORD_TOOLS.has(p.steps[0].tool)) { await reservedWord({ kind: p.steps[0].tool }); return { status: 'reserved' }; }
    const wf = p.steps.find((s) => s.tool === 'run_workflow');
    if (wf) return runWorkflow(wf.params.name, rest);
    return runPlan(rest, p.steps, null, { provider: p.provider, ...(p.model ? { model: p.model } : {}), ...(p.late ? { late: p.late } : {}) });
  }

  // Speculative planning: the shell calls prefetch(interim) once the words have held still ~400 ms; hear() reuses
  // the plan when the final words and the open app match. Anything else plans afresh.
  let early = null;
  const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  let slotAsk = null; // "get a price": the words a slot question ("Where to?") waits to finish
  async function contextNow() {
    // the last Calendar move with someone, so "tell Mum" can say what moved
    const fresh = movedAt != null && clock.now() - movedAt < 120000;
    const cal = fresh && app('calendar')?.state?.(), mv = cal?.lastMoved, ev = mv && cal.events?.find((e) => e.id === mv.id);
    const moved = ev?.with ? { what: ev.title.replace(/\s+with\s+.+$/i, ''), with: ev.with, day: mv.to, time: mv.time } : null;
    return { app: current(), ...(slotAsk ? { asked: slotAsk } : {}), workflows: workflows ? (await workflows.all()).map((w) => w.name) : [], ...(moved ? { moved } : {}) };
  }
  async function planFor(text) {
    const context = await contextNow();
    if (early && early.text === norm(text) && early.app === context.app) { const e = early; early = null; return e.plan; }
    early = null;
    return plan(text, describeRegistry(appsList()), context, planOpts);
  }
  async function prefetch(text) {
    const { rest } = reserved(text, { gate: gates.current, now: clock.now() });
    if (!rest || gates.current || choice || question || offer || proposal || norm(rest) === early?.text) return;
    const context = await contextNow();
    const p = plan(rest, describeRegistry(appsList()), context, planOpts);
    early = { text: norm(rest), app: context.app, plan: p };
    p.catch(() => { if (early?.plan === p) early = null; });
  }
  /** At boot: wake the server and the model, and list the fixed lines the shell can turn into audio ahead of time. */
  async function warm() {
    plan('warm up', describeRegistry(appsList()), { app: null, workflows: [] }, planOpts).catch(() => {});
    return fixedLines();
  }
  function fixedLines() {
    const lines = new Set([ACK, 'Done.', 'Not sent.', 'Undone.', 'Nothing to undo.', 'Yes, or no?', 'Check your fingerprint.', 'Stopped.', 'Sent.', 'Not paid.', "I didn't catch how to do that."]);
    for (const a of appsList()) for (const x of Object.values(a.actions || {})) if (x.doing) lines.add(x.doing);
    return [...lines];
  }

  return {
    hear, prefetch, warm, fixedLines,
    runner, gates, memory, workflows,
    /** The Yes and No buttons on the ask-first sheet. */
    yes: () => gates.yes({ button: true }),
    no: () => gates.no(),
    /** A tap on the choice sheet. */
    pick: (i) => choice?.resolve(i),
    /** Android Back or the Stop bar: same as "stop". */
    stop: () => reservedWord({ kind: 'stop', shell: true }),
    takeOver: () => reservedWord({ kind: 'take_over' }),
    undo: () => runner.undo(),
    carryOn: () => reservedWord({ kind: 'carry_on' }),
    /** Mine's Run button: the saved workflow as its own task (asks a slot, keeps every gate). */
    runWorkflow: (name) => runWorkflow(name, `run ${name}`),
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
