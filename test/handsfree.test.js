import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/os/shell.js', import.meta.url), 'utf8');

test('hands-free never reopens without a speech API, so the typed box keeps focus', () => {
  const rearm = shell.match(/function rearm\([\s\S]*?\n\}/)?.[0];
  assert.match(rearm, /if \(Rec && handsFree/);
});

test('hands-free stops after three silent re-listens and on a blocked mic or speech service', () => {
  assert.match(shell, /\+\+quietRuns > 3\) handsFree = false/);
  assert.match(shell, /if \(!\/no-speech\|aborted\/\.test\(e\.error\)\) handsFree = false/);
  assert.match(shell, /'service-not-allowed': 'Speech recognition is off on this phone/);
  assert.match(shell, /'not-allowed': "Murmur can't hear you: allow the microphone for this site\."/);
});
