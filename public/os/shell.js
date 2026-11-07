// Murmur's shell (spec §2 and §7): the board, the app frame, the work panel, tap to talk, the ask-first sheet,
// Back, Your look and the demo controls. The agent (public/agent/) plugs in through `host`; see os/contract.md §9.
import { createBus, createRegistry, createCursor, createCtx, appKv, loadApps, mountApp } from '../sdk/index.js';
import appIds from '../apps/apps.js';
import { IDLE, reduce, placeLine } from './panel.js';
import { recogniser } from '../lib/gestures.js';
import { loadLook, writeLook, applyLook } from '../look.js';
import { createToolkit } from '../vendor/toolkit/index.js';
import { browserKV } from '../ports/browser-kv.js';
import { playPcm, stopAudio, audioOut } from '../live.js';
import * as passkey from '../passkey.js';
import { byHand, checkFingerprint, payAttempt } from './gate.js';
import { installByName, restoreApps, availableApps } from '../sdk/plugin.js';
import { installToken } from '../agent/token.js';
import { play, buzz, mute, unmute, isMuted, EARCON_NAMES } from '../sound/index.js';
import { cachedTts, warmTts } from '../voice/tts-cache.js';
import { createPhone } from './phone.js';
import { talkAnywhere } from './talk.js';
installToken(); // wraps fetch before any /api call

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
const look = Object.assign({ size: 100, theme: 'auto', rate: 1.15, speaker: 'murmur', agency: 'ask', answers: 'short', planner: 'auto', nolook: false },
  store.get('look', {}));
const saveLook = () => store.set('look', look);
let agent = null; // declared before the mount loop: Mine reads os.workflows during seed()

// ---------- the Librarian: Your look lives in the ability profile; Stop learning pauses memory ----------
let librarian, datastore;
try {
  ({ librarian, datastore } = createToolkit({ kv: browserKV() }));
  if (!(await librarian.getProfile())?.fields?.needs?.length) await writeLook(librarian, look);
  await loadLook(librarian, look);
} catch (e) {
  console.warn('Librarian unavailable; Your look stays on this phone only', e.name);
  librarian = null; datastore = null;
}
if (!/[?&]zoom=/.test(location.search)) applyLook(look);
saveLook();

// ---------- one voice: Murmur speaks, or the screen reader reads the one status region ----------
const status = $('#say');
const caps = QUIET ? {} : await fetch('/health').then((r) => r.json()).catch(() => ({}));
let token = 0, lastLine = '', listening = false;
const readerSpeaks = () => look.speaker === 'reader';
// Screen reader mode: TalkBack and VoiceOver take the taps, so a Talk button comes first in the reading order.
function applySpeaker() { status.setAttribute('aria-live', readerSpeaks() ? 'polite' : 'off'); $('#talk-first').hidden = !readerSpeaks(); }
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
  // Barge-in: while the mic is open nothing new is voiced (shown only), so the queue drains and the mic never hears Murmur
  if (QUIET || !text || listening) return Promise.resolve(true);
  if (readerSpeaks()) return wait(Math.min(4000, 600 + text.length * 55), signal); // give TalkBack time to read it
  const my = token; // only Stop (hush) moves token: a later line queues behind a started one, never cuts it
  return new Promise((res) => {
    let settled = false;
    const end = (ok) => { if (!settled) { settled = true; signal?.removeEventListener('abort', abort); res(ok); } };
    const abort = () => { hush(); end(false); };
    signal?.addEventListener('abort', abort, { once: true });
    const local = () => browserSpeak(text, () => end(my === token));
    if (!caps.tts) return local();
    cachedTts(text) // fetched once; the fixed lines are warmed at boot
      .then((a) => (my === token ? playPcm(a.audio, a.rate) : null))
      .then(() => end(my === token))
      .catch(() => (my === token ? local() : end(false)));
  });
}
function browserSpeak(text, done) {
  if (!('speechSynthesis' in window)) return done();
  // no cancel() here: speechSynthesis queues, so a line that has started always finishes (Stop cancels in hush)
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  u.lang = 'en-GB'; u.rate = look.rate; u.voice = voices.find((v) => v.lang === 'en-GB') || voices[0] || null;
  u.onend = u.onerror = done;
  speechSynthesis.speak(u);
  setTimeout(done, 1500 + (text.length * 90) / look.rate); // shortcut: some Android voices never fire onend; settle by length
}
// Earcons and haptics from public/sound/. The buzz always; the sound only when nothing else is talking.
const ding = (name) => { buzz(name); if (!QUIET) play(name); };

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
// Fetch a line's audio the moment it is queued, so it is ready when the line before it ends.
bus.on('say', (e) => { if (caps.tts && e?.text && !readerSpeaks()) cachedTts(String(e.text)).catch(() => {}); });
const registry = createRegistry();
await loadApps(registry, appIds);
registry.register(createPhone({ stop: () => stopAll(), where: () => where(), noLook: (on) => setNoLook(on), isNoLook: () => !!look.nolook,
  sound: (on) => { (on ? unmute : mute)(); store.set('muted', !on); }, isSound: () => !isMuted() }));
