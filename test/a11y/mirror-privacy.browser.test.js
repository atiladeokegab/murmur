import test from 'node:test';
import assert from 'node:assert/strict';

test('mirror frame omits a hidden app textarea value', async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
  process.env.GEMINI_API_KEY = '';
  process.env.ELEVENLABS_API_KEY = '';
  const { server } = await import('../../server.js');
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const html = await page.evaluate(async () => {
      const { frameOf } = await import('/os/mirror.js');
      document.body.innerHTML = '<main><p>VISIBLE SCREEN</p></main><section id="app-writer" hidden><p>HIDDEN CHAPTER</p><textarea></textarea></section>';
      document.querySelector('textarea').value = 'PRIVATE DRAFT';
      return frameOf(document).html;
    });
    assert.match(html, /VISIBLE SCREEN/);
    assert.doesNotMatch(html, /PRIVATE DRAFT|HIDDEN CHAPTER/);
  } finally {
    await browser?.close();
    server.closeAllConnections?.();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});
