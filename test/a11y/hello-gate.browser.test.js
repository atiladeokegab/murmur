// PLAYWRIGHT=<package entry> node --test test/a11y/hello-gate.browser.test.js
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
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

test('a hand-tapped Hello Send shows its readback and No leaves the sent list unchanged', async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('murmur:look', JSON.stringify({ speaker: 'reader', planner: 'offline' }));
    });
    await page.goto(`${url}?quiet`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await page.evaluate(() => murmur.open('hello'));

    await page.locator('#hello-box').fill('Lunch on Tuesday.');
    await page.getByRole('button', { name: 'Send to Sam' }).click();
    await page.waitForFunction(() => document.querySelector('#sheet')?.open || murmur.registry.get('hello').state().sent.length > 0);
    assert.ok(await page.locator('#sheet').isVisible(), 'Send should wait for a hand confirmation');
    assert.equal(await page.locator('#sheet-readback').textContent(), 'Send to Sam: Lunch on Tuesday.');
    assert.deepEqual(await page.evaluate(() => murmur.registry.get('hello').state().sent), []);

    await page.locator('#sheet-no').click();
    await page.waitForFunction(() => !document.querySelector('#sheet').open);
    assert.deepEqual(await page.evaluate(() => murmur.registry.get('hello').state().sent), []);

    await page.getByRole('button', { name: 'Send to Sam' }).click();
    await page.waitForFunction(() => document.querySelector('#sheet')?.open || murmur.registry.get('hello').state().sent.length > 0);
    assert.ok(await page.locator('#sheet').isVisible(), 'the second hand Send should also ask');
    assert.equal(await page.locator('#sheet-readback').textContent(), 'Send to Sam: Lunch on Tuesday.');
    await page.waitForTimeout(550);
    await page.locator('#sheet-yes').click();
    await page.waitForFunction(() => murmur.registry.get('hello').state().sent.length === 1);
    assert.deepEqual(await page.evaluate(() => murmur.registry.get('hello').state().sent), ['Lunch on Tuesday.']);
  } finally { await page.close(); }
});
