// Dev only: the race page at three sizes, started, tapped and finished. PLAYWRIGHT=<pkg> node scripts/flow-race.mjs [url]
const { chromium } = await import(process.env.PLAYWRIGHT);
const b = await chromium.launch(); const errors = [];
for (const [name, w, h, z] of [['race-desktop', 1280, 633, 1], ['race-phone', 390, 757, 1], ['race-phone-400', 390, 757, 4]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto((process.argv[2] || 'http://localhost:8080/') + 'race', { waitUntil: 'networkidle' });
  if (z > 1) await p.evaluate((z) => { document.documentElement.style.fontSize = `${z * 100}%`; }, z);
  await p.click('#start');
  await p.locator('[data-lane="a"] .tap').click(); await p.locator('[data-lane="b"] .tap').click(); await p.locator('[data-lane="b"] .tap').click();
  await p.waitForTimeout(1300);
  await p.locator('[data-lane="a"] .done').click();
  await p.waitForTimeout(400);
  console.log(name, await p.locator('#say').textContent(), 'hscroll', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await p.screenshot({ path: `shots/${name}.png` });
}
await b.close();
if (errors.length) { console.error(errors); process.exit(1); }
