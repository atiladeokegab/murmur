// PLAYWRIGHT=<package entry> AXE_CORE=<axe.min.js> node --test test/a11y/apps.browser.test.js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import { audit, overflow } from './checks.js';
import appIds from '../../public/apps/apps.js';

let browser, server, url, axePath;

before(async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
  if (!process.env.AXE_CORE) throw new Error('Set AXE_CORE to the local axe-core/axe.min.js path.');
  axePath = process.env.AXE_CORE;
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

async function mountedPage(id, zoom = 1) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  await page.route('**/os/shell.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto(`${url}?zoom=${zoom}`);
  await page.evaluate(async (appId) => {
    const [{ createRegistry }, { loadApps, mountApp }, { createBus, appKv }, { browserKV }, { default: ids }] = await Promise.all([
      import('/sdk/registry.js'), import('/sdk/load.js'), import('/sdk/index.js'),
      import('/ports/browser-kv.js'), import('/apps/apps.js'),
    ]);
    const registry = createRegistry();
    const apps = await loadApps(registry, ids);
    const app = apps.find(({ id }) => id === appId);
    if (!app) throw new Error(`App not found: ${appId}`);
    const host = document.createElement('main');
    document.body.replaceChildren(host);
    const bus = createBus();
    const root = await mountApp(app, host, { kv: appKv(app.id, browserKV({ prefix: 'murmur' })), bus });
    await app.seed?.();
    root.hidden = false;
  }, id);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function undersizedTargets(page) {
  return page.locator('button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="link"]').evaluateAll((nodes) =>
    nodes.filter((el) => el.checkVisibility() && !el.disabled && !el.closest('[inert]')).flatMap((el) => {
      const { width, height } = el.getBoundingClientRect();
      return width < 64 || height < 64 ? [{ target: el.outerHTML.slice(0, 250), width, height }] : [];
    }));
}

for (const id of appIds) {
  for (const zoom of [1, 4]) {
    test(`${id} app at ${zoom * 100}% text: names, 7:1 contrast, target size and reflow`, async (t) => {
      const page = await mountedPage(id, zoom);
      try {
        assert.equal(await page.locator('html').evaluate((el) => getComputedStyle(el).fontSize), `${zoom * 16}px`);
        const root = page.locator(`#app-${id}`);
        assert.equal(await root.getAttribute('aria-labelledby'), `${id}-h`);
        assert.ok(await root.getByRole('heading', { level: 2 }).isVisible());
        const result = await audit(page, axePath);
        if (result.manual.length) t.diagnostic(`Needs manual inspection: ${JSON.stringify(result.manual)}`);
        assert.deepEqual(result.violations, []);
        assert.deepEqual(await undersizedTargets(page), []);
        const flow = await overflow(page);
        assert.ok(flow.document <= flow.viewport + 1, JSON.stringify(flow));
        assert.deepEqual(flow.elements, []);
        assert.deepEqual(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length), 0);
      } finally { await page.close(); }
    });
  }
}

for (const [id, action, resultName] of [
  ['messages', async (page) => page.getByRole('button', { name: /^Mum\./ }).click(), 'Mum chat'],
  ['writer', async (page) => page.locator('#wr-last').click(), 'Read the last page'],
  ['mine', async (page) => page.getByRole('button', { name: "What's in My morning" }).click(), 'Run My morning'],
]) {
  test(`${id} keeps keyboard focus in the app after ${resultName}`, async () => {
    const page = await mountedPage(id);
    try {
      const root = page.locator(`#app-${id}`);
      const target = id === 'messages'
        ? page.getByRole('button', { name: /^Mum\./ })
        : id === 'writer' ? page.locator('#wr-last')
          : page.getByRole('button', { name: "What's in My morning" });
      await target.focus();
      await action(page);
      assert.ok(await page.evaluate((appId) => {
        const active = document.activeElement;
        return active && active !== document.body && document.querySelector(`#app-${appId}`)?.contains(active);
      }, id), `focus was lost after ${resultName}`);
    } finally { await page.close(); }
  });
}
