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

// Native :disabled covers a control inside <fieldset disabled>, where el.disabled is still false.
const off = (el) => el.disabled || el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
const stopped = () => Object.assign(new Error('Stopped'), { name: 'AbortError' });

/**
 * @param {object} o
 * @param {object} o.app      the registered app
 * @param {Element} o.root    the app's mounted root; tap and type refuse anything outside it
 * @param {object} o.bus      from createBus()
 * @param {object} o.kv       from appKv(app.id)
 * @param {object} o.cursor   { moveTo(el, name): Promise, hide() } from createCursor()
 * @param {function} o.ask    host's ask-first sheet: ({app, gate, readback}) => Promise<boolean>
 * @param {function} [o.choose] host's choice sheet: ({app, question, choices: [label]}) => Promise<index | null>
 * @param {function} [o.speak]  the voice: (text, signal) => Promise that settles when the sentence has been said
 * @param {AbortSignal} [o.signal] Stop aborts it; every ctx call after that throws AbortError
 */
export function createCtx({ app, root, bus, kv, cursor, ask, choose = async () => null, speak = async () => {}, signal }) {
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
      if (off(el)) throw new Error(`${app.name}: ${control} isn't available right now.`);
      bus.emit('tap', { app: app.id, control });
      await cursor.moveTo(el, control);
      live();
      el.click();
    },
    async type(el, text) {
      live(); own(el, 'text box');
      if (!('value' in el)) throw new Error(`${app.name}: that isn't a text box.`);
      if (off(el) || el.readOnly || el.getAttribute('aria-readonly') === 'true') {
        throw new Error(`${app.name}: ${controlName(el) || 'that box'} can't be changed right now.`);
      }
      if (el.focus) el.focus({ preventScroll: true });
      // Visible typing, ~25 ms a letter, so the confirm opens on text already in view. Instant under reduced motion,
      // in ?quiet runs (the eval) and outside a browser (tests).
      text = String(text);
      const slow = typeof globalThis.matchMedia === 'function' && !globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
        && !/[?&]quiet\b/.test(globalThis.location?.search || '');
      for (let i = slow ? 1 : text.length; i <= text.length; i++) {
        live();
        el.value = text.slice(0, i);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        if (slow && i < text.length) await new Promise((r) => setTimeout(r, 25));
      }
    },
    /** Says one sentence and settles when it has been said; rejects with AbortError on Stop. */
    async say(text) {
      live();
      bus.emit('say', { app: app.id, text: String(text) });
      await speak(String(text), signal);
      live();
    },
    /**
     * Ask the person to pick one ("Sam or Samira?"). choices: [{ label, ...anything }].
     * Resolves to the chosen choice object, or null when they said no or none.
     */
    async choose(question, choices) {
      live();
      const i = await choose({ app: app.id, question, choices: choices.map((c) => c.label) });
      const picked = Number.isInteger(i) && choices[i] ? choices[i] : null;
      bus.emit('ask', { app: app.id, question, choices: choices.map((c) => c.label), result: picked ? picked.label : null });
      live();
      return picked;
    },
    /** The ask-first sheet. The runner uses this for every gate; an app may use it for its own choices. */
    async confirm(gate, readback) {
      live();
      // ask resolves a boolean, or { result, fingerprint } when the host checked a fingerprint (pay)
      const a = await ask({ app: app.id, gate, readback });
      const result = a === true || a?.result === true;
      bus.emit('confirm', { app: app.id, gate, readback, result, ...(typeof a?.fingerprint === 'boolean' && { fingerprint: a.fingerprint }) });
      live();
      return result;
    },
  };
}
