import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRegistry } from '../public/agent/plan.js';
import { demoPlan } from '../public/agent/demo-plan.js';

const IDS = ['spotify', 'podcasts', 'audible', 'sounds', 'netflix', 'youtube'];
const mods = await Promise.all(IDS.map((id) => import(`../public/apps/${id}/index.js`).then((m) => m.default)));
const apps = describeRegistry(mods);
const plan = (said, app = null) => demoPlan(said, apps, { app, workflows: [] }).plan?.map((x) => x.tool).join(',');

test('every media app has play, pause, next and what\'s playing, none gated', () => {
  for (const a of mods) {
    assert.deepEqual(Object.keys(a.actions), ['play', 'pause', 'next', 'playing'], a.id);
    assert.ok(Object.values(a.actions).every((x) => x.gate === null), a.id);
  }
});

test('said by voice, each reaches its own app', () => {
  assert.equal(plan('Play Spotify'), 'spotify__play');
  assert.equal(plan('Play my liked songs on Spotify'), 'spotify__play');
  assert.equal(plan('Pause Netflix'), 'netflix__pause');
  assert.equal(plan('Play the next episode on Netflix'), 'netflix__next');
  assert.equal(plan("What's playing on BBC Sounds?"), 'sounds__playing');
  assert.equal(plan('Next chapter on Audible'), 'audible__next');
  assert.equal(plan('Play YouTube'), 'youtube__play');
  assert.equal(plan('Next', 'podcasts'), 'podcasts__next', 'the open app when none is named');
  assert.equal(plan("What's playing?", 'spotify'), 'spotify__playing');
});
