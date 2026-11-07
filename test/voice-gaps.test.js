// No silence between Murmur's lines: a step's line queued behind "On it." starts as the ack ends, with no hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { createAgent, ACK, NARRATION_HOLD_MS } from '../public/agent/index.js';
import { phone, memoryKV } from './agent-fixtures.js';

test('a narration queued behind the ack starts within a tick of it, not after the narration hold', async () => {
  const { librarian } = createToolkit({ kv: memoryKV() });
  const p = await phone();
  const lines = [];
  const speak = async (text) => { const at = performance.now(); await new Promise((r) => setTimeout(r, 80)); lines.push({ text, at, end: performance.now() }); };
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, librarian, agency: () => 'ask', planOpts: { offline: true }, speak });
  await agent.hear('Make the text bigger');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(lines[0].text, ACK);
  const gap = lines[1].at - lines[0].end;
  assert.ok(gap < NARRATION_HOLD_MS / 2, `the second line waited ${Math.round(gap)} ms after the ack ended`);
});
