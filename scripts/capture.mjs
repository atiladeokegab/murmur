// Dev only: screenshots of the home screen at the three judged sizes. PLAYWRIGHT=<path to playwright pkg> node scripts/capture.mjs [url] [outdir]
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const url = process.argv[2] || 'http://localhost:8080/';
const out = process.argv[3] || 'shots';
const prep = process.argv[4] || '';   // optional JS run before the shot, e.g. "murmur.loadWeek()"
const browser = await chromium.launch();
let failed = 0;
for (const [name, w, h, q] of [['desktop', 1280, 633, ''], ['phone', 390, 757, ''], ['phone-400', 390, 757, '?zoom=4']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { failed++; console.error(`[${name}] page error:`, e.message); });
  page.on('console', (m) => m.type() === 'error' && console.error(`[${name}] console:`, m.text()));
  await page.goto(url + q, { waitUntil: 'networkidle' });
  if (prep) await page.evaluate(prep);
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) console.error(`[${name}] horizontal scroll`);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
