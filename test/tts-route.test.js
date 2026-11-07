// /api/tts: ElevenLabs first under its daily character cap, then Gemini, then 503; each line synthesised once.
import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, { ELEVENLABS_API_KEY: 'k-eleven', GEMINI_API_KEY: 'k-gemini', ELEVENLABS_DAILY_CHARS: '20', MURMUR_RATE_PER_MIN: '1000' });
const realFetch = globalThis.fetch;
const calls = [];
let elevenOk = true, geminiOk = true;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('elevenlabs.io')) {
    calls.push(['eleven', JSON.parse(init.body).text, init.headers['xi-api-key']]);
    return elevenOk ? new Response(new Uint8Array([1, 0, 2, 0])) : new Response('no', { status: 500 });
  }
  if (u.includes('generativelanguage')) {
    calls.push(['gemini']);
    return geminiOk ? Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: 'R0VN', mimeType: 'audio/L16;rate=24000' } }] } }] })
      : new Response('busy', { status: 503 });
  }
  return realFetch(url, init);
};
const { server, warmTts } = await import('../server.js');
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const tts = (text) => realFetch(`${base}/api/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
test.after(() => server.close());

test('ElevenLabs speaks first, as 24 kHz PCM, and a repeated line costs nothing', async () => {
  assert.equal((await (await realFetch(`${base}/health`)).json()).tts, true);
  const a = await (await tts('On it.')).json();
  assert.deepEqual(a, { audio: Buffer.from([1, 0, 2, 0]).toString('base64'), rate: 24000, provider: 'elevenlabs' });
  assert.deepEqual(calls, [['eleven', 'On it.', 'k-eleven']]);
  await tts('On it.');
  assert.equal(calls.length, 1, 'served from the cache');
});

test('an ElevenLabs failure falls to Gemini; both failing is a 503', async () => {
  calls.length = 0; elevenOk = false;
  assert.equal((await (await tts('Fail.')).json()).provider, 'gemini');
  geminiOk = false;
  assert.equal((await tts('Nope.')).status, 503);
  assert.deepEqual(calls.map((c) => c[0]), ['eleven', 'gemini', 'eleven', 'gemini']);
  elevenOk = true; geminiOk = true;
});

test('past the daily character cap, ElevenLabs is not called at all', async () => {
  calls.length = 0; // 16 of 20 characters spent: "On it." + "Fail." + "Nope."
  assert.equal((await (await tts('Too long now.')).json()).provider, 'gemini');
  assert.deepEqual(calls, [['gemini']]);
});

test('warmTts caches the fixed lines: the ack, Done., and the step labels', async () => {
  const lines = await warmTts();
  for (const l of ['On it.', 'Done.', 'Opening the chat']) assert.ok(lines.includes(l), l);
  calls.length = 0;
  await tts('Done.'); await tts('Opening the chat');
  assert.equal(calls.length, 0, 'warm lines come from the cache');
});
