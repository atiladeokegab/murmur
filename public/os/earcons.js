// Six earcons in one felt-mallet family (research note §3), with haptics that mirror them (spec §7).
import { audioOut } from '../live.js';

// Each note is [Hz, start s, length s, volume]. Nothing else in Murmur makes a sound.
export const EARCONS = {
  summon: [[349.23, 0, 0.07, 0.2], [523.25, 0.06, 0.08, 0.22]],   // a soft rise: listening
  heard: [[750, 0, 0.05, 0.18]],                                  // a click: heard you
  step: [[880, 0, 0.08, 0.2]],                                    // a tick: one step done
  gate: [[130.81, 0, 0.2, 0.28]],                                 // a held low note: I'm asking
  done: [[523.25, 0, 0.09, 0.22], [783.99, 0.08, 0.11, 0.24]],    // two notes up
  stopped: [[587.33, 0, 0.07, 0.22], [392, 0.06, 0.09, 0.2]],     // a fall
  undo: [[783.99, 0, 0.09, 0.22], [523.25, 0.08, 0.11, 0.2]],     // done, reversed
};
export const HAPTICS = { summon: [12], heard: [], step: [8], gate: [40, 60, 40], done: [12, 40, 12], stopped: [20, 50, 20], undo: [12] };

let ctx = null;
function strike(f, at, len, vol) {
  const o = ctx.createOscillator(), ot = ctx.createOscillator(), g = ctx.createGain(), og = ctx.createGain();
  o.frequency.setValueAtTime(f, at);
  ot.frequency.setValueAtTime(f * 3.99, at); // the marimba bar's overtone, damped fast like felt
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  og.gain.setValueAtTime(0.0001, at);
  og.gain.linearRampToValueAtTime(vol * 0.3, at + 0.008);
  og.gain.exponentialRampToValueAtTime(0.0001, at + len * 0.35);
  o.connect(g); ot.connect(og); og.connect(g); g.connect(ctx.destination);
  for (const x of [o, ot]) { x.start(at); x.stop(at + len + 0.02); }
}

/** Play an earcon and its buzz. `sound` false keeps the buzz only (the screen reader is talking). */
export function earcon(name, { sound = true } = {}) {
  const notes = EARCONS[name];
  if (!notes) return;
  try { if (HAPTICS[name].length) navigator.vibrate?.(HAPTICS[name]); } catch { /* no vibration */ }
  if (!sound) return;
  try {
    ctx = audioOut(); // one AudioContext for speech and earcons
    const t = ctx.currentTime;
    for (const [f, at, len, vol] of notes) strike(f, t + at, len, vol);
  } catch { /* no audio: the words still show */ }
}
