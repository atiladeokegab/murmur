import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(`../public/${p}`, import.meta.url), 'utf8');

test('the status bar is in the first paint and hidden from the screen reader', async () => {
  const html = await read('index.html');
  const bar = html.match(/<div class="statusbar"[^>]*>/)?.[0];
  assert.ok(bar, 'status bar markup is in index.html, so its height is reserved from boot');
  assert.match(bar, /aria-hidden="true"/);
  assert.match(html, /href="os\/phone-chrome\.css"/);
  assert.match(html, /src="os\/statusbar\.js"/);
});

test('every board tile gets an icon and keeps its label', async () => {
  const css = await read('os/phone-chrome.css');
  const shell = await read('os/shell.js');
  // the label: every tile, including Add an app, renders a .title span
  assert.equal((shell.match(/className: 'tile'/g) || []).length, (shell.match(/className: 'title'/g) || []).length);
  // the icon: a default for any tile, then one per app the board names
  assert.match(css, /\.tile \.what::before \{ --glyph: var\(--g-default\)/);
  for (const id of ['messages', 'writer', 'look', 'mine', 'bank', 'shop', 'transit', 'travel', 'taxi', 'grocer'])
    assert.match(css, new RegExp(`\\.tile\\[data-app="${id}"\\] \\.what::before \\{ --glyph: var\\(--g-${id}\\)`), id);
  assert.match(css, /\.tile\[data-app="calendar"\] \.what::before \{\s*content: var\(--today/);
});

test('phone chrome uses colour tokens only', async () => {
  const css = (await read('os/phone-chrome.css')).replace(/url\("data:[^"]*"\)/g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(black|white)\b/i);
});
