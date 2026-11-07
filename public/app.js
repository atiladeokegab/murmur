// Murmur in the browser: the menu, the talk bar, the ask-first sheet and the reader.
import { createToolkit } from './vendor/toolkit/index.js';
import { browserKV } from './ports/browser-kv.js';
import { TILES, CONTACTS, SHOP, MUM_MESSAGE, MUM_DRAFT, NOTE, byId } from './lib/tiles.js';
import { daypart, dailyMenu, usualTime, reason, proposals, seedWeek, dayKey } from './lib/menu.js';
import { buildLink } from './lib/links.js';
import { sentences, whereAmI, replaceWord } from './lib/notes.js';
import { createLive, playPcm, stopAudio, audioOut } from './live.js';
import * as passkey from './passkey.js';
import { SIZES, THEMES, readLook, writeLook, applyLook } from './look.js';

const $ = (s) => document.querySelector(s);
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}

// ---------- state on the phone ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('murmur:' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('murmur:' + k, JSON.stringify(v)); } catch { /* private mode: keep going */ } },
};
const prefs = store.get('prefs', {});
prefs.menuIds ||= TILES.filter((t) => t.start).map((t) => t.id);
prefs.declined ||= [];
prefs.snoozed ||= {};
const savePrefs = () => store.set('prefs', prefs);
export const look = Object.assign({ voice: true, rate: 1, size: 100, theme: 'dark' }, store.get('look', {}));

// ---------- the Librarian (event toolkit) on a localStorage port ----------
let clockShift = null; // set only while seeding a past week
let librarian, datastore;
try {
  ({ librarian, datastore } = createToolkit({ kv: browserKV(), clock: { now: () => clockShift ?? Date.now() } }));
  await datastore.runMigrations();
} catch (e) {
  // shortcut: a stub that keeps the same two calls if the toolkit cannot start; logs stay in localStorage.
  console.warn('Librarian unavailable, using the stub', e.name);
  const log = store.get('stublog', []);
  librarian = { async logObservation(o) { log.push({ t: clockShift ?? Date.now(), type: o.type, weight: 3, data: o.data }); store.set('stublog', log); return { logged: true }; },
    async setMemoryPaused() {}, async getAbilityModel() { return {}; } };
  datastore = { async get() { return { entries: log }; } };
}
// Your look lives in the toolkit's ability profile; first run seeds it with dark, the default.
try {
  if (!(await librarian.getProfile())?.fields?.needs?.length) await writeLook(librarian, look);
  Object.assign(look, await readLook(librarian));
} catch { /* stub Librarian: keep the stored look */ }
if (!/[?&]zoom=/.test(location.search)) applyLook(look);
store.set('look', look);
const entries = async () => ((await datastore.get('mine.episodicLog'))?.entries || []).filter((e) => e.data && e.data.tile);
const logTap = (tile, via) => librarian.logObservation({ type: 'saved-action', data: { tile, via }, text: byId(tile)?.title || tile })
  .catch(() => {});

