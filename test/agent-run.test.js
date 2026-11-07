import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { createAgent } from '../public/agent/index.js';
import { attachNarration, placeLine } from '../public/agent/narrate.js';
import { createVoice } from '../public/voice/route.js';
import { gerund } from '../public/agent/runner.js';
import { observationOf } from '../public/agent/memory.js';
import { stubMessages, stubShop, stubCalendar, testBus, memoryKV } from './agent-fixtures.js';

const tick = () => new Promise((r) => setImmediate(r));
async function until(f, n = 2000) { for (let i = 0; i < n; i++) { if (f()) return; await tick(); } throw new Error('timed out'); }

function setup({ broken = false, fingerprint = async () => true, agency = () => 'just' } = {}) {
  const clock = { t: Date.UTC(2026, 10, 7, 8, 40), now() { return this.t; } };
  const sleep = async (ms) => { clock.t += ms; await tick(); };
  const kv = memoryKV();
  const { librarian } = createToolkit({ kv, clock });
  const bus = testBus();
  const taps = [];
  const apps = [stubMessages({ broken }), stubShop(), stubCalendar()];
  const ctxFor = (a) => ({
    tap: async (el) => { taps.push(`${a.id}:${el.id}`); bus.emit('cursor', { app: a.id, target: el.id }); },
    type: async () => {}, say: async (text) => bus.emit('say', { text }), kv: null,
  });
  const agent = createAgent({ registry: apps, bus, ctxFor, librarian, fingerprint, agency, clock, sleep, planOpts: { offline: true } });
  const spoken = [];
  bus.on('say', (e) => spoken.push(e.text));
  const state = (id) => apps.find((a) => a.id === id).state();
  return { agent, bus, clock, taps, kv, state, spoken, librarian, apps };
}

/** Say something that will open a gate, wait for the sheet, then let `after` answer it. */
async function gated(s, utterance, after) {
  const p = s.agent.hear(utterance);
  await until(() => s.bus.log.some((e) => e.type === 'gate:open'));
  await after();
  return p;
}

function assertGatesHonoured(log) {
  // No gated action ever ran without a confirm event whose result was yes, just before it.
  log.forEach((e, i) => {
    if (e.type === 'step:start' && e.gate) {
      const c = log.slice(0, i).reverse().find((x) => x.type === 'confirm');
      assert.equal(c?.result, 'yes', `gated ${e.tool} ran without a yes`);
    }
  });
  // No tick without a verify: every step:verified follows its own step:start.
  log.forEach((e, i) => { if (e.type === 'step:verified') assert.ok(log.slice(0, i).some((x) => x.type === 'step:start' && x.tool === e.tool)); });
}

test('Vertical 1: "Text Sam I\'m ten minutes late" is planned, run with the cursor, verified, gated and logged', async () => {
  const s = setup();
  const out = await gated(s, "Text Sam I'm ten minutes late", async () => { s.clock.t += 600; await s.agent.hear('send'); });
  assert.equal(out.status, 'done');
  assert.deepEqual(s.state('messages').lastSent, { to: 'Sam', text: "I'm ten minutes late." });
  assert.deepEqual(s.taps, ['messages:chat-Sam', 'messages:reply', 'messages:send']);
  const types = s.bus.log.map((e) => e.type).filter((t) => /^(task|step|confirm|gate)/.test(t));
  assert.deepEqual(types, ['task:start', 'step:start', 'step:verified', 'step:start', 'step:verified', 'gate:open', 'confirm', 'step:start', 'step:verified', 'task:done']);
  const plan = s.bus.log.find((e) => e.type === 'plan');
  assert.equal(plan.provider, 'demo');
  const gate = s.bus.log.find((e) => e.type === 'confirm');
  assert.equal(gate.readback, "To Sam: I'm ten minutes late.");
  assert.ok(s.spoken.includes("To Sam: I'm ten minutes late. Send it?"));
  assertGatesHonoured(s.bus.log);
  await until(() => s.bus.log.some((e) => e.type === 'memory' && e.observation));
  const mem = s.bus.log.find((e) => e.type === 'memory' && e.observation);
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
  const s = setup();
  const out = await gated(s, "Tell Mum: I'll be home at seven.", async () => { s.clock.t += 650; await s.agent.hear('stop'); });
  assert.equal(out.status, 'stopped');
  s.clock.t += 650;
  await s.agent.hear('yes');
  assert.equal(s.state('messages').lastSent, null);
  assert.equal(s.bus.log.find((e) => e.type === 'confirm').result, 'stop');
  assertGatesHonoured(s.bus.log);
});

