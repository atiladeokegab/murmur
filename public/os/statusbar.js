// Phone chrome, all visual: the status bar clock, today's date for the Calendar icon, and the app zoom.
// The bar is aria-hidden in index.html; a screen reader asks "what time is it" instead.
const root = document.documentElement;
const time = document.querySelector('.statusbar .sb-time');
function tick() {
  const d = new Date();
  if (time) time.textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  root.style.setProperty('--today', `"${d.getDate()}"`);
  setTimeout(tick, 60000 - (d % 60000) + 50); // on the minute
}
tick();

// Open: the app grows out of the tile that was pressed. Home: the board settles back toward it.
// Transform and opacity only, so layout never shifts; nothing at all under reduced motion.
const still = matchMedia('(prefers-reduced-motion: reduce)');
let from = null; // the last pressed tile's centre, in viewport pixels
document.addEventListener('click', (e) => {
  const t = e.target.closest?.('#board .tile');
  if (t) { const r = t.getBoundingClientRect(); from = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
}, true);
function zoom(el, scale) {
  if (still.matches || !el?.animate) return;
  const r = el.getBoundingClientRect();
  const o = from ? `${from.x - r.left}px ${from.y - r.top}px` : '50% 0';
  el.animate([{ transform: `scale(${scale})`, opacity: 0, transformOrigin: o }, { transform: 'none', opacity: 1, transformOrigin: o }],
    { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
}
let was = root.dataset.open;
new MutationObserver(() => {
  const id = root.dataset.open;
  if (id === was) return;
  if (id) zoom(document.querySelector(`#apps > [data-app="${id}"]:not([hidden])`) || document.getElementById(`app-${id}`), 0.6);
  else { zoom(document.getElementById('board-view'), 1.08); from = null; }
  was = id;
}).observe(root, { attributes: true, attributeFilter: ['data-open'] });