// ---------- speaking: Gemini Live, else Gemini TTS, else the browser's voice ----------
const status = $('#say');
const caps = await fetch('/health').then((r) => r.json()).catch(() => ({}));
let speechToken = 0;
let liveQuiet = false, lastLine = '', live = null, liveBroken = !caps.live;
function voices() { return speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)); }
export function speak(text, { show = true, onend, local = false } = {}) {
  if (show) status.textContent = text;
  if (liveQuiet && !local) { lastLine = text; if (onend) live.afterTurn(onend); return; } // Live says it in its own voice
  const token = ++speechToken;
  if (!look.voice || !text) { onend && setTimeout(() => token === speechToken && onend(), 0); return; }
  if (caps.tts && !local) {
    fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('tts'))))
      .then((a) => token === speechToken && playPcm(a.audio, a.rate))
      .then(() => token === speechToken && onend && onend())
      .catch(() => token === speechToken && browserSpeak(text, token, onend));
    return;
  }
  browserSpeak(text, token, onend);
}
function browserSpeak(text, token, onend) {
  if (!('speechSynthesis' in window)) { onend && onend(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB'; u.rate = look.rate;
  u.voice = voices().find((v) => v.lang === 'en-GB') || voices()[0] || null;
  u.onend = () => token === speechToken && onend && onend();
  speechSynthesis.speak(u);
}
function hush() { speechToken++; stopAudio(); if ('speechSynthesis' in window) speechSynthesis.cancel(); }

// ---------- the menu ----------
const menuEl = $('#menu');
let order = [];
const pad = (n) => String(n).padStart(2, '0');
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const flap = (s) => el('span', { className: 'flap' }, [...s].map((c) => el('i', { className: c === ':' ? 'sep' : '', textContent: c })));

async function render(moved = []) {
  const log = await entries();
  const now = Date.now();
  const part = daypart(new Date(now));
  $('#day').textContent = `${new Date(now).toLocaleDateString('en-GB', { weekday: 'long' })} ${part}`;
  menuEl.replaceChildren(...order.map((id, i) => {
    const t = byId(id);
    const isNow = i === 0;
    const up = moved.some((m) => m.id === id);
    const why = up ? `Moved up: ${reason(log, id, now, t.starter).replace(/^You/, 'you')}` : reason(log, id, now, t.starter);
    const btn = el('button', { className: 'tile', type: 'button' },
      isNow
        ? el('span', { className: 'head' }, el('span', { className: 'badge', textContent: 'Now' }), flap(nowTime()))
        : el('span', { className: 'when', textContent: usualTime(log, id, now) }),
      el('span', { className: 'what' },
        el('span', { className: 'title', textContent: t.title }),
        el('span', { className: 'why' }, up ? el('b', { textContent: 'Up ' }) : null, up ? why.replace(/^Moved up: /, '') : why),
        isNow ? el('span', { className: 'tap', textContent: t.tap }) : null),
      el('span', { className: 'key', textContent: String(i + 1) }));
    btn.dataset.id = id;
    btn.setAttribute('aria-label', `${isNow ? 'Now: ' : ''}${t.title}. ${why}.${isNow ? ' ' + t.tap + '.' : ''}`);
    [...btn.children].forEach((c) => c.setAttribute('aria-hidden', 'true'));
    btn.addEventListener('click', () => runTile(id, btn, 'tile'));
    return el('li', { className: [isNow && 'now', up && 'moved'].filter(Boolean).join(' ') }, btn);
  }));
  const note = $('#note');
  if (moved.length) {
    const t = byId(moved[0].id);
    note.replaceChildren(el('b', { textContent: 'Moved up. ' }), `${t.title}: ${reason(log, t.id, now, '').toLowerCase()}.`);
    note.hidden = false;
  } else note.hidden = true;
  showProposal(log, now);
}
setInterval(() => { const f = menuEl.querySelector('.now .flap'); if (f) f.replaceWith(flap(nowTime())); }, 15000);

async function rerank({ force = false, previous } = {}) {
  const prev = previous || prefs.menuState || null;
  const { state, moved } = dailyMenu(prev, await entries(), prefs.menuIds, Date.now(), { force });
  prefs.menuState = state; savePrefs();
  order = state.order;
  await render(moved);
  return moved;
}

// ---------- proposals: "You ask for the weather most evenings. Add a tile?" ----------
let proposal = null;
function showProposal(log, now) {
  const today = dayKey(new Date(now));
  const skip = [...prefs.menuIds, ...prefs.declined, ...Object.keys(prefs.snoozed).filter((id) => prefs.snoozed[id] === today)];
  proposal = proposals(log, TILES, skip, now)[0] || null;
  $('#proposal').hidden = !proposal;
  if (proposal) $('#proposal-text').textContent = proposal.text;
}
export function answerProposal(answer) {
  if (!proposal) return;
  const t = byId(proposal.id);
  if (answer === 'yes') { prefs.menuIds.push(t.id); prefs.menuState.order.push(t.id); order = prefs.menuState.order; speak(`Added. ${t.title} is on your menu.`); }
  else if (answer === 'never') { prefs.declined.push(t.id); speak(`Okay. I won't suggest ${t.title.toLowerCase()} again.`); }
  else { prefs.snoozed[t.id] = dayKey(new Date()); speak('Okay, not now.'); }
  savePrefs();
  render().then(() => menuEl.querySelector(`[data-id="${t.id}"]`)?.focus() || menuEl.querySelector('.tile')?.focus());
}
$('#proposal').addEventListener('click', (e) => { const b = e.target.closest('[data-answer]'); if (b) answerProposal(b.dataset.answer); });

// ---------- the sheet: ask first, and the reader ----------
const dialog = $('#sheet');
const body = $('#sheet-body');
let opener = null;
let sheet = null;   // { yes, no, reader }
const reader = { text: '', index: 0, reading: false, docEl: null, area: null };

function openSheet({ title, from, lines = [], doc, draft, yes, no = 'No', onYes, onNo }) {
  if (!dialog.open) opener = document.activeElement;
  hush(); reader.reading = false;
  const kids = [el('h2', { id: 'sheet-title', textContent: title })];
  if (from) kids.push(el('p', { className: 'from' }, el('b', { textContent: from[0] }), from[1]));
  for (const l of lines) kids.push(el('p', { textContent: l }));
  reader.docEl = null; reader.area = null;
  if (doc != null) { reader.text = doc; reader.index = 0; reader.docEl = el('p', { className: 'doc' }); kids.push(reader.docEl); }
  if (draft != null) {
    reader.text = draft; reader.index = 0;
    reader.area = el('textarea', { id: 'draft', value: draft });
    reader.area.addEventListener('input', () => { reader.text = reader.area.value; });
    kids.push(el('label', { htmlFor: 'draft', textContent: 'Your reply' }), reader.area);
  }
  const yesBtn = yes && el('button', { className: 'choice yes', type: 'button', textContent: yes });
  const noBtn = el('button', { className: 'choice', type: 'button', textContent: no });
  kids.push(el('div', { className: 'row' }, yesBtn, noBtn));
  body.replaceChildren(...kids);
  sheet = { yes: onYes, no: onNo };
  if (yesBtn) yesBtn.addEventListener('click', () => sheet.yes && sheet.yes());
  noBtn.addEventListener('click', () => { const f = sheet.no; closeSheet(); f && f(); });
  renderDoc();
  if (!dialog.open) { dialog.show(); $('main').inert = true; }
  (yesBtn || noBtn).focus();
}
function closeSheet() {
  hush(); reader.reading = false; sheet = null;
  if (dialog.open) dialog.close();
}
dialog.addEventListener('close', () => { $('main').inert = false; sheet = null; reader.reading = false; (opener && opener.isConnected ? opener : menuEl.querySelector('.tile'))?.focus(); });

function renderDoc() {
  if (!reader.docEl) return;
  const all = sentences(reader.text);
  reader.docEl.replaceChildren(...all.flatMap((s, i) => [i === reader.index ? el('mark', { textContent: s }) : s, ' ']));
}
function readFrom(i) {
  const all = sentences(reader.text);
  if (i >= all.length) { reader.reading = false; speak('That was the last one.'); return; }
  reader.index = i; reader.reading = true; renderDoc();
  speak(all[i], { show: false, local: true, onend: () => reader.reading && readFrom(i + 1) });
}

// ---------- tiles ----------
export async function runTile(id, btn, via) {
  const t = byId(id);
  if (!t) return;
  if (caps.tts && via === 'tile') audioOut(); // unlock audio inside the tap (iOS)
  logTap(id, via);
  const a = t.action;
  try {
    if (a.type === 'notes') {
      openSheet({ title: `Your notes: ${NOTE.title}`, doc: NOTE.text, yes: 'Read it', no: 'Close', onYes: () => readFrom(0) });
      const n = sentences(NOTE.text).length;
      speak(`Your notes are open, ${n} things. First: ${sentences(NOTE.text)[0]}`, { onend: () => { reader.reading = true; readFrom(1); } });
    } else if (a.type === 'draft') {
      openDraft();
    } else if (a.type === 'pay') {
      openPay();
    } else if (a.type === 'link') {
      openLink(t.say, buildLink({ kind: a.kind, place: a.place, phone: a.to && CONTACTS[a.to].phone }), t.title);
    } else {
      speak(t.say);
    }
  } catch (e) {
    speak(`${t.title} didn't open. Tap again, or hold to talk.`);
  }
  btn && btn.focus();
}

function openLink(line, url, title) {
  const w = window.open(url, '_blank', 'noopener');
  if (w === null && !/^(tel|sms):/.test(url)) {
    // A voice request arrives after the tap, so the browser may block the new tab: one more tap opens it.
    openSheet({ title, lines: [line], yes: `Open ${title}`, no: 'Not now', onYes: () => { window.open(url, '_blank', 'noopener'); closeSheet(); } });
  } else if (/^(tel|sms):/.test(url)) location.href = url;
  speak(line);
}

function openDraft(text) {
  const reply = text || MUM_DRAFT;
  openSheet({ title: 'Mum', from: ['Mum says', MUM_MESSAGE], draft: reply, yes: 'Yes, send', onYes: sendDraft });
  speak(text ? `I'll send Mum: ${reply} Send it?` : `Mum says: ${MUM_MESSAGE} I've written: ${reply} Send it, or tell me what to change.`);
}
function sendDraft() {
  const text = reader.area ? reader.area.value : reader.text;
  window.open(buildLink({ kind: 'whatsapp', text }), '_blank', 'noopener');
  closeSheet();
  speak("It's in WhatsApp, ready for Mum. Press send there.");
}

function openPay() {
  const item = SHOP.beans;
  const price = `£${item.price.toFixed(2)}`;
  openSheet({ title: 'Order your usual beans?', lines: [`${item.detail}. ${price}, arriving ${item.arrives}.`, 'Nothing is charged: this shop is a demo.'],
    yes: `Yes, pay ${price}`, onYes: () => pay(item) });
  speak(`Your usual beans from Hill Street Roasters, ${price}, arriving ${item.arrives}. Shall I pay?`);
}
async function pay(item, again = false) {
  if (!(await passkey.available())) {
    closeSheet();
    return speak("This phone can't check your face here, so I haven't paid.");
  }
  let ok = false;
  try { ok = await passkey.confirm(); }
  catch (e) {
    if (e.name === 'NotAllowedError' && !again) {
      // A spoken "yes" may arrive without a tap, and Face ID needs one: offer the one big button.
      openSheet({ title: "Check it's you", lines: ['Use Face ID or your fingerprint to pay.'], yes: 'Check with Face ID', onYes: () => pay(item, true) });
      return speak("Tap the big button and I'll check it's you.");
    }
  }
  closeSheet();
  if (!ok) return speak("That didn't check out, so I haven't paid.");
  speak(`Paid. Your beans arrive ${item.arrives}.`);
}

// ---------- talking ----------
const talk = $('#talk');
const talkLabel = $('#talk-label');
const typed = $('#typed');
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, held = false, heard = '';

function showTyped(reason) {
  typed.hidden = false;
  if (reason) talkLabel.textContent = reason;
  $('#typed-text').focus();
}
function hold(on) {
  if (on === held) return;
  held = on;
  talk.setAttribute('aria-pressed', String(on));
  if (on) {
    hush();
    if (!liveBroken) { startLive(); return; }
    if (!Rec) { held = false; talk.setAttribute('aria-pressed', 'false'); showTyped(); return; }
    heard = '';
    rec = new Rec(); rec.lang = 'en-GB'; rec.interimResults = true; rec.continuous = true;
    rec.onresult = (e) => { heard = [...e.results].map((r) => r[0].transcript).join(' '); talkLabel.textContent = heard; };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') showTyped("Murmur can't hear you: allow the microphone");
    };
    rec.onend = () => { if (heard.trim()) ask(heard); else if (!held) talkLabel.textContent = 'Hold to talk'; };
    try { rec.start(); } catch { /* already started */ }
    talkLabel.textContent = 'Listening';
    status.textContent = 'Listening';
  } else {
    if (live && live.connected && !liveBroken) { live.stop(); talkLabel.textContent = 'Heard you'; return; }
    if (rec) rec.stop();
    talkLabel.textContent = 'Heard you';
  }
}

// ---------- Gemini Live ----------
const TOOL_ACTIONS = {
  open_tile: (a) => ({ type: 'open', tile: a.tile }),
  read_note: () => (dialog.open && (reader.docEl || reader.area) ? { type: 'read' } : { type: 'open', tile: 'notes' }),
  where_am_i: () => ({ type: 'where' }), stop_reading: () => ({ type: 'stop' }), carry_on: () => ({ type: 'resume' }),
  edit_text: (a) => ({ type: 'edit', from: String(a.from || ''), to: String(a.to ?? '') }),
  draft_message: (a) => ({ type: 'draft', to: 'mum', text: a.text || '' }),
  send: () => ({ type: 'send' }), cancel: () => ({ type: 'no' }), start_pay: () => ({ type: 'pay', item: 'beans' }),
};
async function onTool(name, args) {
  const make = TOOL_ACTIONS[name];
  if (!make) return { error: 'unknown tool' };
  liveQuiet = true; lastLine = '';
  try { await act({ action: make(args) }); } finally { liveQuiet = false; }
  return { say: lastLine || 'Done.' };
}
async function startLive() {
  live ||= createLive({
    onTool,
    onCaption: (text) => { status.textContent = text; },
    onHeard: (text) => { talkLabel.textContent = text; },
    onTurnEnd: () => { if (!held) talkLabel.textContent = 'Hold to talk'; },
  });
  talkLabel.textContent = 'Listening';
  status.textContent = 'Listening';
  try {
    await live.start();
    if (!held) live.stop(); // let go before the line opened
  } catch (e) {
    console.warn('Live unavailable, using the browser voice', e.message);
    liveBroken = true;
    // Same hold, simpler ears: switch to the browser's speech recognition at once.
    if (held) { held = false; hold(true); } else { talk.setAttribute('aria-pressed', 'false'); talkLabel.textContent = 'Hold to talk'; }
  }
}
talk.addEventListener('pointerdown', (e) => { e.preventDefault(); hold(true); });
['pointerup', 'pointercancel'].forEach((ev) => talk.addEventListener(ev, () => hold(false)));
talk.addEventListener('pointerleave', () => held && hold(false));
talk.addEventListener('click', (e) => { if (e.detail === 0) hold(!held); }); // keyboard and switch users toggle
typed.addEventListener('submit', (e) => { e.preventDefault(); const v = $('#typed-text').value; $('#typed-text').value = ''; if (v.trim()) ask(v); });

export async function ask(text) {
  talkLabel.textContent = 'One moment';
  status.textContent = 'One moment';
  let reply;
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, context: { screen: dialog.open ? (reader.area ? 'draft to Mum' : reader.docEl ? 'reading notes' : 'ask first') : 'menu' } }) });
    reply = await res.json();
  } catch { reply = { say: "I can't reach the internet. Your tiles still work.", action: null }; }
  talkLabel.textContent = 'Hold to talk';
  act(reply);
}

