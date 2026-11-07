import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('a missing browser provider reports each case once and exits red', () => {
  const tasks = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url))).tasks;
  const result = spawnSync(process.execPath, [new URL('./run.js', import.meta.url).pathname], {
    encoding: 'utf8', timeout: 5000,
    env: { PATH: process.env.PATH, PLAYWRIGHT: '/path/that/does/not/exist/playwright.mjs' },
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const failures = [...result.stdout.matchAll(/^FAIL ([^:]+):/gm)].map(([, id]) => id);
  assert.deepEqual(failures, tasks.map(task => task.id));
  assert.match(result.stdout, /^0 of 30 right$/m);
  assert.doesNotMatch(result.stdout, /^PASS /m);
});
