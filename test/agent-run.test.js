import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { createAgent } from '../public/agent/index.js';
import { placeLine } from '../public/agent/narrate.js';
import { createVoice } from '../public/voice/route.js';
import { gerund, BEAT_MS, createGates } from '../public/agent/runner.js';
import { observationOf } from '../public/agent/memory.js';
import { phone, memoryKV } from './agent-fixtures.js';

const tick = () => new Promise((r) => setImmediate(r));
async function until(f, n = 2000) { for (let i = 0; i < n; i++) { if (f()) return; await tick(); } throw new Error('timed out'); }

async function setup({ patch, fingerprint = async () => true, agency = () => 'just' } = {}) {
  const clock = { t: Date.UTC(2026, 10, 7, 8, 40), now() { return this.t; } };
  const sleep = async (ms) => { clock.t += ms; await tick(); };
  const kv = memoryKV();
  const { librarian } = createToolkit({ kv, clock });
  const p = await phone({ patch });
  const spoken = [];
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, librarian, fingerprint, agency, clock, sleep,
    planOpts: { offline: true }, speak: async (t) => { spoken.push(t); } });
  const log = p.bus.log;
  const ev = (name) => log.filter((e) => e.name === name);
  return { ...p, agent, clock, kv, spoken, librarian, log, ev };
}

/** Say something that will open a gate (answering "Sam or Samira?" first if asked), then let `after` answer it. */
async function gated(s, utterance, after, { choose } = {}) {
  const p = s.agent.hear(utterance);
  if (choose) { await until(() => s.spoken.some((t) => / or .+\?$/.test(t))); await s.agent.hear(choose); }
  await until(() => s.agent.gates.current);
  await after();
  return p;
}

/** No gated step is verified without a confirm {result:true} between its step:start and its tick. */
function assertGatesHonoured(log) {
  log.forEach((e, i) => {
    if (e.name !== 'step:start' || !e.gate) return;
    const end = log.findIndex((x, j) => j > i && x.task === e.task && x.n === e.n && /^step:(verified|failed)$/.test(x.name));
    if (log[end]?.name === 'step:verified') assert.ok(log.slice(i, end).some((x) => x.name === 'confirm' && x.result === true), `gated ${e.action} ran without a yes`);
  });
  log.forEach((e, i) => { if (e.name === 'step:verified') assert.ok(log.slice(0, i).some((x) => x.name === 'step:start' && x.task === e.task && x.n === e.n)); });
}

test('Vertical 1: "Text Sam I\'m ten minutes late" is planned, asks Sam or Samira, runs with the cursor, verified, gated and logged', async () => {
  const s = await setup();
  const out = await gated(s, "Text Sam I'm ten minutes late", async () => { s.clock.t += 600; await s.agent.hear('send'); }, { choose: 'Sam' });
  assert.equal(out.status, 'done');
  assert.deepEqual(s.state('messages').lastSent, { to: 'sam', text: "I'm ten minutes late." });
  assert.equal(s.taps.at(-1), 'Send');
  assert.equal(s.taps.length, 3, "the chat, the reply box, Send: the person's own controls");
  const names = s.log.map((e) => e.name).filter((t) => /^(task|step|confirm|ask)/.test(t));
  assert.deepEqual(names, ['task:start', 'step:start', 'ask', 'step:verified', 'step:start', 'step:verified', 'step:start', 'confirm', 'step:verified', 'task:done']);
  const ids = new Set(s.log.filter((e) => /^(task|step)/.test(e.name)).map((e) => e.task));
  assert.equal(ids.size, 1);
  assert.match([...ids][0], /^t-\d+/);
  assert.deepEqual(s.ev('task:start')[0].plan.map((x) => x.name), ['messages__openChat', 'messages__reply', 'messages__send']);
  assert.equal(s.ev('ask')[0].result, 'Sam');
  assert.deepEqual(s.ev('step:start').map((e) => [e.n, e.of, e.label]), [[1, 3, 'Opening the chat'], [2, 3, 'Writing your reply'], [3, 3, 'Sending']]);
  const gate = s.ev('confirm')[0];
  assert.equal(gate.result, true);
  assert.equal(gate.readback, "Send 'I'm ten minutes late' to Sam?");
  assert.ok(s.spoken.some((t) => t.startsWith("Send 'I'm ten minutes late' to Sam?")));
  assert.ok(s.spoken.includes('Sam or Samira?'));
  assert.equal(s.ev('task:done')[0].ok, true);
  assertGatesHonoured(s.log);
  await until(() => s.ev('memory').some((e) => e.observation));
  const mem = s.ev('memory').find((e) => e.observation);
  assert.equal(mem.logged, true);
  assert.deepEqual(Object.keys(mem.observation).sort(), ['actions', 'app', 'category', 'hour', 'success', 'task', 'type', 'weekday']);
  assert.deepEqual(mem.observation.actions, ['messages__openChat', 'messages__reply', 'messages__send']);
  // The privacy floor: nothing the person wrote is anywhere in the stored memory.
  const all = JSON.stringify(await s.kv.getAll('local')) + JSON.stringify(await s.kv.getAll('sync')) + JSON.stringify(await s.kv.getAll('session'));
  assert.ok(all.includes('messages__send') || all.includes('openChat'), 'the log was written');
  assert.ok(!/ten minutes|Sam/.test(all), 'no content or names in memory');
});

