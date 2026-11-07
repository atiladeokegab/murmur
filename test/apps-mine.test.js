import test from 'node:test';
import assert from 'node:assert/strict';
import * as Mi from '../public/apps/mine/model.js';
import app from '../public/apps/mine/index.js';

const A = app.actions;

test('the app object has the §3.3 shape; delete asks first', () => {
  for (const k of ['id', 'name', 'mount', 'read', 'place', 'state', 'seed', 'reset']) assert.ok(app[k], k);
  for (const [name, a] of Object.entries(A)) {
    assert.ok(a.describe && a.hint && a.params && typeof a.run === 'function' && typeof a.verify === 'function', name);
  }
  assert.deepEqual(Object.entries(A).filter(([, a]) => a.gate).map(([k, a]) => [k, a.gate]), [['delete', 'delete']]);
});

test('steps in plain words', () => {
  const s = Mi.fresh();
  assert.equal(Mi.read(s), 'Mine, 1 saved: My morning.');
  assert.equal(Mi.explain(Mi.find(s, 'my morning')), "My morning: say what's on today, then open Mum's chat, then read the new message.");
  const reply = { name: 'Reply to Mum', steps: [
    { app: 'messages', action: 'openChat', params: { id: 'mum' } },
    { app: 'messages', action: 'reply', params: { text: "Tuesday's fine." } },
    { app: 'messages', action: 'replace', params: { from: 'Tuesday', to: 'Wednesday' } },
    { app: 'messages', action: 'send', params: {} },
  ] };
  assert.equal(Mi.explain(reply), `Reply to Mum: open Mum's chat, then write "Tuesday's fine.", then change Tuesday to Wednesday, then send it, after I ask you.`);
  assert.ok(Mi.gated(reply));
  assert.equal(Mi.stepWords({ app: 'shop', action: 'pay', params: {} }, 'Paying for your usual'), 'paying for your usual');
  assert.equal(Mi.explain({ name: 'Empty', steps: [] }), 'Empty has no steps yet.');
  assert.equal(Mi.read(Mi.fresh([])), 'Mine. Nothing saved yet. Do something once, then say "save that as" and a name.');
});

test('find, explain, run and delete verify on the app truth', () => {
  const s = Mi.fresh();
  assert.equal(Mi.find(s, 'morning').name, 'My morning', 'with or without "my"');
  assert.equal(Mi.find(s, 'evening'), null);
  assert.notEqual(A.explain.verify(s, { name: 'my morning' }), true);
  s.explained = 'My morning';
  assert.equal(A.explain.verify(s, { name: 'my morning' }), true);
  s.lastRun = 'My morning';
  assert.equal(A.run.verify(s, { name: 'My morning' }), true);
  assert.notEqual(A.delete.verify(s, { name: 'My morning' }), true);
  assert.equal(A.delete.readback(s, { name: 'my morning' }), "Delete 'My morning'?");
  assert.ok(Mi.remove(s, 'my morning'));
  assert.equal(A.delete.verify(s, { name: 'My morning' }), true);
  assert.notEqual(A.delete.verify(s, { name: '' }), true, 'an empty name never verifies');
  assert.equal(Mi.remove(s, 'my morning'), false);
  assert.deepEqual(Mi.place(s), { where: 'Mine', item: 'your workflows', n: 0, of: 0, next: 'explain' });
});
