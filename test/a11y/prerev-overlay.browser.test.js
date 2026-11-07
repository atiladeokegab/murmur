import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
let browser, server, url;
before(async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
  process.env.GEMINI_API_KEY = ''; process.env.ELEVENLABS_API_KEY = '';
  ({ server } = await import('../../server.js'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/?quiet`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); if (server?.listening) await new Promise((r) => server.close(r)); });
async function setup(page) {
  await page.addInitScript(() => {
    localStorage.setItem('murmur:passkey', 'AQ');
    Object.defineProperty(navigator, 'credentials', { value: { get: () => new Promise((r) => { window.finishAuthentication = r; }) } });
  });
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
}
const finish = (page) => page.evaluate(() => { const d = new Uint8Array(37); d[32] = 4; window.finishAuthentication({ response: { authenticatorData: d.buffer } }); });
test('Stop after a second sheet opens over a pay awaiting fingerprint still cancels the pay', async () => {
  const page = await browser.newPage();
  try {
    await setup(page);
    await page.evaluate(() => { window.approval = 'pending'; const app = murmur.registry.list()[0];
      murmur.host.ctxFor(app).confirm('pay', 'Pay one pound.').then((ok) => { window.approval = ok; }, () => { window.approval = false; }); });
    await page.locator('#sheet-yes').waitFor(); await page.waitForTimeout(550);
    await page.locator('#sheet-yes').click();
    await page.waitForFunction(() => typeof window.finishAuthentication === 'function');
    await page.evaluate(() => { const app = murmur.registry.list()[0]; murmur.host.ctxFor(app).confirm('send', 'Second sheet.').catch(() => {}); });
    await page.evaluate(() => murmur.host.verbs.stop());
    await finish(page);
    await page.waitForFunction(() => window.approval !== 'pending', null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => window.approval), false);
  } finally { await page.close(); }
});
test('a sheet replaced before its answer still resolves (no hung confirm)', async () => {
  const page = await browser.newPage();
  try {
    await setup(page);
    await page.evaluate(() => { window.first = 'pending'; const app = murmur.registry.list()[0];
      murmur.host.ctxFor(app).confirm('pay', 'Pay one pound.').then((ok) => { window.first = ok; }, () => { window.first = false; });
      murmur.host.ctxFor(app).confirm('send', 'Second sheet.').catch(() => {}); });
    await page.evaluate(() => murmur.host.verbs.stop());
    await page.waitForFunction(() => window.first !== 'pending', null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => window.first), false);
  } finally { await page.close(); }
});
