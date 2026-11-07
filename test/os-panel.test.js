import test from 'node:test';
import assert from 'node:assert/strict';
import { IDLE, reduce, placeLine } from '../public/os/panel.js';
import { EARCONS, HAPTICS } from '../public/os/earcons.js';

test('the work panel follows a task: step, ticks, sentences, then the Done line with undo', () => {
  const run = (events) => events.reduce((s, [n, e]) => reduce(s, n, e), IDLE);
  const s = run([
    ['place', { where: "Sam's chat" }],
    ['task:start', { task: 't' }],
    ['step:start', { label: 'Writing to Sam', n: 1, of: 2 }],
    ['step:verified', {}],
    ['say', { text: 'Written.' }],
    ['step:start', { label: 'Sending', n: 2, of: 2 }],
    ['step:failed', { reason: 'Not sent.' }],
    ['task:done', { ok: false, line: 'Not sent.', undo: { label: 'the draft', until: 1 } }],
  ]);
  assert.equal(s.on, false);
  assert.equal(s.place, "Sam's chat");
  assert.deepEqual(s.ticks, [{ label: 'Writing to Sam', ok: true }, { label: 'Sending', ok: false }]);
  assert.deepEqual(s.lines, ['Written.']);
  assert.deepEqual(s.done, { line: 'Not sent.', undo: { label: 'the draft', until: 1 } });
  assert.equal(reduce(s, 'undo', { ok: true }).done.line, 'Undone.');
  assert.deepEqual(reduce(IDLE, 'say', { text: 'idle chatter' }).lines, [], 'no sentences collect outside a task');
  assert.equal(placeLine({ where: "Mum's chat", item: 'your reply', n: 2, of: 2 }), "Mum's chat · your reply · 2 of 2");
});

test('six earcons plus undo, each with a buzz, all 50 to 200 ms', () => {
  assert.deepEqual(Object.keys(EARCONS).sort(), ['done', 'gate', 'heard', 'step', 'stopped', 'summon', 'undo']);
  for (const [k, notes] of Object.entries(EARCONS)) {
    const end = Math.max(...notes.map(([, at, len]) => at + len));
    assert.ok(end >= 0.05 && end <= 0.2, `${k} lasts ${end}s`);
    assert.ok(k in HAPTICS);
  }
});