test('the observation is a whitelist: no utterance, no params', () => {
  const o = observationOf({ apps: ['messages'], actions: ['messages__reply', "I'm late"], success: true, utterance: 'secret', line: 'secret' }, new Date(2026, 10, 7, 9));
  assert.ok(!JSON.stringify(o).includes('secret') && !JSON.stringify(o).includes("I'm late"));
  assert.equal(o.data.hour, 9);
});

test('stop between the readback and the yes cancels; a later yes sends nothing', async () => {
  const s = await setup();
  const out = await gated(s, "Tell Mum: I'll be home at seven.", async () => { s.clock.t += 650; await s.agent.hear('stop'); });
  assert.equal(out.status, 'stopped');
  s.clock.t += 650;
  await s.agent.hear('yes');
  assert.equal(s.state('messages').lastSent, null);
  assert.equal(s.ev('confirm')[0].result, false);
  assert.equal(s.ev('task:done')[0].ok, false);
  assertGatesHonoured(s.log);
});

test('a yes in the first half second is ignored; the sheet stays; no sends nothing', async () => {
  const s = await setup();
  const out = await gated(s, 'Tell Mum: Please bring the spare charger.', async () => {
    s.clock.t += 50; await s.agent.hear('yes');
    s.clock.t += 650; assert.ok(s.agent.gates.current, 'still gated');
    await s.agent.hear('ok'); assert.ok(s.agent.gates.current, 'ok is not a confirm word');
    await s.agent.hear('no');
  });
  assert.equal(out.status, 'cancelled');
  assert.equal(s.state('messages').lastSent, null);
  assert.equal(out.line, 'Not sent.');
  assert.equal(s.ev('task:done')[0].reason, 'Not sent.');
});

test('Back during a task cancels it', async () => {
  const s = await setup();
  const out = await gated(s, "Tell Mum: I'll meet you by the library.", () => s.agent.stop());
  assert.equal(out.status, 'stopped');
  s.clock.t += 650; await s.agent.hear('yes');
  assert.equal(s.state('messages').lastSent, null);
});

test('pay needs the fingerprint; a stranger cannot pay', async () => {
  const ok = await setup({ fingerprint: async () => true });
  await gated(ok, 'Order my usual from Demo Café.', async () => { ok.clock.t += 650; await ok.agent.hear('pay'); });
  assert.equal(ok.state('shop').orders.length, 1);
  assert.ok(ok.spoken.includes('Check your fingerprint.'));
  assertGatesHonoured(ok.log);

  const no = await setup({ fingerprint: async () => false });
  const p = gated(no, 'Order my usual from Demo Café.', async () => { no.clock.t += 650; await no.agent.hear('pay'); });
  assert.equal((await p).status, 'cancelled', 'no fingerprint: fails closed, nothing paid');
  assert.equal(no.ev('task:done').at(-1).line, 'Not paid.');
  assert.equal(no.state('shop').orders.length, 0);
  assertGatesHonoured(no.log);
});

