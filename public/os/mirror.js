// Live mirror: a phone opened with ?room=… sends its own screen to the relay, so /stage shows the real phone beside Inside.
// One frame at most every 150 ms, only when something changed. Frames go straight to the relay, not through the bus:
// the bus keeps a 500-event log and forward() batches 50 per POST, and 200 KB frames would bloat both.
const MAX = 200 * 1024;

// The phone as markup: scripts dropped, typed values copied into attributes so typing shows on the laptop.
export function frameOf(doc) {
  const live = doc.body, copy = live.cloneNode(true);
  const from = live.querySelectorAll('input, textarea, select'), to = copy.querySelectorAll('input, textarea, select');
  from.forEach((el, i) => {
    const c = to[i];
    if (el.tagName === 'TEXTAREA') c.textContent = el.value;
    else if (el.tagName === 'SELECT') c.querySelectorAll('option').forEach((o, j) => o.toggleAttribute('selected', j === el.selectedIndex));
    else if (el.type === 'checkbox' || el.type === 'radio') c.toggleAttribute('checked', el.checked);
    else if (el.type !== 'password') c.setAttribute('value', el.value);
  });
  copy.querySelectorAll('script').forEach((s) => s.remove());
  const ring = doc.querySelector('.agent-cursor'), win = doc.defaultView, root = doc.documentElement;
  let cx = null, cy = null;
  if (ring && !ring.hidden) {
    const v = (k) => parseFloat(ring.style.getPropertyValue(k)) || 0;
    cx = Math.round(v('--x') + v('--w') / 2); cy = Math.round(v('--y') + v('--h') / 2);
  }
  return { html: copy.outerHTML, w: win.innerWidth, h: win.innerHeight, cx, cy, sy: Math.round(win.scrollY), size: win.getComputedStyle(root).fontSize,
    theme: { className: root.className, ...root.dataset }, at: Date.now(), t: Date.now() }; // t: the stage matches frames by it; the relay overwrites at
}

/**
 * @param {object} o
 * @param {Document} o.doc
 * @param {function} o.send      (frame) => void; the default POSTs one mirror:frame to /api/bus?room=…
 * @param {number} [o.every=150] ms between frames, at most
 * @returns {function} stop
 */
export function mirror({ doc, room, send, every = 150, beat = 5000, now = () => Date.now(), frame = frameOf }) {
  send ??= (f) => {
    try {
      Promise.resolve(globalThis.fetch(`/api/bus?room=${encodeURIComponent(room)}`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'mirror:frame', ...f }) })).catch(() => {});
    } catch {}
  };
  let last = -Infinity, timer = null, prev = '';
  let quiet = 0; // last send time: an idle phone still sends one frame every `beat` ms, or the stage falls back to its own phone
  const shoot = (force = false) => {
    timer = null; last = now();
    let f;
    try { f = frame(doc); } catch { return; }
    if (f.html.length > MAX || (!force && f.html === prev && f.cx === shoot.cx && f.cy === shoot.cy && f.size === shoot.size)) return; // too big, or nothing moved
    prev = f.html; shoot.cx = f.cx; shoot.cy = f.cy; shoot.size = f.size; quiet = now();
    send(f);
  };
  const soon = () => { if (!timer) timer = setTimeout(() => shoot(), Math.max(0, last + every - now())); };
  const win = doc.defaultView;
  const obs = new win.MutationObserver(soon);
  obs.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  doc.addEventListener('input', soon, true); // a typed value changes no attribute
  win.addEventListener('scroll', soon, { capture: true, passive: true });
  soon();
  const hb = setInterval(() => { if (now() - quiet >= beat - 50 && !timer) shoot(true); }, Math.min(beat, 1000));
  return () => { obs.disconnect(); clearTimeout(timer); clearInterval(hb); doc.removeEventListener('input', soon, true); win.removeEventListener('scroll', soon, { capture: true }); };
}
