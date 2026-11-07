// PLAYWRIGHT=<package entry> node --test test/a11y/manual-pay.browser.test.js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';

let browser, server, url;
before(async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
  process.env.GEMINI_API_KEY = '';
  process.env.ELEVENLABS_API_KEY = '';
  ({ server } = await import('../../server.js'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/?quiet`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

for (const cancel of ['Stop', 'Back']) {
  test(`${cancel} revokes payment approval while fingerprint authentication is pending`, async () => {
    const page = await browser.newPage();
    try {
      await page.addInitScript(() => {
        localStorage.setItem('murmur:passkey', 'AQ');
        Object.defineProperty(navigator, 'credentials', { value: {
          get: () => new Promise((resolve) => { window.finishAuthentication = resolve; }),
        } });
      });
      await page.goto(url);
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      await page.evaluate(() => {
        window.approval = 'pending';
        const app = murmur.registry.list()[0];
        murmur.host.ctxFor(app).confirm('pay', 'Pay one simulated pound.').then(
          (ok) => { window.approval = ok; },
          () => { window.approval = false; },
        );
      });
      await page.locator('#sheet-yes').waitFor();
      await page.waitForTimeout(550); // the agent-style confirm ignores a yes during its first 0.5 seconds
      await page.locator('#sheet-yes').click();
      await page.waitForFunction(() => typeof window.finishAuthentication === 'function');
      if (cancel === 'Stop') await page.evaluate(() => {
        murmur.host.verbs.stop();
        const app = murmur.registry.list()[0];
        murmur.host.ctxFor(app).confirm('send', 'Keep this new confirmation open.').catch(() => {});
      });
      else {
        await page.goBack();
        await page.waitForFunction(() => !document.querySelector('#sheet').open);
        await page.evaluate(() => {
          const app = murmur.registry.list()[0];
          murmur.host.ctxFor(app).confirm('send', 'Keep this new confirmation open.').catch(() => {});
        });
      }
      await page.evaluate(() => {
        const data = new Uint8Array(37);
        data[32] = 0x04; // WebAuthn user-verification bit; the successful response deliberately arrives late
        window.finishAuthentication({ response: { authenticatorData: data.buffer } });
      });
      await page.waitForFunction(() => window.approval !== 'pending');
      assert.equal(await page.evaluate(() => window.approval), false);
      assert.ok(await page.locator('#sheet').isVisible());
      assert.equal(await page.locator('#sheet-readback').textContent(), 'Keep this new confirmation open.');
    } finally { await page.close(); }
  });
}