export function act({ say = '', action } = {}) {
  const a = action || {};
  const inDoc = dialog.open && (reader.docEl || reader.area);
  switch (a.type) {
    case 'open': return byId(a.tile) ? runTile(a.tile, null, 'talk') : speak(say);
    case 'draft': return openDraft(a.text || undefined);
    case 'pay': return openPay();
    case 'send':
      // Said "send" over a draft: read it back and ask first. "Yes" (or "send" again) sends.
      if (reader.area && sheet && !sheet.confirming) {
        sheet.confirming = true;
        return speak(`Send this to Mum: ${reader.area.value} Yes?`);
      }
      return sheet && sheet.yes ? sheet.yes() : speak("There's nothing to send right now.");
    case 'yes': return sheet && sheet.yes ? sheet.yes() : speak("There's nothing to say yes to right now.");
    case 'no': if (dialog.open) closeSheet(); return speak(say || 'Okay, I left it.');
    case 'stop': hush(); reader.reading = false; return speak('Stopped.', { show: true });
    case 'read': return inDoc ? readFrom(0) : speak('Open a note or a message first.');
    case 'resume': return inDoc ? readFrom(reader.index + (reader.reading ? 0 : 1)) : speak('Open a note or a message first.');
    case 'where': return inDoc ? speak(whereAmI(reader.text, reader.index)) : speak("You're on your menu.");
    case 'edit': {
      if (!inDoc) return speak('Open a note or a message first, then tell me what to change.');
      const r = replaceWord(reader.text, a.from, a.to, reader.index);
      if (!r.changed) return speak(`I couldn't find ${a.from}.`);
      reader.text = r.text; reader.index = r.index;
      if (sheet) sheet.confirming = false;
      if (reader.area) reader.area.value = r.text;
      renderDoc();
      return speak(`Changed. ${sentences(r.text)[r.index]}`);
    }
    default: return speak(say || "I didn't catch that.");
  }
}

