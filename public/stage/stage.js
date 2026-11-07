// /stage: the real phone (/) and Inside (/inside) on one projector screen, plus one line that follows the task.
import { installToken } from '../agent/token.js';
installToken();
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const room = qs.get('room') || 'stage'; // a phone with no room forwards nothing, so the stage always has one
const pass = `?room=${encodeURIComponent(room)}`;
$('inside-frame').src = `/inside?big&room=${encodeURIComponent(room)}`; // Inside's own projector view

// The phone at phone size, scaled to the height it has; observed, since the top line settles after the font loads.
const col = document.querySelector('.phone-col'), phone = $('phone'), label = $('phone-label');
let size = { w: 390, h: 844 };
const BEZEL = 14; // px of device body around the screen, before scaling
const fit = () => {
  const s = Math.max(0.1, (col.clientHeight - label.offsetHeight - 8) / (size.h + 2 * BEZEL));
  phone.style.setProperty('--w', size.w); phone.style.setProperty('--h', size.h); phone.style.setProperty('--s', String(s));
  return s;
};
new ResizeObserver(fit).observe(col);

// Left pane: the real phone's own screen, from its mirror:frame events (public/os/mirror.js), drawn into a
// script-free iframe. No frame for 8 s (the phone beats every 5 s when idle): this laptop's phone instead, opened with
// ?nomirror so it never mirrors itself, and unloaded again when the real phone is back.
const mirror = $('mirror-frame'), live = $('phone-frame'), cursor = $('cursor');
const STYLES = ['/app.css', '/os/phone-chrome.css', '/os/onboard/onboard.css', '/apps/look/look.css', '/os/demo/demo.css', '/stage/emu.css']; // the phone's head is not in a frame
mirror.srcdoc = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">${STYLES.map((h) => `<link rel="stylesheet" href="${h}">`).join('')}</head><body></body></html>`;
let lastFrame = 0, mode = null;
function show(next) {
  if (mode === next) return;
  mode = next;
  mirror.hidden = next !== 'mirror'; live.hidden = next !== 'live'; cursor.hidden = true;
  label.textContent = next === 'mirror' ? 'Live from the phone' : 'This laptop';
  label.classList.toggle('live', next === 'mirror');
  if (next === 'live') { size = { w: 390, h: 844 }; fit(); live.src = `/${pass}&nomirror`; }
  else live.src = 'about:blank';
}
// The laptop copy gets the same emulator look; the real phone never loads emu.css.
live.addEventListener('load', () => {
  const d = live.contentDocument;
  if (!d?.head || d.URL === 'about:blank') return;
  d.documentElement.classList.add('stage-emu');
  d.head.append(Object.assign(d.createElement('link'), { rel: 'stylesheet', href: '/stage/emu.css' }));
});
let pending = null; // a frame that came before the srcdoc finished loading (the relay's latest, on connect)
mirror.addEventListener('load', () => { if (pending) frame(pending); pending = null; });
function frame(e) {
  if (typeof e.html !== 'string') return;
  const d = mirror.contentDocument;
  if (!d?.body || d.URL !== 'about:srcdoc' || d.readyState !== 'complete') { pending = e; return; }
  lastFrame = Date.now(); // a frame waiting in the queue still means the phone is here
  queue.push(e); if (queue.length > 40) queue.splice(0, queue.length - 40);
  if (!playing) play();
}
function render(e) {
  const d = mirror.contentDocument;
  lastFrame = Date.now();
  show('mirror');
  if (Number(e.w) > 0 && Number(e.h) > 0 && (e.w !== size.w || e.h !== size.h)) size = { w: Number(e.w), h: Number(e.h) };
  const s = fit(), root = d.documentElement, th = e.theme && typeof e.theme === 'object' ? e.theme : {};
  root.className = `${th.className || ''} stage-emu`; // the emulator look: /stage only
  for (const k of Object.keys(root.dataset)) delete root.dataset[k];
  for (const [k, v] of Object.entries(th)) if (k !== 'className' && typeof v === 'string') root.dataset[k] = v;
  root.style.fontSize = typeof e.size === 'string' ? e.size : '';
  // Inert: parsed by DOMParser, and the iframe's sandbox has no allow-scripts.
  const body = new DOMParser().parseFromString(e.html, 'text/html').body;
  body.querySelectorAll('meta, base, iframe, frame, object, embed').forEach((n) => n.remove()); // a forged frame cannot refresh or embed
  d.body.replaceWith(d.adoptNode(body));
  d.defaultView.scrollTo(0, Number(e.sy) || 0);
  return body.querySelector('#apps > .app:not([hidden])')?.dataset.app || 'home';
}
setInterval(() => { if (Date.now() - lastFrame > 8000) show('live'); }, 1000);

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

