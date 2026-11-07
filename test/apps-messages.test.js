import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../public/apps/messages/model.js';
import app from '../public/apps/messages/index.js';

const A = app.actions;

test('the app object has the §3.3 shape', () => {
  for (const k of ['id', 'name', 'mount', 'read', 'place', 'state', 'seed', 'reset']) assert.ok(app[k], k);
  for (const [name, a] of Object.entries(A)) {
    assert.ok(a.describe && a.hint && a.params && typeof a.run === 'function' && typeof a.verify === 'function', name);
  }
  assert.equal(A.send.gate, 'send');
  assert.equal(Object.values(A).filter((a) => a.gate).length, 1, 'only send is gated');
});

test('seed: Mum asks about Tuesday, three chats', () => {
  app.seed();
  const s = app.state();
  assert.equal(M.chatOf(s, 'mum').messages.at(-1).text, 'Lunch on Tuesday?');
  assert.equal(app.read(), 'Messages, 3 chats. Mum wrote: Lunch on Tuesday? Sam wrote: Are you still coming to the quiz tonight? We start at seven.');
  assert.deepEqual(app.place(), { where: 'Messages', item: 'your chats', n: 0, of: 3, next: 'openChat' });
});

test('"Sam" is ambiguous: ask, never pick', () => {
  const s = M.fresh();
  const r = M.resolve(s, { who: 'Sam' });
  assert.equal(r.ask.question, 'Sam or Samira?');
  assert.deepEqual(r.ask.choices.map((c) => c.params.id), ['sam', 'samira']);
  assert.deepEqual(M.resolve(s, { who: 'samira' }), { id: 'samira' });
  assert.deepEqual(M.resolve(s, { who: 'mum' }), { id: 'mum' });
  assert.deepEqual(M.resolve(s, { id: 'sam' }), { id: 'sam' });
  assert.match(M.resolve(s, { who: 'Bob' }).none, /no chat with Bob/);
  assert.equal(A.openChat.verify({ ...s, currentChat: 'samira' }, { who: 'Sam' }), true, 'after the person chose, either is right');
  assert.notEqual(A.openChat.verify({ ...s, currentChat: 'mum' }, { who: 'Sam' }), true);
});

test('the race: open Mum, read, reply, change Tuesday to Wednesday, send', () => {
  const s = M.fresh();
  M.open(s, 'mum');
  assert.equal(A.openChat.verify(s, { who: 'Mum' }), true);
  assert.notEqual(A.read.verify(s), true, 'not read yet');
  const items = M.startReading(s);
  assert.deepEqual(items.map((i) => i.text), ['Lunch on Tuesday?'], 'one item per sentence, the unread one');
  assert.equal(A.read.verify(s), true);
  assert.deepEqual(M.place(s), { where: "Mum's chat", item: "Mum's message", n: 1, of: 1, next: 'reply' });

  M.setDraft(s, "Tuesday's fine.");
  assert.equal(A.reply.verify(s, { text: "Tuesday's fine." }), true);
  assert.equal(s.changed, null);

  M.setDraft(s, "Wednesday's fine.");
  assert.deepEqual(s.changed, { sentence: 0, word: 0, from: "Tuesday's", to: "Wednesday's" });
  assert.equal(A.replace.verify(s, { from: 'Tuesday', to: 'Wednesday' }), true);
  assert.notEqual(A.replace.verify(s, { from: 'Tuesday', to: 'Thursday' }), true);
  assert.deepEqual(M.place(s), { where: "Mum's chat", item: 'your reply', n: 1, of: 1, next: 'send' });

  assert.equal(A.send.readback(s), "Send 'Wednesday's fine' to Mum?");
  assert.notEqual(A.send.verify(s), true, 'not sent yet');
  assert.ok(M.send(s));
  assert.equal(A.send.verify(s), true);
  assert.equal(M.chatOf(s).messages.at(-1).text, "Wednesday's fine.");
  assert.equal(M.read(s), `Mum's chat, 4 messages, the last from you "Wednesday's fine.". Sent.`);
});

test('Vertical 1: text Sam I am ten minutes late', () => {
  const s = M.fresh();
  const r = M.resolve(s, { who: 'Sam' });
  M.open(s, r.ask.choices[0].params.id);
  assert.equal(A.openChat.verify(s, { id: 'sam' }), true);
  M.setDraft(s, "I'm ten minutes late.");
  assert.equal(A.reply.verify(s, { text: "I'm ten minutes late." }), true);
  assert.equal(A.send.readback(s), "Send 'I'm ten minutes late' to Sam?");
  M.send(s);
  assert.equal(A.send.verify(s), true);
  assert.deepEqual(s.lastSent, { to: 'sam', text: "I'm ten minutes late." });
  assert.equal(M.chatOf(s, 'mum').messages.length, 3, 'Mum untouched');
});

test('word change: only one word, else no underline', () => {
  assert.deepEqual(M.wordChange('See you at one. Bring cake.', 'See you at two. Bring cake.'), { sentence: 0, word: 3, from: 'one.', to: 'two.' });
  assert.equal(M.wordChange('a b c.', 'x y c.'), null);
  assert.equal(M.wordChange('a b.', 'a b. c.'), null);
  assert.equal(M.wordChange('a b.', 'a b.'), null);
});

test('send refuses an empty draft and no open chat', () => {
  const s = M.fresh();
  assert.equal(M.send(s), false);
  M.open(s, 'mum');
  assert.equal(M.send(s), false);
  assert.notEqual(A.send.verify(s), true);
});

test('seed and reset bring the demo data back', () => {
  app.seed();
  app.reset();
  assert.equal(app.state().currentChat, null);
  assert.equal(app.state().chats.length, 3);
});
