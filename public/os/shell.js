// Murmur's shell (spec §2 and §7): the board, the app frame, the work panel, tap to talk, the ask-first sheet,
// Back, Your look and the demo controls. The agent (public/agent/) plugs in through `host`; see os/contract.md §9.
import { createBus, createRegistry, createCursor, createCtx, appKv, loadApps, mountApp } from '../sdk/index.js';
import appIds from '../apps/apps.js';
import { earcon } from './earcons.js';
import { IDLE, reduce, placeLine } from './panel.js';
import { recogniser } from '../lib/gestures.js';
import { SIZES, THEMES, readLook, writeLook, applyLook } from '../look.js';
import { createToolkit } from '../vendor/toolkit/index.js';
import { browserKV } from '../ports/browser-kv.js';
import { playPcm, stopAudio, audioOut } from '../live.js';
import * as passkey from '../passkey.js';
import { byHand } from './gate.js';
// Optional modules from other branches: boot never depends on them. The token must wrap fetch before any /api call.
const optional = (p) => import(p).catch(() => null);
(await optional('../agent/token.js'))?.installToken();

const $ = (s) => document.querySelector(s);
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('murmur:' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('murmur:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const QUIET = /[?&]quiet\b/.test(location.search); // the eval and the flows: no audio, no waiting for speech
const look = Object.assign({ size: 100, theme: 'dark', rate: 1, speaker: 'murmur', agency: 'ask', planner: 'auto', nolook: false },
  store.get('look', {}));
const saveLook = () => store.set('look', look);
let agent = null; // declared before the mount loop: Mine reads os.workflows during seed()

// ---------- the Librarian: Your look lives in the ability profile; Stop learning pauses memory ----------
let librarian;
try {
  ({ librarian } = createToolkit({ kv: browserKV() }));
  if (!(await librarian.getProfile())?.fields?.needs?.length) await writeLook(librarian, look);
  Object.assign(look, await readLook(librarian));
} catch (e) {
  console.warn('Librarian unavailable; Your look stays on this phone only', e.name);
  librarian = null;
}
if (!/[?&]zoom=/.test(location.search)) applyLook(look);
saveLook();

// ---------- one voice: Murmur speaks, or the screen reader reads the one status region ----------
const status = $('#say');
const caps = QUIET ? {} : await fetch('/health').then((r) => r.json()).catch(() => ({}));
let token = 0, lastLine = '';
const readerSpeaks = () => look.speaker === 'reader';
function applySpeaker() { status.setAttribute('aria-live', readerSpeaks() ? 'polite' : 'off'); }
function show(text) { status.textContent = text; if (text) lastLine = text; }
function hush() { token++; stopAudio(); try { speechSynthesis.cancel(); } catch { /* no speech */ } }
const wait = (ms, signal) => new Promise((res) => {
  const t = setTimeout(() => res(true), ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); res(false); }, { once: true });
});
/** Say one sentence. Settles true when it has been said, false if Stop cut it off. */
function speak(text, signal) {
  text = String(text || '');
  show(text);
  if (signal?.aborted) return Promise.resolve(false);
  if (QUIET || !text) return Promise.resolve(true);
  if (readerSpeaks()) return wait(Math.min(4000, 600 + text.length * 55), signal); // give TalkBack time to read it
  const my = ++token;
  return new Promise((res) => {
    let settled = false;
    const end = (ok) => { if (!settled) { settled = true; signal?.removeEventListener('abort', abort); res(ok); } };
    const abort = () => { hush(); end(false); };
    signal?.addEventListener('abort', abort, { once: true });
    const local = () => browserSpeak(text, () => end(my === token));
    if (!caps.tts) return local();
    fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('tts'))))
      .then((a) => (my === token ? playPcm(a.audio, a.rate) : null))
      .then(() => end(my === token))
      .catch(() => (my === token ? local() : end(false)));
  });
}
function browserSpeak(text, done) {
  if (!('speechSynthesis' in window)) return done();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  u.lang = 'en-GB'; u.rate = look.rate; u.voice = voices.find((v) => v.lang === 'en-GB') || voices[0] || null;
  u.onend = u.onerror = done;
  speechSynthesis.speak(u);
  setTimeout(done, 1500 + (text.length * 90) / look.rate); // shortcut: some Android voices never fire onend; settle by length
}
const sound = () => !QUIET;
const ding = (name) => earcon(name, { sound: sound() });

