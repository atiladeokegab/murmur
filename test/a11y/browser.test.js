// PLAYWRIGHT=<package entry> AXE_CORE=<axe.min.js> node --test test/a11y/browser.test.js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { audit, overflow, smallTargets } from './checks.js';

const require = createRequire(import.meta.url);
let browser, server, url, axePath;

before(async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
  axePath = process.env.AXE_CORE || require.resolve('axe-core/axe.min.js');
  // The audit must not need a model key or an external service.
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

test('audit detects unnamed controls, small targets, clipping and contrast below 7:1', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 757 } });
  try {
    await page.setContent('<html lang="en"><head><title>Check</title></head><body style="background:white"><main><h1>Check</h1><button style="width:30px;height:30px"></button><p style="font:32px sans-serif;color:#666">Large low-contrast text</p><div style="width:600px">Overflow</div></main></body></html>');
    const result = await audit(page, axePath);
    assert.ok(result.violations.some((r) => r.id === 'button-name'));
    assert.ok(result.violations.some((r) => r.id === 'color-contrast'));
    assert.equal((await smallTargets(page)).length, 1);
    assert.ok((await overflow(page)).elements.length > 0);
  } finally { await page.close(); }
});

for (const [name, width, query] of [
  ['phone', 390, ''],
  ['400% text on phone', 390, '?zoom=4'],
  ['400% browser reflow from 1280px', 320, ''],
]) {
  test(`board: ${name}`, async (t) => {
    const page = await browser.newPage({ viewport: { width, height: 757 }, reducedMotion: 'reduce' });
    try {
      await page.goto(url + query);
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      await page.getByRole('button', { name: /talk/i }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (query) assert.equal(await page.locator('html').evaluate((el) => getComputedStyle(el).fontSize), '64px');
      await t.test('semantics and 7:1 contrast', async () => {
        const result = await audit(page, axePath);
        if (result.manual.length) t.diagnostic(`Needs manual inspection: ${JSON.stringify(result.manual)}`);
        assert.deepEqual(result.violations, []);
      });
      await t.test('64px controls', async () => assert.deepEqual(await smallTargets(page), []));
      await t.test('reflow without horizontal scrolling or clipping', async () => {
        const result = await overflow(page);
        assert.equal(result.viewport, width);
        assert.ok(result.document <= width + 1, JSON.stringify(result));
        assert.deepEqual(result.elements, []);
      });
      await t.test('one status region and no positive tabindex', async () => {
        assert.equal(await page.locator('[role="status"]:visible').count(), 1);
        assert.equal(await page.locator('[tabindex]').evaluateAll((els) => els.filter((el) => el.tabIndex > 0).length), 0);
      });
      await t.test('keyboard focus follows control source order', async () => {
        const selector = 'a[href], button, input, textarea, select, [tabindex]';
        const expected = await page.locator('*').evaluateAll((els, s) => els.flatMap((el, i) =>
          el.matches(s) && el.tabIndex >= 0 && !el.disabled && el.checkVisibility() && !el.closest('[inert]') ? [i] : []), selector);
        await page.locator('body').evaluate((el) => {
          el.tabIndex = -1; el.focus(); el.removeAttribute('tabindex');
        });
        const actual = [];
        while (actual.at(-1) !== expected.at(-1)) {
          await page.keyboard.press('Tab');
          const index = await page.evaluate(() => [...document.querySelectorAll('*')].indexOf(document.activeElement));
          assert.ok(index > (actual.at(-1) ?? -1), `Focus reversed or wrapped: ${JSON.stringify({ actual, index, expected })}`);
          actual.push(index);
        }
        // Chromium can also focus scroll regions without an explicit tabindex.
        assert.deepEqual(actual.filter((i) => expected.includes(i)), expected);
      });
      await t.test('reduced motion leaves no running animation', async () => {
        assert.deepEqual(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.effect.target.outerHTML)), []);
      });
    } finally { await page.close(); }
  });
}
