// The extras the shell calls once at boot: Your look as an app, the one-voice wrap, the first-open sentence,
// and the demo panel on the clock. One call from shell.js; everything here is optional.
import { appKv, createCtx, mountApp, runAction } from '../sdk/index.js';
import look, { settings as lookSettings, onSettings } from '../apps/look/index.js';
import { createDemo, bindDemo } from './demo/index.js';
import { firstOpen, captionIn } from './onboard/index.js';

const SHARED = ['size', 'theme', 'rate', 'speaker', 'agency'];

/**
 * @param {object} o
 * @param {object} o.bus, o.registry       the shell's
 * @param {function} o.speak               the shell's voice: (text, signal) => Promise; it already reads settings.speaker
 * @param {object} [o.settings]            the shell's look object; Your look's rows are copied into it on every change
 * @param {function} [o.save]              persists o.settings (the shell's saveLook)
 * @param {object} o.kv                    the browser-kv port (areas app.look and os.onboard)
 * @param {Element} [o.appsEl]             where apps mount; Your look mounts here unless the shell already mounted it
 * @param {object} [o.librarian, o.datastore]  the shell's toolkit, shared with Your look
 * @param {Element} [o.status]             the one role=status region
 * @param {Element} [o.clockEl]            the demo panel's trigger; omit to leave the shell's own demo sheet alone
 * @param {object} [o.board]               { reset(), nextMorning() }
 * @param {function} [o.replay], [o.stop]  the shell's replay of the last utterance, and Stop
 * @returns {Promise<{ say, demo, off }>}  say: the wrapped voice; demo: the four controls
 */
export async function wireExtras({ bus, registry, speak, settings, save, kv, appsEl, librarian, datastore, status, clockEl, board = {}, replay, stop }) {
  const doc = (appsEl || clockEl || status)?.ownerDocument || globalThis.document;

  // One voice: the status region is live only in screen-reader mode. The shell's speak already stays silent then.
  const say = (text, signal) => {
    status?.setAttribute('aria-live', lookSettings().speaker === 'reader' ? 'polite' : 'off');
    return speak(text, signal);
  };

  // Your look as an app. First boot copies the shell's look in, so nothing the person already chose is lost.
  const lookKv = appKv('look', kv);
  if (settings && !(await lookKv.get('look'))) await lookKv.set('look', Object.fromEntries(SHARED.map((k) => [k, settings[k]]).filter(([, v]) => v !== undefined)));
  const offSync = onSettings((s) => {
    if (!settings) return;
    for (const k of SHARED) settings[k] = s[k];
    try { save?.(); } catch { /* stays in memory */ }
  });
  if (!registry.get('look')) registry.register(look);
  let root = doc?.getElementById('app-look');
  if (!root && appsEl) {
    root = await mountApp(look, appsEl, { kv: lookKv, bus, registry, say: (t) => say(t), librarian, datastore });
    await look.seed();
  }

  // The demo's own hands: Mode presses Your look's row where it is, without opening the app on stage.
  const ctxFor = (app) => createCtx({ app, root: doc.getElementById(`app-${app.id}`), bus, kv: appKv(app.id, kv),
    cursor: { async moveTo() {}, hide() {} }, ask: async () => false, speak: say });
  const run = (name, params, n, of) => runAction({ registry, name, params, bus, ctxFor, n, of });
  const onboard = { kv: { get: (k) => kv.get('os.onboard', k), set: (k, v) => kv.set('os.onboard', k, v) } };
  const planner = settings && (() => {
    settings.planner = settings.planner === 'offline' ? 'auto' : 'offline';
    try { save?.(); } catch { /* stays in memory */ }
    return say(`Planner: ${settings.planner === 'offline' ? 'offline' : 'Gemini'}.`);
  });
  const demo = createDemo({ registry, bus, run, say, board, replay, stop, onboard, planner });
  const panel = clockEl ? bindDemo(clockEl, demo, { doc }) : null;

  // First open: the guided welcome, once. Not awaited, so boot never waits on the voice.
  // Screen-reader mode needs no first tap: the status region is read without one.
  firstOpen({ kv: onboard.kv, say, bus, caption: captionIn(status), win: doc?.defaultView,
    ...(lookSettings().speaker === 'reader' ? { waitTap: false } : {}) }).catch((e) => console.warn('first open', e));

  // Inside: shell.js forwards the bus itself; forwarding here too would double every row on /inside.

  return { say, demo, off: () => { offSync(); panel?.off(); } };
}
