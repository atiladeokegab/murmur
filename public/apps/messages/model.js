// Messages: the pure state. No DOM; the same code runs in the browser and in test/apps-messages.test.js.
// Invented people only (event rule). "Sam" is ambiguous on purpose: Sam and Samira.
import { sentences } from '../../lib/notes.js';

export const seedChats = () => [
  { id: 'mum', name: 'Mum', unread: 1, messages: [
    { from: 'them', text: 'Did you get home all right?', ago: 1500 },
    { from: 'me', text: 'Yes, all fine. Love you.', ago: 1490 },
    { from: 'them', text: 'Lunch on Tuesday?', ago: 2 },
  ] },
  { id: 'sam', name: 'Sam', unread: 1, messages: [
    { from: 'them', text: 'Are you still coming to the quiz tonight? We start at seven.' },
  ] },
  { id: 'samira', name: 'Samira', unread: 0, messages: [
    { from: 'me', text: 'Thanks for the lift.' },
    { from: 'them', text: 'Any time. See you at choir.' },
  ] },
];

export const fresh = () => ({ chats: seedChats(), currentChat: null, draft: '', changed: null, reading: null, lastSent: null });

// ago: minutes before the demo, fixed so the eval's state.example.json stays the same on every run.
// shortcut: seeded times never age, store a real timestamp if messages ever arrive live.
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const n = (x) => NUM[x] || String(x);
export function agoWords(min) {
  if (min == null) return '';
  if (min < 1) return 'just now';
  if (min < 60) return min === 1 ? 'a minute ago' : `${n(min)} minutes ago`;
  if (min < 120) return 'an hour ago';
  if (min < 1440) return `${n(Math.floor(min / 60))} hours ago`;
  return min < 2880 ? 'yesterday' : `${n(Math.floor(min / 1440))} days ago`;
}

const norm = (s) => String(s || '').trim().toLowerCase();
export const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
export const chatOf = (s, id = s.currentChat) => s.chats.find((c) => c.id === id) || null;

/** Every chat a spoken name could mean: "Sam" is Sam and Samira, so the caller must ask. */
export function candidates(s, who) {
  const w = norm(who);
  if (!w) return [];
  return s.chats.filter((c) => norm(c.name).startsWith(w) || norm(c.id) === w);
}

/** Resolve { id } (exact, from a choice) or { who } (spoken). Returns { id } or { ask } or { none }. */
export function resolve(s, p = {}) {
  if (p.id) return chatOf(s, p.id) ? { id: p.id } : { none: `There's no chat with ${p.id}.` };
  const list = candidates(s, p.who);
  if (list.length === 1) return { id: list[0].id };
  if (!list.length) return { none: `There's no chat with ${p.who || 'that name'}.` };
  const names = list.map((c) => c.name);
  return { ask: {
    question: `${names.slice(0, -1).join(', ')} or ${names.at(-1)}?`,
    choices: list.map((c) => ({ label: c.name, params: { id: c.id } })),
  } };
}

export function open(s, id) {
  s.currentChat = id; s.draft = ''; s.changed = null; s.reading = null;
}

/** What "read" reads: the unread messages from them, else the last one from them. One item per sentence. */
export function readItems(s) {
  const c = chatOf(s);
  if (!c) return [];
  const theirs = c.messages.map((m, i) => ({ ...m, i })).filter((m) => m.from === 'them');
  const pick = c.unread ? theirs.slice(-c.unread) : theirs.slice(-1);
  return pick.flatMap((m) => sentences(m.text).map((text) => ({ msg: m.i, text })));
}

export function startReading(s) {
  const items = readItems(s);
  s.reading = { chat: s.currentChat, at: 0, of: items.length, items: items.map((x) => x.text) };
  const c = chatOf(s);
  if (c) c.unread = 0;
  return items;
}

/**
 * Find the one word that changed between two drafts, so the UI can underline it.
 * Returns { sentence, word, from, to } or null when nothing or more than one word changed.
 */
export function wordChange(before, after) {
  const a = sentences(before), b = sentences(after);
  if (a.length !== b.length) return null;
  let found = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const x = a[i].split(/\s+/), y = b[i].split(/\s+/);
    if (found || x.length !== y.length) return null;
    const diff = x.map((w, k) => k).filter((k) => x[k] !== y[k]);
    if (diff.length !== 1) return null;
    found = { sentence: i, word: diff[0], from: x[diff[0]], to: y[diff[0]] };
  }
  return found;
}

/** A typed or dictated draft. Marks the changed word when exactly one word moved. */
export function setDraft(s, text) {
  const change = s.draft ? wordChange(s.draft, text) : null;
  s.draft = text;
  s.changed = change;
  if (s.lastSent && s.lastSent.text !== text) s.lastSent = null;
}

export function send(s) {
  const c = chatOf(s);
  if (!c || !s.draft.trim()) return false;
  c.messages.push({ from: 'me', text: s.draft });
  s.lastSent = { to: c.id, text: s.draft };
  s.changed = null;
  return true;
}

export const sent = (s) => !!s.lastSent && s.lastSent.text === s.draft && s.lastSent.to === s.currentChat;

export function read(s) {
  const c = chatOf(s);
  if (!c) {
    const news = s.chats.filter((x) => x.unread);
    const lead = news.map((x) => `${x.name} wrote: ${x.messages.at(-1).text}`).join(' ');
    return `${s.chats.length} chats.${lead ? ' ' + lead : ''}`; // no app name: the board shows it under the title
  }
  const last = c.messages.at(-1);
  const said = last.text.trim().replace(/[.!]+$/, ''); // the quote keeps a ? but not a closing full stop, so no ".".
  const stop = said.endsWith('?') ? ' ' : '. ';
  let line = `${possessive(c.name)} chat, ${c.messages.length} messages, the last ${last.from === 'me' ? 'from you' : 'says'} "${said}"`;
  if (sent(s)) line += `${stop}Sent.`;
  else if (s.draft) line += `${stop}Your reply: ${s.draft}`;
  return /[.?!]"?$/.test(line) ? line : line + '.';
}

export function place(s) {
  const c = chatOf(s);
  if (!c) return { where: 'Messages', item: 'your chats', n: 0, of: s.chats.length, next: 'openChat' };
  const where = `${possessive(c.name)} chat`;
  if (s.draft && !sent(s)) {
    const of = sentences(s.draft).length;
    const n = s.changed ? s.changed.sentence + 1 : of;
    return { where, item: 'your reply', n, of, next: 'send' };
  }
  if (s.reading && s.reading.chat === c.id) {
    return { where, item: `${possessive(c.name)} message`, n: s.reading.at + 1, of: s.reading.of, next: 'reply' };
  }
  return { where, item: 'the chat', n: c.messages.length, of: c.messages.length, next: sent(s) ? null : 'reply' };
}
