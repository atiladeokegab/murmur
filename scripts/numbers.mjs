// The "why not computer use" numbers: for each demo ask, in a real headless phone, count the model calls,
// the bytes the phone sends, the screenshots sent, and time "On it." and Done. Measured, never estimated.
// Usage: node scripts/numbers.mjs [base url]   (default http://localhost:8080). Prints a markdown table.
// Runs ?quiet (no audio), so the times are Murmur's own work, not speech; an ask-first sheet is answered Yes at once.
const BASE = process.argv[2] || 'http://localhost:8080';
const ASKS = ["Text Sam I'm ten minutes late", 'Read my messages', "What's on today", 'Make the text bigger', 'Pay Sam twenty pounds', 'Stop'];
const IMAGE = /data:image|iVBORw0KGgo|\/9j\/4/; // a PNG or JPEG in a request body, inline or base64
const MODEL_ROUTES = /\/api\/(plan|chat|menu)$/;

let pw;
for (const p of [process.env.PLAYWRIGHT, '/home/atilade/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs', 'playwright']) {
  if (!p) continue;
  try { pw = await import(p); break; } catch { /* try the next */ }
}
if (!pw) { console.error('numbers: no Playwright found'); process.exit(1); }

async function measure(browser, ask) {
  const page = await browser.newPage({ viewport: { width: 390, height: 757 } });
  try {
    await page.goto(`${BASE}/?quiet`, { timeout: 30000 });
    await page.waitForSelector('html[data-ready="true"]', { timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); // the boot warm-up is not the ask's
    const sent = [], pending = [];
    page.on('request', (r) => sent.push({ url: r.url(), bytes: (r.postDataBuffer()?.length || 0) + r.url().length, image: IMAGE.test(r.postData() || '') }));
    page.on('response', (r) => { if (MODEL_ROUTES.test(new URL(r.url()).pathname)) pending.push(r.json().then((j) => j.provider, () => '?')); });
    let sockets = 0; page.on('websocket', () => sockets++);
    const ev = await page.evaluate(async (text) => {
      const m = window.murmur, t0 = performance.now(), out = { says: [], gate: null, done: null };
      const at = () => Math.round(performance.now() - t0);
      m.bus.on('say', (e) => out.says.push([at(), e.text]));
      m.bus.on('task:done', (e) => { out.done ??= [at(), e.ok, e.reason || '']; });
      // Answer each sheet the moment it is up, as a person would: the first name on a choice, Yes on ask-first.
      // "Stop" is said at the first sheet of a text to Sam, and timed from there to "Stopped.".
      const stop = text === 'Stop';
      let answered = null;
      const poll = setInterval(() => {
        const s = m.sheet.pending();
        if (!s || answered === s) return;
        answered = s;
        out.gate ??= [at(), s.kind];
        if (stop) { out.stopAt = at(); m.hear('Stop'); } else if (s.kind === 'choose') m.sheet.choose(0); else m.sheet.yes();
      }, 5);
      await m.hear(stop ? "Text Sam I'm ten minutes late" : text);
      if (stop) for (let i = 0; i < 300 && !out.says.some(([, t]) => /^Stopped/.test(t)); i++) await new Promise((r) => setTimeout(r, 50));
      for (let i = 0; i < 300 && !out.done; i++) await new Promise((r) => setTimeout(r, 50)); // up to 15 s
      clearInterval(poll);
      out.end = at();
      return out;
    }, ask);
    await page.waitForTimeout(300); // let the last request's response land
    const providers = await Promise.all(pending);
    const ack = ev.says.find(([, t]) => t === 'On it.');
    const stopped = ev.says.find(([, t]) => /^Stopped/.test(t));
    const done = ask === 'Stop' ? (stopped ? stopped[0] - ev.stopAt : null) : ev.done ? ev.done[0] : ev.says.filter(([, t]) => t !== 'On it.').at(-1)?.[0];
    return {
      ask, planCalls: sent.filter((s) => /\/api\/plan$/.test(s.url)).length,
      gemini: providers.filter((p) => p === 'gemini').length, apiCalls: sent.filter((s) => /\/api\//.test(s.url)).length,
      bytes: sent.reduce((n, s) => n + s.bytes, 0), screenshots: sent.filter((s) => s.image).length, sockets,
      ack: ack ? ack[0] : null, gate: ev.gate, done, ok: ev.done ? (ev.done[1] ? 'done' : `stopped: ${ev.done[2]}`) : 'no task',
      last: ev.says.at(-1)?.[1] || '',
    };
  } finally { await page.close(); }
}

const RUNS = Number(process.env.RUNS) || 3;
const browser = await pw.chromium.launch();
const runs = []; // runs[ask] = [row per run], each run on a fresh page
try { for (const a of ASKS) { const rs = []; for (let i = 0; i < RUNS; i++) rs.push(await measure(browser, a)); runs.push(rs); } }
finally { await browser.close(); }
// A cell: the one value when every run agrees, else the median and the range. A time never said is "not said".
const cell = (vals, unit = '') => {
  if (vals.some((v) => v == null)) return vals.every((v) => v == null) ? 'not said' : vals.map((v) => (v == null ? '-' : v + unit)).join(' / ');
  const s = [...vals].sort((a, b) => a - b), med = s[Math.floor(s.length / 2)];
  return s[0] === s.at(-1) ? `${med}${unit}` : `${med}${unit} (${s[0]} to ${s.at(-1)})`;
};
const uniq = (xs) => [...new Set(xs)].join(' / ');
console.log(`Measured against ${BASE} at ${new Date().toISOString()}, ${RUNS} runs per ask, each on a fresh page. Times are medians (range).\n`);
console.log('| Ask | Plan calls | Gemini answered | Bytes sent | Screenshots | To "On it." | To first sheet | To Done | Outcome |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const rs of runs) {
  const r0 = rs[0];
  console.log(`| ${r0.ask} | ${cell(rs.map((r) => r.planCalls))} | ${rs.filter((r) => r.gemini).length} of ${RUNS} | ${cell(rs.map((r) => r.bytes))} | ${cell(rs.map((r) => r.screenshots))} | ${cell(rs.map((r) => r.ack), ' ms')} | ${rs.some((r) => r.gate) ? `${cell(rs.map((r) => r.gate?.[0]), ' ms')} (${uniq(rs.map((r) => r.gate?.[1] || 'none'))})` : 'none'} | ${cell(rs.map((r) => r.done), ' ms')} | ${uniq(rs.map((r) => `${r.ok}: "${r.last}"`))} |`);
}
console.log(`\nOther: ${runs.map((rs) => `${rs[0].ask}: ${uniq(rs.map((r) => r.apiCalls))} /api calls, ${uniq(rs.map((r) => r.sockets))} sockets`).join('; ')}.`);
