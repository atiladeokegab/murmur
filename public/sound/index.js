// public/sound/index.js
// Murmur OS: Earcons & Haptics Module (§7 Sound design)
// Zero-dependency WebAudio felt-mallet earcons and matching haptics.
// Crafted for "feels like magic": warm, tactile, responsive (<50ms latency), and cohesive.

export const EARCON_NAMES = Object.freeze([
  'summon',
  'heard',
  'step',
  'gate',
  'done',
  'stopped',
  'undo'
]);

// Step counter state for ascending semitone ticks per verified step
let currentStepCount = 0;
let lastStepTime = 0;

export function resetStepCount() {
  currentStepCount = 0;
}

export function getStepCount() {
  return currentStepCount;
}

export function setStepCount(n) {
  const num = Number(n);
  currentStepCount = Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
  return currentStepCount;
}

export const EARCON_DEFS = Object.freeze({
  summon: Object.freeze({
    name: 'summon',
    description: 'Listening tone that starts within 50 ms of tap (soft felt rise: F4 to C5)',
    durationMs: 140,
    vibratePattern: Object.freeze([140]),
    synth: (ctx, t, masterGain, vol) => {
      const duration = 0.14;
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();
      const otGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(349.23, t);
      osc.frequency.exponentialRampToValueAtTime(523.25, t + duration);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(349.23 * 3.99, t);
      overtone.frequency.exponentialRampToValueAtTime(523.25 * 3.99, t + duration);

      // Soft attack ~10ms starts sound immediately within 50ms of tap
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol * 0.25, t + 0.010);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      // Marimba bar overtone damped fast like felt
      otGain.gain.setValueAtTime(0.0001, t);
      otGain.gain.linearRampToValueAtTime(vol * 0.08, t + 0.006);
      otGain.gain.exponentialRampToValueAtTime(0.0001, t + (duration * 0.35));

      osc.connect(gain);
      overtone.connect(otGain);
      otGain.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      overtone.start(t);
      osc.stop(t + duration + 0.02);
      overtone.stop(t + duration + 0.02);
    }
  }),

  heard: Object.freeze({
    name: 'heard',
    description: 'Soft click when speech is recognized',
    durationMs: 80,
    vibratePattern: Object.freeze([80]),
    synth: (ctx, t, masterGain, vol) => {
      const duration = 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(750.0, t);
      osc.frequency.exponentialRampToValueAtTime(300.0, t + duration);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol * 0.20, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      osc.stop(t + duration + 0.01);
    }
  }),

  step: Object.freeze({
    name: 'step',
    description: 'Soft tick per verified step that rises a semitone each step',
    durationMs: 90,
    vibratePattern: Object.freeze([90]),
    synth: (ctx, t, masterGain, vol, stepOffset = 0) => {
      const duration = 0.09;
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();
      const otGain = ctx.createGain();

      // Base frequency 783.99 Hz (G5); rises a semitone (2^(n/12)) per verified step
      const semitone = stepOffset % 12;
      const baseFreq = 783.99 * Math.pow(2, semitone / 12);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(baseFreq * 3.99, t);

      // Tactile soft attack (8ms) on marimba bar
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol * 0.22, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      otGain.gain.setValueAtTime(0.0001, t);
      otGain.gain.linearRampToValueAtTime(vol * 0.06, t + 0.005);
      otGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

      osc.connect(gain);
      overtone.connect(otGain);
      otGain.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      overtone.start(t);
      osc.stop(t + duration + 0.01);
      overtone.stop(t + duration + 0.01);
    }
  }),

  gate: Object.freeze({
    name: 'gate',
    description: 'Distinct, calm "needs your yes" for the gate sheet (calm rising fourth: D4 to G4)',
    durationMs: 200,
    vibratePattern: Object.freeze([200]),
    synth: (ctx, t, masterGain, vol) => {
      // Warm, contemplative two-tone inquiry: D4 (293.66 Hz) to G4 (392.00 Hz)
      const playChimeNote = (freq, startOffset, noteDur, noteVol) => {
        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();
        const otGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + startOffset);

        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 3.99, t + startOffset);

        gain.gain.setValueAtTime(0.0001, t + startOffset);
        gain.gain.linearRampToValueAtTime(noteVol, t + startOffset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + startOffset + noteDur);

        otGain.gain.setValueAtTime(0.0001, t + startOffset);
        otGain.gain.linearRampToValueAtTime(noteVol * 0.25, t + startOffset + 0.008);
        otGain.gain.exponentialRampToValueAtTime(0.0001, t + startOffset + (noteDur * 0.35));

        osc.connect(gain);
        overtone.connect(otGain);
        otGain.connect(gain);
        gain.connect(masterGain);

        osc.start(t + startOffset);
        overtone.start(t + startOffset);
        osc.stop(t + startOffset + noteDur + 0.02);
        overtone.stop(t + startOffset + noteDur + 0.02);
      };

      playChimeNote(293.66, 0.0, 0.12, vol * 0.22);
      playChimeNote(392.00, 0.07, 0.13, vol * 0.25);
    }
  }),

  done: Object.freeze({
    name: 'done',
    description: 'Warm two-note "done" (C5 to G5 resolving upward)',
    durationMs: 180,
    vibratePattern: Object.freeze([80, 20, 80]),
    synth: (ctx, t, masterGain, vol) => {
      const playNote = (freq, startTime, dur, noteVol) => {
        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();
        const otGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 3.99, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(noteVol, startTime + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

        otGain.gain.setValueAtTime(0.0001, startTime);
        otGain.gain.linearRampToValueAtTime(noteVol * 0.25, startTime + 0.006);
        otGain.gain.exponentialRampToValueAtTime(0.0001, startTime + (dur * 0.35));

        osc.connect(gain);
        overtone.connect(otGain);
        otGain.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        overtone.start(startTime);
        osc.stop(startTime + dur + 0.015);
        overtone.stop(startTime + dur + 0.015);
      };

      // Two warm notes up: C5 (523.25 Hz) then G5 (783.99 Hz)
      playNote(523.25, t, 0.08, vol * 0.22);
      playNote(783.99, t + 0.10, 0.08, vol * 0.26);
    }
  }),

  stopped: Object.freeze({
    name: 'stopped',
    description: 'Gentle "stopped" (soft falling inflection: C5 to G4)',
    durationMs: 140,
    vibratePattern: Object.freeze([140]),
    synth: (ctx, t, masterGain, vol) => {
      const duration = 0.14;
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();
      const otGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, t);
      osc.frequency.exponentialRampToValueAtTime(392.00, t + duration);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(523.25 * 3.99, t);
      overtone.frequency.exponentialRampToValueAtTime(392.00 * 3.99, t + duration);

      // Gentle, non-jarring attack (15ms)
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol * 0.20, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      otGain.gain.setValueAtTime(0.0001, t);
      otGain.gain.linearRampToValueAtTime(vol * 0.05, t + 0.008);
      otGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);

      osc.connect(gain);
      overtone.connect(otGain);
      otGain.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      overtone.start(t);
      osc.stop(t + duration + 0.02);
      overtone.stop(t + duration + 0.02);
    }
  }),

  undo: Object.freeze({
    name: 'undo',
    description: 'The done notes reversed (warm two notes down: G5 then C5)',
    durationMs: 180,
    vibratePattern: Object.freeze([80, 20, 80]),
    synth: (ctx, t, masterGain, vol) => {
      const playNote = (freq, startTime, dur, noteVol) => {
        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();
        const otGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 3.99, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(noteVol, startTime + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

        otGain.gain.setValueAtTime(0.0001, startTime);
        otGain.gain.linearRampToValueAtTime(noteVol * 0.25, startTime + 0.006);
        otGain.gain.exponentialRampToValueAtTime(0.0001, startTime + (dur * 0.35));

        osc.connect(gain);
        overtone.connect(otGain);
        otGain.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        overtone.start(startTime);
        osc.stop(startTime + dur + 0.015);
        overtone.stop(startTime + dur + 0.015);
      };

      playNote(783.99, t, 0.08, vol * 0.24);
      playNote(523.25, t + 0.10, 0.08, vol * 0.22);
    }
  })
});

