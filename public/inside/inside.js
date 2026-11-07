// /inside: listens to the relay and keeps five columns plus the tally live. Rows are keyed, so only what is
// new moves: a row slides in, a step's tick lands when its verify passes, a changed number flips.
import { COLUMNS, createTally } from './tally.js';
import { roomFrom } from './forward.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
// JSON with a space after , and : so it wraps between keys, never mid-word; empty params print nothing.
const json = (o) => JSON.stringify(o).replace(/,(?=["{\[])/g, ', ').replace(/":/g, '": ');
const code = (o) => `<code>${esc(json(o))}</code>`;
const params = (o) => (o && Object.keys(o).length ? ` ${code(o)}` : '');
const val = (v) => (Array.isArray(v) ? v.join(' → ') : v === true ? 'yes' : v === false ? 'no' : typeof v === 'object' && v ? json(v) : v);
// A row's place inside its column, scroll excluded, so following the bottom never counts as movement.
const at = (li) => li.getBoundingClientRect().top - li.parentElement.getBoundingClientRect().top + li.parentElement.scrollTop;
const smooth = () => !quiet && !matchMedia('(prefers-reduced-motion: reduce)').matches;
const ms = (n) => (n == null ? '' : `<span class="ms">${Math.round(n)} ms</span>`);
const yesNo = (r) => (r === true ? 'Yes' : r === false ? 'No' : '…');
const MARK = { verified: '<svg class="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>', failed: '<span class="cross" aria-hidden="true">✗</span>', running: '<span class="spin" aria-hidden="true"></span>' };

const ROW = {
  Heard: (r) => `<p class="heard">“${esc(r.text)}”</p>${r.raw && r.raw !== r.text ? `<p class="raw">raw: ${esc(r.raw)}</p>` : ''}<p class="meta">${esc(r.path || 'from the task')}${ms(r.ms)}</p>`,
  Plan: (r) => `<ol class="calls">${r.plan.map((c, i) => `<li><span class="n">${i + 1}</span><span>${esc(c.name)}</span>${params(c.params)}</li>`).join('') || '<li>No plan</li>'}</ol>`
    + `${r.dropped.length ? `<p class="meta">dropped by the schema ${code(r.dropped)}</p>` : ''}${r.provider ? `<p class="meta">planned by ${esc(r.provider)}</p>` : ''}`,
  Actions: (r) => `<p class="step">${MARK[r.result] || ''}<span>${esc(r.label || r.action)}</span>${r.gate ? `<b class="gate">${esc(r.gate)}</b>` : ''}</p>`
    + `<p class="meta">${esc(r.action)}${params(r.params)}</p>`
    + `<p class="meta">verify: <span class="res">${esc(r.result)}</span>${ms(r.ms)}</p>`
    + `${r.control ? `<p class="pressed">pressed <q>${esc(r.control)}</q></p>` : ''}${r.reason ? `<p class="why">Didn't work: ${esc(r.reason)}</p>` : ''}`,
  Asked: (r) => `<p class="read">${esc(r.readback)}</p><p class="answer ${r.result === true ? 'yes' : r.result === false ? 'no' : ''}"><b>${esc(r.gate)}</b> · ${yesNo(r.result)}</p>`,
  // Every field, as key and value, so a judge sees there is no content in it.
  Memory: (r) => `<p class="kind">${esc(r.kind)}</p><dl class="fields">${Object.entries(r.fields).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(val(v))}</dd>`).join('')}</dl>`,
};
const LABELS = [['tasks', 'tasks'], ['verified', 'steps verified'], ['failed', 'steps failed'], ['asked', 'gates asked'], ['bypassed', 'gates bypassed'], ['modelCalls', 'model calls']];
const $ = (id) => document.getElementById(id);

$('cols').innerHTML = COLUMNS.map((c) => `<section aria-labelledby="h-${c}"><h2 id="h-${c}"><span>${c}</span><span class="count" id="n-${c}">0</span></h2><ol id="c-${c}"></ol></section>`).join('');
$('tally').innerHTML = LABELS.map(([k, l]) => `<div class="t-${k}"><dt>${l}</dt><dd id="t-${k}">0</dd></div>`).join('');

let model = createTally(), els = new WeakMap(), taskOf = new WeakMap(), quiet = true, cur = 0;
const calm = () => { quiet = true; clearTimeout(calm.t); calm.t = setTimeout(() => { quiet = false; }, 600); }; // a replay lands still

function flip(el, v) {
  const s = String(v);
  if (el.textContent === s) return;
  el.textContent = s;
  if (!quiet) { el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); }
}

function draw() {
  const t = model.tally(), cols = model.columns();
  const lis = smooth() ? [...document.querySelectorAll('#cols li')] : [], y0 = new Map(lis.map((li) => [li, at(li)]));
  for (const [k] of LABELS) flip($(`t-${k}`), t[k]);
  $('t-bypassed').parentElement.classList.toggle('bad', t.bypassed > 0);
  for (const c of COLUMNS) {
    const ol = $(`c-${c}`);
    let moved = false;
    flip($(`n-${c}`), cols[c].length);
    for (const r of cols[c]) {
      let e = els.get(r);
      if (!e) {
        e = { li: document.createElement('li'), html: '' };
        els.set(r, e);
        if (!quiet) e.li.className = 'in';
        ol.append(e.li);
      }
      const html = ROW[c](r);
      let grew = false;
      if (html !== e.html) {
        if (e.html && !quiet && r.result && r.result !== 'running') e.li.classList.add('landed'); // the tick lands
        e.html = html; e.li.innerHTML = html; grew = true;
      }
      e.li.dataset.result = r.result || '';
      e.li.classList.toggle('old', (taskOf.get(r) ?? cur) < cur);
      if (grew) moved = true;
    }
    // A row grows after it lands (the press, the verify), so follow the bottom whenever anything changed.
    if (moved) ol.scrollTo({ top: ol.scrollHeight, behavior: smooth() ? 'smooth' : 'auto' });
  }
  // FLIP: rows that a fold or a growing row moved glide to their new place instead of jumping
  for (const [li, y] of y0) { const d = y - at(li); if (Math.abs(d) > 1) li.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)', composite: 'add' }); }
}

// Stamp each new row with its task as it arrives (draws are batched, so the tally has moved on by then):
// a `heard` belongs to the task about to start.
function add(e) {
  const cols = model.columns(), before = Object.fromEntries(COLUMNS.map((c) => [c, cols[c].length]));
  model.add(e);
  const n = model.tally().tasks + (e.type === 'heard' ? 1 : 0);
  for (const c of COLUMNS) for (const r of cols[c].slice(before[c])) taskOf.set(r, n);
  cur = Math.max(cur, n); // fold the last task the moment a new one is heard
}

function restart() {
  model = createTally(); els = new WeakMap(); taskOf = new WeakMap(); cur = 0;
  for (const c of COLUMNS) $(`c-${c}`).replaceChildren();
  calm(); draw();
}
restart();

let pending = false;
// With MURMUR_TOKEN set, open /inside?code=… once, as on the phone; EventSource sends no headers, so it goes as ?t=.
const t = (() => { try { const c = new URLSearchParams(location.search).get('code'); if (c) localStorage.setItem('murmur.token', c); return c || localStorage.getItem('murmur.token'); } catch { return null; } })();
// /inside?room=stage (or #stage) shows that room only; a plain /inside shows the stage.
const q = new URLSearchParams({ room: roomFrom(location) || 'stage', ...(t ? { t } : {}) });
const src = new EventSource(`/api/bus/stream?${q}`);
// The relay replays its whole ring on every connect, so start the model over or a reconnect counts everything twice.
src.onopen = () => { restart(); document.body.dataset.link = 'on'; $('link').textContent = 'Joined to the phone'; };
src.onerror = () => { document.body.dataset.link = 'off'; $('link').textContent = 'Lost the phone. Reconnecting.'; };
src.onmessage = (m) => {
  const e = JSON.parse(m.data);
  if (e.type === 'reset') restart();
  add(e);
  if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; draw(); }); }
};
