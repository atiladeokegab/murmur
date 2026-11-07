// /inside: listens to the relay and redraws five columns plus the tally on each bus event.
import { COLUMNS, createTally } from './tally.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
const code = (o) => `<code>${esc(JSON.stringify(o))}</code>`;
const ms = (n) => (n == null ? '' : ` · ${Math.round(n)} ms`);

const yesNo = (r) => (r === true ? 'yes' : r === false ? 'no' : JSON.stringify(r));
const ROW = {
  Heard: (r) => `${esc(r.text)}${r.raw && r.raw !== r.text ? `<br>Raw: ${esc(r.raw)}` : ''}<br><code>${esc(r.path || 'from the task')}${ms(r.ms)}</code>`,
  Plan: (r) => `${r.plan.map((c) => `${esc(c.name)} ${code(c.params ?? {})}`).join('<br>') || 'No plan'}`
    + `${r.dropped.length ? `<br>Dropped: ${code(r.dropped)}` : ''}${r.provider ? `<br><code>${esc(r.provider)}</code>` : ''}`,
  Actions: (r) => `<span class="${r.result === 'verified' ? 'ok' : r.result === 'failed' ? 'no' : ''}">${esc(r.label || r.action)}</span>${r.gate ? ` <b>[${esc(r.gate)}]</b>` : ''}`
    + `<br><code>${esc(r.app ? `${r.app}.` : '')}${esc(r.action)} ${esc(JSON.stringify(r.params ?? {}))}</code>`
    + `<br><code>${esc(r.control ? `pressed ${r.control} · ` : '')}verify: ${esc(r.result)}${ms(r.ms)}</code>${r.reason ? `<br>Didn't work: ${esc(r.reason)}` : ''}`,
  Asked: (r) => `<b>${esc(r.gate)}</b>: ${esc(r.readback)}<br><code>${esc(r.app || '')} answer: ${esc(yesNo(r.result))}</code>`,
  Memory: (r) => `${esc(r.kind)} ${code(r.fields)}`,
};
const LABELS = [['tasks', 'tasks'], ['verified', 'steps verified'], ['failed', 'steps failed'], ['asked', 'gates asked'], ['bypassed', 'gates bypassed'], ['modelCalls', 'model calls']];

let model = createTally();
const $ = (id) => document.getElementById(id);
$('cols').innerHTML = COLUMNS.map((c) => `<section aria-labelledby="h-${c}"><h2 id="h-${c}">${c}</h2><ol id="c-${c}"></ol></section>`).join('');

function draw() {
  const t = model.tally(), cols = model.columns();
  $('tally').innerHTML = LABELS.map(([k, l]) => `<div class="${k === 'bypassed' && t[k] ? 'bad' : ''}"><dt>${l}</dt><dd>${t[k]}</dd></div>`).join('');
  for (const c of COLUMNS) $(`c-${c}`).innerHTML = cols[c].map((r) => `<li>${ROW[c](r)}</li>`).join('');
}
draw();

let pending = false;
const src = new EventSource('/api/bus/stream');
src.onopen = () => { $('link').textContent = 'Joined to the phone.'; };
src.onerror = () => { $('link').textContent = 'Lost the phone. Reconnecting.'; };
src.onmessage = (m) => {
  const e = JSON.parse(m.data);
  if (e.type === 'reset') model = createTally();
  model.add(e);
  if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; draw(); }); }
};