// ---------- Back: every open, sheet and task is a history entry ----------
const stack = [];
let skipPops = 0;
const queued = []; // pushes made while a history.go() is still travelling land after it, or they would be undone
function push(kind) { stack.push(kind); if (skipPops) queued.push(stack.length); else history.pushState({ d: stack.length }, ''); }
function drop(kind) {
  const i = stack.lastIndexOf(kind);
  if (i < 0) return;
  stack[i] = null;
  let n = 0;
  while (stack.length && stack.at(-1) === null) { stack.pop(); n++; }
  if (n) { skipPops++; history.go(-n); }
}
addEventListener('popstate', (e) => {
  if (skipPops) { if (!--skipPops) while (queued.length) history.pushState({ d: queued.shift() }, ''); return; }
  const d = e.state?.d ?? 0;
  let handled = false;
  while (stack.length > d) { const k = stack.pop(); if (k) { onBack(k); handled = true; break; } }
  while (stack.length > d) stack.pop();
  if (!handled && d > 0) history.back(); // an entry whose thing already closed: take the next one
});
function onBack(kind) {
  if (kind === 'sheet') answerSheet(null);
  else if (kind === 'task') stopAll();
  else if (kind === 'app') home({ fromBack: true });
}

// ---------- the apps ----------
const bus = createBus();
(await optional('../inside/forward.js'))?.forward(bus); // /inside watches the bus
const registry = createRegistry();
await loadApps(registry, appIds);
const port = browserKV({ prefix: 'murmur' });
const appsEl = $('#apps');
const roots = {}, kvs = {};
let current = null, agentPress = false;
let personal = new AbortController(); // the person's own reads (Read it); Stop aborts it too
const cursor = createCursor(document);
for (const app of registry.list()) {
  kvs[app.id] = appKv(app.id, port);
  roots[app.id] = await mountApp(app, appsEl, {
    kv: kvs[app.id], bus, registry,
    say: (t) => speak(t, personal.signal),
    // A person's own tap on a gated control is their yes (Pay still checks the fingerprint); when the agent
    // pressed it, the runner already asked.
    confirm: ({ gate, readback }) => (agentPress ? Promise.resolve(true) : byHand({ app: app.id, gate, readback, bus,
      passkey: { usable: fingerprintUsable, confirm: () => passkey.confirm() },
      sheet: (q) => sheetConfirm(q).then((a) => a === true || a?.result === true) })),
    get workflows() { return agent?.workflows; },
  });
  await app.seed();
}

function open(id, { focus = true } = {}) {
  const app = registry.get(id);
  if (!app) return false;
  for (const [k, r] of Object.entries(roots)) r.hidden = k !== id;
  if (!current) push('app');
  current = id;
  $('#board-view').hidden = true;
  document.documentElement.dataset.open = id;
  if (focus) { const h = roots[id].querySelector('h2'); if (h) { h.tabIndex = -1; h.focus(); } }
  bus.emit('place', { app: id, ...app.place() });
  return true;
}
function home({ fromBack = false } = {}) {
  if (current && !fromBack) drop('app');
  current = null;
  for (const r of Object.values(roots)) r.hidden = true;
  delete document.documentElement.dataset.open;
  $('#board-view').hidden = false;
  cursor.hide();
  panel = { ...IDLE }; renderPanel();
  renderBoard();
  $('#board .tile')?.focus();
}
// Take over: a person's own touch inside the app while Murmur works hands it back to them.
appsEl.addEventListener('pointerdown', (e) => { if (e.isTrusted && panel.on && e.target.closest('button, a, input, textarea, select')) takeOver(); }, true);

