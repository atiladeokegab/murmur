// PLAYWRIGHT=<package entry> node --test test/a11y/calls.browser.test.js
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

async function shellPage() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem('murmur:look', JSON.stringify({ speaker: 'reader', planner: 'offline' }));
  });
  await page.goto(`${url}?quiet`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  return page;
}

const call = {
  utterance: 'Call Mum',
  steps: [{ tool: 'calls__call', app: 'calls', action: 'call', params: { who: 'Mum' } }],
};

test('the Call gate No leaves state and history unchanged', async () => {
  const page = await shellPage();
  try {
    await page.evaluate(async () => { await murmur.open('calls'); });
    const before = await page.evaluate(() => murmur.agent.runner.history.length);
    await page.evaluate((task) => { window.callTask = murmur.agent.runner.run(task); }, call);
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.locator('#sheet-readback').textContent(), 'Call Mum?');
    await dialog.locator('#sheet-no').click();
    const result = await page.evaluate(() => window.callTask);
    assert.equal(result.status, 'cancelled');
    assert.equal(await page.evaluate(() => murmur.registry.get('calls').state().status), 'idle');
    assert.equal(await page.evaluate(() => murmur.agent.runner.history.length), before);
  } finally { await page.close(); }
});

test('a trusted Call tap asks first; Yes starts the call with Hang up focus and one Reader status', async () => {
  const page = await shellPage();
  try {
    await page.evaluate(async () => { await murmur.open('calls'); });
    const before = await page.evaluate(() => ({
      state: murmur.registry.get('calls').state(), history: murmur.agent.runner.history.length,
    }));
    await page.locator('[data-call="mum"]').click(); // real trusted app-control activation
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(await dialog.locator('#sheet-readback').textContent(), 'Call Mum?');
    await dialog.locator('#sheet-no').click();
    await page.waitForFunction(() => !document.querySelector('#sheet').open);
    assert.deepEqual(await page.evaluate(() => ({
      state: murmur.registry.get('calls').state(), history: murmur.agent.runner.history.length,
    })), before, 'a hand No leaves state and history unchanged');
    await page.locator('[data-call="mum"]').click();
    await dialog.waitFor();
    assert.equal(await dialog.locator('#sheet-readback').textContent(), 'Call Mum?');
    assert.equal(await page.evaluate(() => murmur.registry.get('calls').state().status), 'idle', 'a tap does not call before Yes');
    await dialog.locator('#sheet-yes').click();
    await page.waitForFunction(() => murmur.registry.get('calls').state().status === 'calling');
    const duringCall = await page.evaluate(() => ({
      focus: document.activeElement?.id,
    }));
    await page.waitForFunction(() => murmur.registry.get('calls').state().status === 'noanswer');
    assert.ok(await page.locator('#app-calls').getByText(/Mum isn't picking up/).isVisible());
    const statuses = await page.locator('[role="status"]:visible').evaluateAll((els) => els.map((el) => ({
      text: el.textContent.trim(), live: el.getAttribute('aria-live') || 'polite',
    })));
    assert.equal(duringCall.focus, 'calls-hangup');
    assert.equal(statuses.length, 1, JSON.stringify(statuses));
    assert.equal(statuses[0].live, 'polite');
    assert.match(statuses[0].text, /Mum isn't picking up/);
  } finally { await page.close(); }
});
