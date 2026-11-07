// Dev only: the "why not computer use" numbers. Each demo line runs once in a fresh headless phone and we count
// what leaves the phone (every request after the line is said), model calls, screenshots, and the two times.
// PLAYWRIGHT=<pkg> node scripts/numbers.mjs [url] [--runs 3] [--md out.md]
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : d; };
const RUNS = Number(opt('--runs', 3));
const MD = opt('--md', '');
const URL_ = argv[0] || 'https://murmur-901257379404.europe-west1.run.app';
const REACT_MS = 300; // a quick person answers this long after the voice stops
const LINES = [
  { app: 'messages', say: "Text Sam I'm ten minutes late", label: 'Vertical 1: Messages send' },
  { app: 'bank', say: 'Pay Sam twenty pounds', label: 'Bank: pay Sam £20' },
  { app: 'bank', say: "What's my balance", label: 'Bank: balance' },
  { app: 'calendar', say: "What's on my calendar today", label: 'Calendar: today' },
  { app: 'look', say: 'Make the text bigger', label: 'Look: text bigger' },
  { app: 'travel', say: 'Find flights to Lisbon for next Friday', label: 'Travel: find flights' },
];

// In the page, before any script: time the first voice audio (TTS buffers and Web Speech) against performance.now().
const instrument = () => {
  const M = window.__n = { voice: [] };
  const start0 = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when = 0, ...r) {
    const at = performance.now() + Math.max(0, when - this.context.currentTime) * 1000;
    M.voice.push({ start: at, end: at + (this.buffer?.duration || 0) * 1000 });
    return start0.call(this, when, ...r);
  };
  if ('speechSynthesis' in window) {
    const speak0 = speechSynthesis.speak.bind(speechSynthesis);
    // shortcut: headless Chromium has no voices and fires no end, so a Web Speech line counts ~65 ms a character (as magic.mjs)
    speechSynthesis.speak = (u) => { const at = performance.now(); M.voice.push({ start: at, end: at + (u.text.length * 65) / (u.rate || 1), est: true }); return speak0(u); };
  }
};

// Say the line, answer a choice with "Sam" and a gate with "yes" once the voice has been quiet REACT_MS.
const drive = ({ say, REACT_MS }) => new Promise((resolve) => {
  const { bus, sheet } = window.murmur;
  const ev = [];
  bus.on('*', (name, e) => ev.push({ t: performance.now(), name, ok: e?.ok, status: e?.status, text: e?.text || e?.line || '' }));
  let answered = {};
  const quietFor = () => performance.now() - Math.max(0, ...window.__n.voice.map((v) => v.end));
  const t0 = performance.now();
  const iv = setInterval(() => {
    const t = performance.now(), p = sheet.pending();
    if (p && quietFor() >= REACT_MS && t - (answered[p.kind] || 0) > 700) {
      answered[p.kind] = t;
      window.murmur.hear(p.kind === 'choose' ? 'Sam' : 'yes', 'voice');
    }
    const done = ev.find((e) => e.name === 'task:done');
    if (done || t - t0 > 30000) { clearInterval(iv); setTimeout(() => resolve({ t0, ev, voice: window.__n.voice }), 1500); }
  }, 10);
  window.murmur.hear(say, 'voice');
});

const IMAGE = /data:image\/|"mime_?type"\s*:\s*"image\/|image\/(?:png|jpe?g|webp)/i;

