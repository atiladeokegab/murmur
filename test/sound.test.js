// test/sound.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
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
  resetAudioContext
} from '../public/sound/index.js';

function createMockAudioContext() {
  const nodes = [];
  return {
    currentTime: 1.0,
    state: 'running',
    destination: { name: 'destination' },
    resume: async () => {},
    close: async () => {},
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
      return gain;
    }
  };
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

test('every earcon duration is strictly within 80 ms to 200 ms', () => {
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
