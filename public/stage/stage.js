// /stage: the real phone (/) and Inside (/inside) on one projector screen, plus one line that follows the task.
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const room = qs.get('room');
const pass = room ? `?room=${encodeURIComponent(room)}` : ''; // Hermes' opt-in room, passed through when given
$('phone-frame').src = `/${pass}`;
const inside = $('inside-frame');
inside.src = `/inside${pass}`;
// Same origin, so Inside takes a bigger-type sheet without any change to Inside itself.
inside.addEventListener('load', () => {
  const d = inside.contentDocument;
  if (!d) return;
  const l = d.createElement('link');
  l.rel = 'stylesheet'; l.href = '/stage/inside-stage.css';
  d.head.append(l);
});

// The phone at phone size, scaled to the height it has.
const phone = $('phone');
const fit = () => {
  const h = document.querySelector('.stage main').clientHeight;
  phone.style.setProperty('--s', String(h / 860));
};
addEventListener('resize', fit);
fit();

// The top line, from the same relay Inside reads. Text goes in by textContent only.
const now = $('now');
const line = (label, text) => { now.replaceChildren(Object.assign(document.createElement('b'), { textContent: `${label}: ` }), text); };
const token = (() => { try { return qs.get('code') || localStorage.getItem('murmur.token'); } catch { return null; } })();
const q = new URLSearchParams();
if (token) q.set('t', token);
if (room) q.set('room', room);
const src = new EventSource(`/api/bus/stream${q.size ? `?${q}` : ''}`);
let heard = '';
src.onmessage = (m) => {
  let e; try { e = JSON.parse(m.data); } catch { return; }
  if (e.type === 'reset') { heard = ''; now.textContent = 'Waiting for the phone.'; }
  else if (e.type === 'heard') { heard = e.text || ''; line('Heard', heard); }
  else if (e.type === 'task:start' && !heard && e.utterance) { heard = e.utterance; line('Heard', heard); }
  else if (e.type === 'step:start') line('Doing', e.label || e.action || '');
  else if (e.type === 'confirm' && e.readback && e.result == null) line('Asking', e.readback);
  else if (e.type === 'step:failed') line("Didn't work", e.reason || e.action || '');
  else if (e.type === 'task:done') { line('Done', heard); heard = ''; }
};
