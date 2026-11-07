// The paraphrase sweep: judges speak freely and Gemini's quota is thin, so the demo asks must plan offline in
// many words. Each line runs as the agent hears it: the OS's reserved words first (hear), then planUtterance
// offline (the demo planner, no network). `must` lines are asserted; the rest are known misses, kept as todos
// so they show up in the run and turn green when the planner learns them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hear } from '../public/agent/words.js';
import { planUtterance } from '../public/agent/planner.js';
import { describeRegistry } from '../public/agent/plan.js';
import ids from '../public/apps/apps.js';

const apps = [];
for (const id of [...ids, 'look', 'bank']) {
  try { apps.push((await import(`../public/apps/${id}/index.js`)).default); } catch { /* not merged yet */ }
}
const reg = describeRegistry(apps);
const has = (id) => apps.some((a) => a.id === id);

const SAM_LATE = [['messages__openChat', { who: 'Sam' }], ['messages__reply', { text: /late/i }], ['messages__send', {}]];
const READ = [['messages__read', {}]];
const TODAY = [['calendar__whatsOn', { day: /today/i }]];
const BIGGER = [['look__textBigger', {}]];
const DARK = [['look__colours', { colours: 'dark' }]];
const PAY = [['bank__payPerson', { who: 'Sam', amount: 20 }]];
const BALANCE = [['bank__balance', {}]];
const TRAVEL = [[/^(open_app|travel__)/, {}]];
const word = (kind, w) => [[`word:${kind}`, w ? { word: w } : {}]];
const GATE = { gate: { gate: 'send', openedAt: 0 }, now: 10_000 };

// [what was said, the steps it must plan, must work today, why not (for a known miss)]
const LINES = [
  ["Text Sam I'm late", SAM_LATE, true],
  ["Tell Sam I'm running late", SAM_LATE, true],
  ["Message Sam saying I'll be ten minutes late", SAM_LATE, true],
  ["Send Sam a message saying I'm late", SAM_LATE, true],
  ["Text Sam that I'm going to be late", SAM_LATE, true],
  ["Can you text Sam and say I'm late", SAM_LATE, false, 'planner'],
  ["Let Sam know I'm running late", SAM_LATE, false, 'planner'],

  ['What did Sam say', READ, true],
  ["Read Sam's last message", READ, true],
  ['Read my messages', READ, false, 'planner'],
  ['Read me my messages', READ, false, 'planner'],
  ['Any new messages?', READ, false, 'planner'],
  ['Do I have any messages', READ, false, 'planner: plans run_workflow "I have any messages"'],
  ['Check my texts', READ, false, 'planner'],

  ["What's on today", TODAY, true],
  ["What's on my calendar today", TODAY, true],
  ["What's happening today", TODAY, true],
  ["What's on tomorrow", [['calendar__whatsOn', { day: /tomorrow/i }]], true],
  ["What's next", [['calendar__next', {}]], true],
  ['What have I got today', TODAY, false, 'planner'],
  ['Am I busy today', TODAY, false, 'planner'],

  ['Move my 3pm to Thursday', [['calendar__move', { event: /3 ?pm/i, day: 'Thursday' }]], true],
  ["Move my three o'clock to Friday", [['calendar__move', { event: /three/i, day: 'Friday' }]], true],
  ['Move lunch with Mum to Wednesday', [['calendar__move', { event: /lunch/i, day: 'Wednesday' }]], true],
  ['Reschedule lunch with Mum to Wednesday', [['calendar__move', { event: /lunch/i, day: 'Wednesday' }]], true],
  ['Can you move my 3pm meeting to tomorrow', [['calendar__move', { event: /3 ?pm/i, day: /tomorrow/i }]], false, 'planner'],
  ['Push my 3pm back to Thursday', [['calendar__move', { event: /3 ?pm/i, day: 'Thursday' }]], false, 'planner'],

  ['Make the text bigger', BIGGER, true],
  ['Bigger text', BIGGER, true],
  ['Can you make the writing larger', BIGGER, false, 'planner'],
  ['Increase the text size', BIGGER, false, 'planner'],
  ['Dark mode', DARK, true],
  ['Switch to dark mode', DARK, true],
  ['Make it yellow on black', [['look__colours', { colours: 'yellow' }]], true],
  ['Turn on dark mode', DARK, false, 'planner'],

  ['Pay Sam twenty pounds', PAY, has('bank'), 'Bank not on main'],
  ['Pay Sam £20', PAY, has('bank'), 'Bank not on main'],
  ['Send Sam 20 quid', PAY, has('bank'), 'Bank not on main'],
  ['Can you pay Sam twenty pounds', PAY, false, 'planner'],
  ['Give Sam twenty pounds', PAY, false, 'planner'],

  ["What's my Murmur Bank balance", BALANCE, false, 'planner: NO_GO refuses "bank|balance", even for the Murmur Bank app'],
  ['Check my balance', BALANCE, false, 'planner: refused by NO_GO'],
  ['How much money do I have', BALANCE, false, 'planner'],
  ['Open Murmur Bank', [[/^(open_app|bank__)/, {}]], false, 'planner: refused by NO_GO'],

  ['Open travel', TRAVEL, has('travel'), 'Travel not on main'],
  ['Open the travel app', TRAVEL, has('travel'), 'Travel not on main'],
  ["When's my flight", TRAVEL, false, 'planner'],
  ['Show me my flight', TRAVEL, false, 'planner'],
  ['What time is my flight', TRAVEL, false, 'planner'],

  ['Stop', word('stop'), true],
  ['Stop it', word('stop'), true],
  ['Cancel', word('stop'), true],
  ['Hang on', word('stop'), true],
  ['Shut up', word('stop'), false, 'words.js'],

  ['Undo', word('undo'), true],
  ['Undo that', word('undo'), true],
  ['Take that back', word('undo'), true],
  ['Undo the last thing', [['undo', {}]], true],
  ['Go back', word('undo'), false, 'words.js (or go_home): nothing'],

  ['Yes', word('confirm', 'yes'), true, '', GATE],
  ['Yes please', word('confirm', 'yes'), true, '', GATE],
  ['Send it', word('confirm', 'send'), true, '', GATE],
  ['Yeah', word('confirm', 'yes'), false, 'words.js', GATE],
  ['No', word('deny'), true, '', GATE],
  ['No thanks', word('deny'), true, '', GATE],
  ["Don't send it", word('deny'), true, '', GATE],
  ['Nope', word('deny'), false, 'words.js', GATE],
];

