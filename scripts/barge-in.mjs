// Tap to talk during boot, before the first-open line: nothing may be voiced while the mic is open.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 757 } });
await p.addInitScript(() => {
  window.__spoken = [];
  class R { start() { window.__rec = this; } stop() { this.onend?.(); } abort() {} }
  window.SpeechRecognition = window.webkitSpeechRecognition = R;
  const ss = window.speechSynthesis;
  ss.speak = (u) => { window.__spoken.push({ t: u.text, listening: document.querySelector('#talk')?.getAttribute('aria-pressed') }); setTimeout(() => u.onend?.(), 300); };
  localStorage.clear();
});
await p.goto(process.argv[2] || 'http://localhost:8093/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.querySelector('#talk'));
for (let i = 0; i < 40; i++) { // tap blank space as soon as the talk listener is live
  await p.mouse.click(200, 300);
  if (await p.evaluate(() => document.querySelector('#talk').getAttribute('aria-pressed') === 'true')) break;
  await p.waitForTimeout(25);
}
const ready0 = await p.evaluate(() => document.documentElement.dataset.ready);
await p.waitForSelector('html[data-ready="true"]'); await p.waitForTimeout(800);
const spoken = await p.evaluate(() => window.__spoken.filter((s) => s.listening === 'true'));
const ok = spoken.length === 0;
console.log(ok ? 'ok  ' : 'FAIL', 'nothing voiced while the mic is open', JSON.stringify(spoken));
await b.close();
process.exit(ok ? 0 : 1);
