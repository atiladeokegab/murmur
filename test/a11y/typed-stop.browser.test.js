// PLAYWRIGHT=<package entry> node --test test/a11y/typed-stop.browser.test.js
// Exercise Stop through Talk and the typed form while a real taxi hand-tap is awaiting pay verification.
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

async function typeStopThroughTalk(page) {
  await page.locator('#talk').click();
  await page.locator('#typed-text').waitFor();
  await page.locator('#typed-text').fill('stop');
  await page.locator('#typed-text').press('Enter');
}

test('typed Stop withdraws a pending user-verification result before a taxi can book', async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      localStorage.setItem('murmur:look', JSON.stringify({ speaker: 'reader', planner: 'offline' }));
      localStorage.setItem('murmur:os.onboard:said', 'true');
      localStorage.setItem('murmur:os.plugins:installed', JSON.stringify([{ id: 'taxi', path: 'taxi/index.js' }]));
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
      localStorage.setItem('murmur:passkey', 'AQ');
      window.authenticationPrompts = 0;
      Object.defineProperty(navigator, 'credentials', { configurable: true, value: {
        get: () => new Promise((resolve) => { window.authenticationPrompts++; window.finishAuthentication = resolve; }),
      } });
    });
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true' && !!murmur.registry.get('taxi'));
    await page.locator('#board .tile[data-app="taxi"]').click();
    await page.locator('#taxi-to').fill('Home');
    await page.locator('#taxi-book').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.match(await dialog.locator('#sheet-readback').textContent(), /Book a taxi to Home, £14/);
    await dialog.locator('#sheet-yes').click();
    await page.waitForFunction(() => window.authenticationPrompts === 1);

    await typeStopThroughTalk(page);
    await page.waitForFunction(() => !document.querySelector('#sheet').open);
    const data = new Uint8Array(37);
    data[32] = 0x04;
    await page.evaluate((bytes) => window.finishAuthentication({ response: { authenticatorData: new Uint8Array(bytes).buffer } }), [...data]);
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => murmur.registry.get('taxi').state().booking), null);
  } finally { await page.close(); }
});

test('typed Stop cancels a pending authenticator-availability check before it can prompt', async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      localStorage.setItem('murmur:look', JSON.stringify({ speaker: 'reader', planner: 'offline' }));
      localStorage.setItem('murmur:os.onboard:said', 'true');
      localStorage.setItem('murmur:os.plugins:installed', JSON.stringify([{ id: 'taxi', path: 'taxi/index.js' }]));
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
      window.availabilityChecks = window.fingerprintPrompts = 0;
      const available = new Promise((resolve) => { window.finishAvailability = resolve; });
      Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: class {} });
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () => {
        window.availabilityChecks++;
        return available;
      };
      Object.defineProperty(navigator, 'credentials', { configurable: true, value: { create: async () => {
        window.fingerprintPrompts++;
        return null;
      } } });
    });
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true' && !!murmur.registry.get('taxi'));
    await page.locator('#board .tile[data-app="taxi"]').click();
    await page.locator('#taxi-to').fill('Home');
    await page.locator('#taxi-book').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.match(await dialog.locator('#sheet-readback').textContent(), /Book a taxi to Home, £14/);
    await dialog.locator('#sheet-yes').click();
    await page.waitForFunction(() => window.availabilityChecks === 1);

    await typeStopThroughTalk(page);
    await page.waitForFunction(() => !document.querySelector('#sheet').open);
    await page.evaluate(() => window.finishAvailability(true));
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.fingerprintPrompts), 0);
    assert.equal(await page.evaluate(() => murmur.registry.get('taxi').state().booking), null);
  } finally { await page.close(); }
});
