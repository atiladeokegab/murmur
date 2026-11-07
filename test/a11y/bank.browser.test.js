// PLAYWRIGHT=<package entry> node --test test/a11y/bank.browser.test.js
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

async function bankPage() {
  const page = await browser.newPage({ viewport: { width: 390, height: 757 } });
  await page.addInitScript(() => {
    localStorage.setItem('murmur:passkey', 'AQ');
    localStorage.setItem('murmur:look', JSON.stringify({ speaker: 'reader', planner: 'offline' }));
    Object.defineProperty(navigator, 'credentials', { value: { get: async () => {
      const data = new Uint8Array(37);
      data[32] = 0x04;
      return { response: { authenticatorData: data.buffer } };
    } } });
  });
  await page.goto(`${url}?quiet`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await page.evaluate(() => murmur.open('bank'));
  await page.locator('#app-bank h2').waitFor();
  return page;
}

test('Balance and Pay screen changes keep keyboard focus in Bank', async () => {
  const page = await bankPage();
  try {
    const bank = page.locator('#app-bank');
    await page.locator('#bank-balance').click();
    const balanceFocusStayedInBank = await bank.evaluate((root) => root.contains(document.activeElement));

    await page.locator('#bank-back').click();
    await page.locator('#bank-pay-open').click();
    const payFocusStayedInBank = await bank.evaluate((root) => root.contains(document.activeElement));
    assert.deepEqual({ balance: balanceFocusStayedInBank, pay: payFocusStayedInBank }, { balance: true, pay: true });
  } finally { await page.close(); }
});

test('Reader mode exposes one live status after a simulated Bank payment', async () => {
  const page = await bankPage();
  try {
    await page.evaluate(() => murmur.open('look'));
    await page.locator('#look-speaker-reader').click();
    await page.waitForFunction(() => document.documentElement.dataset.speaker === 'reader');
    await page.evaluate(() => murmur.open('bank'));

    await page.locator('#bank-pay-open').click();
    await page.locator('[data-payee="mum"]').click();
    await page.locator('#bank-amount').fill('20');
    await page.locator('#bank-pay').click();
    await page.getByRole('dialog').waitFor();
    assert.match(await page.locator('#sheet-readback').textContent(), /Mum £20/);
    await page.waitForTimeout(600);
    await page.locator('#sheet-yes').click(); // local fake passkey; no hardware or external payment service
    await page.waitForFunction(() => document.querySelector('#say')?.textContent.trim() === 'Paid Mum twenty pounds.');

    const statuses = await page.locator('[role="status"]:visible').evaluateAll((els) => els.map((el) => ({
      text: el.textContent.trim(),
      live: el.getAttribute('aria-live') || (el.getAttribute('role') === 'status' ? 'polite (role default)' : 'off'),
    })));
    const active = statuses.filter((status) => status.live.startsWith('polite'));
    assert.equal(statuses.length, 1, JSON.stringify(statuses));
    assert.equal(active.length, 1, `visible status regions=${statuses.length}: ${JSON.stringify(statuses)}`);
    assert.equal(active[0].text, 'Paid Mum twenty pounds.', JSON.stringify(statuses));
  } finally { await page.close(); }
});

test('Split action clears a previously selected recipient when reusing the real form', async () => {
  const page = await bankPage();
  try {
    await page.locator('#bank-split-open').click();
    await page.locator('[data-payee="mum"]').click();
    await page.locator('#bank-back').click();
    await page.locator('#bank-split-open').click();
    await page.locator('[data-payee="mum"]').click();
    assert.deepEqual(await page.evaluate(() => murmur.registry.get('bank').state().draft.to), ['mum']);

    const result = await page.evaluate(async () => {
      const app = murmur.registry.get('bank');
      await app.actions.splitBill.run({ who: ['Landlord'], total: 100 }, murmur.host.ctxFor(app));
      const state = app.state();
      return { to: state.lastPaid?.to, pence: state.lastPaid?.pence, balance: state.balance };
    });
    assert.deepEqual(result, { to: ['landlord'], pence: [10000], balance: 114050 });
  } finally { await page.close(); }
});

test('a payment cannot exceed the amount the person approved if the draft changes during the final cursor wait', async () => {
  const page = await bankPage();
  try {
    await page.evaluate(async () => {
      const { runAction } = await import('/sdk/run.js');
      const app = murmur.registry.get('bank');
      const originalCtxFor = murmur.host.ctxFor;
      const ctxFor = (target) => {
        const ctx = originalCtxFor(target);
        const originalTap = ctx.tap.bind(ctx);
        ctx.tap = async (control, ...args) => {
          if (control.id !== 'bank-pay') return originalTap(control, ...args);
          window.__payTapStarted = performance.now();
          setTimeout(() => {
            const input = document.querySelector('#bank-amount');
            input.value = '30';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            window.__draftChangedAt = performance.now();
          }, 50);
          const result = await originalTap(control, ...args); // real shell cursor waits 150 ms before clicking
          window.__payTapReturned = performance.now();
          return result;
        };
        return ctx;
      };
      window.__runAction = runAction({
        registry: murmur.registry,
        name: 'bank__payPerson',
        params: { who: 'Mum', amount: 20 },
        bus: murmur.bus,
        ctxFor,
      });
    });

    await page.getByRole('dialog').waitFor();
    assert.match(await page.locator('#sheet-readback').textContent(), /Mum £20/);
    await page.waitForTimeout(600);
    await page.locator('#sheet-yes').click(); // real Playwright click; the passkey fixture is local and simulated

    const result = await page.evaluate(() => window.__runAction);
    const evidence = await page.evaluate(() => {
      const state = murmur.registry.get('bank').state();
      return {
        tapStarted: window.__payTapStarted,
        draftChanged: window.__draftChangedAt,
        tapReturned: window.__payTapReturned,
        balance: state.balance,
        lastPaid: state.lastPaid,
      };
    });
    assert.ok(evidence.draftChanged > evidence.tapStarted && evidence.draftChanged < evidence.tapReturned, JSON.stringify(evidence));
    assert.deepEqual({ balance: evidence.balance, lastPaid: evidence.lastPaid },
      { balance: 124050, lastPaid: null }, `a changed payment must be refused before any debit: ${JSON.stringify({ result, evidence })}`);
  } finally { await page.close(); }
});