test('a failed verify stops the task, with no tick, and offers the way out', async () => {
  const s = await setup({ patch: { messages: (a) => ({ reply: { ...a.reply, async run() {} } }) } });
  const out = await s.agent.hear('Draft a message to Mum: Bring the blue bag.');
  assert.equal(out.status, 'failed');
  assert.ok(!s.ev('step:verified').some((e) => e.action === 'messages__reply'));
  assert.ok(s.ev('step:failed').some((e) => e.action === 'messages__reply'));
  assert.equal(out.line, "The reply box did not take it. Try again, I'll do it, or stop.");
  assert.equal(s.ev('task:done')[0].ok, false);
  assert.equal(s.state('messages').draft, '');
});

test('undo works for 8 seconds after a change, then is gone', async () => {
  const s = await setup();
  const write = [{ tool: 'hello__write', app: 'hello', action: 'write', params: { text: 'Lunch on Tuesday.' } }];
  await s.agent.runner.run({ utterance: 'write', steps: write });
  assert.equal(s.state('hello').draft, 'Lunch on Tuesday.');
  const done = s.ev('task:done')[0];
  assert.equal(done.line, 'Done.', 'a short done line on task:done for the panel, never the read() dump');
  assert.equal(done.undo.until, s.clock.t + 8000);
  assert.match(done.undo.label, /^Undo /);
  await s.agent.undo();
  assert.equal(s.state('hello').draft, '');
  await s.agent.runner.run({ utterance: 'write', steps: write });
  await s.agent.hear('undo');
  assert.equal(s.state('hello').draft, '');
  assert.deepEqual(s.ev('undo').map((e) => [e.action, e.ok]), [['hello__write', true], ['hello__write', true]]);
  await s.agent.runner.run({ utterance: 'write', steps: write });
  s.clock.t += 8001;
  await s.agent.hear('undo');
  assert.equal(s.state('hello').draft, 'Lunch on Tuesday.');
  assert.ok(s.spoken.includes('Nothing to undo.'));
});