async function once(browser, devices, line) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(instrument);
  const page = await ctx.newPage();
  // The fingerprint: a virtual platform authenticator that verifies the user, so a pay gate can finish headless.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const reqs = [];
  page.on('requestfinished', async (q) => {
    const sizes = await q.sizes().catch(() => null), body = q.postData() || '';
    reqs.push({ at: q.timing().startTime, path: new URL(q.url()).pathname, method: q.method(),
      bytes: sizes ? sizes.requestHeadersSize + sizes.requestBodySize : body.length, image: IMAGE.test(body) || /^image\//.test(q.headers()['content-type'] || '') && q.method() !== 'GET',
      plan: q.url().includes('/api/plan') ? await (await q.response())?.text().catch(() => '') : '' });
  });
  const ready = () => page.waitForSelector('html[data-ready="true"]', { timeout: 30000 });
  await page.goto(URL_, { timeout: 30000 }); await ready();
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('murmur:welcomed', 'true'); });
  await page.reload({ timeout: 30000 }); await ready();
  await page.waitForTimeout(1500); // boot warm-up (warm(), warmTts) is not the task's traffic
  const has = await page.evaluate((id) => !!window.murmur.registry.get(id), line.app);
  if (!has) { await ctx.close(); return { missing: true }; }
  const origin = await page.evaluate(() => performance.timeOrigin);
  const r = await page.evaluate(drive, { say: line.say, REACT_MS });
  await ctx.close();
  const t0Wall = origin + r.t0;
  const mine = reqs.filter((x) => x.at >= t0Wall - 5);
  const rel = (t) => Math.round(t - r.t0);
  const ack = r.ev.find((e) => e.name === 'say' && e.text === 'On it.');
  const done = r.ev.find((e) => e.name === 'task:done');
  const spoken = r.voice.filter((v) => v.start >= r.t0), voice = spoken.map((v) => v.start);
  return {
    planCalls: mine.filter((x) => x.path === '/api/plan').length,
    modelPlans: mine.filter((x) => x.path === '/api/plan' && /"provider"\s*:\s*"gemini"/.test(x.plan)).length,
    ttsCalls: mine.filter((x) => x.path === '/api/tts').length,
    requests: mine.length, bytes: mine.reduce((n, x) => n + x.bytes, 0), screenshots: mine.filter((x) => x.image).length,
    ack: ack ? rel(ack.t) : null, firstVoice: voice.length ? rel(Math.min(...voice)) : null,
    done: done ? rel(done.t) : null, lastVoice: spoken.length ? rel(Math.max(...spoken.map((v) => v.end))) : null,
    estimated: spoken.some((v) => v.est), status: done ? (done.ok ? 'done' : done.status || 'not done') : 'no task:done in 30 s',
    line: [...r.ev].reverse().find((e) => e.name === 'say')?.text || '',
  };
}

const median = (xs) => { const a = xs.filter((x) => x != null).sort((p, q) => p - q); return a.length ? a[(a.length - 1) >> 1] : null; };

const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const rows = [];
for (const line of LINES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    try { const r = await once(browser, devices, line); runs.push(r); if (r.missing) break; } catch (e) { console.error(`${line.label}: ${e.message}`); }
  }
  if (runs[0]?.missing) { rows.push({ line, missing: true }); continue; }
  const m = (k) => median(runs.map((r) => r[k]));
  rows.push({ line, n: runs.length, planCalls: m('planCalls'), modelPlans: m('modelPlans'), ttsCalls: m('ttsCalls'), requests: m('requests'),
    bytes: m('bytes'), screenshots: Math.max(...runs.map((r) => r.screenshots)), ack: m('ack'), firstVoice: m('firstVoice'), done: m('done'), lastVoice: m('lastVoice'), estimated: runs.some((r) => r.estimated),
    status: [...new Set(runs.map((r) => r.status))].join(', '), last: runs.at(-1)?.line });
}
await browser.close();

const when = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const head = '| Demo line | Model plan calls | TTS calls | Requests off the phone | Bytes sent | Screenshots sent | ms to "On it." | ms to first voice | ms to Done | ms to last word spoken | Result |';
const out = [`Murmur numbers, measured ${when} against ${URL_}, headless Chromium (Pixel 7 profile), median of ${RUNS} runs per line.`, '',
  head, '|' + head.split('|').slice(1, -1).map(() => '---').join('|') + '|'];
for (const r of rows) {
  if (r.missing) { out.push(`| ${r.line.label} ("${r.line.say}") | not on this build | | | | | | | | | the ${r.line.app} app is not installed here |`); continue; }
  out.push(`| ${r.line.label} ("${r.line.say}") | ${r.modelPlans} of ${r.planCalls} | ${r.ttsCalls} | ${r.requests} | ${r.bytes} | ${r.screenshots} | ${r.ack ?? '—'} | ${r.firstVoice ?? '—'} | ${r.done ?? '—'} | ${r.lastVoice ?? '—'}${r.estimated ? ' (est.)' : ''} | ${r.status}: "${r.last}" |`);
}
out.push('', 'How it is measured: t = 0 is the moment the transcript reaches the phone (the shell\'s end-of-speech wait is not included). Every request the page makes after t = 0 counts as sent off the phone: request headers plus body, as Chromium reports them. "Model plan calls" is /api/plan calls answered by Gemini, of all /api/plan calls; the rest were planned on the phone. TTS calls are /api/tts, the voice. A screenshot is any request body carrying image data. The fingerprint for a payment is a virtual platform authenticator (Chromium WebAuthn) that verifies the user. Choices are answered "Sam" and gates "yes" 300 ms after the voice goes quiet, as in scripts/magic.mjs, so ms to Done includes those waits. Done is when the agent finishes the task; the voice may still be reading, so the last column is when the last spoken line ends: real for the server voice (TTS audio), estimated at 65 ms a character (est.) where headless Chromium falls back to its silent built-in voice.');
const text = out.join('\n') + '\n';
console.log(text);
if (MD) (await import('node:fs')).writeFileSync(MD, text);
