// Demo controls: reset, next morning, mode, replay. Behind one discreet control, the same as the shell's:
// three taps on the clock within 1.5 s, or Shift+D. The rehearsal list is /os/demo/ (index.html here). Lesson 42: the lead knows these cold.
import { rearm } from '../onboard/index.js';

export const CONTROLS = [
  { key: 'reset', label: 'Reset', words: 'Every app back to its demo data, the board back to day 1.' },
  { key: 'nextMorning', label: 'Next morning', words: 'Moves the seeded week on a day, so Murmur proposes Put the bus first?' },
  { key: 'mode', label: 'Mode', words: 'Switches who speaks: Murmur, or the screen reader.' },
  { key: 'replay', label: 'Replay', words: 'Runs the last task again, gates included.' },
  { key: 'planner', label: 'Planner', words: 'Switches the planner: Gemini, or offline. The fallback if Gemini hangs.' },
];
export const TAPS = 3, WITHIN_MS = 1500;

/**
 * @param {object} o
 * @param {object} o.registry   every mounted app; reset() is called on each
 * @param {object} o.bus        the bus; replay reads the last task:start from its log
 * @param {function} o.run      (name, params) => runAction result: the shell's single-step runner
 * @param {function} [o.say]    the host's routed voice, for the control's own one-line result
 * @param {object} [o.board]    { reset(), nextMorning() }: the board's day 1 and its seeded week
 * @param {function} [o.replay] (task) => Promise: the agent's runner for a whole plan; default runs each step
 * @param {function} [o.stop]   stops a running task before a reset
 * @param {object} [o.onboard]  { kv } for the first-open flag, re-armed on reset
 * @param {function} [o.planner] flips the planner (offline or Gemini) and says which
 */
export function createDemo({ registry, bus, run, say = async () => {}, board = {}, replay, stop, onboard = {}, planner }) {
  const lastTask = () => [...bus.log].reverse().find((e) => e.name === 'task:start');
  return {
    async reset() {
      if (stop) await stop();
      for (const app of registry.list()) await app.reset();
      if (board.reset) await board.reset();
      await rearm(onboard);
      await say('Reset. Day 1.');
    },
    async nextMorning() {
      if (!board.nextMorning) return say('Next morning needs the board.');
      await board.nextMorning();
    },
    async mode() {
      const look = registry.get('look');
      if (!look) return say('Mode needs Your look.');
      const who = look.state().speaker === 'reader' ? 'murmur' : 'reader';
      const r = await run('look__whoSpeaks', { who });
      if (r?.ok) await say(look.actions.whoSpeaks.done(look.state())); // the agent's press is quiet, so Mode says its row
      return r;
    },
    async planner() {
      if (!planner) return say('Planner needs the shell.');
      return planner();
    },
    async replay() {
      const t = lastTask();
      if (!t) return say('Nothing to replay yet.');
      if (replay) return replay(t);
      for (const [i, s] of t.plan.entries()) {
        const r = await run(s.name, s.params, i + 1, t.plan.length);
        if (!r?.ok) return r;
      }
    },
  };
}

/**
 * Opens the demo panel on three taps on `trigger` (the clock) within 1.5 s, or Shift+D anywhere.
 * Inside the panel, keys 1 to 5 run the controls in order and Escape closes it. A control closes the panel
 * before it runs, so the mirror shows the phone, not the panel. Returns { open, close, panel, off }.
 */
export function bindDemo(trigger, demo, { doc = trigger.ownerDocument, now = () => Date.now() } = {}) {
  if (doc.head && !doc.getElementById('demo-css')) {
    const css = doc.createElement('link');
    Object.assign(css, { id: 'demo-css', rel: 'stylesheet', href: new URL('demo.css', import.meta.url).href });
    doc.head.append(css);
  }
  const panel = doc.createElement('div');
  panel.className = 'demo-panel';
  panel.id = 'demo-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'demo-panel-h');
  panel.hidden = true;
  const h = doc.createElement('h2');
  h.id = 'demo-panel-h';
  h.textContent = 'Demo controls';
  panel.append(h);
  let back = null;
  const close = () => { panel.hidden = true; if (back && back.focus) back.focus(); };
  const fire = (c) => { close(); return Promise.resolve(demo[c.key]()).catch((e) => console.error('demo', c.key, e)); };
  const buttons = CONTROLS.map((c, i) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.id = `demo-${c.key}`;
    b.textContent = `${i + 1}. ${c.label}`;
    b.addEventListener('click', () => fire(c));
    panel.append(b);
    return b;
  });
  const shut = doc.createElement('button');
  shut.type = 'button';
  shut.id = 'demo-close';
  shut.textContent = 'Close';
  shut.addEventListener('click', close);
  panel.append(shut);
  doc.body.append(panel);
  const open = () => { back = doc.activeElement; panel.hidden = false; buttons[0].focus(); };

  let taps = [];
  const tap = () => {
    const t = now();
    taps = [...taps.filter((x) => t - x < WITHIN_MS), t];
    if (taps.length >= TAPS) { taps = []; open(); }
  };
  const onKey = (e) => {
    if (panel.hidden) {
      if (e.key === 'D' && e.shiftKey && !/^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '')) { e.preventDefault?.(); open(); }
      return;
    }
    if (e.key === 'Escape') close();
    const c = CONTROLS[Number(e.key) - 1];
    if (c) { e.preventDefault?.(); fire(c); }
  };
  trigger.addEventListener('click', tap);
  doc.addEventListener('keydown', onKey);
  const off = () => {
    trigger.removeEventListener?.('click', tap);
    doc.removeEventListener?.('keydown', onKey);
    panel.remove?.();
  };
  return { open, close, panel, off };
}
