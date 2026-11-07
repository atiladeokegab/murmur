import { test } from 'node:test';
import assert from 'node:assert/strict';
import { talkAnywhere, LONG_MS } from '../public/os/talk.js';

// A target that is a control when one of `kinds` matches the CONTROL selector.
const node = (control) => ({ closest: (sel) => (control && sel.split(',').some((s) => s.trim() === control) ? {} : null) });
function setup() {
  const h = {}, timers = [];
  const doc = { addEventListener: (n, f) => { h[n] = f; } };
  let starts = 0, prevented = 0, stopped = 0;
  talkAnywhere({ doc, start: () => starts++, listening: () => false, wait: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clear: (i) => { timers[i - 1].f = null; } });
  const ev = (target, x = 0, y = 0) => ({ isTrusted: true, button: 0, target, clientX: x, clientY: y, defaultPrevented: false,
    preventDefault() { prevented++; this.defaultPrevented = true; }, stopPropagation() { stopped++; } });
  const fire = () => { const t = timers.at(-1); if (t?.f) t.f(); };
  return { h, ev, fire, timers, get starts() { return starts; }, get prevented() { return prevented; }, get stopped() { return stopped; } };
}

test('a tap on blank board space starts listening; a tap on a button does not', () => {
  const t = setup();
  const blank = node(null);
  t.h.pointerdown(t.ev(blank)); t.h.pointerup(t.ev(blank)); t.h.click(t.ev(blank));
  assert.equal(t.starts, 1);
  for (const c of ['button', 'a[href]', 'input', 'textarea', 'dialog']) {
    const b = node(c);
    t.h.pointerdown(t.ev(b)); t.h.pointerup(t.ev(b)); t.h.click(t.ev(b));
  }
  assert.equal(t.starts, 1, 'controls keep their own taps');
  t.h.click({ ...t.ev(blank), isTrusted: false });
  assert.equal(t.starts, 1, "the agent's synthetic clicks never start listening");
});

test('a long press anywhere, even on a button, starts listening and the button is not pressed', () => {
  const t = setup();
  const b = node('button');
  t.h.pointerdown(t.ev(b));
  assert.equal(t.timers.at(-1).ms, LONG_MS);
  t.fire(); t.h.pointerup(t.ev(b));
  assert.equal(t.starts, 1);
  const click = t.ev(b); t.h.click(click);
  assert.equal(click.defaultPrevented, true); assert.equal(t.stopped, 1);
  t.h.pointerdown(t.ev(b)); t.h.pointerup(t.ev(b)); const next = t.ev(b); t.h.click(next);
  assert.equal(next.defaultPrevented, false, 'the next ordinary tap works');
});

test('a drag is a scroll, not a long press', () => {
  const t = setup();
  t.h.pointerdown(t.ev(node(null), 0, 0)); t.h.pointermove(t.ev(node(null), 0, 60)); t.fire();
  assert.equal(t.starts, 0);
});
