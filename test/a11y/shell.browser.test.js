// PLAYWRIGHT=<package entry> AXE_CORE=<axe.min.js> node --test test/a11y/shell.browser.test.js
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
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('murmur:os.onboard:said', 'true');
    window.__tts = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() {}, getVoices() { return []; }, speak(utterance) {
        window.__tts.push(utterance.text);
        queueMicrotask(() => utterance.onend?.());
      },
    } });
  });
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  return page;
}

test('task lifecycle moves focus to Stop and the Done line', async () => {
  const page = await shellPage();
  try {
    await page.evaluate(() => {
      murmur.bus.emit('task:start', { task: 'a11y', utterance: 'Read my calendar', plan: [] });
    });
    await page.waitForFunction(() => document.activeElement?.id === 'stop');
    await page.evaluate(() => murmur.bus.emit('task:done', {
      task: 'a11y', ms: 100, ok: true, line: 'Done: your calendar is clear.', undo: null,
    }));
    await page.waitForFunction(() => document.activeElement?.id === 'done-line');
    await page.evaluate(() => {
      murmur.bus.emit('task:start', { task: 'a11y', utterance: 'Change my calendar', plan: [] });
      murmur.bus.emit('task:done', {
        task: 'a11y', ms: 100, ok: true, line: 'Done: the event moved.',
        undo: { label: 'the event', until: Date.now() + 5000 },
      });
    });
    await page.waitForFunction(() => document.activeElement?.id === 'undo');
    assert.match(await page.locator('#done-line').textContent(), /event moved/);
  } finally { await page.close(); }
});

test('Calendar shows one active status region; Your look selects the speaking mode', async () => {
  const page = await shellPage();
  try {
    await page.locator('#look-link').click();
    await page.locator('#look-speaker-reader').click();
    await page.waitForFunction(() => document.querySelector('#say')?.getAttribute('aria-live') === 'polite');
    await page.evaluate(() => murmur.host.speak('Reader mode stays silent.', new AbortController().signal));
    assert.equal(await page.evaluate(() => window.__tts.includes('Reader mode stays silent.')), false);

    await page.evaluate(() => murmur.open('calendar'));
    await page.getByRole('button', { name: 'Wednesday', exact: true }).click();
    await page.getByRole('button', { name: 'Add an event' }).click();
    await page.locator('#cal-what').fill('A11y check');
    await page.locator('#cal-when-day').fill('Wednesday');
    await page.locator('#cal-when-time').fill('10:00');
    await page.getByRole('button', { name: 'Save' }).click();
    const activeStatuses = page.locator('[role="status"]:visible');
    await page.getByText('Added A11y check on Wednesday at 10 am.').waitFor();
    assert.equal(await activeStatuses.count(), 1);

    await page.evaluate(() => murmur.home());
    await page.locator('#look-link').click();
    await page.locator('#look-speaker-murmur').click();
    await page.waitForFunction(() => document.querySelector('#say')?.getAttribute('aria-live') === 'off');
    assert.equal(await page.locator('[role="status"][aria-live="polite"]:visible').count(), 0);
    await page.evaluate(() => murmur.host.speak('Murmur voice is enabled.', new AbortController().signal));
    assert.equal(await page.evaluate(() => window.__tts.includes('Murmur voice is enabled.')), true);
  } finally { await page.close(); }
});

test('Back dismisses a confirmation as No and leaves the app unchanged', async () => {
  const page = await shellPage();
  try {
    await page.evaluate(() => {
      const app = murmur.registry.get('messages');
      window.confirmResult = murmur.host.ctxFor(app).confirm('send', 'Send a message to Mum.');
    });
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByText('Send?', { exact: true }).waitFor();
    assert.equal(await dialog.locator('#sheet-readback').textContent(), 'Send a message to Mum.');
    assert.equal(await page.locator('#apps').evaluate((el) => el.inert), true);
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('#sheet').open);
    assert.equal(await page.evaluate(() => window.confirmResult), false);
    assert.equal(await page.locator('#apps').evaluate((el) => el.inert), false);
    assert.equal(await page.locator('#sheet[open]').count(), 0);
  } finally { await page.close(); }
});

test('a read-only task keeps the previous change available through its Undo button', async () => {
  const page = await shellPage();
  try {
    const until = await page.evaluate(async () => {
      await murmur.agent.runner.run({ utterance: 'write', steps: [
        { tool: 'hello__write', app: 'hello', action: 'write', params: { text: 'Lunch on Tuesday.' } },
      ] });
      return murmur.bus.log.filter((e) => e.name === 'task:done').at(-1).undo.until;
    });
    assert.ok(await page.locator('#undo').isVisible());
    const nextUntil = await page.evaluate(async () => {
      await murmur.agent.runner.run({ utterance: 'open Mum', steps: [
        { tool: 'messages__openChat', app: 'messages', action: 'openChat', params: { id: 'mum' } },
      ] });
      return murmur.bus.log.filter((e) => e.name === 'task:done').at(-1).undo?.until;
    });
    assert.equal(nextUntil, until, 'the original expiry is preserved');
    assert.ok(await page.locator('#undo').isVisible());
    await page.locator('#undo').click();
    await page.waitForFunction(() => murmur.registry.get('hello').state().draft === '');
  } finally { await page.close(); }
});