if (store.get('muted', false)) mute();
const port = browserKV({ prefix: 'murmur' });
const appsEl = $('#apps');
const roots = {}, kvs = {};
let current = null, agentTapping = false, granted = false;
// Only the agent's own synthetic click on the control it is pressing carries its yes, and only to the first
// os.confirm after it. A person's real click (even during the cursor's glide) revokes it, so it asks them.
// shortcut: a person's handler that awaits before os.confirm while the agent clicks could take the grant; apps call confirm first
appsEl.addEventListener('click', (e) => { granted = !e.isTrusted && agentTapping; }, true);
let personal = new AbortController(); // the person's own reads (Read it); Stop aborts it too
const cursor = createCursor(document);
const take = () => { const g = granted; granted = false; return g; };
const osFor = (app, kv) => ({
    kv, bus, registry,
    say: (t) => speak(t, personal.signal),
    // A person's own tap on a gated control still gets the readback sheet (no grace), and pay the fingerprint;
    // when the agent pressed it, the runner already asked.
    confirm: ({ gate, readback }) => (take() ? Promise.resolve(true) : byHand({ app: app.id, gate, readback, bus, sheet: sheetConfirm })),
    get workflows() { return agent?.workflows; },
    get agent() { return agent; }, // Mine runs a workflow with os.agent.runWorkflow(name)
    hear: (text) => hear(text, 'typed'),
    librarian, datastore,
});
for (const app of registry.list()) {
  kvs[app.id] = appKv(app.id, port);
  roots[app.id] = await mountApp(app, appsEl, osFor(app, kvs[app.id]));
  await app.seed();
}
// Plug-ins (sdk/plugin.js): added apps come back on boot and mount exactly like the built-in ones.
const plug = { registry, host: appsEl, port, os: osFor,
  // a plug-in's own Remove button: the sheet asks (gate delete), then the app leaves the board
  confirm: (q) => sheetConfirm(q).then((a) => a === true || a?.result === true),
  removed: (x) => { if (x.ok) { if (current === x.id) home(); delete roots[x.id]; delete kvs[x.id]; renderBoard(); } speak(x.say, personal.signal); } };
