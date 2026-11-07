// The race: one task, Murmur against the usual way. Both clocks start together; a helper counts taps on each side.
import { fmt } from './lib/race.js';
const $ = (s, r = document) => r.querySelector(s);
const status = $('#say');
let started = 0, tick = null;
const lanes = [...document.querySelectorAll('.lane')].map((el) => ({ el, name: $('h2', el).textContent, taps: 0, end: 0 }));
const show = (l) => { $('.clock', l.el).textContent = fmt((l.end || performance.now()) - started); $('.n', l.el).textContent = l.taps; $('.unit', l.el).textContent = l.taps === 1 ? 'tap' : 'taps'; };
function frame() { lanes.forEach((l) => !l.end && show(l)); if (lanes.some((l) => !l.end)) tick = requestAnimationFrame(frame); }
$('#start').addEventListener('click', () => {
  cancelAnimationFrame(tick); started = performance.now();
  lanes.forEach((l) => { l.taps = 0; l.end = 0; l.el.classList.remove('won'); });
  status.textContent = 'Go.'; frame();
});
$('#reset').addEventListener('click', () => {
  cancelAnimationFrame(tick); started = 0;
  lanes.forEach((l) => { l.taps = 0; l.end = 0; l.el.classList.remove('won'); show(l); $('.clock', l.el).textContent = fmt(0); });
  status.textContent = 'Reset. Press Start both.';
});
for (const l of lanes) {
  $('.tap', l.el).addEventListener('click', () => { if (started && !l.end) { l.taps++; show(l); } });
  $('.done', l.el).addEventListener('click', () => {
    if (!started || l.end) return;
    l.end = performance.now(); show(l);
    const first = lanes.filter((x) => x.end).length === 1;
    if (first) l.el.classList.add('won');
    status.textContent = `${l.name} finished in ${fmt(l.end - started)} with ${l.taps} ${l.taps === 1 ? 'tap' : 'taps'}${first ? ', first' : ''}.`;
  });
}
