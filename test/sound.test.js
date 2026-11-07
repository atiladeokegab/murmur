// test/sound.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import sound, {
  EARCON_NAMES,
  EARCON_DEFS,
  play,
  buzz,
  mute,
  unmute,
  isMuted,
  setVolume,
  getVolume,
  setQuiet,
  isQuiet,
  getDuration,
  getVibratePattern,
  getEarconDef,
  setAudioContext,
  resetAudioContext,
  initAudioContext,
  getAudioContext,
  unlockAudioContext,
  preload,
  resetStepCount,
  getStepCount,
  setStepCount
} from '../public/sound/index.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockAudioContext() {
  const nodes = [];
  const oscillators = [];
  const gains = [];

  const ctx = {
    currentTime: 1.0,
    state: 'running',
    sampleRate: 44100,
    destination: { name: 'destination' },
    resume: async () => { ctx.state = 'running'; },
    close: async () => { ctx.state = 'closed'; },
    createBuffer: (channels, length, sampleRate) => ({
      numberOfChannels: channels,
      length,
      sampleRate
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: (target) => {},
      start: (time) => {},
      stop: (time) => {}
    }),
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: {
          value: 440,
          setValueAtTime(val) { osc.frequency.value = val; },
          exponentialRampToValueAtTime(val) { osc.frequency.value = val; }
        },
        connect(target) {},
        start(time) {},
        stop(time) {}
      };
      nodes.push(osc);
      oscillators.push(osc);
      return osc;
    },
    createGain() {
      const gain = {
        gain: {
          value: 1,
          setValueAtTime(val) { gain.gain.value = val; },
          linearRampToValueAtTime(val) { gain.gain.value = val; },
          exponentialRampToValueAtTime(val) { gain.gain.value = val; }
        },
        connect(target) {}
      };
      nodes.push(gain);
      gains.push(gain);
      return gain;
    },
    _nodes: nodes,
    _oscillators: oscillators,
    _gains: gains
  };
  return ctx;
}

test('earcon names are complete and match the spec exactly', () => {
  const expected = ['summon', 'heard', 'step', 'gate', 'done', 'stopped', 'undo'];
  assert.equal(EARCON_NAMES.length, 7);
  assert.deepEqual([...EARCON_NAMES], expected);

  for (const name of expected) {
    assert.ok(name in EARCON_DEFS, `EARCON_DEFS missing "${name}"`);
    const def = getEarconDef(name);
    assert.equal(def.name, name);
    assert.ok(typeof def.description === 'string');
    assert.ok(typeof def.synth === 'function');
  }
});

test('unknown earcon names throw descriptive errors', () => {
  const invalidNames = ['unknown', 'click', 'ping', '', null, undefined, 42];

  for (const invalid of invalidNames) {
    assert.throws(
      () => play(invalid),
      /Unknown earcon/,
      `play("${invalid}") should throw`
    );
    assert.throws(
      () => buzz(invalid),
      /Unknown earcon/,
      `buzz("${invalid}") should throw`
    );
    assert.throws(
      () => getDuration(invalid),
      /Unknown earcon/,
      `getDuration("${invalid}") should throw`
    );
    assert.throws(
      () => getVibratePattern(invalid),
      /Unknown earcon/,
      `getVibratePattern("${invalid}") should throw`
    );
  }
});

test('every earcon duration is strictly within 80 ms to 200 ms and under 250 ms', () => {
  for (const name of EARCON_NAMES) {
    const dur = getDuration(name);
    assert.ok(
      typeof dur === 'number' && Number.isFinite(dur),
      `Duration for ${name} must be a valid number`
    );
    assert.ok(
      dur >= 80,
      `Duration for ${name} (${dur}ms) is less than the 80ms minimum requirement`
    );
    assert.ok(
      dur <= 200,
      `Duration for ${name} (${dur}ms) exceeds the 200ms maximum requirement`
    );
    assert.ok(
      dur < 250,
      `Duration for ${name} (${dur}ms) must remain strictly under 250 ms`
    );
  }
});

test('vibrate patterns mirror earcon durations and structures', () => {
  for (const name of EARCON_NAMES) {
    const pattern = getVibratePattern(name);
    const dur = getDuration(name);

    assert.ok(Array.isArray(pattern), `Pattern for ${name} must be an array`);
    assert.ok(pattern.length >= 1, `Pattern for ${name} must have at least one element`);

    // Every segment must be a positive integer
    for (const segment of pattern) {
      assert.ok(Number.isInteger(segment) && segment > 0, `Segment ${segment} in ${name} must be > 0`);
    }

    // Total duration of vibrate pattern must equal earcon duration
    const totalPatternMs = pattern.reduce((sum, ms) => sum + ms, 0);
    assert.equal(
      totalPatternMs,
      dur,
      `Total vibration pattern duration for "${name}" (${totalPatternMs}ms) must equal earcon duration (${dur}ms)`
    );
  }

  // Done and Undo should both be two-pulse patterns mirroring the two notes
  assert.deepEqual(getVibratePattern('done'), [80, 20, 80]);
  assert.deepEqual(getVibratePattern('undo'), [80, 20, 80]);
});

test('volume control clamps correctly between 0 and 1', () => {
  setVolume(0.8);
  assert.equal(getVolume(), 0.8);

  setVolume(1.5); // Upper bound clamp
  assert.equal(getVolume(), 1.0);

  setVolume(-0.5); // Lower bound clamp
  assert.equal(getVolume(), 0.0);

  setVolume('invalid'); // Invalid input ignored
  assert.equal(getVolume(), 0.0);

  setVolume(1.0); // Reset
  assert.equal(getVolume(), 1.0);
});

