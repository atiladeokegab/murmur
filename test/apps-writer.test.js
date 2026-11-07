import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../public/apps/writer/model.js';
import app from '../public/apps/writer/index.js';
import { sentences } from '../public/lib/notes.js';

const A = app.actions;

test('the app object has the §3.3 shape, nothing gated', () => {
  for (const k of ['id', 'name', 'mount', 'read', 'place', 'state', 'seed', 'reset']) assert.ok(app[k], k);
  for (const [name, a] of Object.entries(A)) {
    assert.ok(a.describe && a.hint && a.params && typeof a.run === 'function' && typeof a.verify === 'function', name);
    assert.equal(a.gate, null, name);
  }
});

test('seed: two chapters, chapter 2 has 30 sentences', () => {
  const s = W.fresh();
  assert.equal(W.count(s, 0), 8);
  assert.equal(W.count(s, 1), 30);
  assert.equal(W.read(s), 'The Writer: Platform Four. 2 chapters. Open: chapter 2, Platform Four, 30 sentences.');
});

test('the demo beat: read the last page, stop, where am I, carry on', () => {
  const s = W.fresh();
  W.openChapter(s, 1);
  W.startLastPage(s);
  assert.equal(s.chapter, 1);
  assert.equal(s.sentence, 10, 'the last page starts at sentence 11');
  assert.equal(A.readLastPage.verify(s), true);
  s.sentence = 13; // the reader stopped here
  assert.equal(W.where(s), 'Chapter 2, sentence 14 of 30, the part about the station.');
  assert.deepEqual(W.place(s), { where: 'Chapter 2, Platform Four', item: 'sentence', n: 14, of: 30, next: 'carryOn', say: W.where(s) });
  s.lastSaid = W.where(s);
  assert.equal(A.where.verify(s), true);
  W.startCarryOn(s);
  assert.equal(s.readFrom, 13, 'carry on resumes the sentence you stopped in');
  assert.equal(A.carryOn.verify(s), true);
});

test('where am I: every part, and a new chapter', () => {
  const s = W.fresh();
  s.sentence = 0; assert.equal(W.where(s), 'Chapter 2, sentence 1 of 30, the part about the rain.');
  s.sentence = 29; assert.equal(W.where(s), 'Chapter 2, sentence 30 of 30, the part about the envelope.');
  W.newChapter(s, 'Leeds');
  assert.equal(W.where(s), "Chapter 3, Leeds. It's empty so far.");
  W.dictate(s, 'The hotel was cold. The radiator ticked all night.');
  assert.equal(W.where(s), 'Chapter 3, sentence 2 of 2, the part that starts "the radiator ticked all night".');
});

test('dictate, change and new chapter verify on the app truth', () => {
  const s = W.fresh();
  W.newChapter(s, 'Leeds');
  assert.equal(A.newChapter.verify(s, { title: 'Leeds' }), true);
  assert.notEqual(A.newChapter.verify(s, { title: 'York' }), true);
  assert.equal(W.dictate(s, '  '), false);
  W.dictate(s, 'The hotel was cold.');
  assert.equal(A.dictate.verify(s, { text: 'The hotel was cold.' }), true);
  assert.notEqual(A.newChapter.verify(s, {}), true, 'not empty any more');
  W.dictate(s, 'I slept in my coat.');
  assert.equal(W.current(s).text, 'The hotel was cold. I slept in my coat.');
  assert.ok(W.change(s, 'cold', 'freezing'));
  assert.equal(s.sentence, 0, 'the change moves you to the edited sentence');
  assert.equal(A.change.verify(s, { from: 'cold', to: 'freezing' }), true);
  assert.equal(sentences(W.current(s).text)[0], 'The hotel was freezing.');
  assert.equal(W.change(s, 'banana', 'x'), false);
});

test('change prefers the sentence you are in', () => {
  const s = W.fresh();
  s.sentence = 15; // sentences 15 and 16 both say "dog"; you are in 16
  assert.ok(W.change(s, 'dog', 'cane'));
  assert.equal(s.sentence, 15);
  assert.match(sentences(W.current(s).text)[15], /the cane led the way/);
  assert.match(sentences(W.current(s).text)[14], /guide dog/, 'the other one is untouched');
});

test('open chapter bounds', () => {
  const s = W.fresh();
  assert.ok(W.openChapter(s, 1));
  assert.equal(A.openChapter.verify(s, { n: 1 }), true);
  assert.equal(W.openChapter(s, 3), false);
  assert.equal(W.openChapter(s, 0), false);
});
