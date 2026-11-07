// ctx: the agent's hands inside one app. It presses the same controls the person does, through the cursor.
const CONTROL = 'button, a[href], input, textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="tab"], [contenteditable="true"]';

/** The name a screen reader would say for this control (enough of accname for our own apps). */
export function controlName(el) {
  const by = el.getAttribute('aria-labelledby');
  const named = el.getAttribute('aria-label')
    || (by && by.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent || '').join(' '))
    || (el.labels && el.labels[0] && el.labels[0].textContent)
    || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || '';
  return named.replace(/\s+/g, ' ').trim();
}

const stopped = () => Object.assign(new Error('Stopped'), { name: 'AbortError' });

/**
 * @param {object} o
 * @param {object} o.app      the registered app
 * @param {Element} o.root    the app's mounted root; tap and type refuse anything outside it
 * @param {object} o.bus      from createBus()
 * @param {object} o.kv       from appKv(app.id)
 * @param {object} o.cursor   { moveTo(el, name): Promise, hide() } from createCursor()
 * @param {function} o.ask    host's ask-first sheet: ({app, gate, readback}) => Promise<boolean>
 * @param {AbortSignal} [o.signal] Stop aborts it; every ctx call after that throws AbortError
 */
export function createCtx({ app, root, bus, kv, cursor, ask, signal }) {
  const live = () => { if (signal && signal.aborted) throw stopped(); };
  const own = (el, what) => {
    if (!el || !root.contains(el)) throw new Error(`${app.name}: the ${what} isn't on screen.`);
  };
  return {
    root, kv, signal,
    async tap(el, name) {
      live(); own(el, 'control');
      if (!el.matches(CONTROL)) throw new Error(`${app.name}: that isn't a control a person could press.`);
      const control = name || controlName(el);
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') throw new Error(`${app.name}: ${control} isn't available right now.`);
      bus.emit('tap', { app: app.id, control });
      await cursor.moveTo(el, control);
      live();
      el.click();
    },
    async type(el, text) {
      live(); own(el, 'text box');
      if (!('value' in el)) throw new Error(`${app.name}: that isn't a text box.`);
      if (el.focus) el.focus({ preventScroll: true });
      el.value = String(text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    say(text) { bus.emit('say', { app: app.id, text: String(text) }); },
    /** The ask-first sheet. The runner uses this for every gate; an app may use it for its own choices. */
    async confirm(gate, readback) {
      live();
      const result = !!(await ask({ app: app.id, gate, readback }));
      bus.emit('confirm', { app: app.id, gate, readback, result });
      live();
      return result;
    },
  };
}
