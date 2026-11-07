// /stage: the real phone (/) and Inside (/inside) on one projector screen, plus one line that follows the task.
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const room = qs.get('room') || 'stage'; // a phone with no room forwards nothing, so the stage always has one
const pass = `?room=${encodeURIComponent(room)}`;
$('inside-frame').src = `/inside?big&room=${encodeURIComponent(room)}`; // Inside's own projector view

// The phone at phone size, scaled to the height it has; observed, since the top line settles after the font loads.
const col = document.querySelector('.phone-col'), phone = $('phone'), label = $('phone-label');
let size = { w: 390, h: 844 };
const fit = () => {
  const s = Math.max(0.1, (col.clientHeight - label.offsetHeight - 8) / (size.h + 16));
  phone.style.setProperty('--w', size.w); phone.style.setProperty('--h', size.h); phone.style.setProperty('--s', String(s));
  return s;
};
new ResizeObserver(fit).observe(col);

// Left pane: the real phone's own screen, mirrored from its 'mirror:frame' events (Hermes), drawn into a
// script-free iframe. No frame for 5 s: the stage's own phone instead, loaded only then so the two never both forward.
const mirror = $('mirror-frame'), live = $('phone-frame'), cursor = $('cursor');
const STYLES = ['/app.css', '/os/phone-chrome.css', '/os/onboard/onboard.css'];
mirror.srcdoc = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">${STYLES.map((h) => `<link rel="stylesheet" href="${h}">`).join('')}</head><body></body></html>`;
const own = new Set(); // t of frames our own fallback phone sent, so it never mirrors itself
let lastFrame = 0, mode = null;
function show(next) {
  if (mode === next) return;
  mode = next;
  mirror.hidden = next !== 'mirror'; live.hidden = next !== 'live'; cursor.hidden = true;
  label.textContent = next === 'mirror' ? 'Live from the phone' : 'This laptop';
  label.classList.toggle('live', next === 'mirror');
  if (next === 'live') { size = { w: 390, h: 844 }; fit(); live.src = `/${pass}`; }
  else live.src = 'about:blank';
}
live.addEventListener('load', () => { // the fallback phone's own frames, by their bus time
  const hook = (n = 0) => {
    const bus = live.contentWindow?.murmur?.bus;
    if (!bus) { if (n < 50 && mode === 'live') setTimeout(() => hook(n + 1), 200); return; }
    try { bus.on('mirror:frame', (e) => own.add(e.t)); } catch { /* no mirror on this build */ }
  };
  hook();
});
let pending = null; // a frame that came before the srcdoc finished loading (the relay's latest, on connect)
mirror.addEventListener('load', () => { if (pending) frame(pending); pending = null; });
function frame(e) {
  if (own.has(e.t) || typeof e.html !== 'string') return;
  const d = mirror.contentDocument;
  if (!d?.body || d.URL !== 'about:srcdoc' || d.readyState !== 'complete') { pending = e; return; }
  lastFrame = Date.now();
  show('mirror');
  if (Number(e.w) > 0 && Number(e.h) > 0 && (e.w !== size.w || e.h !== size.h)) size = { w: Number(e.w), h: Number(e.h) };
  const s = fit();
  if (e.theme && e.theme !== 'dark') d.documentElement.dataset.theme = e.theme; else delete d.documentElement.dataset.theme;
  d.body.innerHTML = e.html; // inert: the iframe's sandbox has no allow-scripts
  const has = Number.isFinite(e.cx) && Number.isFinite(e.cy);
  cursor.hidden = !has;
  if (has) cursor.style.transform = `translate(${(8 + e.cx) * s}px, ${(8 + e.cy) * s}px)`;
}
setInterval(() => { if (Date.now() - lastFrame > 5000) show('live'); }, 1000);

// The top line, from the same relay Inside reads. Text goes in by textContent only.
const now = $('now');
const line = (label, text) => { now.replaceChildren(Object.assign(document.createElement('b'), { textContent: `${label}: ` }), text); };
const token = (() => { try { return qs.get('code') || localStorage.getItem('murmur.token'); } catch { return null; } })();
const q = new URLSearchParams();
if (token) q.set('t', token);
q.set('room', room);
const src = new EventSource(`/api/bus/stream?${q}`);
let heard = '';
src.onmessage = (m) => {
  let e; try { e = JSON.parse(m.data); } catch { return; }
  if (e.type === 'mirror:frame') frame(e);
  else if (e.type === 'reset') { heard = ''; now.textContent = 'Waiting for the phone.'; }
  else if (e.type === 'heard') { heard = e.text || ''; line('Heard', heard); }
  else if (e.type === 'task:start' && !heard && e.utterance) { heard = e.utterance; line('Heard', heard); }
  else if (e.type === 'step:start') line('Doing', e.label || e.action || '');
  else if (e.type === 'confirm' && e.readback && e.result == null) line('Asking', e.readback);
  else if (e.type === 'step:failed') line("Didn't work", e.reason || e.action || '');
  else if (e.type === 'task:done') { line('Done', heard); heard = ''; }
};

// Inside follows the bottom of Actions, which on a short screen hides the newest step's name: keep that name at the top.
$('inside-frame').addEventListener('load', (ev) => {
  const ol = ev.target.contentDocument?.getElementById('c-Actions');
  if (ol) new MutationObserver(() => { const li = ol.lastElementChild; if (li) ol.scrollTo({ top: ol.scrollTop + li.getBoundingClientRect().top - ol.getBoundingClientRect().top, behavior: 'instant' }); }).observe(ol, { childList: true, subtree: true });
});
