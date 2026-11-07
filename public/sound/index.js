// public/sound/index.js
// Murmur OS: Earcons & Haptics Module (§7 Sound design)
// Zero-dependency procedural WebAudio felt-mallet earcons and matching haptics.

export const EARCON_NAMES = Object.freeze([
  'summon',
  'heard',
  'step',
  'gate',
  'done',
  'stopped',
  'undo'
]);

export const EARCON_DEFS = Object.freeze({
  summon: Object.freeze({
    name: 'summon',
    description: 'One soft rising note (mic opens / listening)',
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

      // Felt-mallet soft attack (12ms) avoiding clicks
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol * 0.25, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      otGain.gain.setValueAtTime(0.0001, t);
      otGain.gain.linearRampToValueAtTime(vol * 0.08, t + 0.008);
      otGain.gain.exponentialRampToValueAtTime(0.0001, t + (duration * 0.4));

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
    description: 'A soft click when heard (speech recognized)',
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
      gain.gain.linearRampToValueAtTime(vol * 0.22, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      osc.stop(t + duration + 0.01);
    }
  }),

  step: Object.freeze({
    name: 'step',
    description: 'Crisp high tick (action verified / cursor moves)',
    durationMs: 90,
    vibratePattern: Object.freeze([90]),
    synth: (ctx, t, masterGain, vol) => {
      const duration = 0.09;
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();
      const otGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880.0, t);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(880.0 * 3.99, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol * 0.24, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      otGain.gain.setValueAtTime(0.0001, t);
      otGain.gain.linearRampToValueAtTime(vol * 0.07, t + 0.006);
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
    description: 'Held low resonant note: "I am asking" (gate confirmation required)',
    durationMs: 200,
    vibratePattern: Object.freeze([200]),
    synth: (ctx, t, masterGain, vol) => {
      const duration = 0.20;
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(130.81, t);

      sub.type = 'sine';
      sub.frequency.setValueAtTime(130.81 * 2, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol * 0.30, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc.connect(gain);
      sub.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      sub.start(t);
      osc.stop(t + duration + 0.02);
      sub.stop(t + duration + 0.02);
    }
  }),

  done: Object.freeze({
    name: 'done',
    description: 'Two notes up (task verified and complete)',
    durationMs: 180,
    vibratePattern: Object.freeze([80, 20, 80]),
    synth: (ctx, t, masterGain, vol) => {
      const playNote = (freq, startTime, dur, noteVol) => {
        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 3.99, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(noteVol, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

        osc.connect(gain);
        overtone.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        overtone.start(startTime);
        osc.stop(startTime + dur + 0.01);
        overtone.stop(startTime + dur + 0.01);
      };

      playNote(523.25, t, 0.08, vol * 0.22);
      playNote(783.99, t + 0.10, 0.08, vol * 0.24);
    }
  }),

  stopped: Object.freeze({
    name: 'stopped',
    description: 'One falling note (task cancelled or stopped)',
    durationMs: 140,
    vibratePattern: Object.freeze([140]),
    synth: (ctx, t, masterGain, vol) => {
      const duration = 0.14;
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, t);
      osc.frequency.exponentialRampToValueAtTime(392.00, t + duration);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(587.33 * 3.99, t);
      overtone.frequency.exponentialRampToValueAtTime(392.00 * 3.99, t + duration);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol * 0.23, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc.connect(gain);
      overtone.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      overtone.start(t);
      osc.stop(t + duration + 0.02);
      overtone.stop(t + duration + 0.02);
    }
  }),

  undo: Object.freeze({
    name: 'undo',
    description: 'The done notes reversed (G5 then C5 downward)',
    durationMs: 180,
    vibratePattern: Object.freeze([80, 20, 80]),
    synth: (ctx, t, masterGain, vol) => {
      const playNote = (freq, startTime, dur, noteVol) => {
        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 3.99, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(noteVol, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

        osc.connect(gain);
        overtone.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        overtone.start(startTime);
        osc.stop(startTime + dur + 0.01);
        overtone.stop(startTime + dur + 0.01);
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

// Lazy AudioContext initialization unlocked on first user gesture
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
}

export function play(name) {
  validateName(name);

  // Quiet or muted suppresses sound output
  if (isQuietState || isMutedState) {
    return false;
  }

  const ctx = initAudioContext();
  if (!ctx || !masterGain) {
    return false;
  }

  const t = ctx.currentTime;
  const def = EARCON_DEFS[name];
  def.synth(ctx, t, masterGain, masterVolume);
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
  setAudioContext,
  resetAudioContext
};
