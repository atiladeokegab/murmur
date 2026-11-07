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
  const first = demoPlan(phrase, describeRegistry(apps), { app: app.id, workflows: [] }).plan?.[0];
  // A phrase with a blank in it ("take an item out") opens this app and asks for the blank: that lands here too.
  if (first?.tool === 'open_app') return first.params.app === app.id ? `${app.id}__open` : `open_app:${first.params.app}`;
  return first?.tool || 'nothing';
}

// The one action with nothing to offer: offline, every "write ..." plans Writer's or Messages' tools first, and the planner
// finds an app's own action only by its verb (write). Kept unsaid rather than offered wrong.
const UNSAID = new Set(['hello.write']);

test('every phrase offered in every app plans that app\'s own tool, offline', async () => {
  const p = await phone();
  // The phone's real apps: the fixture's stub Shop is not one (no public/apps/shop), and its "add" would take Grocer's words.
  const apps = [...p.registry.list().filter((a) => a.id !== 'shop'), writer, mine, taxi, grocer];
  const m = p.registry.get('messages'), ctx = p.ctxFor(m, { bus: p.bus });
  const states = { messages: [m.state()] };
  await m.actions.openChat.run({ id: 'mum' }, ctx); states.messages.push(m.state());
  await m.actions.reply.run({ text: 'On my way' }, ctx); states.messages.push(m.state());
  const wrong = [], said = new Set();
  for (const app of apps) {
    let st; try { st = app.state?.(); } catch { /* not mounted */ }
    for (const s of states[app.id] || [st]) {
      for (const x of Object.values(app.actions)) {
        const phrase = spokenAs(x, s);
        if (!phrase) continue;
        said.add(`${app.id}.${Object.keys(app.actions).find((k) => app.actions[k] === x)}`);
        const got = lands(phrase, app, apps);
        if (!got.startsWith(`${app.id}__`)) wrong.push(`${app.id}: "${phrase}" -> ${got}`);
      }
    }
  }
  assert.deepEqual([...new Set(wrong)], []);
  const quiet = apps.flatMap((a) => Object.keys(a.actions).map((k) => `${a.id}.${k}`)).filter((k) => !said.has(k));
  assert.deepEqual(quiet, [...UNSAID], 'every action offers a phrase in at least one state');
});