// Module state
let audioCtx = null;
let masterGain = null;
let masterVolume = 1.0;
let isMutedState = false;
let isQuietState = false;

function validateName(name) {
  if (typeof name !== 'string' || !EARCON_DEFS[name]) {
    throw new Error(`Unknown earcon: "${name}". Valid names are: ${EARCON_NAMES.join(', ')}`);
  }
}

export function getDuration(name) {
  validateName(name);
  return EARCON_DEFS[name].durationMs;
}

export function getVibratePattern(name) {
  validateName(name);
  return [...EARCON_DEFS[name].vibratePattern];
}

export function getEarconDef(name) {
  validateName(name);
  return EARCON_DEFS[name];
}

export function setVolume(vol) {
  const num = Number(vol);
  if (Number.isNaN(num)) return masterVolume;
  masterVolume = Math.max(0, Math.min(1, num));
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(isMutedState || isQuietState ? 0 : masterVolume, audioCtx.currentTime);
  }
  return masterVolume;
}

export function getVolume() {
  return masterVolume;
}

export function mute() {
  isMutedState = true;
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
  }
}

export function unmute() {
  isMutedState = false;
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(isQuietState ? 0 : masterVolume, audioCtx.currentTime);
  }
}

export function isMuted() {
  return isMutedState;
}