// ---------- the board: Now on top, one tile per app ----------
let day = store.get('day', 0);
const pad = (n) => String(n).padStart(2, '0');
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const flap = (s) => el('span', { className: 'flap' }, [...s].map((c) => el('i', { className: c === ':' ? 'sep' : '', textContent: c })));
const firstSentence = (t) => (String(t || '').match(/^[^.!?]*[.!?]?/) || [''])[0];
function tilesNow() {
  const apps = registry.list();
  const lines = apps.map((a) => { try { return a.now?.({ day }) || null; } catch { return null; } });
  const i = Math.max(0, lines.findIndex(Boolean));
  return apps.map((a, k) => ({ app: a, now: k === i, line: lines[k] || { why: firstSentence(a.read()) } }))
    .sort((x, y) => y.now - x.now);
}
function renderBoard() {
  $('#day').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
  $('#board').replaceChildren(...tilesNow().map(({ app, now, line }, i) => {
    const why = line.why || '';
    const btn = el('button', { className: 'tile', type: 'button' },
      now ? el('span', { className: 'head' }, el('span', { className: 'badge', textContent: 'Now' }), flap(nowTime()))
        : el('span', { className: 'when' }),
      el('span', { className: 'what' }, el('span', { className: 'title', textContent: line.title || app.name }),
        el('span', { className: 'why', textContent: why })),
      el('span', { className: 'key', textContent: String(i + 1) }));
    btn.dataset.app = app.id;
    btn.setAttribute('aria-label', `${now ? 'Now: ' : ''}${line.title || app.name}. ${why}`);
    [...btn.children].forEach((c) => c.setAttribute('aria-hidden', 'true'));
    btn.addEventListener('click', () => { open(app.id); if (line.say) speak(line.say, personal.signal); });
    return el('li', { className: now ? 'now' : '' }, btn);
  }));
}
setInterval(() => { const f = $('#board .now .flap'); if (f) f.replaceWith(flap(nowTime())); }, 15000);

// ---------- the work panel: place line, current step, Stop, the Done line with Undo, the sentences ----------
let panel = { ...IDLE }, undoTimer = null;
const work = $('#work');
function renderPanel() {
  const p = panel;
  work.hidden = !(p.on || p.done || current);
  $('#place').textContent = p.place || (current ? placeLine(registry.get(current).place()) : '');
  $('#step').textContent = p.on ? p.step : '';
  $('#step').hidden = !p.on;
  const stop = $('#stop');
  stop.hidden = !p.on;
  stop.setAttribute('aria-label', `Stop. Murmur is ${(p.step || 'working').replace(/\.$/, '').toLowerCase()}`);
  const done = $('#done');
  done.hidden = p.on || !p.done;
  if (p.done) {
    $('#done-line').textContent = p.done.line;
    $('#done-ms').textContent = p.ms != null ? `Done in ${(p.ms / 1000).toFixed(1)} s` : '';
    const u = $('#undo');
    u.hidden = !p.done.undo;
    if (p.done.undo) u.setAttribute('aria-label', `${p.done.line} Undo ${p.done.undo.label || ''}`.trim());
  }
  $('#lines').hidden = !p.on; // once done, the ticks are the record; the sentences would repeat them
  $('#lines').replaceChildren(...p.lines.map((t, i) => el('li', {}, el('span', { className: 'sr', textContent: `Sentence ${i + 1} of ${p.lines.length}: ` }), t)));
  $('#ticks').replaceChildren(...p.ticks.map((t) => el('li', { className: t.ok ? 'ok' : 'no' },
    el('span', { className: 'sr', textContent: t.ok ? 'Done: ' : 'Failed: ' }), t.label)));
}
bus.on('*', (name, e) => {
  const was = panel;
  panel = reduce(panel, name, e);
  if (name === 'task:done') panel.ms = e.ms;
  if (name === 'task:start') { push('task'); renderPanel(); $('#stop').focus(); return; }
  if (name === 'step:verified') ding('step');
  if (name === 'task:done') {
    drop('task');
    ding(e.ok ? 'done' : 'stopped');
    cursor.hide();
    if (panel.done?.line) show(panel.done.line); // the strip says where it ended, not the last question
    renderPanel();
    clearTimeout(undoTimer);
    if (e.undo) {
      const ms = Math.max(0, (e.undo.until ?? Date.now() + 8000) - Date.now());
      undoTimer = setTimeout(() => { panel = { ...panel, done: panel.done && { ...panel.done, undo: null } }; renderPanel(); }, ms);
      $('#undo').focus();
    } else $('#done-line').focus();
    return;
  }
  if (name === 'undo') ding('undo');
  if (panel !== was) renderPanel();
});
$('#stop').addEventListener('click', () => stopAll());
$('#undo').addEventListener('click', () => (agent?.undo || agent?.runner?.undo)?.());