// ---------- keys: 1 to 6 press tiles, Space held is talk ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dialog.open) { e.preventDefault(); closeSheet(); return; }
  if (e.target.closest('input, textarea, dialog')) return;
  if (e.code === 'Space' && !e.repeat && e.target === document.body) { e.preventDefault(); hold(true); }
  const n = Number(e.key);
  const tiles = menuEl.querySelectorAll('.tile');
  if (n >= 1 && n <= tiles.length && !e.metaKey && !e.ctrlKey && !e.altKey) tiles[n - 1].click();
});
document.addEventListener('keyup', (e) => { if (e.code === 'Space' && e.target === document.body) hold(false); });

// ---------- Your look: text, colours, voice, and the demo controls ----------
const RATES = [[0.75, 'slow'], [1, 'normal'], [1.25, 'quick'], [1.5, 'fast']];
const rateName = (r) => (RATES.find(([v]) => v === r) || [0, 'normal'])[1];
async function setLook(change, line) {
  Object.assign(look, change);
  try { Object.assign(look, await writeLook(librarian, look)); } catch { /* stub Librarian */ }
  applyLook(look); store.set('look', look);
  speak(line(look));
}
async function openLook(focusKey) {
  if (!dialog.open) opener = document.activeElement;
  hush(); reader.reading = false; reader.docEl = null; reader.area = null;
  let paused = false;
  try { paused = !!(await librarian.getProfile()).memoryPaused; } catch { /* stub */ }
  const btn = (k, text, on, pressed) => {
    const b = el('button', { className: 'choice', type: 'button', textContent: text });
    b.dataset.k = k;
    if (pressed != null) b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', on);
    return b;
  };
  const group = (title, ...kids) => el('section', { className: 'group' }, el('h3', { textContent: title }), el('div', { className: 'choices' }, ...kids));
  const i = SIZES.indexOf(look.size), r = RATES.findIndex(([v]) => v === look.rate);
  const refresh = (k) => () => openLook(k);
  const kids = [
    el('h2', { id: 'sheet-title', textContent: 'Your look' }),
    el('p', { className: 'quiet', textContent: `Saved in your ability profile on this phone: text ${look.size} percent, ${THEMES[look.theme].toLowerCase()}, voice ${rateName(look.rate)}.` }),
    group(`Text, now ${look.size}%`,
      btn('smaller', 'Smaller', () => i <= 0 ? speak('Text is as small as it goes.') :
        setLook({ size: SIZES[i - 1] }, (l) => `Text: smaller. Now ${l.size} percent.`).then(refresh('smaller'))),
      btn('bigger', 'Bigger', () => i >= SIZES.length - 1 ? speak('Text is as big as it goes, 400 percent.') :
        setLook({ size: SIZES[i + 1] }, (l) => `Text: bigger. Now ${l.size} percent.`).then(refresh('bigger')))),
    group('Colours', ...Object.entries(THEMES).map(([t, name]) =>
      btn(`theme-${t}`, name, () => setLook({ theme: t }, () => `Colours: ${name.toLowerCase()}.`).then(refresh(`theme-${t}`)), look.theme === t))),
    group(`Voice, ${rateName(look.rate)}`,
      btn('slower', 'Slower', () => r <= 0 ? speak('That is the slowest.') :
        setLook({ rate: RATES[r - 1][0] }, (l) => `Voice: slower. This is ${rateName(l.rate)}.`).then(refresh('slower'))),
      btn('faster', 'Faster', () => r >= RATES.length - 1 ? speak('That is the fastest.') :
        setLook({ rate: RATES[r + 1][0] }, (l) => `Voice: faster. This is ${rateName(l.rate)}.`).then(refresh('faster'))),
      btn('voice', "Murmur's voice", () => { look.voice = !look.voice; store.set('look', look);
        status.textContent = look.voice ? "Murmur's voice is on." : "Murmur's voice is off. I'll show my lines here.";
        if (look.voice) speak(status.textContent); openLook('voice'); }, look.voice)),
    group('Learning',
      btn('learn', paused ? 'Start learning again' : 'Stop learning', async () => {
        try { await librarian.setMemoryPaused(!paused); } catch { /* stub */ }
        speak(paused ? "Learning is on. I'll notice what you do most." : "Learning is off. I won't note what you tap.");
        openLook('learn'); }),
      btn('week', 'Load a week of use', () => { closeSheet(); loadWeek(); }),
      btn('reset', 'Start again as day 1', resetDayOne)),
  ];
  if (await passkey.available() && !passkey.hasPasskey()) {
    kids.push(group('Paying', btn('passkey', 'Set up Face ID for paying', async () => {
      try { await passkey.setup(); speak("Face ID is set. I'll ask for it before I pay."); openLook(); }
      catch { speak("That didn't work, so nothing changed."); }
    })));
  }
  const done = el('button', { className: 'choice yes', type: 'button', textContent: 'Done' });
  done.addEventListener('click', closeSheet);
  kids.push(el('div', { className: 'row' }, done));
  body.replaceChildren(...kids);
  sheet = null;
  if (!dialog.open) { dialog.show(); $('main').inert = true; }
  (focusKey && body.querySelector(`[data-k="${focusKey}"]`) || body.querySelector('button')).focus();
}
function resetDayOne() {
  // Forget the learned log and menu; keep Your look and the passkey.
  try {
    for (const k of Object.keys(localStorage)) if (/^aat:.*aa\.mine\.(episodicLog|proposals)/.test(k) || k === 'murmur:prefs' || k === 'murmur:stublog') localStorage.removeItem(k);
  } catch { /* nothing stored */ }
  location.reload();
}
$('#look-link').addEventListener('click', (e) => { e.preventDefault(); openLook(); });

