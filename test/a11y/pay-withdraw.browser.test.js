// Prometheus on os 046a02f: Stop must withdraw the fingerprint prompt on a hand-tapped pay, not only ignore its answer.
// PLAYWRIGHT=<package entry> node --test test/a11y/pay-withdraw.browser.test.js
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

for (const how of ['Stop', 'No', 'Back']) {
  test(`${how} on a hand-tapped pay withdraws the WebAuthn prompt and pays nothing`, async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 757 } });
    try {
      await page.addInitScript(() => {
        localStorage.setItem('murmur:passkey', 'AQ');
        Object.defineProperty(navigator, 'credentials', { value: { get: (o) => new Promise((res, rej) => {
          window.prompt = { signal: o.signal, finish: res };
          o.signal?.addEventListener('abort', () => rej(new DOMException('withdrawn', 'AbortError')));
        }) } });
      });
      await page.goto(url);
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      await page.evaluate(() => window.murmur.install('grocer')); await page.evaluate(() => window.murmur.open('grocer'));
      await page.fill('#grocer-add', 'milk'); await page.click('#grocer-add-btn');
      await page.click('#grocer-order'); await page.locator('#sheet-yes').waitFor();
      await page.click('#sheet-yes');
      await page.waitForFunction(() => window.prompt?.signal);
      assert.equal(await page.evaluate(() => window.prompt.signal.aborted), false, 'the prompt is up');
      if (how === 'Stop') await page.evaluate(() => murmur.host.verbs.stop());
      if (how === 'No') await page.evaluate(() => murmur.host.sheet.no());
      if (how === 'Back') await page.goBack();
      await page.waitForFunction(() => window.prompt.signal.aborted, null, { timeout: 2000 });
      await page.evaluate(() => { const d = new Uint8Array(37); d[32] = 4; window.prompt.finish({ response: { authenticatorData: d.buffer } }); }); // too late
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => murmur.bus.log.some((e) => e.name === 'confirm' && e.result)), false, 'nothing paid');
    } finally { await page.close(); }
  });
}