// ---------- the ask-first sheet: gates and choices ----------
const dialog = $('#sheet');
const sheetBody = $('#sheet-body');
let pending = null; // what the sheet is asking: { kind: 'confirm'|'choose', gate?, readback?, question?, choices?, at, answer(v) }
const VERB = { send: 'Send', pay: 'Pay', call: 'Call', delete: 'Delete' };
const GRACE_MS = 500; // a yes this soon could not have heard the readback
let opener = null;
function openSheet(kids, focusEl) {
  if (!dialog.open) opener = document.activeElement;
  sheetBody.replaceChildren(...kids);
  if (!dialog.open) { dialog.show(); behind(true); push('sheet'); }
  focusEl.focus();
}
// Under the sheet the board and the app go inert and dim; the work panel stays live, so Stop still works.
const behind = (on) => { for (const n of [$('#board-view'), appsEl]) n.inert = on; };
function closeSheet() {
  if (!dialog.open) return;
  dialog.close();
  behind(false);
  drop('sheet');
  (opener?.isConnected ? opener : $('#stop:not([hidden])') || $('#board .tile'))?.focus();
}
/** Answer whatever the sheet is asking. confirm: true/false; choose: an index or null. False if it was ignored. */
function answerSheet(value) {
  if (!pending) { closeSheet(); return false; }
  return pending.answer(value) !== false;
}
function showSheet(kind, q, answer) {
  pending = { kind, ...q, at: performance.now(), answer };
  ding('gate');
  if (kind === 'confirm') {
    const verb = VERB[q.gate] || 'Yes';
    const read = el('p', { id: 'sheet-readback', tabIndex: -1, textContent: q.readback || '' });
    const yes = el('button', { className: 'choice yes', type: 'button', id: 'sheet-yes', textContent: verb });
    const no = el('button', { className: 'choice', type: 'button', id: 'sheet-no', textContent: 'No' });
    yes.addEventListener('click', () => answerSheet(true));
    no.addEventListener('click', () => answerSheet(false));
    openSheet([el('h2', { id: 'sheet-title', textContent: q.question || `${verb}?` }), read, el('div', { className: 'row' }, yes, no)], read);
  } else {
    const h = el('h2', { id: 'sheet-title', tabIndex: -1, textContent: q.question });
    const btns = q.choices.map((c, i) => {
      const b = el('button', { className: 'choice yes', type: 'button', textContent: c });
      b.addEventListener('click', () => answerSheet(i));
      return b;
    });
    const none = el('button', { className: 'choice', type: 'button', textContent: 'None of these' });
    none.addEventListener('click', () => answerSheet(null));
    openSheet([h, el('div', { className: 'row' }, ...btns, none)], h);
  }
}
function hideSheet(kind) { if (pending?.kind === kind) { pending = null; closeSheet(); } }

