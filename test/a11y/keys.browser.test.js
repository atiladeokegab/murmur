// specimen-b: Space on a focused control must press it, and the first tap or Enter after load must not be swallowed.
// PLAYWRIGHT=<package entry> node --test test/a11y/keys.browser.test.js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';

let browser, server, url;
before(async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
  process.env.GEMINI_API_KEY = ''; process.env.ELEVENLABS_API_KEY = '';
  ({ server } = await import('../../server.js'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/?quiet`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); if (server?.listening) await new Promise((r) => server.close(r)); });

async function fresh() {
  const page = await browser.newPage({ viewport: { width: 390, height: 757 } });
  await page.addInitScript(() => { class R { start() {} stop() { this.onend?.(); } abort() {} } window.SpeechRecognition = window.webkitSpeechRecognition = R;
    Object.defineProperty(Navigator.prototype, 'userActivation', { get: () => ({ hasBeenActive: false, isActive: false }) }); }); // a phone fresh from the link: nothing tapped, so the welcome waits for the first press
  await page.goto(url); // a first open: the welcome has not been said, and nothing has been tapped yet
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  return page;
}
const opened = (page) => page.evaluate(() => !!window.murmur.current());
const listening = (page) => page.evaluate(() => document.querySelector('#talk').getAttribute('aria-pressed') === 'true');

test('the first tap after load on a board tile opens it', async () => {
  const page = await fresh();
  try {
    await page.locator('#board .tile').first().click();
    await page.waitForTimeout(300);
    assert.equal(await opened(page), true, 'the first tap opened the app');
  } finally { await page.close(); }
});

test('the first Enter after load inside an app presses the focused button', async () => {
  const page = await fresh();
  try {
    await page.evaluate(() => window.murmur.open('hello')); await page.waitForTimeout(300);
    await page.locator('#hello-box').fill('hi Sam'); // fill types no keys, so the first press is still to come
    await page.locator('#hello-send').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#hello-sent li').count(), 1, 'Enter pressed Send');
  } finally { await page.close(); }
});

test('Space on a focused tile presses the tile and does not summon talk', async () => {
  const page = await fresh();
  try {
    await page.mouse.click(5, 5); await page.waitForTimeout(200); // spend the first tap on blank space
    if (await listening(page)) { await page.mouse.click(5, 5); await page.waitForTimeout(200); }
    await page.locator('#board .tile').first().focus();
    await page.keyboard.press(' ');
    await page.waitForTimeout(300);
    assert.equal(await listening(page), false, 'Space did not start listening');
    assert.equal(await opened(page), true, 'Space pressed the tile');
  } finally { await page.close(); }
});

test('Space on blank space still summons talk', async () => {
  const page = await fresh();
  try {
    await page.mouse.click(5, 5); await page.waitForTimeout(200);
    if (await listening(page)) { await page.mouse.click(5, 5); await page.waitForTimeout(200); }
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press(' ');
    await page.waitForTimeout(200);
    assert.equal(await listening(page), true);
  } finally { await page.close(); }
});
