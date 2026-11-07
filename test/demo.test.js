import test from 'node:test';
import assert from 'node:assert/strict';
import { chat, menuLine } from '../lib/demo.js';
import { cleanAction } from '../lib/gemini.js';

test('the demo provider maps what people say to actions', () => {
  const a = (t) => chat(t).action;
  assert.deepEqual(a('read my notes'), { type: 'open', tile: 'notes' });
  assert.deepEqual(a('order my usual beans'), { type: 'pay', item: 'beans' });
  assert.deepEqual(a('message mum'), { type: 'draft', to: 'mum' });
  assert.deepEqual(a("tell Mum I'm on my way"), { type: 'draft', to: 'mum', text: "I'm on my way." });
  assert.deepEqual(a('change Tuesday to Wednesday'), { type: 'edit', from: 'Tuesday', to: 'Wednesday' });
  assert.deepEqual(a('change one to two.'), { type: 'edit', from: 'one', to: 'two' });
  assert.deepEqual(a('where am I?'), { type: 'where' });
  assert.deepEqual(a('stop'), { type: 'stop' });
  assert.deepEqual(a('carry on'), { type: 'resume' });
  assert.deepEqual(a('send it'), { type: 'send' });
  assert.deepEqual(a('yes'), { type: 'yes' });
  assert.deepEqual(a('get me an uber home'), { type: 'open', tile: 'ride' });
  assert.equal(a('what is the meaning of life'), null);
  assert.ok(chat('what is the meaning of life').say.length > 10);
  assert.equal(chat('').action, null);
});

test('menu lines are one spoken sentence or two', () => {
  assert.equal(menuLine({ part: 'evening', top: 'Read my notes' }), 'Evening. Read my notes is first. Tap it, or hold the bar and tell me.');
  assert.match(menuLine({ part: 'morning', top: 'Read my notes', moved: ['Order beans'] }), /^Morning\. Order beans moved up/);
});

test('model actions are cleaned before they reach the phone', () => {
  assert.equal(cleanAction({ type: 'transfer', to: 'x' }), null);
  assert.equal(cleanAction({ type: 'open', tile: 'bank' }), null);
  assert.deepEqual(cleanAction({ type: 'open', tile: 'mum', extra: 1 }), { type: 'open', tile: 'mum' });
  assert.deepEqual(cleanAction({ type: 'edit', from: 'one', to: '' }), { type: 'edit', from: 'one', to: '' });
  assert.equal(cleanAction(null), null);
});