test('the race, then "save that as Reply to Mum", then run it', async () => {
  const s = await setup();
  await s.agent.hear("Read Mum's message");
  assert.ok(s.spoken.includes('Mum: Lunch on Tuesday?'));
  await s.agent.hear("Reply: Tuesday's fine.");
  await s.agent.hear('Change Tuesday to Wednesday');
  assert.equal(s.state('messages').draft, "Wednesday's fine.");
  await s.agent.hear('Send it'); // saying send is the yes (the lead, 7 Nov)
  assert.deepEqual(s.state('messages').lastSent, { to: 'mum', text: "Wednesday's fine." });
  await s.agent.hear('Save that as Reply to Mum');
  assert.match(s.spoken.at(-1), /^Open the chat with a person \(Mum\), then read .+, then write a reply in the open chat \(Tuesday's fine\), then change one word .+ \(Tuesday, Wednesday\), then send the reply\. Saved as Reply to Mum\.$/);
  assert.ok(s.ev('memory').some((e) => e.workflow?.name === 'Reply to Mum'));
  await s.registry.get('messages').reset();
  const out = await gated(s, 'run Reply to Mum', async () => { s.clock.t += 600; await s.agent.hear('yes'); });
  assert.equal(out.status, 'done');
  assert.deepEqual(s.state('messages').lastSent, { to: 'mum', text: "Wednesday's fine." });
  assertGatesHonoured(s.log);
  // Mine's Run and Delete buttons
  await s.registry.get('messages').reset();
  const again = s.agent.runWorkflow('Reply to Mum');
  await until(() => s.agent.gates.current);
  s.agent.no();
  assert.equal((await again).status, 'cancelled');
  assert.equal(await s.agent.workflows.remove('reply to mum'), true);
  assert.equal((await s.agent.workflows.all()).length, 0);
  assert.equal(await s.agent.workflows.remove('reply to mum'), false);
});

test('a workflow with a slot asks who at run time', async () => {
  const s = await setup();
  await s.agent.hear("Draft a message to Mum: I'm at the library.");
  await s.agent.hear('Save that as message someone.');
  await s.registry.get('messages').reset();
  const p = s.agent.hear('run message someone');
  await until(() => s.spoken.at(-1) === 'Who?');
  await s.agent.hear('Samira');
  assert.equal((await p).status, 'done');
  assert.equal(s.state('messages').currentChat, 'samira');
  assert.equal(s.state('messages').draft, "I'm at the library.");
  assert.equal(s.state('messages').lastSent, null);
});

test('edit a workflow: drop a step', async () => {
  const s = await setup();
  await s.agent.hear("Read Mum's message");
  await s.agent.hear('Save that as my morning');
  await s.agent.hear('Change my morning: drop the read');
  assert.match(s.spoken.at(-1), /^My morning: Open the chat with a person \(Mum\)\.$/);
});

test('"how do I…" is a dry run that speaks the hints, then does it on request', async () => {
  const s = await setup();
  const before = JSON.stringify(s.state('calendar'));
  const out = await s.agent.hear('How do I move a meeting?');
  assert.equal(out.status, 'taught');
  assert.equal(s.spoken.at(-1), `Open Calendar, then ${s.registry.get('calendar').actions.move.describe}. Shall I do it?`);
  assert.equal(JSON.stringify(s.state('calendar')), before);
  assert.ok(!s.ev('task:start').length);
  await s.agent.hear('do it');
  await until(() => s.spoken.at(-1) === "Say it in full, and I'll do it.");
  await s.agent.hear('How do I move a meeting?');
  const done = await s.agent.hear('Do it: move lunch with Mum to Wednesday.');
  assert.equal(done.status, 'done');
  assert.equal(s.state('calendar').events.find((e) => e.title === 'Lunch with Mum').day, 'Wednesday');
});

test('Teach me: each step waits for the person, then is verified', async () => {
  const s = await setup();
  await s.agent.hear('How do I send a message to Mum?');
  const p = s.agent.hear('walk me through');
  await until(() => s.spoken.includes('Your chats are buttons under the Messages heading'));
  assert.equal(s.state('messages').currentChat, null);
  s.doc.body.querySelector('[data-chat="mum"]').click(); // the person taps Mum's chat themselves
  await until(() => s.ev('step:verified').some((e) => e.action === 'messages__openChat'));
  s.agent.stop();
  assert.equal((await p).status, 'stopped');
  assert.equal(s.ev('task:done').at(-1).ok, false);
});

test('refusals and the unknown: said, no task, nothing remembered', async () => {
  const s = await setup();
  assert.equal((await s.agent.hear('Transfer twenty pounds from my bank account to Samira.')).status, 'refused');
  assert.match(s.spoken.at(-1), /bank/);
  await s.agent.hear('Open Lantern Music and play my quiet playlist.');
  assert.match(s.spoken.at(-1), /don't have/);
  await s.agent.hear('Mum messa... shh... brng... [unintelligible]...');
  assert.match(s.spoken.at(-1), /didn't catch/);
  assert.ok(!s.log.some((e) => e.name === 'task:start' || e.name === 'memory'));
});

test('reserved words inside content stay content', async () => {
  const s = await setup();
  await s.agent.hear('Draft a message to Mum: Please stop worrying, say yes to lunch, and call me tomorrow.');
  assert.equal(s.state('messages').draft, 'Please stop worrying, say yes to lunch, and call me tomorrow.');
  assert.equal(s.state('messages').lastSent, null);
});

test("where am I reads the app's place", async () => {
  const s = await setup();
  await s.agent.hear('Draft a message to Mum: Hello.');
  await s.agent.hear('Where am I?');
  assert.equal(s.spoken.at(-1), placeLine(s.registry.get('messages').place()));
  assert.match(s.spoken.at(-1), /^Mum's chat, your reply/);
  assert.equal(s.ev('place').at(-1).app, 'messages');
  assert.equal(placeLine({ where: "Mum's chat", item: 'your reply', n: 2, of: 2, next: 'send it' }), "Mum's chat, your reply, sentence 2 of 2.");
});

test('three identical runs propose "just do it"; never means never', async () => {
  const s = await setup();
  for (let i = 0; i < 3; i++) await s.agent.hear("Read Mum's message");
  await until(() => s.ev('memory').some((e) => e.proposal));
  assert.match(s.spoken.at(-1), /^Want me to just do this one from now on\? Yes, not now, or never\?$/);
  assert.equal((await s.agent.hear('Never.')).answer, 'never');
  const n = s.ev('memory').filter((e) => e.proposal).length;
  for (let i = 0; i < 3; i++) await s.agent.hear("Read Mum's message");
  await tick(); await tick();
  assert.equal(s.ev('memory').filter((e) => e.proposal).length, n);
});

test('stop learning: nothing is logged while paused', async () => {
  const s = await setup();
  await s.agent.memory.stopLearning(true);
  await s.agent.hear("Read Mum's message");
  await until(() => s.ev('memory').length);
  assert.equal(s.ev('memory')[0].logged, false);
});

test('Ask me pauses a beat before a change, never before reading or opening', async () => {
  const s = await setup({ agency: () => 'ask' });
  const t0 = s.clock.t;
  await s.agent.hear('Draft a message to Mum: Hello.');
  assert.equal(s.clock.t - t0, BEAT_MS, 'one beat, before the reply');
  const t1 = s.clock.t;
  await s.agent.hear("Read Mum's message");
  assert.equal(s.clock.t, t1, 'no beat before opening or reading');
});

test("narration and who speaks: Murmur's voice or the status region, never both", async () => {
  const status = { attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
  let who = 'murmur';
  const heard = [];
  const voice = createVoice({ status, who: () => who, speak: async (t) => heard.push(t) });
  await voice.say('Opening the chat');
  assert.deepEqual(heard, ['Opening the chat']);
  assert.equal(status.attrs['aria-live'], 'off');
  assert.equal(status.attrs.role, 'status');
  who = 'reader';
  await voice.say('Sent.');
  assert.deepEqual(heard, ['Opening the chat']);
  assert.equal(status.attrs['aria-live'], 'polite');
  assert.equal(status.textContent, 'Sent.');

  const s = await setup({ agency: () => 'ask' });
  await s.agent.hear("Read Mum's message");
  assert.deepEqual(s.spoken.slice(0, 3), ['On it.', 'Reading', 'Mum: Lunch on Tuesday?'], '"Opening the chat" is dropped: its step was done before its turn');
  const quick = await setup(); // Just do it: the step earcons carry the steps; the voice says the result
  await quick.agent.hear("Read Mum's message");
  assert.ok(!quick.spoken.includes('Opening the chat'));
  assert.equal(quick.spoken.at(-1), 'Mum: Lunch on Tuesday?');
  assert.equal(s.spoken.at(-1), 'Mum: Lunch on Tuesday?', 'a read ends on what was read, not a summary of the screen');
  assert.deepEqual(s.ev('say').map((e) => e.text), s.spoken, 'every sentence heard is on the record, once');
  assert.equal(gerund('Change a word'), 'Changing a word');
  assert.equal(gerund('Stop the timer'), 'Stopping the timer');
});

test('Ask me, Vertical 1: no clipped "Opening the chat" before "Sam or Samira?", and no beat before typing when Send asks anyway', async () => {
  const s = await setup({ agency: () => 'ask' });
  const t0 = s.clock.t;
  const out = await gated(s, "Text Sam I'm ten minutes late", async () => { s.clock.t += 600; await s.agent.hear('send'); }, { choose: 'Sam' });
  assert.equal(out.status, 'done');
  const q = s.spoken.findIndex((t) => / or .+\?$/.test(t));
  assert.ok(!s.spoken.slice(0, q).includes('Opening the chat'), 'the question replaced the step line');
  assert.equal(s.clock.t - t0, 600, 'no 700 ms beat: the send gate is the moment to say no');
});

test('a travel hold (a pay gate that reads "held for 24 hours") asks "Hold?", a payment still asks "Pay?"', () => {
  const said = [];
  const g = createGates({ say: async (t) => { said.push(t); } });
  g.ask({ gate: 'pay', readback: 'The 9:40 to Lisbon, £120, held for 24 hours.' }); g.cancel();
  g.ask({ gate: 'pay', readback: 'Pay Sam £20. From Murmur Bank.' }); g.cancel();
  assert.deepEqual(said, ['The 9:40 to Lisbon, £120, held for 24 hours. Hold?', 'Pay Sam £20. From Murmur Bank. Pay?']);
});

test('Stop or No while the fingerprint is up withdraws the prompt (its signal aborts), and a late match pays nothing', async () => {
  let t = 10_000, sig = null, match;
  const g = createGates({ clock: { now: () => t }, fingerprint: (signal) => { sig = signal; return new Promise((r) => { match = r; }); } });
  const paid = g.ask({ gate: 'pay', readback: 'A taxi to the Station, £14.' }); t += 600;
  const yes = g.yes(); await new Promise((r) => setTimeout(r, 0));
  assert.ok(sig && !sig.aborted, 'the fingerprint gets a live signal');
  g.cancel(); // what runner.stop() does on a said or typed Stop
  assert.equal(sig.aborted, true, 'Stop withdraws the WebAuthn prompt');
  match(true); // the finger lands late
  assert.equal(await yes, false); assert.equal(await paid, false, 'nothing paid');
  const g2 = createGates({ clock: { now: () => t }, fingerprint: (signal) => { sig = signal; return new Promise(() => {}); } });
  g2.ask({ gate: 'pay', readback: 'Pay?' }); t += 600; g2.yes(); await new Promise((r) => setTimeout(r, 0));
  g2.no(); assert.equal(sig.aborted, true, 'No withdraws it too');
});

test('a No to a hold says "Not held.", a No to a payment still says "Not paid."', async () => {
  const { runAction } = await import('../public/sdk/run.js');
  const no = async (readback) => {
    const action = { gate: 'pay', readback: () => readback, run() {}, verify: () => true };
    const app = { id: 't', name: 'T', state: () => ({}), read: () => '', place: () => ({}) };
    const registry = { resolve: () => ({ app, action }) };
    return (await runAction({ registry, name: 't__x', params: {}, bus: { emit() {} }, ctxFor: () => ({ confirm: async () => false }) })).reason;
  };
  assert.equal(await no('The 9:40 to Lisbon, £120, held for 24 hours. Hold?'), 'Not held.');
  assert.equal(await no('Pay Sam £20. From Murmur Bank. Pay?'), 'Not paid.');
});

test('a read-only, refused or No\'d task keeps the last change undoable, still 8 s from that change', async () => {
  const s = await setup();
  const write = [{ tool: 'hello__write', app: 'hello', action: 'write', params: { text: 'Lunch on Tuesday.' } }];
  await s.agent.runner.run({ utterance: 'write', steps: write });
  s.clock.t += 2000;
  await s.agent.hear("Read Mum's message");
  await s.agent.hear('Check my Barclays balance');
  s.clock.t += 2000;
  await s.agent.hear('undo');
  assert.equal(s.state('hello').draft, '', 'undone after a read and a refusal');
  await s.agent.runner.run({ utterance: 'write', steps: write });
  s.clock.t += 6000;
  await s.agent.hear("Read Mum's message");
  s.clock.t += 2001;
  await s.agent.hear('undo');
  assert.equal(s.state('hello').draft, 'Lunch on Tuesday.', 'the 8 s run from the change, not from the read');
});

test('never "Done." after a refusal the app said, or a step that changed nothing; "Done." after a real change', async () => {
  const s = await setup({ patch: { hello: () => ({
    sorry: { describe: 'Say sorry', doing: 'Saying sorry', hint: 'Sorry', params: { type: 'object', properties: {} }, async run(p, ctx) { await ctx.say('I cannot get the weather right now.'); }, verify: () => true },
    noop: { describe: 'Do nothing', doing: 'Doing nothing', hint: 'Nothing', params: { type: 'object', properties: {} }, async run() {}, verify: () => true },
  }) } });
  for (const action of ['sorry', 'noop']) {
    const r = await s.agent.runner.run({ utterance: action, steps: [{ tool: `hello__${action}`, app: 'hello', action, params: {} }] });
    assert.equal(r.line, '', action);
    assert.ok(!s.spoken.includes('Done.'), `${action}: ${s.spoken.join(' | ')}`);
  }
  const r = await s.agent.runner.run({ utterance: 'write', steps: [{ tool: 'hello__write', app: 'hello', action: 'write', params: { text: 'Lunch.' } }] });
  assert.notEqual(r.line, '', 'a real change still ends on its line');
});

test('"Call Mum" with no calls app opens her chat and says so, never "Done."', async () => {
  const s = await setup();
  await s.agent.hear('Call Mum');
  assert.equal(s.state('messages').currentChat, 'mum');
  assert.ok(s.spoken.includes("I can't call yet. I've opened Mum's chat."), s.spoken.join(' | '));
  assert.ok(!s.spoken.includes('Done.'), s.spoken.join(' | '));
});

test('a read-only task:done carries the live Undo with its own expiry, so the panel keeps the button', async () => {
  const s = await setup();
  await s.agent.runner.run({ utterance: 'write', steps: [{ tool: 'hello__write', app: 'hello', action: 'write', params: { text: 'Lunch.' } }] });
  const until = s.ev('task:done').at(-1).undo?.until;
  assert.ok(until, 'the change offers Undo');
  s.clock.t += 2000;
  await s.agent.hear("Read Mum's message");
  assert.deepEqual(s.ev('task:done').at(-1).undo, { label: s.ev('task:done').at(-2).undo.label, until }, 'same Undo, same expiry');
  s.clock.t = until + 1;
  await s.agent.hear("Read Mum's message");
  assert.equal(s.ev('task:done').at(-1).undo, undefined, 'an expired Undo is not offered');
});

test('Ask me: a step line is never said once its step is done, and "Writing your reply" is left to the readback', async () => {
  const s = await setup({ agency: () => 'ask' });
  await gated(s, "Text Sam I'm ten minutes late", async () => { s.clock.t += 600; await s.agent.hear('send'); }, { choose: 'Sam' });
  assert.ok(!s.spoken.some((t) => /^Writing/.test(t)), s.spoken.join(' | '));
  const at = s.spoken.length;
  await s.agent.hear("Read Mum's message");
  assert.ok(!s.spoken.slice(at).includes('Opening the chat'), 'its step was done before its turn');
});

test('a spoken "hold" answers "Hold?" and still checks the fingerprint; it never confirms a payment or a send', async () => {
  const { hear } = await import('../public/agent/words.js');
  let prints = 0;
  const clock = { t: 0, now() { return this.t; } };
  const g = createGates({ say: async () => {}, clock, fingerprint: async () => { prints++; return true; } });
  const asked = g.ask({ gate: 'pay', readback: 'The 9:40 to Lisbon, £120, held for 24 hours.' });
  clock.t = 1000;
  assert.deepEqual(hear('hold', { gate: g.current, now: clock.t }).words, [{ kind: 'confirm', word: 'hold' }]);
  await g.yes();
  assert.equal(await asked, true); assert.equal(prints, 1, 'the pay fingerprint is kept');
  const pay = { gate: 'pay', readback: 'Pay Sam £20. From Murmur Bank.', openedAt: 0 };
  assert.equal(hear('hold', { gate: pay, now: 1000 }).words[0].kind, 'ignored');
  assert.equal(hear('hold', { gate: { gate: 'send', readback: 'To Sam: late.', openedAt: 0 }, now: 1000 }).words[0].kind, 'ignored');
});

test('an app the phone does not have: Murmur says it is bringing it over, and Inside hears app:import', async () => {
  const s = await setup();
  const seen = []; s.bus.on('app:import', (e) => seen.push(e.name));
  await s.agent.hear('open the camera'); await until(() => seen.length);
  assert.deepEqual(seen, ['Camera']);
  assert.ok(s.spoken.some((l) => /I don't have Camera yet\. I'm starting to bring it over from your phone now\./.test(l)), s.spoken.join(' | '));
});

test('a popular app the phone lacks is acted out: one line, app:open, ticks on /stage, never which-app, never a send', async () => {
  const s = await setup();
  const opened = []; s.bus.on('app:open', (e) => opened.push(e.name));
  await s.agent.hear('play my liked songs on Spotify'); await until(() => s.ev('task:done').length);
  assert.deepEqual(opened, ['Spotify']);
  assert.ok(s.spoken.includes('Opening Spotify. Playing your liked songs.'), s.spoken.join(' | '));
  assert.equal(s.ev('step:verified').length, 3);
  assert.equal(s.ev('ask').length, 0, 'never asks which app');
  const t = await setup();
  await t.agent.hear('send a WhatsApp to Priya'); await until(() => t.ev('task:done').length);
  assert.ok(t.spoken.some((l) => /won't send, pay, call or delete/.test(l)), t.spoken.join(' | '));
  assert.ok(!t.spoken.some((l) => /\bsent\b/i.test(l)));
});
