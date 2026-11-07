// Talk anywhere (the lead, 13:55): a blind person cannot find one tap target, so the whole screen is the talk bar.
// A tap on anything that is not a control starts listening. A press held about 500 ms anywhere, even on a control,
// starts listening too, and that control is not pressed. Space stays on the keyboard (the shell binds it).
export const LONG_MS = 500, SLOP = 24;
const CONTROL = 'button, a[href], input, textarea, select, label, summary, [role="button"], [role="link"], [contenteditable], dialog, .nolook';

export function talkAnywhere({ doc = document, start, listening, wait = (f, ms) => setTimeout(f, ms), clear = (t) => clearTimeout(t) }) {
  let timer = null, at = null, swallow = false;
  const cancel = () => { if (timer) clear(timer); timer = null; at = null; };
  const onDown = (e) => {
    if (!e.isTrusted || e.button > 0 || e.target.closest?.('.nolook')) return; // no-look mode has its own surface
    cancel(); swallow = false;
    at = { x: e.clientX, y: e.clientY };
    timer = wait(() => { timer = null; swallow = true; if (!listening()) { try { navigator.vibrate?.(30); } catch { /* no buzz */ } start(); } }, LONG_MS); // start dings the earcon
  };
  const onMove = (e) => { if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > SLOP) cancel(); }; // a scroll, not a hold
  const onClick = (e) => {
    if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); return; } // the long press was the talk, not this tap
    if (!e.isTrusted || e.defaultPrevented || e.target.closest?.(CONTROL)) return;
    start();
  };
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('pointermove', onMove, true);
  doc.addEventListener('pointerup', cancel, true);
  doc.addEventListener('pointercancel', cancel, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('contextmenu', (e) => { if (swallow) e.preventDefault(); }, true); // a touch long press opens no menu
}
