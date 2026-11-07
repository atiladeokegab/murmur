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

test('agent cursor is hidden from assistive technology and skips its glide for reduced motion', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = await page.locator('#hello-send').evaluate(async (el) => {
    const { createCursor } = await import('/sdk/cursor.js');
    const cursor = createCursor(document);
    await cursor.moveTo(el, 'Send to Sam');
    const ring = document.querySelector('.agent-cursor');
    return {
      hiddenFromAT: ring.getAttribute('aria-hidden'),
      name: ring.dataset.name,
      transition: getComputedStyle(ring).transitionDuration,
      left: ring.style.getPropertyValue('--x'),
    };
  });
  assert.equal(result.hiddenFromAT, 'true');
  assert.equal(result.name, 'Send to Sam');
  assert.equal(result.transition, '0s');
  assert.match(result.left, /^\d+(?:\.\d+)?px$/);
});
