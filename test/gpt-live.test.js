// GPT live: the server mints a short-lived secret (the key stays server-side); tool calls run through Murmur's agent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { session, REALTIME_TOOLS, REALTIME_MODEL } from '../lib/openai.js';
import { LIVE_TOOLS } from '../lib/gemini.js';
import { handleEvent, toUtterance } from '../public/voice/gpt.js';

test('without OPENAI_API_KEY the session route is 503 and /health says gpt off', async () => {
  delete process.env.OPENAI_API_KEY;
  const { server } = await import('../server.js');
  await new Promise((r) => server.listen(0, r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/api/openai-session`, { method: 'POST', body: '{}' })).status, 503);
    assert.equal((await (await fetch(`${base}/health`)).json()).gpt, false);
  } finally { server.close(); }
});

test('session: posts the model, persona and every Gemini Live tool to client_secrets; returns only the secret', async () => {
  let call;
  const fetchFn = async (url, init) => { call = { url, init }; return { ok: true, json: async () => ({ value: 'ek_test', expires_at: 1 }) }; };
  const out = await session('sk-secret', { fetchFn });
  assert.equal(call.url, 'https://api.openai.com/v1/realtime/client_secrets');
  assert.equal(call.init.headers.authorization, 'Bearer sk-secret');
  const body = JSON.parse(call.init.body);
  assert.equal(body.session.type, 'realtime');
  assert.equal(body.session.model, REALTIME_MODEL);
  assert.match(body.session.instructions, /Murmur/);
  const names = body.session.tools.map((t) => t.name);
  for (const f of LIVE_TOOLS[0].functionDeclarations) assert.ok(names.includes(f.name), f.name);
  assert.ok(names.includes('phone'));
  assert.equal(REALTIME_TOOLS.find((t) => t.name === 'open_tile').parameters.properties.tile.type, 'string', 'OpenAI wants JSON Schema types');
  assert.deepEqual(out, { token: 'ek_test', model: REALTIME_MODEL, expires_at: 1 });
  assert.doesNotMatch(JSON.stringify(out), /sk-secret/);
  await assert.rejects(session('k', { fetchFn: async () => ({ ok: false, status: 401 }) }), /session 401/);
});

test('a function call runs through onTool and answers with its call_id, then asks for a reply', async () => {
  const seen = [];
  const out = await handleEvent({ type: 'response.function_call_arguments.done', name: 'phone', call_id: 'c1', arguments: '{"request":"text Sam hello"}' },
    { onTool: async (n, a) => { seen.push([n, a]); return { say: 'Sam or Samira?' }; } });
  assert.deepEqual(seen, [['phone', { request: 'text Sam hello' }]]);
  assert.equal(out[0].item.type, 'function_call_output');
  assert.equal(out[0].item.call_id, 'c1');
  assert.deepEqual(JSON.parse(out[0].item.output), { say: 'Sam or Samira?' });
  assert.deepEqual(out[1], { type: 'response.create' });
  const failed = await handleEvent({ type: 'response.function_call_arguments.done', name: 'phone', call_id: 'c2', arguments: 'nope' }, { onTool: async () => { throw new Error('x'); } });
  assert.doesNotMatch(JSON.parse(failed[0].item.output).say, /can'?t/i, 'never a refusal');
  assert.deepEqual(await handleEvent({ type: 'session.created' }, { onTool: () => assert.fail() }), []);
});

test('Gemini Live tool names become words the agent already hears', () => {
  assert.equal(toUtterance('open_tile', { tile: 'notes' }), 'open notes');
  assert.equal(toUtterance('draft_message', { text: 'see you Tuesday' }), 'text Mum see you Tuesday');
  assert.equal(toUtterance('draft_message', {}), 'reply to Mum');
  assert.equal(toUtterance('phone', { request: 'Call Priya' }), 'Call Priya');
  assert.equal(toUtterance('send'), 'send');
});

test('orb level: silence is still, speech swells, a full-scale wave caps at 1', async () => {
  const { rms } = await import('../public/os/orb.js');
  assert.equal(rms(new Uint8Array(512).fill(128)), 0);
  const wave = (amp) => Uint8Array.from({ length: 512 }, (_, i) => 128 + Math.round(amp * Math.sin(i / 8)));
  assert.ok(rms(wave(20)) > 0.3 && rms(wave(20)) < 1, 'ordinary speech moves it');
  assert.equal(rms(wave(127)), 1);
});
