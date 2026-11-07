import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/apps/calendar/model.js';
import app from '../public/apps/calendar/index.js';

const A = app.actions;

test('the app object has the §3.3 shape; invite asks first', () => {
  for (const k of ['id', 'name', 'mount', 'read', 'place', 'state', 'seed', 'reset']) assert.ok(app[k], k);
  for (const [name, a] of Object.entries(A)) {
    assert.ok(a.describe && a.hint && a.params && typeof a.run === 'function' && typeof a.verify === 'function', name);
  }
  assert.equal(A.invite.gate, 'send');
  assert.deepEqual(Object.entries(A).filter(([, a]) => a.gate).map(([k]) => k), ['invite']);
});

test("what's on, in words", () => {
  const s = C.fresh();
  assert.equal(C.whatsOn(s), 'Today: Choir at six, then Quiz with Sam at half past seven.');
  assert.equal(C.whatsOn(s, 'Tuesday'), 'Tuesday: Lunch with Mum at one.');
  assert.equal(C.whatsOn(s, 'wed'), 'Wednesday is free.');
  assert.equal(C.whatsOn(s, 'Blursday'), "I don't know Blursday.");
  s.showing = 'Tuesday';
  assert.ok(A.whatsOn.verify(s, { day: 'Tuesday' }));
  assert.equal(A.whatsOn.verify(s, {}), false);
});

test('the demo: move lunch with Mum to Wednesday', () => {
  const s = C.fresh();
  const r = C.resolve(s, { what: 'lunch with Mum' });
  assert.deepEqual(r, { id: 'lunch-mum' });
  assert.equal(A.move.verify(s, { what: 'lunch with Mum', to: 'Wednesday' }), false);
  assert.deepEqual(C.move(s, r.id, 'Wednesday'), { say: "Wednesday's free. Moved. Tell Mum?" });
  assert.ok(A.move.verify(s, { what: 'lunch with Mum', to: 'Wednesday' }));
  assert.equal(C.line(C.event(s, 'lunch-mum')), 'Lunch with Mum, Wednesday at one.');
  assert.deepEqual(C.place(s), { where: 'Calendar, Wednesday', item: 'Lunch with Mum', n: 1, of: 1, next: 'move' });
});

test('a clash is said, never overwritten', () => {
  const s = C.fresh();
  const r = C.move(s, 'dentist', 'Saturday', '18:00');
  assert.equal(r.fail, 'Saturday has Choir at six. Pick another time?');
  assert.equal(C.event(s, 'dentist').day, 'Thursday');
  assert.deepEqual(C.move(s, 'dentist', 'Friday'), { say: "Friday's free. Moved." });
});

test('find: every word must match; two matches ask', () => {
  const s = C.fresh();
  assert.deepEqual(C.resolve(s, { what: 'the quiz' }).none, "I can't find the quiz this week.");
  assert.deepEqual(C.resolve(s, { what: 'quiz' }), { id: 'quiz' });
  C.add(s, { title: 'Quiz final', day: 'Sunday', time: '20:00' });
  const r = C.resolve(s, { what: 'quiz', to: 'Monday' });
  assert.equal(r.ask.question, 'Quiz with Sam or Quiz final?');
  assert.deepEqual(r.ask.choices[1].params, { what: 'quiz', to: 'Monday', id: 'quiz-final-sun' });
});

test('add and invite verify on the app truth', () => {
  const s = C.fresh();
  assert.equal(C.add(s, { title: '', day: 'Monday', time: '10:00' }), null);
  assert.equal(C.add(s, { title: 'Haircut', day: 'Mon', time: '10am' }), null);
  C.add(s, { title: 'Haircut', day: 'Mon', time: '10:00' });
  assert.ok(A.add.verify(s, { title: 'Haircut', day: 'Monday', time: '10:00' }));
  C.move(s, 'lunch-mum', 'Wednesday');
  assert.equal(A.invite.readback(s, { what: 'lunch with Mum', who: 'Mum' }), 'Send Mum an invite: Lunch with Mum, Wednesday at one.');
  assert.equal(A.invite.verify(s, { what: 'lunch with Mum', who: 'Mum' }), false);
  assert.ok(C.invite(s, 'lunch-mum', 'mum'));
  assert.ok(A.invite.verify(s, { what: 'lunch with Mum', who: 'Mum' }));
  assert.equal(C.invite(s, 'lunch-mum', 'Bob'), false, 'only people in the phone');
});

test('spoken times', () => {
  assert.deepEqual(['13:00', '09:30', '10:15', '19:45', '00:00', '08:40'].map(C.spokenTime),
    ['one', 'half past nine', 'quarter past ten', 'quarter to eight', 'twelve', 'eight 40']);
});