const added = (r) => { roots[r.id] = r.root; kvs[r.id] = r.kv; return r; };
for (const r of await restoreApps(plug)) added(r); // no renderBoard here: `day` is declared below (TDZ)
async function install(name) { const r = await installByName(name, plug); if (r.root) { added(r); renderBoard(); } return r; }

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
  const apps = registry.list().filter((a) => a.id !== 'look' && a.id !== 'phone'); // the links under the board
  const lines = apps.map((a) => { try { return a.now?.({ day }) || null; } catch { return null; } });
  const i = Math.max(0, lines.findIndex(Boolean));
  return apps.map((a, k) => ({ app: a, now: k === i, line: lines[k] || { why: firstSentence(a.read()) } }))
    .sort((x, y) => y.now - x.now);
}
function renderBoard() {
  $('#day').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
  $('#board').replaceChildren(...tilesNow().map(({ app, now, line }, i) => {
    const title = line.title || app.name;
    // read() opens with the app's own name ("Messages, 3 chats."): the tile says it once
    const rest = (line.why || '').startsWith(title) ? line.why.slice(title.length) : null;
    const why = (rest !== null && /^([.,:]|$)/.test(rest) ? rest.replace(/^[.,:]\s*/, '') : line.why || '').replace(/^./, (c) => c.toUpperCase());
    const btn = el('button', { className: 'tile', type: 'button' },
      now ? el('span', { className: 'head' }, el('span', { className: 'badge', textContent: 'Now' }), flap(nowTime()))
        : el('span', { className: 'when' }),
      el('span', { className: 'what' }, el('span', { className: 'title', textContent: title }),
        el('span', { className: 'why', textContent: why })),
      el('span', { className: 'key', textContent: String(i + 1) }));
    btn.dataset.app = app.id;
    btn.setAttribute('aria-label', `${now ? 'Now: ' : ''}${title}.${why ? ' ' + why : ''}`);
    [...btn.children].forEach((c) => c.setAttribute('aria-hidden', 'true'));
    btn.addEventListener('click', () => { open(app.id); if (line.say) speak(line.say, personal.signal); });
    return el('li', { className: now ? 'now' : '' }, btn);
  }), addTile());
}
function addTile() {
  const btn = el('button', { className: 'tile', type: 'button' }, el('span', { className: 'when' }),
    el('span', { className: 'what' }, el('span', { className: 'title', textContent: 'Add an app' })), el('span', { className: 'key' }));
  btn.addEventListener('click', async () => {
    const l = (await availableApps(plug)).filter((p) => !p.installed);
    if (!l.length) return speak('Every app is already added.', personal.signal);
    const i = await sheetChoose({ question: 'Which app do you want to add?', choices: l.map((p) => p.name) });
    if (i != null) speak((await install(l[i].id)).say, personal.signal);
  });
  return el('li', {}, btn);
}
setInterval(() => { const f = $('#board .now .flap'); if (f) f.replaceWith(flap(nowTime())); }, 15000);

