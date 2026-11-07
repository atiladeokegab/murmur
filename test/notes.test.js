import test from 'node:test';
import assert from 'node:assert/strict';
import { sentences, whereAmI, replaceWord } from '../public/lib/notes.js';
import { NOTE } from '../public/lib/tiles.js';

test('splits a note into sentences', () => {
  assert.equal(sentences(NOTE.text).length, 8);
  assert.deepEqual(sentences('One. Two? Three'), ['One.', 'Two?', 'Three']);
  assert.deepEqual(sentences(''), []);
});

test('where am I says the place and the gist', () => {
  assert.equal(whereAmI(NOTE.text, 2), 'Sentence 3 of 8, the part that starts "lunch with mum on sunday".');
  assert.equal(whereAmI('', 0), 'This one is empty.');
  assert.match(whereAmI(NOTE.text, 99), /^Sentence 8 of 8/);
});

test('change X to Y edits one whole word, near where you are', () => {
  const r = replaceWord(NOTE.text, 'Tuesday', 'Wednesday', 0);
  assert.equal(r.changed, true);
  assert.equal(r.index, 1);
  assert.match(sentences(r.text)[1], /on Wednesday to move/);
  assert.equal(sentences(r.text).length, 8);
  const draft = "Yes, I'll be there at one on Sunday. I'll bring the cake.";
  assert.equal(replaceWord(draft, 'one', 'two').text, "Yes, I'll be there at two on Sunday. I'll bring the cake.");
  assert.equal(replaceWord(draft, 'yes', 'no').text, "No, I'll be there at one on Sunday. I'll bring the cake.");
  assert.equal(replaceWord(draft, 'on', 'by').text, "Yes, I'll be there at one by Sunday. I'll bring the cake.", 'whole word only');
  assert.equal(replaceWord(draft, 'cake', 'pie', 1).index, 1);
  assert.equal(replaceWord(draft, 'banana', 'x').changed, false);
  assert.equal(replaceWord(draft, 'a.b', 'x').changed, false, 'regex characters are literal');
});
