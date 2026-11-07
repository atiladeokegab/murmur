import test from 'node:test';
import assert from 'node:assert/strict';
import app, { APPS } from '../public/apps/yourapps/index.js';
import { describeRegistry } from '../public/agent/plan.js';
import { demoPlan } from '../public/agent/demo-plan.js';

const apps = describeRegistry([app]);
const plan = (said) => demoPlan(said, apps, { app: null, workflows: [] }).plan?.map((x) => x.tool).join(',');

test('Your apps: every popular app has an Open action and 2-4 of its own, and gates where money or a message leaves', () => {
  for (const id of Object.keys(APPS)) {
    const own = Object.keys(app.actions).filter((k) => k.startsWith(id));
    assert.ok(own.length >= 3 && own.length <= 5, `${id}: ${own}`);
  }
  assert.equal(app.actions.uberBook.gate, 'pay');
  assert.equal(app.actions.deliverooOrder.gate, 'pay');
  assert.equal(app.actions.whatsappReply.gate, 'send');
  assert.equal(app.actions.instagramReply.gate, 'send');
  assert.equal(app.actions.spotifyPlay.gate, null);
});

test('Your apps: said by voice, each reaches its own action, never another app', () => {
  assert.equal(plan('Play Spotify'), 'yourapps__spotifyPlay');
  assert.equal(plan('Open Netflix'), 'yourapps__netflixOpen');
  assert.equal(plan('Book an Uber home'), 'yourapps__uberBook');
  assert.equal(plan('Order my usual on Deliveroo'), 'yourapps__deliverooOrder');
  assert.equal(plan("What's playing on Spotify?"), 'yourapps__spotifyPlaying');
  assert.equal(plan('Directions home on Maps'), 'yourapps__mapsHome');
  assert.equal(plan('Reply on WhatsApp saying on my way'), 'yourapps__whatsappReply');
});
