// The agent cursor: one amber ring in a fixed overlay, moved onto the control the agent is about to press.
export function createCursor(doc = document) {
  let ring = null;
  return {
    async moveTo(el, name) {
      if (!ring) {
        ring = doc.createElement('div');
        ring.className = 'agent-cursor';
        ring.setAttribute('aria-hidden', 'true'); // the step line says it; the ring is for eyes
        doc.body.append(ring);
      }
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      ring.style.setProperty('--x', `${r.left}px`); ring.style.setProperty('--y', `${r.top}px`);
      ring.style.setProperty('--w', `${r.width}px`); ring.style.setProperty('--h', `${r.height}px`);
      ring.dataset.name = name;
      ring.hidden = false;
      const still = doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches;
      await new Promise((res) => setTimeout(res, still ? 0 : 220)); // let the glide land before the press
    },
    hide() { if (ring) ring.hidden = true; },
  };
}