// The sheet: every gate the runner asks through ctx.confirm, and a hand-tapped Pay with no fingerprint to check.
// The shell keeps the grace, the fingerprint and the voice, and resolves { result, fingerprint } for pay.
function sheetConfirm({ gate, readback }) {
  return new Promise((resolve) => {
    showSheet('confirm', { gate, readback }, (v) => {
      if (v === true && performance.now() - pending.at < GRACE_MS) return false;
      pending = null;
      if (v === true && gate === 'pay') { // pay always needs the fingerprint (spec §3.7)
        fingerprintUsable().then((usable) => {
          // shortcut: no platform authenticator means the sheet's yes stands alone (fingerprint:false)
          if (!usable) { closeSheet(); resolve({ result: true, fingerprint: false }); return; }
          show('Check your fingerprint.');
          passkey.confirm().then((ok) => ok === true, () => false).then((ok) => { closeSheet(); resolve({ result: ok, fingerprint: true }); });
        });
        return true;
      }
      closeSheet(); resolve(v === true);
      return true;
    });
    speak(`${String(readback || '').replace(/[.!?\s]+$/, '')}. ${VERB[gate] || 'Yes'}?`, personal.signal);
  });
}
async function fingerprintUsable() { return passkey.hasPasskey() || await passkey.available(); }
function sheetChoose({ question, choices }) {
  return new Promise((resolve) => {
    showSheet('choose', { question, choices }, (v) => { pending = null; closeSheet(); resolve(Number.isInteger(v) ? v : null); });
    speak(question, personal.signal);
  });
}
// The agent's gates and choices: it keeps the grace, the fingerprint and the voice; the sheet shows them and
// forwards the taps. It hides the sheet by calling back with null.
const agentGate = (s) => (s ? showSheet('confirm', s, (v) => { if (v === true) agent.yes(); else agent.no(); }) : hideSheet('confirm'));
const agentChoose = (c) => (c ? showSheet('choose', c, (v) => { agent.pick(Number.isInteger(v) ? v : null); }) : hideSheet('choose'));

// ---------- tap to talk (never hold: TalkBack's double tap cannot hold) ----------
const talk = $('#talk'), talkLabel = $('#talk-label'), typed = $('#typed');
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, heard = '', silence = null;
function showTyped(reason) { typed.hidden = false; if (reason) talkLabel.textContent = reason; $('#typed-text').focus(); }
function setListening(on) { listening = on; talk.setAttribute('aria-pressed', String(on)); talkLabel.textContent = on ? 'Listening. Tap to finish' : 'Tap to talk'; }
function summon() {
  if (listening) { endTalk(); return; }
  hush(); audioOut(); ding('summon');
  if (!Rec) { showTyped(); return; }
  heard = '';
  rec = new Rec(); rec.lang = 'en-GB'; rec.interimResults = true; rec.continuous = true;
  rec.onresult = (e) => {
    heard = [...e.results].map((r) => r[0].transcript).join(' ');
    talkLabel.textContent = heard;
    clearTimeout(silence); silence = setTimeout(endTalk, 1500);
  };
  rec.onerror = (e) => { if (/not-allowed/.test(e.error)) showTyped("Murmur can't hear you: allow the microphone"); };
  rec.onend = () => { clearTimeout(silence); setListening(false); if (heard.trim()) hear(heard.trim(), 'voice'); };
  try { rec.start(); setListening(true); show('Listening'); } catch { showTyped(); }
}
function endTalk() { clearTimeout(silence); try { rec?.stop(); } catch { /* already stopped */ } }
talk.addEventListener('click', summon);
typed.addEventListener('submit', (e) => { e.preventDefault(); const i = $('#typed-text'); const t = i.value.trim(); i.value = ''; if (t) hear(t, 'typed'); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); if (stack.length) history.back(); else if (look.nolook) setNoLook(false); return; }
  if (e.target.closest?.('input, textarea, [contenteditable]')) return;
  if (e.key === ' ' && !e.repeat && !dialog.open) { e.preventDefault(); summon(); }
  if (/^[1-9]$/.test(e.key) && !current && !dialog.open) $(`#board li:nth-child(${e.key}) .tile`)?.click();
  if (e.key === 'D' && e.shiftKey) openDemo();
});

