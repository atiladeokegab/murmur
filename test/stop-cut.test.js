// Said Stop and Undo cut the line playing now (the shell's hush), not only the queue behind it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { createAgent, ACK } from '../public/agent/index.js';
import { phone, memoryKV } from './agent-fixtures.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(f, n = 400) { for (let i = 0; i < n; i++) { if (f()) return; await wait(5); } throw new Error('timed out'); }

// A voice like the shell's: a line plays until it ends (60 ms) or the shell's hush cuts it.
async function setup() {
  const { librarian } = createToolkit({ kv: memoryKV() });
  const p = await phone();
  const started = [], cut = [];
  let playing = null;
  const speak = (t) => new Promise((r) => { started.push(t); const end = (ok) => { clearTimeout(timer); playing = null; if (!ok) cut.push(t); r(ok); }; const timer = setTimeout(() => end(true), 60); playing = end; });
  const onCut = () => playing?.(false), stops = [];
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, librarian, agency: () => 'just', planOpts: { offline: true }, speak, onCut, onStop: () => stops.push('stopAll') });
  return { ...p, agent, started, cut, stops };
}

test('said "stop" cuts the line already playing', async () => {
  const s = await setup();
  s.agent.hear('Make the text bigger');
  await until(() => s.started.length);
  await s.agent.hear('stop talking');
  assert.deepEqual(s.cut, [ACK], 'the playing line was cut, not left to finish');
  await wait(150);
  assert.deepEqual(s.started, [ACK], 'and nothing queued plays after it');
  assert.deepEqual(s.stops, ['stopAll'], "a said or typed Stop runs the shell's whole Stop (sheets, a pending fingerprint)");
  await s.agent.stop();
  assert.deepEqual(s.stops, ['stopAll'], "the shell's own Stop button does not loop back into it");
});

test('undo cuts the stale lines and says "Undone." at once', async () => {
  const s = await setup();
  const done = s.agent.hear('Make the text bigger');
  await until(() => s.state('look').size === 150);
  await done.catch(() => {});
  const before = s.started.length;
  s.agent.hear('Make the text bigger'); // a second change, its lines still queued
  await until(() => s.state('look').size === 200 && s.started.length > before);
  const at = s.started.length, cutBefore = s.cut.length;
  await s.agent.hear('undo');
  await until(() => s.started.includes('Undone.'));
  assert.deepEqual(s.started.slice(at), ['Undone.'], 'no queued line plays before "Undone."');
  assert.equal(s.cut.length, cutBefore + 1, 'the line playing when Undo was said is cut');
  assert.deepEqual(s.stops, [], 'Undo cuts the line, it does not stop everything');
  assert.equal(s.state('look').size, 150);
  const after = s.started.slice(s.started.indexOf('Undone.') + 1);
  assert.deepEqual(after, [], `nothing stale after Undone.: ${after}`);
});
