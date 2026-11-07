// Every phrase "what can I do" offers must work when said: offline, it plans that app's own tool (or is a reserved
// word the agent sends to that app). A phrase that plans nothing, or another app, is never offered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hear } from '../public/agent/words.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { describeRegistry } from '../public/agent/plan.js';
import { spokenAs } from '../public/agent/offer.js';
import { phone } from './agent-fixtures.js';
import writer from '../public/apps/writer/index.js';
import mine from '../public/apps/mine/index.js';
import taxi from '../public/plugins/taxi/index.js';
import grocer from '../public/plugins/grocer/index.js';

// What the agent does with a phrase in this app: the planner's first tool, or the reserved word it is.
function lands(phrase, app, apps) {
  const r = hear(phrase);
  if (r.words.length && !r.rest) {
    const k = r.words.map((w) => w.kind).join(' ');
    if (k === 'carry_on' && (app.actions.carryOn || app.actions.resume)) return `${app.id}__carryOn`;
    if (k === 'where' && app.place) return `${app.id}__where`;
    return `reserved:${k}`;
  }
  return demoPlan(phrase, describeRegistry(apps), { app: app.id, workflows: [] }).plan?.[0]?.tool || 'nothing';
}

test('every phrase offered in every app plans that app\'s own tool, offline', async () => {
  const p = await phone();
  const apps = [...p.registry.list(), writer, mine, taxi, grocer]; // with a Shop on the phone too, so its words compete
  const m = p.registry.get('messages'), ctx = p.ctxFor(m, { bus: p.bus });
  const states = { messages: [m.state()] };
  await m.actions.openChat.run({ id: 'mum' }, ctx); states.messages.push(m.state());
  await m.actions.reply.run({ text: 'On my way' }, ctx); states.messages.push(m.state());
  const wrong = [];
  for (const app of apps.filter((a) => a.id !== 'shop')) { // the fixture's stub Shop is not a real app
    let st; try { st = app.state?.(); } catch { /* not mounted */ }
    for (const s of states[app.id] || [st]) {
      for (const x of Object.values(app.actions)) {
        const phrase = spokenAs(x, s);
        if (!phrase) continue;
        const got = lands(phrase, app, apps);
        if (!got.startsWith(`${app.id}__`)) wrong.push(`${app.id}: "${phrase}" -> ${got}`);
      }
    }
  }
  assert.deepEqual([...new Set(wrong)], []);
});