let lastUtterance = '';
function hear(text, path) {
  ding('heard');
  lastUtterance = text;
  if (agent) { agent.hear(text, { path }); return; }
  // No agent on this build: a choice sheet still takes a spoken name ("Samira").
  if (pending?.kind === 'choose') {
    const i = pending.choices.findIndex((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
    if (i >= 0) { answerSheet(i); return; }
  }
  show(`Heard: ${text}`);
  speak("I can't do that yet.", personal.signal);
}

// ---------- the eight verbs: the shell's side (the agent matches the words and does undo and carry on) ----------
function stopAll() {
  personal.abort(); personal = new AbortController();
  hush();
  if (pending) answerSheet(pending.kind === 'confirm' ? false : null);
  agent?.stop?.();
  if (!panel.on) ding('stopped');
}
function where() {
  const app = current && registry.get(current);
  if (!app) { const t = tilesNow()[0]; return speak(`The board. Now: ${t.line.title || t.app.name}.`, personal.signal); }
  const p = app.place();
  return speak(`${[p.where, p.item, p.n && p.of ? `${p.n} of ${p.of}` : ''].filter(Boolean).join(', ')}.${p.next ? ` Next: ${p.next}.` : ''}`, personal.signal);
}
const again = () => speak(lastLine, personal.signal);
function takeOver() {
  (agent?.takeOver || agent?.runner?.takeOver)?.();
  hush();
  show("You've got it. I'll stay quiet until you need me.");
}

// ---------- no-look mode: tap anywhere to talk, swipe down to stop, right to carry on, double tap to repeat ----------
const nl = $('#nolook');
const gestures = recogniser({
  tap() { if (pending?.kind === 'confirm') answerSheet(true); else summon(); },
  doubleTap() { again(); },
  swipe(dir) {
    if (dir === 'down') stopAll();
    else if (dir === 'right') (agent?.carryOn ? agent.carryOn() : agent?.hear('carry on', { path: 'gesture' }));
    else if (dir === 'up') where();
  },
  holdStart() { summon(); },   // holding still works; letting go ends it
  holdEnd() { endTalk(); },
});
nl.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  e.preventDefault(); nl.setPointerCapture(e.pointerId); gestures.down(e.clientX, e.clientY, e.timeStamp);
});
nl.addEventListener('pointermove', (e) => gestures.move(e.clientX, e.clientY));
nl.addEventListener('pointerup', (e) => gestures.up(e.clientX, e.clientY));
nl.addEventListener('pointercancel', () => gestures.cancel());
nl.addEventListener('contextmenu', (e) => e.preventDefault());
function setNoLook(on) {
  look.nolook = on; saveLook();
  nl.hidden = !on;
  document.documentElement.classList.toggle('no-look', on);
  if (on) speak('No-look mode. Tap anywhere and tell me what you need. Swipe down to stop.', personal.signal);
  else { speak('No-look mode is off.', personal.signal); $('#board .tile')?.focus(); }
}
$('#nolook-exit').addEventListener('click', () => setNoLook(false));
// Summon on the board: a tap on empty space (not a tile or a control) opens the mic.
$('#board-view').addEventListener('click', (e) => { if (!e.target.closest('button, a, input, textarea')) summon(); });