// ---------- the work panel: place line, current step, Stop, the Done line with Undo, the sentences ----------
let panel = { ...IDLE }, undoTimer = null, asking = ''; // asking: the open sheet's question, which the heading shows
const work = $('#work');
function renderPanel() {
  const p = panel;
  work.hidden = !(p.on || p.done || current);
  $('#place').textContent = p.place || (current ? placeLine(registry.get(current).place()) : '');
  $('#step').textContent = p.on ? asking || p.step : '';
  $('#step').hidden = !p.on;
  $('#slot-a').hidden = $('#slot-b').hidden = !(p.on || p.done);
  $('#done-line').hidden = p.on || !p.done;
  // While Murmur works or reports, the panel replaces the board rather than pushing it down.
  $('#board-view').hidden = !!(current || ((p.on || p.done) && stack.length));
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
  $('#lines').replaceChildren(...p.lines.map((t, i) => el('li', {}, el('span', { className: 'sr', textContent: `Sentence ${i + 1} of ${p.lines.length}: ` }), t)));
  // One row of marks, one per step, drawn in as each verify passes; the labels are for the screen reader.
  const ticks = $('#ticks');
  for (const [i, t] of p.ticks.entries()) if (!ticks.children[i]) ticks.append(el('li', { className: t.ok ? 'ok' : 'no' }, el('span', { className: 'sr', textContent: `${t.ok ? 'Done' : 'Failed'}: ${t.label}` })));
  while (ticks.children.length > p.ticks.length) ticks.lastChild.remove();
}
bus.on('*', (name, e) => {
  if (thinking && (/^(task:start|task:done|step:start|ask)$/.test(name) || (name === 'say' && !/^On it\b/.test(e.text)))) stopThinking();
  const was = panel;
  panel = reduce(panel, name, e);
  if (name === 'task:done') panel.ms = e.ms;
  if (name === 'task:start') { push('task'); renderPanel(); $('#stop').focus(); return; }
  if (name === 'step:verified') ding('step');
  if (name === 'task:done') {
    drop('task');
    ding(e.ok ? 'done' : 'stopped');
    setTimeout(() => { if (!panel.on) cursor.hide(); }, 400); // the ring rests on the last press a moment
    if (panel.done?.line && !readerSpeaks()) show(panel.done.line); // the strip says where it ended; in reader mode the runner's line already does
    renderPanel();
    clearTimeout(undoTimer);
    if (e.undo) {
      const ms = Math.max(0, (e.undo.until ?? Date.now() + 8000) - Date.now());
      undoTimer = setTimeout(() => { panel = { ...panel, done: panel.done && { ...panel.done, undo: null } }; renderPanel(); }, ms);
      $('#undo').focus();
    } else $('#talk').focus(); // focus on Talk for what's next; the status region says the line
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
// A travel hold is a pay gate (nothing is charged), but its button and question say Hold.
const verbOf = ({ gate, readback }) => (gate === 'pay' && /\b(hold|held)\b/i.test(readback || '') ? 'Hold' : VERB[gate] || 'Yes');
const GRACE_MS = 500; // a yes this soon could not have heard the readback
let opener = null;
function openSheet(kids, focusEl, question) {
  asking = question; renderPanel(); show(question); // the heading and caption ask what the sheet asks, no stale "Sam or Samira?"
  if (!dialog.open) opener = document.activeElement;
  sheetBody.replaceChildren(...kids);
  const rising = !dialog.open;
  if (rising) { dialog.show(); behind(true); push('sheet'); }
  // Focus after the 220 ms rise, not during it: focus forces a layout mid-animation (magic-judge: 2 dropped frames)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!rising || still) focusEl.focus();
  else setTimeout(() => { if (dialog.open && focusEl.isConnected) focusEl.focus(); }, 230);
}
// Under the sheet the board and the app go inert and dim; the work panel stays live, so Stop still works.
const behind = (on) => { for (const n of [$('#board-view'), appsEl]) n.inert = on; };
function closeSheet() {
  if (!dialog.open) return;
  dialog.close();
  asking = ''; renderPanel();
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
    const verb = verbOf(q);
    const read = el('p', { id: 'sheet-readback', tabIndex: -1, textContent: q.readback || '' });
    const yes = el('button', { className: 'choice yes', type: 'button', id: 'sheet-yes', textContent: verb });
    const no = el('button', { className: 'choice', type: 'button', id: 'sheet-no', textContent: 'No' });
    yes.addEventListener('click', () => answerSheet(true));
    no.addEventListener('click', () => answerSheet(false));
    const title = verb === 'Hold' || !q.question ? `${verb}?` : q.question;
    openSheet([el('h2', { id: 'sheet-title', textContent: title }), read, el('div', { className: 'row' }, yes, no)], read, title);
  } else {
    const h = el('h2', { id: 'sheet-title', tabIndex: -1, textContent: q.question });
    const btns = q.choices.map((c, i) => {
      const b = el('button', { className: 'choice yes', type: 'button', textContent: c });
      b.addEventListener('click', () => answerSheet(i));
      return b;
    });
    const none = el('button', { className: 'choice', type: 'button', textContent: 'None of these' });
    none.addEventListener('click', () => answerSheet(null));
    openSheet([h, el('div', { className: 'row' }, ...btns, none)], h, q.question);
  }
}
function hideSheet(kind) { if (pending?.kind === kind) { pending = null; closeSheet(); } }

// The sheet: every gate the runner asks through ctx.confirm, and every gated control a person taps (no grace then).
// The shell keeps the grace, the fingerprint and the voice, and resolves { result, fingerprint } for pay.
function sheetConfirm({ gate, readback, grace = true }) {
  return new Promise((resolve) => {
    showSheet('confirm', { gate, readback }, (v) => {
      if (v === true && grace && performance.now() - pending.at < GRACE_MS) return false;
      if (v === true && gate === 'pay') { // pay always needs the fingerprint (spec §3.7)
        show('Check your fingerprint.');
        const attempt = payAttempt(fingerprint);
        const mine = pending = { ...pending, answer: (w) => (w === true ? false : (attempt.cancel(), true)) }; // Stop or Back cancels; another yes waits
        attempt.result.then((ok) => { if (pending === mine) { pending = null; closeSheet(); } resolve({ result: ok, fingerprint: ok }); }); // never close a newer sheet
        return true;
      }
      pending = null;
      closeSheet(); resolve(v === true);
      return true;
    });
    const r = String(readback || '').trim(); // a readback that already asks ("… Pay?") is said as it is
    speak(/\?$/.test(r) ? r : `${r.replace(/[.!\s]+$/, '')}. ${verbOf({ gate, readback })}?`, personal.signal);
  });
}
// Every pay, hand or agent: the fingerprint or no pay (gate.js). The spoken or tapped yes never stands alone.
const fingerprint = () => checkFingerprint({ passkey: { has: passkey.hasPasskey, available: passkey.available, confirm: passkey.confirm }, say: (t) => speak(t, personal.signal) });
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

// ---------- talk anywhere: a tap on blank space or a long press anywhere (os/talk.js), the bar, or Space ----------
const talk = $('#talk'), talkLabel = $('#talk-label'), typed = $('#typed');
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, heard = '', silence = null, still = null;
function showTyped(reason) { typed.hidden = false; if (reason) talkLabel.textContent = reason; $('#typed-text').focus(); }
function setListening(on) { listening = on; talk.setAttribute('aria-pressed', String(on)); talkLabel.textContent = on ? 'Listening. Tap anywhere to finish' : 'Tap anywhere to talk'; }
function summon() {
  if (listening) { endTalk(); return; }
  hush(); audioOut(); ding('summon');
  if (!Rec) { showTyped(); return; }
  heard = '';
  rec = new Rec(); rec.lang = 'en-GB'; rec.interimResults = true; rec.continuous = true;
  rec.onresult = (e) => {
    heard = [...e.results].map((r) => r[0].transcript).join(' ');
    talkLabel.textContent = heard;
    clearTimeout(silence); silence = setTimeout(endTalk, 600);
    clearTimeout(still); still = setTimeout(() => agent?.prefetch?.(heard.trim()), 400); // plan while they finish
  };
  rec.onerror = (e) => { if (/not-allowed/.test(e.error)) showTyped("Murmur can't hear you: allow the microphone"); };
  rec.onend = () => { clearTimeout(silence); setListening(false); if (heard.trim()) hear(heard.trim(), 'voice'); };
  try { rec.start(); setListening(true); show('Listening'); } catch { showTyped(); }
}
function endTalk() { clearTimeout(silence); try { rec?.stop(); } catch { /* already stopped */ } }
talk.addEventListener('click', summon);
$('#talk-first').addEventListener('click', summon);
talkAnywhere({ start: summon, listening: () => listening });
typed.addEventListener('submit', (e) => { e.preventDefault(); const i = $('#typed-text'); const t = i.value.trim(); i.value = ''; if (t) hear(t, 'typed'); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); if (stack.length) history.back(); else if (look.nolook) setNoLook(false); return; }
  if (e.target.closest?.('input, textarea, [contenteditable]')) return;
  if (e.key === ' ' && !e.repeat && !dialog.open) { e.preventDefault(); summon(); }
  if (/^[1-9]$/.test(e.key) && !current && !dialog.open) $(`#board li:nth-child(${e.key}) .tile`)?.click();
});

