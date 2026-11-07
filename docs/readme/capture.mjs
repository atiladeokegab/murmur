// Regenerates the README images: demo.gif and the stills, from the real app driven through Vertical 1
// ("Text Sam I'm ten minutes late") at 390x844 with the demo provider.
// Needs Playwright and ffmpeg: PLAYWRIGHT=<path to playwright pkg> node docs/readme/capture.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(OUT, '..', '..');
const PORT = process.env.PORT || 8794;
const URL = `http://localhost:${PORT}/?quiet`;
const W = 390, H = 844;

// The server with no key, so the demo provider plans every step.
const env = { ...process.env, PORT: String(PORT) }; delete env.GEMINI_API_KEY;
const server = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch {}
  if (i > 50) throw new Error('server did not start');
  await new Promise((r) => setTimeout(r, 100));
}

const vids = mkdtempSync(path.join(tmpdir(), 'murmur-gif-'));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: vids, size: { width: W, height: H } } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const ready = () => page.waitForSelector('html[data-ready="true"]', { timeout: 15000 });
const still = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const t0 = Date.now();

await page.goto(URL); await ready();
await page.evaluate(() => localStorage.clear());
await page.reload(); await ready();
const start = (Date.now() - t0) / 1000; // the GIF starts here, after the blank load and the reset
await page.waitForTimeout(1800);
await still('home');

await page.evaluate(() => murmur.hear("Text Sam I'm ten minutes late", 'typed'));
// "Sam or Samira?": pick Sam, the way a person would.
await page.waitForSelector('dialog[open] .choice.yes');
await page.waitForTimeout(1400);
await page.locator('dialog[open] .choice.yes', { hasText: /^Sam$/ }).click();
// The agent's steps with the cursor ring, then the ask-first sheet with the readback.
await page.waitForSelector('dialog[open] #sheet-yes', { timeout: 15000 });
await page.waitForTimeout(1600);
await still('ask-first');
await page.locator('#sheet-yes').click();
await page.waitForSelector('#done:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(1800);
await still('sent');
const end = (Date.now() - t0) / 1000;

const video = await page.video().path();
await ctx.close(); await browser.close(); stop();
if (errors.length) { console.error('page errors:', errors.join(' | ')); process.exit(1); }

// Two-pass palette GIF; drop frame rate until it fits under 3 MB.
const gif = path.join(OUT, 'demo.gif');
for (const fps of [10, 8, 6]) {
  const f = `fps=${fps},scale=${W}:-1:flags=lanczos`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-to', String(end), '-i', video,
    '-filter_complex', `${f},split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, gif]);
  if (statSync(gif).size < 3e6) break;
}
rmSync(vids, { recursive: true, force: true });
for (const f of readdirSync(OUT).filter((f) => /\.(png|gif)$/.test(f))) console.log(`${f} ${(statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`);
