// First open: a guided welcome that makes a stranger fluent in about 30 seconds, then never again.
// 1. Who Murmur is, how to talk, one thing to try. 2. On the first thing that works: the three words that
// get you out of trouble. 3. One more thing to try. Reset and rearm() bring it back. No network beyond TTS.
export const FIRST_WORDS = "Hi, I'm Murmur. I run this phone for you by voice. Tap anywhere and speak. Try saying: read my messages.";
export const NO_EARS = "Hi, I'm Murmur. I run this phone for you by voice, but this browser can't hear you. To talk, open this page in Chrome. To type instead, tap the Talk button at the bottom. Try: read my messages.";
export const FIRST_WIN = "That's it. Say 'what can I do' any time, 'stop' to stop me, or 'undo' to take it back.";
// build-plugin's hint, folded into step 2 so it is said once, after the first success, not at open.
export const OFFER_HINT = "Say 'what can I do' any time.";
export const NUDGE = "Try: text Sam I'm ten minutes late.";
export const MIC_BLOCKED = "The microphone is blocked, so I can't hear you. Allow it in this site's settings, or type in the box at the bottom.";

const defaultKv = async () => {
  const { browserKV } = await import('../../ports/browser-kv.js');
  const port = browserKV({ prefix: 'murmur' });
  return { get: (k) => port.get('os.onboard', k), set: (k, v) => port.set('os.onboard', k, v) };
};
const hasEars = () => !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
// A browser will not speak before the first tap. Then the welcome waits for that tap instead of being lost.
const mustWaitForTap = () => globalThis.navigator?.userActivation ? !globalThis.navigator.userActivation.hasBeenActive : false;
// shortcut: the runner says its done line after task:done and sends no end event; wait about as long as saying it takes
export const sayTime = (text) => 800 + String(text || '').length * 70;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts the welcome. Resolves true when it said (or owes, until the first tap) step 1 on this open.
 * @param {object} o
 * @param {object} [o.kv]        { get, set }: 'said' after step 1, 'done' after steps 2 and 3
 * @param {Function} o.say       the one voice (screen-reader aware)
 * @param {object} [o.bus]       the OS bus: the first task:done that is ok gives steps 2 and 3
 * @param {Function} [o.caption] (text|null) shows the same line quietly on screen
 * @param {object} [o.win]       where the first tap is heard when the browser will not speak before it
 * @param {boolean} [o.ears]     speech recognition exists
 * @param {boolean} [o.waitTap]  the browser will not speak until the first tap
 * @param {object} [o.mic]       navigator.permissions, to say plainly when the microphone is blocked
 * @param {Function} [o.sleep]
 */
export async function firstOpen({ kv, say, bus, caption, win, ears = hasEars(), waitTap = mustWaitForTap(), mic = globalThis.navigator?.permissions, sleep = pause } = {}) {
  kv ||= await defaultKv();
  if (bus && !(await kv.get('done'))) follow({ kv, say, bus, caption, sleep });
  watchMic({ say, caption, mic });
  if (await kv.get('said')) return false;
  await kv.set('said', true); // marked first, so an interrupted welcome is never said twice
  const line = ears ? FIRST_WORDS : NO_EARS;
  caption?.(line);
  if (waitTap && win) onFirstTap(win, () => say(line));
  else await say(line);
  return true;
}

/** Steps 2 and 3, once: after the first task that works, and only when the person has not started talking again. */
function follow({ kv, say, bus, caption, sleep }) {
  let turn = 0, done = false;
  const offs = [bus.on('heard', () => turn++), bus.on('task:start', () => turn++)];
  offs.push(bus.on('task:done', async (e) => {
    if (!e?.ok || done) return;
    const mine = ++turn;
    await sleep(sayTime(e.line)); // let Murmur finish the result first
    if (mine !== turn || done) return; // they spoke again: the next success gets it
    done = true;
    offs.forEach((off) => off?.());
    await kv.set('done', true);
    caption?.(FIRST_WIN); await say(FIRST_WIN);
    caption?.(NUDGE); await say(NUDGE);
    const off = bus.on('task:start', () => { caption?.(null); off?.(); }); // the caption stays until they try it
  }));
}

/** The first tap (or Space or Enter) says the welcome, and does nothing else, so nobody starts talking over it. */
function onFirstTap(win, fn) {
  const types = ['pointerdown', 'pointerup', 'click', 'contextmenu', 'keydown', 'keyup'];
  let spent = false;
  const off = () => types.forEach((t) => win.removeEventListener(t, swallow, true));
  function swallow(e) {
    const key = e.type.startsWith('key');
    if (key && e.key !== ' ' && e.key !== 'Enter') return; // Tab and the rest still move about
    e.stopImmediatePropagation?.(); e.stopPropagation?.();
    if (e.type !== 'pointerdown' && e.type !== 'pointerup') e.preventDefault?.();
    if (spent) { if (e.type === 'keyup' || e.type === 'click') off(); return; }
    if (e.type === 'click' || e.type === 'contextmenu' || e.type === 'keydown') {
      spent = true; fn();
      if (e.type !== 'keydown') off(); // a key still has its keyup to swallow
    }
  }
  types.forEach((t) => win.addEventListener(t, swallow, true));
}

/** Says plainly when the microphone is blocked, now or later. */
async function watchMic({ say, caption, mic }) {
  try {
    const st = await mic?.query?.({ name: 'microphone' });
    if (!st) return;
    const tell = () => { if (st.state === 'denied') { caption?.(MIC_BLOCKED); say(MIC_BLOCKED); } };
    st.addEventListener?.('change', tell);
    if (st.state === 'denied') tell();
  } catch { /* no permissions API: the shell still shows the typing box */ }
}

/** A quiet caption above Murmur's line, for a sighted helper. aria-hidden: the voice or the status region says it. */
export function captionIn(status) {
  const doc = status?.ownerDocument;
  if (!doc?.createElement) return null;
  const p = doc.createElement('p');
  p.className = 'welcome-caption';
  p.setAttribute('aria-hidden', 'true');
  p.hidden = true;
  const at = status.closest?.('.say') || status;
  if (at.before) at.before(p); else at.parentNode?.append(p);
  if (doc.head && !doc.getElementById('onboard-css')) {
    const css = doc.createElement('link');
    Object.assign(css, { id: 'onboard-css', rel: 'stylesheet', href: new URL('onboard.css', import.meta.url).href });
    doc.head.append(css);
  }
  return (text) => { p.textContent = text || ''; p.hidden = !text; };
}

/** The demo reset calls this so the next open is a first open again. */
export async function rearm({ kv } = {}) {
  kv ||= await defaultKv();
  await kv.set('said', undefined);
  await kv.set('done', undefined);
}
