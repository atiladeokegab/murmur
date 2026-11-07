// Dev only: the Live path end to end against scripts/fake-live.mjs, with Chromium's fake microphone.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const url = process.argv[2] || 'http://localhost:8081/';
const fake = process.argv[3] || 'http://localhost:8790/';
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 757 }, permissions: ['microphone'] });
await ctx.addInitScript(() => { window.open = (u) => { (window.opened ||= []).push(u); return {}; }; });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => /Live unavailable/.test(m.text()) && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
const talk = page.locator('#talk');
async function turn(expect) {
  const box = await talk.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
  await page.waitForFunction((re) => new RegExp(re).test(document.querySelector('#say').textContent), expect.source, { timeout: 8000 })
    .catch(() => errors.push(`no "${expect.source}"`));
  console.log('said:', await page.locator('#say').textContent());
}
await turn(/Mum says/);
await turn(/two on Sunday/);
const draft = await page.locator('#draft').inputValue();
console.log('draft:', draft);
await turn(/^Sentence 1 of 2/);
const log = await (await fetch(fake)).json();
console.log(`fake live: setup model ${log.setup?.model}, ${log.audioChunks} audio chunks, ${log.turns} turns, tools: ${log.toolResponses.map((r) => r.name).join(', ')}`);
if (!log.audioChunks) errors.push('no audio streamed');
if (!/two on Sunday/.test(draft)) errors.push('draft not edited');
await browser.close();
if (errors.length) { console.error('live flow FAILED:', errors.join(' | ')); process.exit(1); }
console.log('live flow ok');