let lastUtterance = '';
// A soft pulse every 600 ms while the plan is out; the task's first sign (or 7 s) ends it.
const PULSE = EARCON_NAMES.includes('thinking') ? 'thinking' : 'heard';
let thinking = 0;
const stopThinking = () => { clearInterval(thinking); thinking = 0; };
function think() {
  stopThinking();
  let n = 0;
  thinking = setInterval(() => { if (++n > 12) stopThinking(); else if (!QUIET) play(PULSE); }, 600);
}
function hear(text, path) {
  ding('heard');
  lastUtterance = text;
  if (agent) { think(); agent.hear(text, { path }); return; }
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
  stopThinking();
  personal.abort(); personal = new AbortController();
  hush();
  if (pending) answerSheet(pending.kind === 'confirm' ? false : null);
  agent?.stop?.();
  if (!panel.on) ding('stopped');
}
const oneStop = (t) => (/[.!?]$/.test(String(t).trim()) ? String(t).trim() : `${String(t).trim()}.`); // one stop, never "one.."
function where() {
  const app = current && registry.get(current);
  if (!app) { const t = tilesNow()[0]; return speak(`The board. Now: ${oneStop(t.line.title || t.app.name)}`, personal.signal); }
  const p = app.place();
  return speak(`${oneStop([p.where, p.item, p.n && p.of ? `${p.n} of ${p.of}` : ''].filter(Boolean).join(', '))}${p.next ? ` Next: ${oneStop(p.next)}` : ''}`, personal.signal);
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

// ---------- Your look is an app (public/apps/look/); the demo panel and first open come from wire.js ----------
$('#look-link').addEventListener('click', (e) => { e.preventDefault(); open('look'); });
$('#phone-link').addEventListener('click', (e) => { e.preventDefault(); open('phone'); });
async function resetAll() {
  stopAll();
  for (const a of registry.list()) await a.reset();
  await agent?.reset?.();
  panel = { ...IDLE };
  if (current) home();
  renderBoard(); renderPanel();
}

// ---------- the agent ----------
// ctxFor(app, hooks): hooks are the agent's { bus, ask, choose, speak, signal }; an AbortSignal alone also works.
function ctxFor(app, hooks = {}) {
  if (hooks instanceof AbortSignal) hooks = { signal: hooks };
  if (current !== app.id) open(app.id, { focus: false }); // the agent works where you can see it
  const ctx = createCtx({ app, root: roots[app.id], bus, kv: kvs[app.id], cursor, speak,
    ask: (q) => sheetConfirm(q), choose: (q) => sheetChoose(q), ...hooks });
  const tap = ctx.tap;
  ctx.tap = async (...a) => { agentTapping = true; try { await tap(...a); } finally { agentTapping = false; } };
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
    os: { open: (id) => open(id), current: () => current, install, home: () => home(),
      sound: (on) => { (on ? unmute : mute)(); store.set('muted', !on); } },
    fingerprint,
    agency: () => look.agency, answers: () => look.answers,
    onGate: agentGate, onChoose: agentChoose,
  });
  // Mine mounted before the agent, on its own seed. Give the real store that first tile so Run My morning runs.
  // shortcut: reseeds whenever the store is empty (a deleted My morning returns on reload); fine for the demo
  if (agent.workflows && registry.get('mine') && !(await agent.workflows.all()).length) {
    const { SEED } = await import('../apps/mine/model.js');
    for (const w of SEED()) await agent.workflows.save(w.name, w.steps.map((s) => ({ ...s, tool: `${s.app}__${s.action}` })));
  }
  await registry.get('mine')?.seed?.();
  if (caps.tts) agent.warm?.().then((lines) => warmTts(lines)).catch(() => {}); // not awaited: boot does not wait on the network
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
try {
  const { wireExtras } = await import('./wire.js');
  await wireExtras({ bus, registry, speak, settings: look, save: () => { saveLook(); applySpeaker(); }, kv: port, appsEl,
    librarian, datastore, status, clockEl: $('#day'),
    board: { reset: resetAll, nextMorning: async () => { day++; store.set('day', day); await agent?.nextMorning?.(); renderBoard(); } },
    replay: async () => { const u = lastUtterance; await resetAll(); if (u) hear(u, 'replay'); }, stop: stopAll });
  roots.look = $('#app-look'); kvs.look = appKv('look', port);
} catch (e) { console.error('Your look and the demo panel did not load', e); }
window.murmur = { bus, registry, host, agent, open, home, current: host.current, sheet: host.sheet, reset: resetAll, hear, look, install, ready: Promise.resolve(true) };
document.documentElement.dataset.ready = 'true';
