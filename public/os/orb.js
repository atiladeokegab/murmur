// The orb (the lead, 7 Nov): breathes when idle, swells with the mic when listening, pulses with Murmur's voice when it speaks.
// It writes --level (0 to 1) and data-orb (idle | listening | speaking) on the element; simple.css draws it.
export function rms(bytes) {
  let s = 0;
  for (const v of bytes) s += ((v - 128) / 128) ** 2;
  return Math.min(1, Math.sqrt(s / (bytes.length || 1)) * 4); // speech sits near 0.1 RMS: x4 fills the swell
}

export function createOrb(el, { ctx, state }) {
  const taps = {};
  const level = (a) => { if (!a) return 0; const d = new Uint8Array(a.fftSize); a.getByteTimeDomainData(d); return rms(d); };
  let smooth = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  function frame() {
    const mic = level(taps.mic), out = level(taps.out);
    let s = state();
    if (s === 'live') s = out > 0.04 && out >= mic ? 'speaking' : 'listening'; // GPT owns both ends: the louder side wins
    const raw = s === 'listening' ? mic : s === 'speaking' ? out : 0;
    smooth += (raw - smooth) * 0.25;
    if (el.dataset.orb !== s) el.dataset.orb = s;
    el.style.setProperty('--level', still.matches ? '0' : smooth.toFixed(3));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    /** kind 'mic' or 'out'; node a MediaStream or an AudioNode to listen to. */
    attach(kind, node) {
      try {
        const c = ctx(), a = c.createAnalyser();
        a.fftSize = 512;
        (node instanceof MediaStream ? c.createMediaStreamSource(node) : node).connect(a);
        taps[kind] = a;
      } catch { /* no level, the orb still breathes */ }
    },
  };
}