/** What the agent would do: reserved words as `word:<kind>` steps, then the offline plan of the rest. */
async function heard(said, opts = {}) {
  const h = hear(said, opts);
  const steps = h.words.map((w) => ({ tool: `word:${w.kind}`, params: w.word ? { word: w.word } : {} }));
  if (!h.rest) return { steps, say: '' };
  const p = await planUtterance(h.rest, reg, { app: null, workflows: [] }, { offline: true });
  return { steps: [...steps, ...p.steps], say: p.say || '' };
}
const fits = (v, want) => (want instanceof RegExp ? want.test(String(v)) : typeof want === 'string' ? String(v).toLowerCase() === want.toLowerCase() : v === want);
const hit = (steps, want) => want.every(([tool, params]) => steps.some((s) => (tool instanceof RegExp ? tool.test(s.tool) : s.tool === tool)
  && Object.entries(params).every(([k, v]) => fits(s.params?.[k], v))));

for (const [said, want, must, why, opts] of LINES) {
  test(`paraphrase: "${said}"`, must ? {} : { todo: why || 'miss' }, async () => {
    const r = await heard(said, opts);
    assert.ok(hit(r.steps, want), `${said} -> ${r.steps.map((s) => s.tool + JSON.stringify(s.params)).join(' > ') || r.say}`);
  });
}

test('paraphrase: the sweep has at least 60 lines; the hit rate and misses are in the diagnostics', async (t) => {
  assert.ok(LINES.length >= 60);
  const missed = [];
  for (const [said, want, , why, opts] of LINES) if (!hit((await heard(said, opts)).steps, want)) missed.push(`${said} (${why})`);
  t.diagnostic(`hit rate ${LINES.length - missed.length} of ${LINES.length}`);
  for (const m of missed) t.diagnostic(`miss: ${m}`);
  assert.ok(LINES.length - missed.length >= LINES.filter((l) => l[2]).length);
});
