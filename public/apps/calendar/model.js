// Calendar: one week of invented plans. Pure; tested in test/apps-calendar.test.js.
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const PEOPLE = { mum: 'Mum', sam: 'Sam', samira: 'Samira' };

export const fresh = () => ({
  today: 'Saturday',
  events: [
    { id: 'lunch-mum', title: 'Lunch with Mum', day: 'Tuesday', time: '13:00', with: ['mum'], invited: [] },
    { id: 'dentist', title: 'Dentist', day: 'Thursday', time: '09:30', with: [], invited: [] },
    { id: 'choir', title: 'Choir', day: 'Saturday', time: '18:00', with: ['samira'], invited: [] },
    { id: 'quiz', title: 'Quiz with Sam', day: 'Saturday', time: '19:30', with: ['sam'], invited: [] },
  ],
  showing: 'Saturday',
  selected: null,
});

const norm = (t) => String(t || '').trim().toLowerCase();
/** "Wed", "wednesday", "today" or "tomorrow" (with the state's today) to "Wednesday"; null when unknown. */
export function dayOf(d, today = 'Saturday') {
  const w = norm(d);
  if (w === 'today') return today;
  if (w === 'tomorrow') return DAYS[(DAYS.indexOf(today) + 1) % 7];
  return DAYS.find((x) => norm(x) === w || (w.length >= 3 && norm(x).startsWith(w))) || null;
}

const NUM = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
/** "13:00" → "one", "09:30" → "half past nine", "10:15" → "quarter past ten", "19:45" → "quarter to eight". */
export function spokenTime(t) {
  const [h, m] = String(t).split(':').map(Number);
  if (m === 0) return NUM[h % 12];
  if (m === 30) return `half past ${NUM[h % 12]}`;
  if (m === 15) return `quarter past ${NUM[h % 12]}`;
  if (m === 45) return `quarter to ${NUM[(h + 1) % 12]}`;
  return `${NUM[h % 12]} ${String(m).padStart(2, '0')}`;
}

export const byDay = (s, day) => s.events.filter((e) => e.day === day).sort((a, b) => a.time.localeCompare(b.time));
export const line = (e) => `${e.title}, ${e.day} at ${spokenTime(e.time)}.`;

export function whatsOn(s, day = s.today) {
  const d = dayOf(day, s.today);
  if (!d) return `I don't know ${day}.`;
  const list = byDay(s, d);
  const when = d === s.today ? 'Today' : d;
  if (!list.length) return `${when} is free.`;
  return `${when}: ` + list.map((e) => `${e.title} at ${spokenTime(e.time)}`).join(', then ') + '.';
}

/** Events a spoken name could mean. Every word of it must be in the title. */
export function find(s, what) {
  const w = norm(what).split(/\s+/).filter(Boolean);
  if (!w.length) return [];
  return s.events.filter((e) => w.every((x) => norm(e.title).split(/\s+/).includes(x)));
}

export function resolve(s, p = {}) {
  if (p.id) return s.events.some((e) => e.id === p.id) ? { id: p.id } : { none: 'That plan is gone.' };
  const list = find(s, p.what);
  if (list.length === 1) return { id: list[0].id };
  if (!list.length) return { none: `I can't find ${p.what || 'that'} this week.` };
  return { ask: { question: list.map((e) => e.title).join(' or ') + '?', choices: list.map((e) => ({ label: line(e), params: { ...p, id: e.id } })) } };
}

export const event = (s, id) => s.events.find((e) => e.id === id) || null;
export const clash = (s, day, time, id) => s.events.find((e) => e.id !== id && e.day === day && e.time === time) || null;

export function add(s, { title, day, time = '12:00' }) {
  const d = dayOf(day, s.today);
  if (!String(title || '').trim() || !d || !/^\d{2}:\d{2}$/.test(time || '')) return null;
  const id = norm(title).replace(/[^a-z0-9]+/g, '-') + '-' + d.slice(0, 3).toLowerCase();
  const e = { id, title: String(title).trim(), day: d, time, with: [], invited: [] };
  s.events.push(e);
  s.showing = d; s.selected = id;
  return e;
}

/** Move an event to another day (same time unless given). Returns the sentence to say, or { fail }. */
export function move(s, id, to, time) {
  const e = event(s, id), d = dayOf(to, s.today);
  if (!e || !d) return { fail: `I don't know ${to}.` };
  const t = time || e.time;
  const c = clash(s, d, t, id);
  if (c) return { fail: `${d} has ${c.title} at ${spokenTime(t)}. Pick another time?` };
  e.day = d; e.time = t;
  s.showing = d; s.selected = id;
  const who = e.with.map((x) => PEOPLE[x]).filter(Boolean);
  return { say: `${d}'s free. Moved.${who.length ? ` Tell ${who.join(' and ')}?` : ''}` };
}

export function invite(s, id, who) {
  const e = event(s, id), k = Object.keys(PEOPLE).find((x) => norm(PEOPLE[x]) === norm(who));
  if (!e || !k) return false;
  if (!e.invited.includes(k)) e.invited.push(k);
  if (!e.with.includes(k)) e.with.push(k);
  return true;
}

export function read(s) {
  const sel = event(s, s.selected);
  return `Calendar. ${whatsOn(s, s.showing)}${sel ? ` Chosen: ${line(sel)}` : ''}`;
}

export function place(s) {
  const list = byDay(s, s.showing);
  const i = list.findIndex((e) => e.id === s.selected);
  return { where: `Calendar, ${s.showing === s.today ? 'today' : s.showing}`, item: i >= 0 ? list[i].title : 'the day', n: i + 1, of: list.length, next: i >= 0 ? 'move' : 'whatsOn' };
}
