// /api/tts: ElevenLabs first under its daily character cap, then Gemini, then 503; each line synthesised once;
// a provider out of quota rests; the boot warm never spends Gemini.
import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, { ELEVENLABS_API_KEY: 'k-eleven', GEMINI_API_KEY: 'k-gemini', ELEVENLABS_DAILY_CHARS: '3000', MURMUR_RATE_PER_MIN: '1000' });
const realFetch = globalThis.fetch;
const calls = [];
let elevenStatus = 200, geminiStatus = 200;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('elevenlabs.io')) {
    calls.push(['eleven', JSON.parse(init.body).text, init.headers['xi-api-key']]);
    return elevenStatus === 200 ? new Response(new Uint8Array([1, 0, 2, 0])) : new Response('no', { status: elevenStatus });
  }
  if (u.includes('generativelanguage')) {
    calls.push(['gemini']);
    return geminiStatus === 200 ? Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: 'R0VN', mimeType: 'audio/L16;rate=24000' } }] } }] })
      : new Response('busy', { status: geminiStatus });
  }
  return realFetch(url, init);
};
const { server, warmTts } = await import('../server.js');
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const tts = (text) => realFetch(`${base}/api/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
const said = async (text) => (await (await tts(text)).json()).provider;
test.after(() => server.close());

test('ElevenLabs speaks first, as 24 kHz PCM, and a repeated line costs nothing', async () => {
  assert.equal((await (await realFetch(`${base}/health`)).json()).tts, true);
  const a = await (await tts('On it.')).json();
  assert.deepEqual(a, { audio: Buffer.from([1, 0, 2, 0]).toString('base64'), rate: 24000, provider: 'elevenlabs' });
  assert.deepEqual(calls, [['eleven', 'On it.', 'k-eleven']]);
  await tts('On it.');
  assert.equal(calls.length, 1, 'served from the cache');
});

test('warmTts caches the fixed lines through ElevenLabs and never spends Gemini', async () => {
  calls.length = 0; elevenStatus = 500;
  await warmTts();
  assert.ok(calls.length > 5 && calls.every((c) => c[0] === 'eleven'), 'no Gemini call while warming');
  elevenStatus = 200; calls.length = 0;
  const lines = await warmTts();
  for (const l of ['On it.', 'Done.', 'Opening the chat']) assert.ok(lines.includes(l), l);
  calls.length = 0;
  await tts('Done.'); await tts('Opening the chat');
  assert.equal(calls.length, 0, 'warm lines come from the cache');
});

test('an ElevenLabs failure falls to Gemini; both failing is a 503', async () => {
  calls.length = 0; elevenStatus = 500;
  assert.equal(await said('Fail.'), 'gemini');
  geminiStatus = 503;
  assert.equal((await tts('Nope.')).status, 503);
  assert.deepEqual(calls.map((c) => c[0]), ['eleven', 'gemini', 'eleven', 'gemini']);
  elevenStatus = 200; geminiStatus = 200;
});

test('past the daily character cap, ElevenLabs is not called at all', async () => {
  let i = 0;
  while (await said(`${i++}`.padEnd(400, '.')) === 'elevenlabs') assert.ok(i < 10, 'the cap is reached');
  calls.length = 0;
  assert.equal(await said('Over the cap'.padEnd(400, '!')), 'gemini');
  assert.deepEqual(calls, [['gemini']]);
});

test('a provider out of quota rests, so the 503 comes back without calling it', async () => {
  calls.length = 0; elevenStatus = 401; geminiStatus = 429;
  assert.equal((await tts('First.')).status, 503);
  assert.equal((await tts('Second.')).status, 503);
  assert.deepEqual(calls.map((c) => c[0]), ['eleven', 'gemini'], 'both rest after a 401 and a 429');
});