// The agent's highlight: one ring on the stage, over whatever Murmur touches, in both modes. Phone pixels in, scaled here.
function ring(x, y, w, h, s = Number(phone.style.getPropertyValue('--s')) || 1) {
  cursor.hidden = false;
  cursor.style.width = `${w * s}px`; cursor.style.height = `${h * s}px`;
  cursor.style.transform = `translate(${(BEZEL + x) * s}px, ${(BEZEL + y) * s}px)`;
}
// Laptop copy: follow the phone's own .agent-cursor (same origin) and draw the stage ring on its box.
// The app runs live here, so the open and the presses are shown as they happen (its own cursor sets the pace).
let liveApp = 'home', liveAt = null, icons = {}, busy = false;
setInterval(async () => {
  if (mode !== 'live' || busy) return;
  const d = live.contentDocument;
  if (!d?.body) return;
  const app = d.querySelector('#apps > .app:not([hidden])')?.dataset.app || 'home';
  if (app === 'home') d.querySelectorAll('#board .tile[data-app] .what').forEach((w) => { const r = w.getBoundingClientRect(); if (r.width) icons[w.closest('.tile').dataset.app] = r; });
  if (app !== liveApp) {
    const r = icons[app]; liveApp = app;
    if (app !== 'home' && r) { busy = true; ring(r.left + r.width / 2 - 34, r.top - 6, 68, 68); tap(); open(live); await sleep(BEAT.open); busy = false; }
  }
  const c = d.querySelector('.agent-cursor');
  if (!c || c.hidden || d.querySelector('dialog[open]')) { cursor.hidden = true; liveAt = null; return; }
  const v = (k) => parseFloat(c.style.getPropertyValue(k)) || 0, at = ['--x', '--y', '--w', '--h'].map(v).join();
  ring(v('--x'), v('--y'), v('--w'), v('--h'));
  if (at !== liveAt) { liveAt = at; setTimeout(tap, BEAT.glide); }
}, 50);

// The show: each thing Murmur does gets its own beat, so the eye can follow. Home, the icon tap, the app opening
// from that icon, then the ring to each control with a press. Mirror frames queue and play out at this pace.
const still = matchMedia('(prefers-reduced-motion: reduce)');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BEAT = { glide: 380, press: 420, open: 520 }; // ms: the ring lands, the press reads, the app settles
const queue = [];
let playing = false, shownApp = 'home', lastAt = null, home = null; // home: the last home-screen frame
function tap() { cursor.classList.remove('tap'); void cursor.offsetWidth; cursor.classList.add('tap'); }
function open(el) { // the app grows out of the icon that was tapped
  if (still.matches) return;
  // The frame is already scale(--s) from its top left (stage.css), so the zoom composes onto that, about the ring's
  // centre in the phone's own pixels; replacing the transform or its origin would draw the phone at full size.
  const k = Number(phone.style.getPropertyValue('--s')) || 1;
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(cursor.style.transform) || [0, 0, 0];
  const ox = (Number(m[1]) + cursor.offsetWidth / 2) / k - BEZEL, oy = (Number(m[2]) + cursor.offsetHeight / 2) / k - BEZEL;
  const at = (z) => `scale(${k}) translate(${ox}px, ${oy}px) scale(${z}) translate(${-ox}px, ${-oy}px)`;
  el.animate([{ transform: at(0.2), opacity: 0.3 }, { transform: at(1), opacity: 1 }], { duration: BEAT.open, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
}
async function iconTap(doc, app) { // ring onto the home icon, press it; false when there is no icon to show
  const r = doc?.querySelector(`#board .tile[data-app="${CSS.escape(app)}"] .what`)?.getBoundingClientRect();
  if (!r?.width) return false;
  ring(r.left + r.width / 2 - 34, r.top - 6, 68, 68); await sleep(BEAT.glide);
  tap(); await sleep(BEAT.press);
  return true;
}
async function play() {
  playing = true;
  while (queue.length) {
    const e = queue.shift();
    const app = (() => { try { return new DOMParser().parseFromString(e.html, 'text/html').body.querySelector('#apps > .app:not([hidden])')?.dataset.app || 'home'; } catch { return 'home'; } })();
    const opening = app !== shownApp && app !== 'home';
    if (app === 'home') home = e;
    if (opening && shownApp !== 'home' && home) { // app to app: back out to the home screen first, so the icon tap shows
      cursor.hidden = true; render(home); open(mirror); await sleep(BEAT.open);
    }
    if (opening) await iconTap(mirror.contentDocument, app);
    render(e);
    if (opening) { open(mirror); await sleep(BEAT.open); }
    shownApp = app;
    const has = Number.isFinite(e.cx) && Number.isFinite(e.cy), at = has ? `${e.cx},${e.cy}` : null;
    if (!has) { cursor.hidden = true; lastAt = null; continue; }
    ring(e.cx - 28, e.cy - 28, 56, 56); // a frame carries only the centre: a ring around it
    if (at !== lastAt) { lastAt = at; await sleep(BEAT.glide); tap(); await sleep(BEAT.press); }
  }
  playing = false;
}
