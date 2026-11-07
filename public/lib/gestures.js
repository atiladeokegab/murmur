// No-look gestures on one surface: tap, double tap, swipe, hold. Pointer events only, so mouse, touch and pen all work.
// The recogniser is plain state over (x, y, t) so it runs in node tests with fake timers.
export const HOLD_MS = 450, DOUBLE_MS = 280, SLOP = 24, SWIPE = 48;

export function recogniser(on, timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) }) {
  let down = null, holding = false, holdT = null, tapT = null;
  const fire = (name, ...a) => on[name] && on[name](...a);
  return {
    down(x, y, t) {
      down = { x, y, t };
      holdT = timers.set(() => { holdT = null; if (tapT) { timers.clear(tapT); tapT = null; } holding = true; fire('holdStart'); }, HOLD_MS);
    },
    move(x, y) {
      if (!down || holding || !holdT) return;
      if (Math.hypot(x - down.x, y - down.y) > SLOP) { timers.clear(holdT); holdT = null; } // a drag, not a hold
    },
    up(x, y) {
      if (!down) return;
      if (holdT) { timers.clear(holdT); holdT = null; }
      const dx = x - down.x, dy = y - down.y;
      down = null;
      if (holding) { holding = false; fire('holdEnd'); return; }
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE) {
        if (tapT) { timers.clear(tapT); tapT = null; }
        fire('swipe', Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        return;
      }
      if (Math.hypot(dx, dy) > SLOP) return;
      if (tapT) { timers.clear(tapT); tapT = null; fire('doubleTap'); return; }
      tapT = timers.set(() => { tapT = null; fire('tap'); }, DOUBLE_MS);
    },
    cancel() { if (holdT) timers.clear(holdT); holdT = null; down = null; if (holding) { holding = false; fire('holdEnd'); } },
  };
}
