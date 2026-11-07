// The agent cursor: one amber ring in a fixed overlay, moved onto the control the agent is about to press.
// It glides there, gives a soft press pulse on arrival, and stays on its control while the page scrolls.
// Reduced motion: it fades out where it was and in where it lands.
export function createCursor(doc = document) {
  const win = doc.defaultView;
  let ring = null, target = null, frame = 0;
  const still = () => win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const place = () => {
    frame = 0;
    if (!ring || ring.hidden || !target) return;
    if (!target.isConnected || !target.getClientRects().length) { ring.hidden = true; return; } // its control went away
    const r = target.getBoundingClientRect();
    ring.style.setProperty('--x', `${r.left}px`); ring.style.setProperty('--y', `${r.top}px`);
    ring.style.setProperty('--w', `${r.width}px`); ring.style.setProperty('--h', `${r.height}px`);
  };
  const follow = () => { if (!frame) frame = win.requestAnimationFrame(place); };
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  return {
    async moveTo(el, name) {
      if (!ring) {
        ring = doc.createElement('div');
        ring.className = 'agent-cursor';
        ring.setAttribute('aria-hidden', 'true'); // the step line says it; the ring is for eyes
        ring.hidden = true;
        doc.body.append(ring);
        win.addEventListener('scroll', follow, { capture: true, passive: true });
        win.addEventListener('resize', follow, { passive: true });
      }
      el.scrollIntoView({ block: 'nearest' });
      const appearing = ring.hidden;
      target = el;
      ring.dataset.name = name;
      if (still() && !appearing) { ring.style.opacity = '0'; await wait(120); }
      if (appearing) { // the first ring appears on its control, not where the panel was a frame ago, and does not fly in
        ring.style.transition = 'none';
        await new Promise((res) => win.requestAnimationFrame(() => win.requestAnimationFrame(res)));
        if (target !== el) return; // hidden or moved on while we waited
      }
      ring.hidden = false; // before place(): place() skips a hidden ring, which left the first one at 0,0
      place();
      ring.style.opacity = '1';
      if (appearing) { ring.getBoundingClientRect(); ring.style.transition = ''; }
      await wait(still() ? 120 : 280); // let the glide land before the press
      delete ring.dataset.press; ring.getBoundingClientRect(); ring.dataset.press = '';
    },
    hide() { if (ring) ring.hidden = true; target = null; },
  };
}