export function setQuiet(bool) {
  isQuietState = Boolean(bool);
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(isQuietState || isMutedState ? 0 : masterVolume, audioCtx.currentTime);
  }
}

export function isQuiet() {
  return isQuietState;
}

// AudioContext initialization & preloading
export function initAudioContext(customCtx = null) {
  if (customCtx) {
    audioCtx = customCtx;
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(isMutedState || isQuietState ? 0 : masterVolume, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
    return audioCtx;
  }

  if (audioCtx) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  const AudioContextClass = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : (typeof globalThis !== 'undefined' ? (globalThis.AudioContext || globalThis.webkitAudioContext) : null);

  if (!AudioContextClass) {
    return null;
  }

  audioCtx = new AudioContextClass();
  masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(isMutedState || isQuietState ? 0 : masterVolume, audioCtx.currentTime);
  masterGain.connect(audioCtx.destination);

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

export function getAudioContext() {
  return audioCtx;
}

export function unlockAudioContext() {
  const ctx = initAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function preload() {
  return unlockAudioContext();
}

// Allows test suites to inject mock AudioContext
export function setAudioContext(customCtx) {
  return initAudioContext(customCtx);
}

export function resetAudioContext() {
  if (audioCtx && typeof audioCtx.close === 'function') {
    audioCtx.close().catch(() => {});
  }
  audioCtx = null;
  masterGain = null;
  currentStepCount = 0;
}

export function play(name, options = {}) {
  validateName(name);

  // Quiet or muted suppresses sound output
  if (isQuietState || isMutedState) {
    return false;
  }

  const ctx = initAudioContext();
  if (!ctx || !masterGain) {
    return false;
  }

  // Ensure AudioContext is running on user gesture
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const t = ctx.currentTime;
  const def = EARCON_DEFS[name];

  if (name === 'step') {
    let stepOffset;
    if (options && typeof options.stepIndex === 'number') {
      stepOffset = options.stepIndex;
    } else if (options && typeof options.step === 'number') {
      stepOffset = options.step;
    } else {
      const now = Date.now();
      // If idle for more than 8 seconds, restart step counter
      if (now - lastStepTime > 8000) {
        currentStepCount = 0;
      }
      stepOffset = currentStepCount;
      currentStepCount++;
      lastStepTime = now;
    }
    def.synth(ctx, t, masterGain, masterVolume, stepOffset);
  } else {
    // Other earcons reset step progression
    if (name === 'done' || name === 'stopped' || name === 'summon' || name === 'undo') {
      currentStepCount = 0;
    }
    def.synth(ctx, t, masterGain, masterVolume);
  }

  return true;
}

export function buzz(name) {
  validateName(name);

  // Quiet setting suppresses all haptics as well
  if (isQuietState) {
    return false;
  }

  const pattern = EARCON_DEFS[name].vibratePattern;
  const nav = typeof navigator !== 'undefined' ? navigator : (typeof globalThis !== 'undefined' ? globalThis.navigator : null);

  if (nav && typeof nav.vibrate === 'function') {
    try {
      nav.vibrate([...pattern]);
      return true;
    } catch {
      return false;
    }
  }

  // Graceful no-op on platforms without vibration
  return false;
}

// Preload & automatic unlock on first user gesture at boot
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    initAudioContext();
  } catch {
    // Ignore in environments without WebAudio
  }

  const unlockEvents = ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'];
  const autoUnlock = () => {
    try {
      if (audioCtx) {
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        // Warm up audio buffer
        const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate || 44100);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);
        src.start(0);
      } else {
        initAudioContext();
      }
    } catch {
      // Ignore
    }
  };

  for (const ev of unlockEvents) {
    window.addEventListener(ev, autoUnlock, { capture: true, once: true, passive: true });
    document.addEventListener(ev, autoUnlock, { capture: true, once: true, passive: true });
  }
}

export default {
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
  initAudioContext,
  getAudioContext,
  unlockAudioContext,
  preload,
  setAudioContext,
  resetAudioContext,
  resetStepCount,
  getStepCount,
  setStepCount
};