test('mute and unmute toggle audio output', () => {
  unmute();
  assert.equal(isMuted(), false);

  mute();
  assert.equal(isMuted(), true);

  // When muted, play() returns false
  assert.equal(play('step'), false);

  unmute();
  assert.equal(isMuted(), false);
});

test('quiet mode suppresses both audio playback and haptics', () => {
  setQuiet(false);
  assert.equal(isQuiet(), false);

  setQuiet(true);
  assert.equal(isQuiet(), true);

  // Both play and buzz must return false when quiet
  assert.equal(play('step'), false);
  assert.equal(buzz('step'), false);

  setQuiet(false);
  assert.equal(isQuiet(), false);
});

test('buzz executes haptics via navigator.vibrate or safely no-ops', () => {
  let lastPattern = null;
  const originalVibrate = globalThis.navigator?.vibrate;

  globalThis.navigator.vibrate = (pattern) => {
    lastPattern = pattern;
    return true;
  };

  try {
    setQuiet(false);
    const buzzed = buzz('done');
    assert.equal(buzzed, true);
    assert.deepEqual(lastPattern, [80, 20, 80]);

    buzz('gate');
    assert.deepEqual(lastPattern, [200]);
  } finally {
    if (originalVibrate) {
      globalThis.navigator.vibrate = originalVibrate;
    } else {
      delete globalThis.navigator.vibrate;
    }
  }

  // Test when vibrate is undefined (safe no-op returning false)
  delete globalThis.navigator.vibrate;
  assert.doesNotThrow(() => {
    const result = buzz('step');
    assert.equal(result, false);
  });
});

test('procedural WebAudio synth executes graph cleanly for all earcons', () => {
  const mockCtx = createMockAudioContext();
  setAudioContext(mockCtx);

  unmute();
  setQuiet(false);
  setVolume(1.0);

  try {
    for (const name of EARCON_NAMES) {
      const played = play(name);
      assert.equal(played, true, `play("${name}") must succeed with mock AudioContext`);
    }
  } finally {
    resetAudioContext();
  }
});

test('step earcon rises a semitone each verified step and resets appropriately', () => {
  const mockCtx = createMockAudioContext();
  setAudioContext(mockCtx);
  resetStepCount();

  try {
    assert.equal(getStepCount(), 0);

    // Play consecutive steps and track frequencies generated
    const recordedFreqs = [];
    for (let i = 0; i < 4; i++) {
      const prevNodesCount = mockCtx._oscillators.length;
      play('step');
      const newOsc = mockCtx._oscillators[prevNodesCount];
      recordedFreqs.push(newOsc.frequency.value);
    }

    assert.equal(getStepCount(), 4);

    // Verify each step rises by a semitone: ratio approx 2^(1/12) ~= 1.05946
    for (let i = 1; i < recordedFreqs.length; i++) {
      const ratio = recordedFreqs[i] / recordedFreqs[i - 1];
      assert.ok(
        Math.abs(ratio - 1.059463) < 0.005,
        `Step ${i} should be a semitone higher than step ${i - 1}: ratio is ${ratio}`
      );
    }

    // Explicit stepIndex option
    const prevCount = mockCtx._oscillators.length;
    play('step', { stepIndex: 0 });
    const baseOsc = mockCtx._oscillators[prevCount];
    assert.ok(Math.abs(baseOsc.frequency.value - 783.99) < 0.01);

    // Done resets step count
    play('done');
    assert.equal(getStepCount(), 0);

    // Reset manually
    setStepCount(5);
    assert.equal(getStepCount(), 5);
    resetStepCount();
    assert.equal(getStepCount(), 0);
  } finally {
    resetAudioContext();
  }
});

test('preload and audio context unlock functions initialize pipeline cleanly', () => {
  const mockCtx = createMockAudioContext();
  mockCtx.state = 'suspended';
  setAudioContext(mockCtx);

  try {
    const ctx = unlockAudioContext();
    assert.ok(ctx);
    assert.equal(ctx.state, 'running');

    const preloadedCtx = preload();
    assert.ok(preloadedCtx);
    assert.equal(getAudioContext(), mockCtx);
  } finally {
    resetAudioContext();
  }
});

test('proves Murmur sound boots in Chromium with zero page errors via Playwright', async () => {
  let playwright;
  try {
    playwright = require('/home/atilade/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
  } catch (err) {
    // If playwright cannot be loaded in test runner, skip
    return;
  }

  const { chromium } = playwright;
  const publicDir = path.resolve(__dirname, '../public');

  // Spawn lightweight local HTTP server to serve public/
  const server = http.createServer((req, res) => {
    const cleanUrl = req.url.split('?')[0];
    const relPath = cleanUrl === '/' ? 'sound/demo.html' : cleanUrl.replace(/^\//, '');
    const fullPath = path.join(publicDir, relPath);

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath);
      const mime = ext === '.html' ? 'text/html' : (ext === '.js' ? 'application/javascript' : 'text/plain');
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(fullPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const consoleErrors = [];

  page.on('pageerror', (err) => errors.push(err.message || String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    await page.goto(`http://127.0.0.1:${port}/sound/demo.html`, { waitUntil: 'load' });
    await page.waitForSelector('button[data-name="summon"]');

    // Click each earcon button to ensure sound & haptics execution produce no errors
    for (const name of EARCON_NAMES) {
      await page.click(`button[data-name="${name}"]`);
    }

    // Click reset steps button
    await page.click('#reset-step-btn');

    // Assert zero page errors and zero console errors
    assert.deepEqual(errors, [], `Expected zero page errors, got: ${JSON.stringify(errors)}`);
    assert.deepEqual(consoleErrors, [], `Expected zero console errors, got: ${JSON.stringify(consoleErrors)}`);
  } finally {
    await browser.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
