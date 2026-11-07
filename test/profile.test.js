// The phone's invented owner: "who am I", the greeting and "take me home" read from one seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE, greeting, whoAmI, profileLine } from '../public/lib/profile.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { describeRegistry } from '../public/agent/plan.js';
import ids from '../public/apps/apps.js';

const apps = [];
for (const id of [...ids, 'look']) { try { apps.push((await import(`../public/apps/${id}/index.js`)).default); } catch { /* not merged */ } }
const reg = describeRegistry(apps);
const plan = (s) => demoPlan(s, reg, { app: null, workflows: [] }).plan;

test('profile: "Who am I?" is Joy from the seed, the people she talks to and what she likes; no health beyond sight', () => {
  const who = plan('Who am I?')[0].params.text;
  assert.equal(who, whoAmI());
  for (const w of ['Joy Adeyemi', 'Stratford', 'Mum', 'Sam', 'Priya', 'audiobooks', 'book club', 'Pasta Corner']) assert.ok(who.includes(w), w);
  assert.doesNotMatch(who, /diabet|medic|doctor|condition|illness|you (?:asked|moved|sent)/i);
  assert.deepEqual(Object.keys(PROFILE).filter((k) => /health|medical|nhs|bank|card/i.test(k)), []);
});

test('profile: the greeting uses her name for the time of day; hello says it', () => {
  assert.equal(greeting(new Date(2026, 10, 7, 9)), 'Good morning, Joy');
  assert.equal(greeting(new Date(2026, 10, 7, 15)), 'Good afternoon, Joy');
  assert.equal(greeting(new Date(2026, 10, 7, 20)), 'Good evening, Joy');
  assert.match(plan('hello')[0].params.text, /^Good (?:morning|afternoon|evening), Joy\. I'm Murmur\./);
});

test('profile: "take me home" is the way home, "go home" stays the board, and the model planner gets her name and home', async () => {
  for (const s of ['Take me home', 'get me home', 'directions home']) assert.deepEqual(plan(s), [{ tool: 'transit__directions', params: { place: 'Home' } }], s);
  assert.deepEqual(plan('go home'), [{ tool: 'go_home', params: {} }]);
  assert.match(profileLine(), /Joy Adeyemi\. Home: 14 Larkspur Mews/);
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../lib/agent/planner.js', import.meta.url), 'utf8'));
  assert.match(src, /\$\{profileLine\(\)\}\\nOpen app:/, 'the Gemini prompt starts with the profile line');
});
