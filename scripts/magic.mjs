// Dev only: how smooth Vertical 1 feels, in numbers. Runs "Text Sam I'm ten minutes late" N times on a phone
// viewport, answers "Sam" and "yes" like a quick person, and scores the median run against the demo targets.
// PLAYWRIGHT=<pkg> node scripts/magic.mjs [url] [--runs 3] [--out dir] [--demo-plan: skip /api/plan, plan in the browser]   (exits 1 if any row fails)
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : d; };
const RUNS = Number(opt('--runs', 3));
const OUT = opt('--out', 'magic-out');
const DEMO_PLAN = argv.includes('--demo-plan') && argv.splice(argv.indexOf('--demo-plan'), 1);
const URL_ = argv[0] || 'https://murmur-901257379404.europe-west1.run.app';
const SAY = "Text Sam I'm ten minutes late";
const REACT_MS = 300; // a quick person answers this long after the question stops sounding

// Everything is timestamped in the page with performance.now(), relative to the moment the transcript lands.
const instrument = () => {
  const M = window.__magic = { sounds: [], frames: [], longtasks: [], shifts: [], cursor: [], blanks: 0, events: [] };
  const now = () => performance.now();
  const sound = (kind, start) => { const s = { kind, start, end: null }; M.sounds.push(s); return s; };
  // Web Audio: earcon oscillators, and TTS buffers. Start is the scheduled time. A TTS buffer counts only from its
  // first to its last audible sample (padding is silence to a listener); a hush cuts it at the real 'ended'.
  for (const [proto, kind] of [[OscillatorNode.prototype, 'earcon'], [AudioBufferSourceNode.prototype, 'voice']]) {
    const start0 = proto.start;
    proto.start = function (when = 0, ...rest) {
      const at = now() + Math.max(0, when - this.context.currentTime) * 1000;
      const s = sound(kind, at);
      if (this.buffer) {
        const ch = this.buffer.getChannelData(0), loud = (x) => Math.abs(x) > 0.01, rate = this.buffer.sampleRate;
        let i = 0, j = ch.length - 1;
        while (i < ch.length && !loud(ch[i])) i++;
        while (j > i && !loud(ch[j])) j--;
        Object.assign(s, { start: at + (i / rate) * 1000, audibleEnd: at + (j / rate) * 1000, raw: [at, at + this.buffer.duration * 1000] });
        this.addEventListener('ended', () => { s.end = Math.min(now(), s.audibleEnd); });
      } else this.addEventListener('ended', () => { s.end = now(); });
      return start0.call(this, when, ...rest);
    };
  }
  const play0 = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    const s = sound('media', now());
    this.addEventListener('ended', () => { s.end = now(); }, { once: true });
    this.addEventListener('pause', () => { s.end ??= now(); }, { once: true });
    return play0.apply(this, a);
  };
  if ('speechSynthesis' in window) {
    const speak0 = speechSynthesis.speak.bind(speechSynthesis), cancel0 = speechSynthesis.cancel.bind(speechSynthesis);
    speechSynthesis.cancel = () => { for (const s of M.sounds) if (s.kind === 'webspeech-est' && s.end > now()) s.end = Math.max(s.start, now()); return cancel0(); };
    speechSynthesis.speak = (u) => {
      // shortcut: headless Chromium has no voices, so no start/end fires; count ~65 ms a character as sounding.
      if (!speechSynthesis.getVoices().length) { const s = sound('webspeech-est', now() + 50); s.end = s.start + (u.text.length * 65) / (u.rate || 1); return speak0(u); }
      let s = null;
      u.addEventListener('start', () => { s = sound('webspeech', now()); });
      u.addEventListener('end', () => { if (s) s.end = now(); });
      return speak0(u);
    };
  }
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => M.longtasks.push({ t: e.startTime, ms: e.duration }))).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) M.shifts.push({ t: e.startTime, v: e.value, who: (e.sources || []).map((x) => x.node && (x.node.id ? '#' + x.node.id : x.node.nodeName + (x.node.className ? '.' + String(x.node.className).split(' ')[0] : ''))).join(' ') }); })).observe({ type: 'layout-shift', buffered: true });
  } catch { /* not supported */ }
  // Every frame: its delta, the cursor ring's box, and whether anything is on screen at all.
  let last = now();
  const visible = (el) => { if (!el || el.hidden) return 0; const r = el.getBoundingClientRect(); if (!r.height) return 0; let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const tick = (t) => {
    M.frames.push({ t, d: t - last }); last = t;
    const ring = document.querySelector('.agent-cursor');
    if (ring && !ring.hidden) { const r = ring.getBoundingClientRect(); M.cursor.push({ t, x: r.left + r.width / 2, y: r.top + r.height / 2 }); } else M.cursor.push({ t, hidden: true });
    if (document.documentElement.dataset.ready === 'true') {
      const seen = Math.max(visible(document.querySelector('#board-view')), ...[...document.querySelectorAll('#apps > *')].map(visible), document.querySelector('#sheet')?.open ? 1 : 0);
      if (seen < 0.05) { M.blanks++; (M.blankAt ||= []).push(t); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

// In the page: say the line, then answer the choice and the gate the way a person would.
const drive = ({ SAY, REACT_MS }) => new Promise((resolve) => {
  const M = window.__magic, { bus, sheet } = window.murmur;
  const t0 = performance.now();
  M.t0 = t0;
  bus.on('*', (name, e) => M.events.push({ t: performance.now(), name, ok: e?.ok, text: e?.text || e?.label || e?.line || e?.reason || '' }));
  const sounding = () => M.sounds.some((s) => s.start <= performance.now() && performance.now() < (s.end ?? s.audibleEnd ?? Infinity));
  let quietSince = performance.now(), answered = {}, answers = [];
  const iv = setInterval(() => {
    const t = performance.now();
    if (sounding()) quietSince = t;
    const p = sheet.pending();
    if (p && t - quietSince >= REACT_MS && t - (answered[p.kind] || 0) > 700) {
      answered[p.kind] = t;
      const word = p.kind === 'choose' ? 'Sam' : 'yes';
      answers.push({ t, kind: p.kind, word, choices: p.choices });
      window.murmur.hear(word, 'voice');
    }
    const done = M.events.find((e) => e.name === 'task:done');
    if (done || t - t0 > 30000) { clearInterval(iv); setTimeout(() => resolve({ t0, answers }), 2500); } // keep 2.5 s for the last line
  }, 10);
  window.murmur.hear(SAY, 'voice');
});

export function score(raw) {
  const { t0, answers, M, sentAt } = raw;
  const rel = (t) => t - t0;
  const sounds = M.sounds.filter((s) => s.start >= t0 - 50).map((s) => ({ ...s, start: rel(s.start), end: rel(s.end ?? s.audibleEnd ?? s.start) }));
  const voice = sounds.filter((s) => s.kind !== 'earcon');
  const end = sentAt ?? 30000;
  // Silence gaps from the transcript to Sent: merge sound intervals, measure the holes.
  const iv = sounds.map((s) => [s.start, s.end]).sort((a, b) => a[0] - b[0]);
  const gaps = []; let cur = 0;
  for (const [a, b] of iv) { if (a > cur && a <= end && a - cur > 700) gaps.push({ from: cur, to: a, ms: a - cur }); cur = Math.max(cur, b); }
  if (end - cur > 700 && cur < end) gaps.push({ from: cur, to: end, ms: end - cur });
  const frames = M.frames.filter((f) => f.t >= t0 && f.t <= t0 + end);
  const slow = frames.filter((f) => f.d > 20);
  const dropped = slow.reduce((n, f) => n + Math.max(1, Math.round(f.d / 16.7) - 1), 0);
  const fps = frames.length / ((frames.at(-1)?.t - frames[0]?.t) / 1000 || 1);
  const shifts = M.shifts.filter((s) => s.t >= t0);
  const cls = shifts.reduce((n, s) => n + s.v, 0);
  const jumps = [];
  for (let i = 1; i < M.cursor.length; i++) {
    const a = M.cursor[i - 1], b = M.cursor[i];
    if (a.hidden || b.hidden) continue;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > 100) jumps.push({ t: rel(b.t), px: Math.round(d) });
  }
  return {
    firstSound: sounds.length ? Math.min(...sounds.map((s) => s.start)) : null,
    firstVoice: voice.length ? Math.min(...voice.map((s) => s.start)) : null,
    maxGap: gaps.length ? Math.max(...gaps.map((g) => g.ms)) : 0, gaps,
    sent: sentAt, fps, dropped, slow: slow.map((f) => ({ t: rel(f.t), ms: Math.round(f.d) })),
    longtasks: M.longtasks.filter((l) => l.t >= t0).map((l) => ({ t: rel(l.t), ms: Math.round(l.ms) })),
    cls, shifts: shifts.map((s) => ({ ...s, t: rel(s.t) })), jumps,
    blanks: (M.blankAt || []).filter((t) => t >= t0).map(rel),
    answers: answers.map((a) => ({ ...a, t: rel(a.t) })),
    events: M.events.map((e) => ({ ...e, t: rel(e.t) })), sounds,
  };
}

async function once({ browser, devices }, n) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true,
    recordVideo: { dir: OUT, size: { width: 390, height: 844 } } });
  await ctx.addInitScript(instrument);
  const page = await ctx.newPage();
  const errors = [], net = [], born = Date.now();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfinished', async (q) => { if (!/\/api\//.test(q.url())) return; const t = q.timing(), res = await q.response().catch(() => null);
    const path = new URL(q.url()).pathname;
    net.push({ path, at: t.startTime, ms: Math.round(t.responseEnd), status: res?.status(), body: path === '/api/plan' ? await res?.text().catch(() => '') : undefined }); });
  if (DEMO_PLAN) await page.route('**/api/plan', (q) => q.abort()); // the browser's own demo planner plans instead
  const ready = () => page.waitForSelector('html[data-ready="true"]', { timeout: 30000 });
  await page.goto(URL_, { timeout: 30000 }); await ready();
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('murmur:welcomed', 'true'); });
  await page.reload({ timeout: 30000 }); await ready();
  // No tap first: any tap starts listening, and headless recognition never ends. The autoplay flag unlocks audio.
  // shortcut: the transcript is injected, so the shell's 1.5 s end-of-speech wait before hear() is not measured.
  await page.waitForTimeout(1200);
  const r = await page.evaluate(drive, { SAY, REACT_MS });
  const M = await page.evaluate(() => window.__magic);
  const ok = M.events.find((e) => e.name === 'task:done' && e.ok);
  const origin = await page.evaluate(() => performance.timeOrigin);
  const doneLine = await page.locator('#done-line').textContent().catch(() => '');
  const video = page.video();
  await ctx.close();
  const path = `${OUT}/run-${n}.webm`;
  await video.saveAs(path).catch(() => {}); await video.delete().catch(() => {});
  const s = score({ ...r, M, sentAt: ok ? ok.t - r.t0 : null });
  const t0Wall = origin + r.t0;
  return { ...s, doneLine, errors, video: path, t0InVideo: (t0Wall - born) / 1000,
    net: net.filter((x) => x.at >= t0Wall - 50).map((x) => ({ ...x, at: Math.round(x.at - t0Wall) })) };
}