// ---------- demo control: a week of use (Your look calls this) ----------
export async function loadWeek() {
  const before = { day: 'seed', order: TILES.filter((t) => t.start).map((t) => t.id) };
  for (const e of seedWeek(Date.now())) {
    clockShift = e.t;
    await librarian.logObservation({ type: e.type, data: e.data, text: byId(e.data.tile).title });
  }
  clockShift = null;
  prefs.menuIds = before.order.slice(); prefs.declined = []; prefs.snoozed = {}; savePrefs();
  const moved = await rerank({ force: true, previous: before });
  const t = moved[0] && byId(moved[0].id);
  const log = await entries();
  speak(t ? `A week later. ${t.title} moved up: ${reason(log, t.id, Date.now(), '').toLowerCase()}. ${proposal ? proposal.text : ''}` : 'A week of use loaded.');
}

// ---------- start ----------
new ResizeObserver(([e]) => document.documentElement.style.setProperty('--footer-h', `${Math.ceil(e.borderBoxSize[0].blockSize)}px`))
  .observe(document.querySelector('footer'));
await rerank();
window.murmur = { act, ask, loadWeek, runTile, speak, librarian, look };
try {
  const r = await fetch('/api/menu', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ part: daypart(new Date()), top: byId(order[0]).title, moved: [...menuEl.querySelectorAll('.moved .title')].map((n) => n.textContent) }) });
  status.textContent = (await r.json()).say;
} catch { status.textContent = `${byId(order[0]).title} is first. Tap it, or hold the bar and tell me.`; }
