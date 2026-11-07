// Who speaks (spec §2, "One voice"): Murmur's own audio, or the one role="status" region for the person's
// screen reader. Never both. In Murmur mode the region is live-off (still visible, not announced); in
// screen-reader mode Murmur makes no sound and every sentence goes to the region.

/** Browser speech as the default voice; Gemini TTS can replace `speak` when a key exists. */
export function browserSpeak(text, { rate = 1.1 } = {}) {
  const s = globalThis.speechSynthesis;
  if (!s || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate; u.lang = 'en-GB';
    u.onend = u.onerror = () => resolve();
    s.speak(u);
  });
}

/**
 * @param {{ status: HTMLElement, who: () => 'murmur'|'reader', speak?: (text) => Promise, hush?: () => void }} o
 */
export function createVoice({ status, who = () => 'murmur', speak = browserSpeak, hush = () => globalThis.speechSynthesis?.cancel() }) {
  let last = '';
  if (status && status.getAttribute('role') !== 'status') status.setAttribute('role', 'status');
  const route = () => {
    const reader = who() === 'reader';
    status?.setAttribute('aria-live', reader ? 'polite' : 'off');
    return reader;
  };
  return {
    say(text) {
      text = String(text || '').trim();
      if (!text) return Promise.resolve();
      last = text;
      const reader = route();
      if (status) status.textContent = text;
      return reader ? Promise.resolve() : speak(text);
    },
    again() { return last ? this.say(last) : Promise.resolve(); },
    stop() { try { hush(); } catch { /* nothing playing */ } },
    get last() { return last; },
  };
}