test('a yes in the first half second is ignored; the sheet stays; no sends nothing', async () => {
  const s = setup();
  const out = await gated(s, 'Tell Mum: Please bring the spare charger.', async () => {
    s.clock.t += 50; await s.agent.hear('yes');
    s.clock.t += 650; assert.ok(s.agent.gates.current, 'still gated');
    await s.agent.hear('ok'); assert.ok(s.agent.gates.current, 'ok is not a confirm word');
    await s.agent.hear('no');
  });
  assert.equal(out.status, 'cancelled');
  assert.equal(s.state('messages').lastSent, null);
  assert.equal(out.line, 'Not sent.');
});

test('Back during a task cancels it', async () => {
  const s = setup();
  const out = await gated(s, "Tell Mum: I'll meet you by the library.", () => s.agent.stop());
  assert.equal(out.status, 'stopped');
  s.clock.t += 650; await s.agent.hear('yes');
  assert.equal(s.state('messages').lastSent, null);
});

test('pay needs the fingerprint; a stranger cannot pay', async () => {
  const ok = setup({ fingerprint: async () => true });
  await gated(ok, 'Order my usual from Demo Café.', async () => { ok.clock.t += 650; await ok.agent.hear('pay'); });
  assert.equal(ok.state('shop').paid, true);
  assert.ok(ok.spoken.includes('Check your fingerprint.'));
  assert.equal(ok.bus.log.find((e) => e.type === 'confirm').fingerprint, true);

  const no = setup({ fingerprint: async () => false });
  const p = gated(no, 'Order my usual from Demo Café.', async () => { no.clock.t += 650; await no.agent.hear('pay'); });
  await until(() => no.spoken.includes('Not you, or not read. Try again, or No.'));
  assert.equal(no.state('shop').paid, false);
  await no.agent.hear('no');
  assert.equal((await p).status, 'cancelled');
  assert.equal(no.state('shop').paid, false);
  assertGatesHonoured(no.bus.log);
});

