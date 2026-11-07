// PLAYWRIGHT=<package entry> node --test test/a11y/sdk.browser.test.js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';

let browser, server, page, url;

before(async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
  if (!process.env.AXE_CORE) throw new Error('Set AXE_CORE to the local axe-core/axe.min.js path.');
  process.env.GEMINI_API_KEY = '';
  process.env.ELEVENLABS_API_KEY = '';
  ({ server } = await import('../../server.js'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 757 } });
  await page.route('**/os/shell.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto(url);
  await page.evaluate(async () => {
    const [{ default: app }, { mountApp }, { createBus }] = await Promise.all([
      import('/apps/hello/index.js'), import('/sdk/load.js'), import('/sdk/bus.js'),
    ]);
    const root = await mountApp(app, document.body, {
      kv: { get: async () => undefined, set: async () => {} }, bus: createBus(),
    });
    root.hidden = false;
  });
  await page.addScriptTag({ path: process.env.AXE_CORE });
});

after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

test('mounted Hello exposes its labelled, headed app and controls in a real browser', async () => {
  const root = page.locator('#app-hello');
  assert.equal(await page.locator('#hello-send').count(), 1);
  assert.equal(await page.locator('#hello-box').count(), 1);
  assert.equal(await root.getAttribute('aria-labelledby'), 'hello-h');
  assert.ok(await page.getByRole('heading', { level: 2, name: 'Hello' }).isVisible());
  assert.ok(await page.getByRole('textbox', { name: 'Your message to Sam' }).isVisible());
  assert.ok(await page.getByRole('button', { name: 'Send to Sam' }).isVisible());
  const violations = await root.evaluate(async (el) => {
    const result = await axe.run(el, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
  });
  assert.deepEqual(violations, []);
});

test('mounted Hello visible controls meet the 64px target floor', async () => {
  const targets = await page.locator('#app-hello textarea, #app-hello button').evaluateAll((els) => els.filter((el) => el.checkVisibility()).map((el) => {
    const { width, height } = el.getBoundingClientRect();
    return { name: el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent, width, height };
  }));
  assert.ok(targets.length, 'expected the sample text box and button');
  assert.deepEqual(targets.filter(({ width, height }) => width < 64 || height < 64), []);
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`agent cursor lands on its first and second targets without scrolling (${reducedMotion})`, async () => {
    await page.emulateMedia({ reducedMotion });
    const results = await page.evaluate(async () => {
      const { createCursor } = await import('/sdk/cursor.js');
      const cursor = createCursor(document), results = [];
      const scroll = { x: scrollX, y: scrollY };
      // Visible fixed targets prevent a scroll event from repairing a missing first placement.
      for (const [i, name] of ['First target', 'Second target'].entries()) {
        const target = document.createElement('button');
        target.textContent = name;
        target.style.cssText = `position:fixed;left:${32 + i * 160}px;top:${120 + i * 200}px;width:140px;height:64px`;
        document.body.append(target);
        await cursor.moveTo(target, name);
        const ring = document.querySelector('.agent-cursor');
        await Promise.all(ring.getAnimations().map((animation) => animation.finished));
        results.push({
          target: target.getBoundingClientRect().toJSON(), ring: ring.getBoundingClientRect().toJSON(),
          visible: ring.checkVisibility(), hiddenFromAT: ring.getAttribute('aria-hidden'), name: ring.dataset.name,
          transitionProperties: getComputedStyle(ring).transitionProperty.split(',').map((p) => p.trim()),
          animation: getComputedStyle(ring).animationName, scroll, afterScroll: { x: scrollX, y: scrollY },
        });
        target.remove();
      }
      cursor.hide();
      document.querySelector('.agent-cursor').remove();
      return results;
    });
    for (const [i, result] of results.entries()) {
      assert.equal(result.visible, true);
      assert.equal(result.hiddenFromAT, 'true');
      assert.equal(result.name, i ? 'Second target' : 'First target');
      assert.deepEqual(result.afterScroll, result.scroll, 'placement must work before any scroll');
      for (const dimension of ['x', 'y', 'width', 'height']) {
        assert.ok(Math.abs(result.ring[dimension] - result.target[dimension]) <= 1,
          `${result.name}: ring ${dimension} ${result.ring[dimension]} must match target ${result.target[dimension]}`);
      }
      if (reducedMotion === 'reduce') {
        assert.ok(result.transitionProperties.every((p) => p === 'opacity' || p === 'none'));
        assert.equal(result.animation, 'none');
      }
    }
  });
}
