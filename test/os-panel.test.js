import test from 'node:test';
import assert from 'node:assert/strict';
import { IDLE, reduce, placeLine } from '../public/os/panel.js';

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

test('a line outside any task clears the last task\'s ticks; the task\'s own done line keeps them', () => {
  let s = reduce(IDLE, 'task:start', { task: 't1' });
  s = reduce(s, 'step:start', { label: 'Sending' }); s = reduce(s, 'step:verified', {});
  s = reduce(s, 'task:done', { task: 't1', ok: true, line: 'Sent.' });
  assert.equal(reduce(s, 'say', { task: 't1', text: 'Sent.' }).ticks.length, 1);
  const after = reduce(s, 'say', { text: "I didn't catch that." });
  assert.deepEqual([after.ticks, after.done, after.lines], [[], null, []]);
});