const fmt = (v, u = 'ms') => (v == null ? '—' : u === 'ms' ? `${Math.round(v)} ms` : u === 's' ? `${(v / 1000).toFixed(2)} s` : String(Math.round(v * 1000) / 1000));
const median = (xs) => { const a = xs.filter((x) => x != null).sort((p, q) => p - q); return a.length ? a[(a.length - 1) >> 1] : null; };

if (import.meta.main) {
const { chromium, devices } = await import(process.env.PLAYWRIGHT || 'playwright');
const { mkdirSync, writeFileSync } = await import('node:fs');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const runs = [];
for (let i = 1; i <= RUNS; i++) {
  try { runs.push(await once({ browser, devices }, i)); } catch (e) { console.error(`run ${i} failed: ${e.message}`); runs.push(null); }
}
await browser.close();
writeFileSync(`${OUT}/runs.json`, JSON.stringify(runs, null, 1));
const good = runs.filter(Boolean);
const m = (k) => median(good.map((r) => r[k]));
const rows = [
  ['First sound after last word', '≤ 300 ms', m('firstSound'), (v) => v != null && v <= 300, 'ms'],
  ['Longest silence in the task', '≤ 700 ms', m('maxGap'), (v) => v != null && v <= 700, 'ms'],
  ['Last word to "Sent"', '< 6 s', m('sent'), (v) => v != null && v < 6000, 's'],
  ['Dropped frames (rAF > 20 ms)', '0', m('dropped'), (v) => v === 0, 'n'],
  ['Layout shift (CLS)', '0', m('cls'), (v) => v === 0, 'n'],
  ['Cursor teleports (> 100 px/frame)', '0', median(good.map((r) => r.jumps.length)), (v) => v === 0, 'n'],
  ['Blank frames', '0', median(good.map((r) => r.blanks.length)), (v) => v === 0, 'n'],
];
console.log(`\nMurmur magic — ${URL_}${DEMO_PLAN ? ' (demo planner)' : ''} — median of ${good.length}/${RUNS} runs\n`);
console.log('Row'.padEnd(36) + 'Target'.padEnd(11) + 'Measured'.padEnd(12) + 'Runs'.padEnd(26) + 'Verdict');
let fail = good.length < RUNS;
for (const [name, target, v, pass, u] of rows) {
  const ok = pass(v); fail ||= !ok;
  const key = { 'First sound after last word': 'firstSound', 'Longest silence in the task': 'maxGap', 'Last word to "Sent"': 'sent', 'Dropped frames (rAF > 20 ms)': 'dropped', 'Layout shift (CLS)': 'cls' }[name];
  const per = good.map((r) => (key ? r[key] : name.startsWith('Cursor') ? r.jumps.length : r.blanks.length)).map((x) => fmt(x, u)).join(' / ');
  console.log(name.padEnd(36) + target.padEnd(11) + fmt(v, u).padEnd(12) + per.padEnd(26) + (ok ? 'PASS' : 'FAIL'));
}
console.log(`\nInfo: first voice ${fmt(m('firstVoice'))}, fps ${Math.round(m('fps'))}, long tasks ${median(good.map((r) => r.longtasks.length))}, done line "${good[0]?.doneLine || ''}"`);
for (const [i, r] of runs.entries()) {
  if (!r) continue;
  console.log(`run ${i + 1}: gaps ${r.gaps.map((g) => `${fmt(g.from, 's')}→${fmt(g.to, 's')}`).join(', ') || 'none'}; answers ${r.answers.map((a) => `${a.word}@${fmt(a.t, 's')}`).join(', ')}; api ${r.net.map((x) => `${x.path.slice(5)} ${x.status} ${fmt(x.ms)}@${fmt(x.at, 's')}`).join(', ')}; slow frames ${r.slow.map((f) => `${f.ms}ms@${fmt(f.t, 's')}`).join(' ') || 'none'}; shifts ${r.shifts.map((x) => `${x.v.toFixed(3)}@${fmt(x.t, 's')} ${x.who}`).join(', ') || 'none'}${r.errors.length ? `; errors: ${r.errors.join(' | ')}` : ''}`);
}
console.log(`\nVideos and runs.json in ${OUT}`);
process.exit(fail ? 1 : 0);
}