test('a failed verify stops the task, with no tick, and offers the way out', async () => {
  const s = setup({ broken: true });
  const out = await s.agent.hear('Draft a message to Mum: Bring the blue bag.');
  assert.equal(out.status, 'failed');
  assert.ok(!s.bus.log.some((e) => e.type === 'step:verified' && e.tool === 'messages__reply'));
  assert.ok(s.bus.log.some((e) => e.type === 'step:failed' && e.tool === 'messages__reply'));
  assert.match(out.line, /Try again, I'll do it, or stop\.$/);
  assert.equal(s.state('messages').draft, '');
});

test('undo works for 8 seconds after a change, then is gone', async () => {
  const s = setup();
  await s.agent.hear('Draft a message to Mum: Lunch on Tuesday.');
  assert.equal(s.state('messages').draft, 'Lunch on Tuesday.');
  await s.agent.hear('undo');
  assert.equal(s.state('messages').draft, '');
  await s.agent.hear('Draft a message to Mum: Lunch on Tuesday.');
  s.clock.t += 8001;
  await s.agent.hear('undo');
  assert.equal(s.state('messages').draft, 'Lunch on Tuesday.');
  assert.ok(s.spoken.includes('Nothing to undo.'));
});

test('the race, then "save that as Reply to Mum", then run it', async () => {
  const s = setup();
  await s.agent.hear("Read Mum's message");
  await s.agent.hear("Reply: Tuesday's fine.");
  await s.agent.hear('Change Tuesday to Wednesday');
  assert.equal(s.state('messages').draft, "Wednesday's fine.");
  await gated(s, 'Send it', async () => { s.clock.t += 600; await s.agent.hear('send'); });
  assert.deepEqual(s.state('messages').lastSent, { to: 'Mum', text: "Wednesday's fine." });
  await s.agent.hear('Save that as Reply to Mum');
  assert.match(s.spoken.at(-1), /^Open a chat \(Mum\), then read it, then reply \(Tuesday's fine\), then change a word \(Tuesday, Wednesday\), then send the reply\. Saved as Reply to Mum\.$/);
  assert.ok(s.bus.log.some((e) => e.type === 'memory' && e.workflow?.name === 'Reply to Mum'));
  assert.match(await s.agent.workflows.explain('reply to mum'), /^Reply to Mum: Open a chat/);
  s.apps[0].reset();
  const n = s.bus.log.length;
  const out = await gated({ ...s, bus: { log: { some: (f) => s.bus.log.slice(n).some(f) } } }, 'run Reply to Mum', async () => { s.clock.t += 600; await s.agent.hear('yes'); });
  assert.equal(out.status, 'done');
  assert.deepEqual(s.state('messages').lastSent, { to: 'Mum', text: "Wednesday's fine." });
  assertGatesHonoured(s.bus.log);
});

test('a workflow with a slot asks who at run time', async () => {
  const s = setup();
  await s.agent.hear("Draft a message to Mum: I'm at the library.");
  await s.agent.hear('Save that as message someone.');
  s.apps[0].reset();
  const p = s.agent.hear('run message someone');
  await until(() => s.spoken.at(-1) === 'Who?');
  await s.agent.hear('Samira');
  assert.equal((await p).status, 'done');
  assert.equal(s.state('messages').open, 'Samira');
  assert.equal(s.state('messages').draft, "I'm at the library.");
  assert.equal(s.state('messages').lastSent, null);
});

test('edit a workflow: drop a step', async () => {
  const s = setup();
  await s.agent.hear("Read Mum's message");
  await s.agent.hear('Save that as my morning');
  await s.agent.hear('Change my morning: drop the read');
  assert.match(s.spoken.at(-1), /^My morning: Open a chat \(Mum\)\.$/);
});

test('"how do I…" is a dry run that speaks the hints, then does it on request', async () => {
  const s = setup();
  const before = JSON.stringify(s.state('calendar'));
  const out = await s.agent.hear('How do I move a meeting?');
  assert.equal(out.status, 'taught');
  assert.equal(s.spoken.at(-1), 'Open Calendar, then Open the event, then the day button. Shall I do it, or walk you through?');
  assert.equal(JSON.stringify(s.state('calendar')), before);
  assert.ok(!s.bus.log.some((e) => e.type === 'task:start'));
  await s.agent.hear('do it');
  assert.equal(s.spoken.at(-1), "Say it in full, and I'll do it.");
  await s.agent.hear('How do I move a meeting?');
  const done = await s.agent.hear('Do it: move lunch with Mum to Wednesday.');
  assert.equal(done.status, 'done');
  assert.equal(s.state('calendar').events[0].day, 'Wednesday');
});

test('Teach me: each step waits for the person, then is verified', async () => {
  const s = setup();
  await s.agent.hear('How do I send a message to Sam?');
  const p = s.agent.hear('walk me through');
  await until(() => s.spoken.includes('Chats are in a list; each is a button with the name'));
  assert.equal(s.state('messages').open, null);
  // The person taps Sam's chat themselves (the stub's own run, as their tap would).
  await s.apps[0].actions.openChat.run({ name: 'Sam' }, { tap: async () => {} });
  await until(() => s.bus.log.some((e) => e.type === 'step:verified' && e.tool === 'messages__openChat'));
  s.agent.stop();
  assert.equal((await p).status, 'stopped');
});

test('refusals and the unknown: said, no task, nothing remembered', async () => {
  const s = setup();
  assert.equal((await s.agent.hear('Transfer twenty pounds from my bank account to Samira.')).status, 'refused');
  assert.match(s.spoken.at(-1), /bank/);
  await s.agent.hear('Open Lantern Music and play my quiet playlist.');
  assert.match(s.spoken.at(-1), /don't have/);
  await s.agent.hear('Mum messa... shh... brng... [unintelligible]...');
  assert.match(s.spoken.at(-1), /didn't catch/);
  assert.ok(!s.bus.log.some((e) => e.type === 'task:start' || e.type === 'memory'));
});

test('reserved words inside content stay content', async () => {
  const s = setup();
  await s.agent.hear('Draft a message to Mum: Please stop worrying, say yes to lunch, and call me tomorrow.');
  assert.equal(s.state('messages').draft, 'Please stop worrying, say yes to lunch, and call me tomorrow.');
  assert.equal(s.state('messages').lastSent, null);
});

test('where am I reads the app\'s place', async () => {
  const s = setup();
  await s.agent.hear('Draft a message to Mum: Hello.');
  await s.agent.hear('Where am I?');
  assert.equal(s.spoken.at(-1), "Mum's chat, your reply.");
  assert.equal(placeLine({ where: "Mum's chat", item: 'your reply', n: 2, of: 2, next: 'send it' }), "Mum's chat, your reply, sentence 2 of 2. Next: send it?");
});

test('three identical runs propose "just do it"; never means never', async () => {
  const s = setup();
  for (let i = 0; i < 3; i++) await s.agent.hear("Read Mum's message");
  await until(() => s.bus.log.some((e) => e.type === 'memory' && e.proposal));
  assert.match(s.spoken.at(-1), /^Want me to just do this one from now on\? Yes, not now, or never\?$/);
  assert.equal((await s.agent.hear('Never.')).answer, 'never');
  const n = s.bus.log.filter((e) => e.type === 'memory' && e.proposal).length;
  for (let i = 0; i < 3; i++) await s.agent.hear("Read Mum's message");
  await tick(); await tick();
  assert.equal(s.bus.log.filter((e) => e.type === 'memory' && e.proposal).length, n);
});

test('stop learning: nothing is logged while paused', async () => {
  const s = setup();
  await s.agent.memory.stopLearning(true);
  await s.agent.hear("Read Mum's message");
  await until(() => s.bus.log.some((e) => e.type === 'memory'));
  assert.equal(s.bus.log.find((e) => e.type === 'memory').logged, false);
});

test('Ask me pauses a beat before a change, never before reading or opening', async () => {
  const s = setup({ agency: () => 'ask' });
  await s.agent.hear('Draft a message to Mum: Hello.');
  const next = s.bus.log.filter((e) => e.type === 'step:next').map((e) => e.tool);
  assert.deepEqual(next, ['messages__reply']);
});

test('narration and who speaks: Murmur\'s voice or the status region, never both', async () => {
  const status = { attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
  let who = 'murmur';
  const heard = [];
  const voice = createVoice({ status, who: () => who, speak: async (t) => heard.push(t) });
  await voice.say('Opening a chat');
  assert.deepEqual(heard, ['Opening a chat']);
  assert.equal(status.attrs['aria-live'], 'off');
  assert.equal(status.attrs.role, 'status');
  who = 'reader';
  await voice.say('Sent.');
  assert.deepEqual(heard, ['Opening a chat']);
  assert.equal(status.attrs['aria-live'], 'polite');
  assert.equal(status.textContent, 'Sent.');

  const s = setup();
  const lines = [];
  attachNarration(s.bus, { say: (t) => lines.push(t) });
  await s.agent.hear("Read Mum's message");
  assert.deepEqual(lines.slice(0, 2), ['Opening a chat', 'Reading it']);
  assert.equal(lines.at(-1), "Mum's chat. The last says: Lunch on Tuesday?");
  assert.equal(gerund('Change a word'), 'Changing a word');
  assert.equal(gerund('Stop the timer'), 'Stopping the timer');
});
