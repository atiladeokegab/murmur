import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRegistry } from '../public/agent/plan.js';
import { plan, cleanApps, MODELS } from '../lib/agent/planner.js';
import messages from '../public/apps/messages/index.js';

const apps = describeRegistry([messages]);

test('POST /api/plan returns a validated plan offline', async () => {
  delete process.env.GEMINI_API_KEY;
  const { server } = await import('../server.js');
  await new Promise((r) => server.listen(0, r));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/plan`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance: "Text Sam I'm ten minutes late", apps, context: { app: 'messages' } }),
    });
    const j = await res.json();
    assert.equal(res.status, 200);
    assert.equal(j.provider, 'demo');
    assert.deepEqual(j.steps.map((s) => s.tool), ['messages__openChat', 'messages__reply', 'messages__send']);
    assert.equal(j.steps[2].gate, 'send');
  } finally { server.close(); }
});

test('a Gemini failure falls back to the demo plan; the registry from the browser is cleaned', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  try {
    const out = await plan({ key: 'k', utterance: "Read Mum's message", apps });
    assert.equal(out.provider, 'demo');
    assert.deepEqual(out.steps.map((s) => s.tool), ['messages__openChat', 'messages__read']);
  } finally { globalThis.fetch = realFetch; }
  const dirty = cleanApps([{ id: 'x y', actions: [] }, { id: 'ok', name: 'OK', actions: [{ name: 'go', gate: 'nuke' }, { name: '<script>' }] }]);
  assert.deepEqual(dirty.map((a) => a.id), ['ok']);
  assert.deepEqual(dirty[0].actions.map((x) => [x.name, x.gate]), [['go', null]]);
});

test('Gemini function calls become the plan, validated', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [
    { functionCall: { name: 'messages__openChat', args: { who: 'Sam', evil: 1 } } },
    { functionCall: { name: 'messages__wipe', args: {} } },
  ] } }] }) });
  try {
    const out = await plan({ key: 'k', utterance: 'open Sam', apps });
    assert.equal(out.provider, 'gemini');
    assert.deepEqual(out.steps.map((s) => [s.tool, s.params]), [['messages__openChat', { who: 'Sam' }]]);
    assert.ok(out.dropped.some((d) => d.reason === 'unknown action'));
  } finally { globalThis.fetch = realFetch; }
});

test('one model, one try: a JSON plan is read, the model is reported, a 503 does not try a second model', async () => {
  const realFetch = globalThis.fetch;
  const asked = [];
  let fail = false;
  globalThis.fetch = async (url) => {
    asked.push(String(url).match(/models\/([^:]+)/)[1]);
    if (fail) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ steps: [
      { tool: 'open_app', params: '{"app":"the board"}' },
      { tool: 'messages__openChat', params: '{"who":"Sam"}' },
      { tool: 'messages__reply', params: '{"text":"Late."}' },
    ] }) }] } }] }) };
  };
  try {
    const out = await plan({ key: 'k', utterance: 'tell Sam late', apps });
    assert.deepEqual(MODELS(), [process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite']);
    assert.equal(out.provider, 'gemini');
    assert.equal(out.model, asked[0]);
    assert.deepEqual(out.steps.map((s) => [s.tool, s.params]), [['messages__openChat', { who: 'Sam' }], ['messages__reply', { text: 'Late.' }]], 'open_app of a non-app is dropped');
    fail = true; asked.length = 0;
    const down = await plan({ key: 'k', utterance: 'tell Sam late', apps });
    assert.equal(asked.length, 1, 'no second model');
    assert.equal(down.provider, 'demo');
  } finally { globalThis.fetch = realFetch; }
});

test('/api/* needs the device token when MURMUR_TOKEN is set, and says why when it is refused', async () => {
  const { createGuard } = await import('../lib/guard.js');
  const req = (h = {}, ip = '1.2.3.4') => ({ headers: { 'x-forwarded-for': `9.9.9.9, ${ip}`, ...h }, socket: {} });
  const open = createGuard({ token: () => '' });
  assert.equal(open(req()), null, 'unset: open for local work');
  const g = createGuard({ token: () => 's3cret' });
  assert.equal(g(req()).status, 401);
  assert.match(g(req({ 'x-murmur-token': 'nope' })).say, /set up/);
  assert.equal(g(req({ 'x-murmur-token': 's3cret' })), null);

  process.env.MURMUR_TOKEN = 's3cret';
  const { server } = await import('../server.js');
  await new Promise((r) => server.listen(0, r));
  try {
    const at = `http://localhost:${server.address().port}`;
    const body = JSON.stringify({ utterance: "Read Mum's message", apps });
    const bad = await fetch(`${at}/api/plan`, { method: 'POST', body });
    assert.equal(bad.status, 401);
    const good = await fetch(`${at}/api/plan`, { method: 'POST', body, headers: { 'x-murmur-token': 's3cret' } });
    assert.equal(good.status, 200);
    assert.equal((await fetch(`${at}/health`)).status, 200, 'health stays open');
  } finally { delete process.env.MURMUR_TOKEN; server.close(); }
});