// ---------- Your look ----------
const RATES = [[0.75, 'slow'], [1, 'normal'], [1.25, 'quick'], [1.5, 'fast']];
const AGENCY = { ask: 'Ask me', just: 'Just do it', teach: 'Teach me' };
const SPEAKER = { murmur: 'Murmur', reader: 'My screen reader' };
async function setLook(change, line) {
  Object.assign(look, change);
  try { if (librarian) Object.assign(look, await writeLook(librarian, look)); } catch { /* stays on this phone */ }
  applyLook(look); saveLook(); applySpeaker();
  speak(line, personal.signal);
}
async function openLook(focusKey) {
  let paused = false;
  try { paused = !!(await librarian?.getProfile())?.memoryPaused; } catch { /* no Librarian */ }
  const btn = (k, text, on, pressed) => {
    const b = el('button', { className: 'choice', type: 'button', textContent: text });
    b.dataset.k = k;
    if (pressed != null) b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', async () => { await on(); openLook(k); });
    return b;
  };
  const group = (title, ...kids) => el('section', { className: 'group' }, el('h3', { textContent: title }), el('div', { className: 'choices' }, ...kids));
  const i = SIZES.indexOf(look.size), r = RATES.findIndex(([v]) => v === look.rate);
  const kids = [
    el('h2', { id: 'sheet-title', textContent: 'Your look' }),
    group('Who speaks', ...Object.entries(SPEAKER).map(([k, name]) =>
      btn(`speaker-${k}`, name, () => setLook({ speaker: k }, k === 'reader' ? "Your screen reader speaks now. I'll stay quiet." : "I'll speak."), look.speaker === k))),
    group('How much Murmur does', ...Object.entries(AGENCY).map(([k, name]) =>
      btn(`agency-${k}`, name, () => setLook({ agency: k }, { ask: "I'll say each step and wait a beat before I change anything.", just: "I'll just do it. I still ask before I send, pay or call.", teach: "I'll tell you where each control is and you press it." }[k]), look.agency === k))),
    group(`Text, now ${look.size}%`,
      btn('smaller', 'Smaller', () => (i <= 0 ? speak('Text is as small as it goes.') : setLook({ size: SIZES[i - 1] }, `Text: smaller. Now ${SIZES[i - 1]} percent.`))),
      btn('bigger', 'Bigger', () => (i >= SIZES.length - 1 ? speak('Text is as big as it goes, 400 percent.') : setLook({ size: SIZES[i + 1] }, `Text: bigger. Now ${SIZES[i + 1]} percent.`)))),
    group('Colours', ...Object.entries(THEMES).map(([t, name]) =>
      btn(`theme-${t}`, name, () => setLook({ theme: t }, `Colours: ${name.toLowerCase()}.`), look.theme === t))),
    group(`Voice, ${(RATES[r] || RATES[1])[1]}`,
      btn('slower', 'Slower', () => (r <= 0 ? speak('That is the slowest.') : setLook({ rate: RATES[r - 1][0] }, `Voice: slower. This is ${RATES[r - 1][1]}.`))),
      btn('faster', 'Faster', () => (r >= RATES.length - 1 ? speak('That is the fastest.') : setLook({ rate: RATES[r + 1][0] }, `Voice: faster. This is ${RATES[r + 1][1]}.`)))),
    group('Learning', btn('learn', paused ? 'Start learning again' : 'Stop learning', async () => {
      try { await librarian?.setMemoryPaused(!paused); } catch { /* no Librarian */ }
      speak(paused ? "Learning is on. I'll notice what you do most." : "Learning is off. I won't note what you do.");
    })),
    group('Without looking', btn('nolook', 'No-look mode', () => { closeSheet(); setNoLook(!look.nolook); }, look.nolook)),
  ];
  if (await passkey.available() && !passkey.hasPasskey()) {
    kids.push(group('Paying', btn('passkey', 'Set up your fingerprint for paying', async () => {
      try { await passkey.setup(); speak("Fingerprint set. I'll ask for it before I pay."); } catch { speak("That didn't work, so nothing changed."); }
    })));
  }
  const done = el('button', { className: 'choice yes', type: 'button', textContent: 'Done' });
  done.addEventListener('click', () => closeSheet());
  kids.push(el('div', { className: 'row' }, done));
  pending = null;
  openSheet(kids, (focusKey && sheetBody.querySelector(`[data-k="${focusKey}"]`)) || kids[1].querySelector('button'));
  if (focusKey) sheetBody.querySelector(`[data-k="${focusKey}"]`)?.focus();
}
$('#look-link').addEventListener('click', (e) => { e.preventDefault(); openLook(); });