test('a per-IP rate limit and a daily model cap answer 429 with a sentence to say', async () => {
  const { createGuard } = await import('../lib/guard.js');
  let t = Date.UTC(2026, 10, 7, 13);
  const req = (ip) => ({ headers: { 'x-forwarded-for': ip }, socket: {} });
  const g = createGuard({ token: () => '', perMinute: 3, dailyCap: 5, now: () => t });
  for (let i = 0; i < 3; i++) assert.equal(g(req('a'), { model: true }), null);
  const slow = g(req('a'), { model: true });
  assert.equal(slow.status, 429);
  assert.match(slow.say, /minute/);
  assert.equal(g(req('b'), { model: true }), null, 'another phone is not limited by the first');
  t += 61000;
  assert.equal(g(req('a'), { model: true }), null, 'a minute later it is fine');
  const cap = g(req('c'), { model: true });
  assert.equal(cap.status, 429);
  assert.match(cap.say, /today/);
  assert.equal(g(req('c'), { model: false }), null, 'routes that call no model are not capped');
  t += 86400000;
  assert.equal(g(req('d'), { model: true }), null, 'a new day resets the cap');
});

test('the phone keeps the code from ?code= and sends it only to its own /api/', async () => {
  const { installToken } = await import('../public/agent/token.js');
  const store = new Map();
  const seen = [];
  const win = {
    location: { href: 'https://murmur.example/?code=abc', origin: 'https://murmur.example' },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    history: { replaceState: (a, b, u) => { win.location.href = String(u); } },
    fetch: async (input, init = {}) => { seen.push([String(input), new Headers(init.headers).get('x-murmur-token')]); return { ok: true }; },
  };
  installToken({ win });
  assert.equal(win.location.href, 'https://murmur.example/');
  await win.fetch('/api/plan', { method: 'POST' });
  await win.fetch('/apps/apps.js');
  await win.fetch('https://elsewhere.example/api/x');
  assert.deepEqual(seen, [['/api/plan', 'abc'], ['/apps/apps.js', null], ['https://elsewhere.example/api/x', null]]);
});

test('a real bank is refused before the model is asked, even when the model would plan it; a message about one still sends', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [
    { functionCall: { name: 'messages__openChat', args: { who: 'Sam' } } }] } }] }) }; };
  try {
    const bankApps = [...apps, { id: 'bank', name: 'Murmur Bank', actions: [{ name: 'balance', params: { type: 'object', properties: {} } }] }];
    const out = await plan({ key: 'k', utterance: 'Check my Barclays bank balance', apps: bankApps });
    assert.deepEqual([out.kind, out.steps.length, calls], ['refuse', 0, 0]);
    const { demoPlan } = await import('../public/agent/demo-plan.js');
    const ok = demoPlan('Tell Sam: I switched from Monzo', apps);
    assert.equal(ok.kind, 'task'); assert.match(ok.plan[1].params.text, /Monzo/);
    assert.equal(demoPlan('Text Sam my sort code is 12 34 56', apps).kind, 'refuse', 'credentials never go, even in a message');
    assert.equal(demoPlan('Text Sam then check my Barclays balance', apps).kind, 'refuse', 'a bank request behind a message is a request, not content');
    assert.equal(demoPlan('Tell Sam: I moved to Monzo, then went home', apps).kind, 'task', 'a quote is all content');
  } finally { globalThis.fetch = realFetch; }
});

test('the client refuses before any provider too: a model that would plan a real bank is never asked', async () => {
  const { planUtterance } = await import('../public/agent/planner.js');
  let calls = 0;
  const fetch = async () => { calls++; return { ok: true, json: async () => ({ kind: 'task', steps: [{ tool: 'bank__balance', params: {} }], provider: 'gemini' }) }; };
  const bankApps = [...apps, { id: 'bank', name: 'Murmur Bank', actions: [{ name: 'balance', params: { type: 'object', properties: {} } }] }];
  for (const u of ['Check my Barclays bank balance', 'Move GBP 20 from my current account to another account', 'Check my Chase balance', 'Open my TSB account']) {
    const out = await planUtterance(u, bankApps, {}, { fetch });
    assert.deepEqual([u, out.kind, out.steps.length], [u, 'refuse', 0]);
  }
  assert.equal(calls, 0);
  const server = await plan({ key: '', utterance: 'Move GBP 20 from my current account to another account', apps: bankApps });
  assert.equal(server.kind, 'refuse', 'money movement is refused, never a calendar move');
  assert.equal((await planUtterance("What's my balance", bankApps, {}, { fetch })).steps[0].tool, 'bank__balance', 'the phone\'s own Bank still works');
  assert.equal(calls, 0, 'and plans locally');
});