// ---------- demo controls: three taps on the clock, or Shift+D ----------
async function resetAll() {
  stopAll();
  for (const a of registry.list()) await a.reset();
  await agent?.reset?.();
  panel = { ...IDLE };
  if (current) home();
  renderBoard(); renderPanel();
}
function openDemo() {
  const b = (text, on) => { const x = el('button', { className: 'choice', type: 'button', textContent: text }); x.addEventListener('click', on); return x; };
  pending = null;
  const kids = [
    el('h2', { id: 'sheet-title', textContent: 'Demo' }),
    el('div', { className: 'choices' },
      b('Reset', async () => { closeSheet(); await resetAll(); show('Reset. Day 1.'); }),
      b('Next morning', async () => { closeSheet(); day++; store.set('day', day); await agent?.nextMorning?.(); renderBoard(); show('Next morning.'); }),
      b(`Planner: ${look.planner === 'offline' ? 'offline' : 'Gemini'}`, () => {
        look.planner = look.planner === 'offline' ? 'auto' : 'offline'; saveLook(); closeSheet(); show(`Planner: ${look.planner === 'offline' ? 'offline' : 'Gemini'}.`);
      }),
      b('Replay', async () => { closeSheet(); const u = lastUtterance; await resetAll(); if (u) hear(u, 'replay'); })),
    el('div', { className: 'row' }, b('Close', () => closeSheet())),
  ];
  openSheet(kids, kids[1].firstChild);
}
let clockTaps = [];
$('#day').addEventListener('click', () => {
  const t = performance.now();
  clockTaps = [...clockTaps.filter((x) => t - x < 1500), t];
  if (clockTaps.length >= 3) { clockTaps = []; openDemo(); }
});

// ---------- the agent ----------
// ctxFor(app, hooks): hooks are the agent's { bus, ask, choose, speak, signal }; an AbortSignal alone also works.
function ctxFor(app, hooks = {}) {
  if (hooks instanceof AbortSignal) hooks = { signal: hooks };
  if (current !== app.id) open(app.id, { focus: false }); // the agent works where you can see it
  const ctx = createCtx({ app, root: roots[app.id], bus, kv: kvs[app.id], cursor, speak,
    ask: (q) => sheetConfirm(q), choose: (q) => sheetChoose(q), ...hooks });
  const tap = ctx.tap;
  ctx.tap = async (...a) => { agentPress = true; try { await tap(...a); } finally { agentPress = false; } };
  return ctx;
}
const host = {
  registry, bus, ctxFor, speak, open, home, current: () => (current ? registry.get(current) : null),
  agency: () => look.agency, planner: () => look.planner, earcon: ding,
  sheet: { pending: () => pending && { ...pending, answer: undefined }, yes: () => answerSheet(true),
    no: () => answerSheet(pending?.kind === 'confirm' ? false : null), choose: (i) => answerSheet(i) },
  verbs: { stop: stopAll, where, again, takeOver },
};
try {
  const { createAgent } = await import('../agent/index.js');
  agent = await createAgent({
    registry, bus, ctxFor, speak, librarian,
    os: { open: (id) => open(id), current: () => current },
    fingerprint: () => passkey.confirm(),
    agency: () => look.agency,
    onGate: agentGate, onChoose: agentChoose,
  });
} catch (e) {
  if (!/Failed to fetch|Cannot find|404|Importing a module script failed/i.test(String(e?.message))) console.error('agent failed to start', e);
}

// ---------- start ----------
for (const [sel, v] of [['footer', '--footer-h'], ['#work', '--work-h']]) {
  new ResizeObserver(([e]) => document.documentElement.style.setProperty(v, `${Math.ceil(e.borderBoxSize[0]?.blockSize || 0)}px`))
    .observe(document.querySelector(sel));
}
applySpeaker();
renderBoard(); renderPanel();
if (look.nolook) { nl.hidden = false; document.documentElement.classList.add('no-look'); }
const first = !store.get('welcomed', false);
show(first ? 'Tap anywhere and tell me what you need.' : '');
if (first) store.set('welcomed', true);
window.murmur = { bus, registry, host, agent, open, home, current: host.current, sheet: host.sheet, reset: resetAll, hear, look, ready: Promise.resolve(true) };
document.documentElement.dataset.ready = 'true';
