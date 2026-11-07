// Calendar: the glance a sighted person gets ("what's on today"), by voice. Contract: os/contract.md.
// One invented week. "Today" is fixed at Monday 09:00 so the demo and the eval always hear the same week.
// The screen shows one thing at a time: a day's list, or one open event, or the add form.
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TODAY = 'Monday', TODAY_DATE = '2026-11-09', NOW = '09:00';
const SEED = [
  { id: 'lunch', title: 'Lunch with Mum', day: 'Tuesday', date: '2026-11-10', time: '12:30', mins: 60, with: 'Mum', invited: [] },
  { id: 'bookclub', title: 'Book club', day: 'Thursday', date: '2026-11-12', time: '19:00', mins: 90, with: null, invited: [] },
  { id: 'callsam', title: 'Call Sam', day: 'Friday', date: '2026-11-13', time: '19:00', mins: 30, with: 'Sam', invited: [] },
];

let root = null, kv = null, osConfirm = null, osSay = null;
let events = [], shown = TODAY, open = null, picking = false, clash = null, adding = false, inviting = false;
let lastMoved = null, lastAdded = null, lastInvite = null, status = '';
let draft = { title: '', day: '', time: '', to: '', who: '' };
let before = null; // the last move's starting point, for undo
let pressed = null; // the control just pressed: where a moved event takes off from
let personal = false; // a person's own tap moves focus; the agent's taps leave it on Stop
let clearing = null; // the clear action waits for the button's persistence result
let targetDate = null;

// ---------- plain helpers (pure: verify and readback use them on state) ----------
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const order = (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || mins(a.time) - mins(b.time);
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const hasDate = (input) => /\d/.test(String(input ?? '')); // Weekday-only input never needs digits.
function validDate(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date.toISOString().slice(0, 10) : null;
}
/** Absolute dates map to the fixed demo week; weekday-only dates stay in that same week. */
export function dateOf(s, todayDate = TODAY_DATE) {
  const raw = String(s ?? '').trim().toLowerCase();
  const prefix = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+/i.exec(raw)?.[1];
  const q = raw.replace(/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+/i, '');
  let y, m, d, hit;
  if ((hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(q))) [, y, m, d] = hit.map(Number);
  else if ((hit = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?$/.exec(q))) {
    d = Number(hit[1]); m = MONTHS.indexOf(hit[2]) + 1; y = Number(hit[3]) || Number(todayDate.slice(0, 4));
  } else if ((hit = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/.exec(q))) {
    m = MONTHS.indexOf(hit[1]) + 1; d = Number(hit[2]); y = Number(hit[3]) || Number(todayDate.slice(0, 4));
  } else return null;
  if (m < 1 || m > 12) return null;
  let result = validDate(y, m, d);
  if (!result) return null;
  if (!hit[3] && result < todayDate) result = validDate(y + 1, m, d);
  if (prefix && DAYS[(new Date(`${result}T00:00:00Z`).getUTCDay() + 6) % 7].toLowerCase() !== prefix.toLowerCase()) return null;
  return result;
}
export function dateForDay(day, todayDate = TODAY_DATE) {
  const target = DAYS.findIndex((d) => d.toLowerCase() === String(day).toLowerCase());
  if (target < 0) return null;
  const start = new Date(`${todayDate}T00:00:00Z`);
  const startDay = (start.getUTCDay() + 6) % 7; // Monday-first
  return new Date(start.getTime() + ((target - startDay + 7) % 7) * 86400000).toISOString().slice(0, 10);
}
const eventDate = (input) => {
  if (hasDate(input)) {
    const date = dateOf(input);
    return date && date >= TODAY_DATE && date <= dateForDay('Sunday') ? date : null;
  }
  return dateForDay(dayOf(input));
};
/** "today", "tomorrow", "wed", "Wednesday" -> "Wednesday"; null if not a day. */
export function dayOf(s, today = TODAY) {
  const raw = String(s ?? '').trim().toLowerCase();
  if (hasDate(raw) && !eventDate(raw)) return null;
  const absolute = dateOf(raw);
  if (absolute) return DAYS[(new Date(`${absolute}T00:00:00Z`).getUTCDay() + 6) % 7];
  // dictation leaves fillers in: "um Wednesday", "Wednesday please"
  const q = raw.replace(/[^a-z ]/g, ' ').replace(/\b(um+|uh+|erm?|please|on|this|the|like|so)\b/g, ' ').trim().replace(/\s+/g, ' ');
  if (!raw || q === 'today') return today;
  if (q.includes(' ')) return q.split(' ').map((w) => dayOf(w, today)).find(Boolean) ?? null;
  if (q === 'tomorrow') return DAYS[(DAYS.indexOf(today) + 1) % 7];
  return DAYS.find((d) => q.length >= 3 && d.toLowerCase().startsWith(q.slice(0, 3)) && d.toLowerCase().startsWith(q.replace(/s$/, ''))) ?? null;
}
/** "7pm", "7:30 pm", "19:00", "10" -> "HH:MM"; null if not a time. */
export function timeOf(s) {
  if (/^noon$/i.test(String(s ?? '').trim())) return '12:00';
  if (/^midnight$/i.test(String(s ?? '').trim())) return '00:00';
  const m = /^\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/i.exec(String(s ?? ''));
  if (!m) return null;
  let h = Number(m[1]); const mm = Number(m[2] ?? 0), pm = /^p/i.test(m[3] ?? '');
  if (m[3] && (h < 1 || h > 12)) return null;
  if (m[3]) h = (h % 12) + (pm ? 12 : 0);
  if (h > 23 || mm > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
/** "12:30" -> "12:30 pm", "19:00" -> "7 pm": how a person says it. */
export function spoken(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}
const NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
/** "3pm", "three o'clock", "my 12:30 meeting" -> "15:00", "15:00", "12:30". A bare 1 to 7 is afternoon. Not a time: null. */
export function heardTime(q) {
  const s = String(q ?? '').toLowerCase().replace(/\b(my|the|meeting|event|appointment|thing|o'?clock)\b/g, ' ')
    .trim().replace(/^[a-z]+/, (w) => NUMS[w] ?? w);
  const t = timeOf(s);
  if (!t || /[ap]\.?m/.test(s)) return t;
  const h = Number(t.slice(0, 2));
  return h >= 1 && h <= 7 ? `${h + 12}${t.slice(2)}` : t;
}
/** The best-matching events for what was said ("lunch with Mum", "lunch", "Mum", or a time: "my 12:30"). Ties come back together. */
export function matches(list, said) {
  const q = String(said ?? '').toLowerCase().replace(/\b(the|my|a)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return [];
  const at = heardTime(q);
  if (at) return list.filter((e) => e.time === at);
  const score = (e) => {
    const t = e.title.toLowerCase();
    if (t === q) return 4;
    if (t.startsWith(q)) return 3;
    if (t.includes(q) || q.includes(t)) return 2;
    return e.with && q.includes(e.with.toLowerCase()) ? 1 : 0;
  };
  const best = Math.max(0, ...list.map(score));
  return best ? list.filter((e) => score(e) === best) : [];
}
/** Other events on `day` that overlap an event of `len` minutes at `time`. */
export function clashes(list, id, day, time, len) {
  const a = mins(time);
  return list.filter((e) => e.id !== id && e.day === day && a < mins(e.time) + e.mins && mins(e.time) < a + len);
}
const nextOf = (list) => list.slice().sort(order).find((e) => DAYS.indexOf(e.day) > DAYS.indexOf(TODAY)
  || (e.day === TODAY && mins(e.time) >= mins(NOW))) ?? null;
const at = (e) => `${e.title} at ${spoken(e.time)}`;
function dayLine(list, day) {
  const on = list.filter((e) => e.day === day).sort(order);
  const name = day === TODAY ? 'today' : `on ${day}`;
  if (on.length) return `${day === TODAY ? 'Today' : day}: ${on.map(at).join(', then ')}.`;
  const n = nextOf(list);
  return `Nothing ${name}.${day === TODAY && n ? ` Next is ${n.title} on ${n.day} at ${spoken(n.time)}.` : ''}`;
}
// The longer answer ("tell me more"): the day's first event still to come (else the next one), when to leave, the
// rest of that day, and how to move it.
const LEAVE = 15; // shortcut: events have no place, so leave a fixed 15 minutes before; Transit could give the real trip
const clockOf = (m) => spoken(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
function inTime(m) {
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), r = m % 60, n = (k, w) => k && `${k} ${w}${k > 1 ? 's' : ''}`;
  return m <= 0 ? 'now' : `in ${[n(d, 'day'), n(h, 'hour'), n(r, 'minute')].filter(Boolean).join(' ')}`;
}
export function moreLine(list, day) {
  const later = (e) => DAYS.indexOf(e.day) > DAYS.indexOf(TODAY) || (e.day === TODAY && mins(e.time) >= mins(NOW));
  const on = list.filter((e) => e.day === day).sort(order);
  const f = on.find(later) ?? nextOf(list);
  if (!f) return `Nothing ${day === TODAY ? 'today' : `on ${day}`}, and nothing else this week. Say "add" and what, to add an event.`;
  const leave = mins(f.time) - LEAVE;
  const rest = on.filter((e) => e !== f);
  return [`${f.day === day ? '' : `Nothing on ${day}. Next is `}${f.title}, ${f.day} at ${spoken(f.time)} for ${f.mins} minutes${f.with && !f.title.includes(f.with) ? `, with ${f.with}` : ''}.`,
    /^call\b/i.test(f.title) ? '' : `Leave by ${clockOf(leave)}, ${inTime((DAYS.indexOf(f.day) - DAYS.indexOf(TODAY)) * 1440 + leave - mins(NOW))}.`,
    rest.length ? `Also on ${f.day}: ${rest.map(at).join(', then ')}.` : `Nothing else on ${f.day}.`,
    `To change it, say "move ${f.title} to" another day.`].filter(Boolean).join(' ');
}
const clashLine = (c, e) => `${c.day} has ${c.with.map(at).join(' and ')}. Move ${e.title} anyway?`;

// ---------- the screen ----------
function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (k.startsWith('aria-') || k === 'for' || k === 'role') n.setAttribute(k, v); else n[k] = v;
  for (const k of kids) n.append(k);
  return n;
}
const $ = (id) => root.querySelector(`#${id}`);
function btn(id, text, onClick, cls = 'choice', label) {
  const b = el('button', { type: 'button', id, className: cls, textContent: text });
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', (e) => { personal = !!e?.isTrusted; pressed = b; onClick(); });
  return b;
}
// Short visible names so a day never breaks mid-word at 400%; the full name stays in the accessible name.
const dayBtn = (id, d, tail, onClick) => btn(id, d.slice(0, 3) + tail, onClick, 'choice', d + tail);
function field(id, label, key, type = 'text') {
  const i = el('input', { id, type, value: draft[key], autocomplete: 'off' });
  i.addEventListener('input', () => { draft[key] = i.value; });
  return [el('label', { for: id, textContent: label }), i];
}
const save = () => kv && kv.set('events', events);
const ev = () => events.find((e) => e.id === open);
function show(day) { shown = day; open = null; picking = inviting = adding = false; clash = null; status = ''; render('cal-day-h'); }

function doMove(to, time) {
  const e = ev();
  lastMoved = { id: e.id, from: e.day, to, time };
  e.day = to; e.date = targetDate || dateForDay(to); e.time = time;
  events.sort(order);
  shown = to; picking = false; clash = null;
  status = `Moved to ${to} at ${spoken(time)}.`;
  const from = pressed?.getBoundingClientRect?.();
  save(); render('cal-status');
  fly(from, e.title, $(`cal-day-${to}`));
}
const still = () => !!root.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** The moved event lifts off where it was pressed, arcs up and lands on its new day, which then gives a small bounce. */
function fly(from, title, dayBtn) {
  if (!from || !dayBtn?.animate || still()) return;
  dayBtn.scrollIntoView?.({ block: 'nearest' });
  const to = dayBtn.getBoundingClientRect();
  const chip = el('div', { className: 'cal-fly', textContent: title, 'aria-hidden': 'true' });
  root.ownerDocument.body.append(chip); // outside the app: main's container query would trap a fixed element
  const c = chip.getBoundingClientRect();
  const x0 = from.left + from.width / 2 - c.width / 2, y0 = from.top + from.height / 2 - c.height / 2;
  chip.style.left = `${x0}px`; chip.style.top = `${y0}px`;
  const dx = to.left + to.width / 2 - c.width / 2 - x0, dy = to.top + to.height / 2 - c.height / 2 - y0;
  const lift = Math.min(120, Math.abs(dy) / 3 + 40);
  const a = chip.animate([
    { transform: 'translate(0, 0) scale(0.6)', opacity: 0 },
    { transform: 'translate(0, -8px) scale(1.05)', opacity: 1, offset: 0.15 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(1)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.85)`, opacity: 1, offset: 0.9 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0 },
  ], { duration: 780, easing: 'cubic-bezier(.3,.7,.2,1)' });
  let landed = false;
  const land = () => {
    if (landed) return;
    landed = true;
    chip.remove();
    dayBtn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(0.97)' }, { transform: 'scale(1)' }],
      { duration: 380, easing: 'ease-out' });
  };
  a.onfinish = a.oncancel = land;
  setTimeout(land, 1000); // never leave the chip on screen if the animation is starved
}
function pickDay(to) {
  const e = ev(), time = timeOf(draft.to) || e.time;
  const hit = clashes(events, e.id, to, time, e.mins);
  if (hit.length) { clash = { day: to, time, with: hit }; render('cal-clash'); } else doMove(to, time);
}
function addEvent() {
  const title = draft.title.trim(), day = dayOf(draft.day), time = timeOf(draft.time);
  status = !title ? 'Say what it is.' : !draft.day.trim() || !day ? 'Say which day.' : !time ? 'Say what time.' : '';
  if (status) return render('cal-status');
  let id = title.toLowerCase().replace(/[^a-z0-9]/g, '') || 'event', n = 2;
  while (events.some((e) => e.id === id)) id = id.replace(/\d*$/, '') + n++;
  events.push({ id, title, day, date: eventDate(draft.day), time, mins: 60, with: null, invited: [] });
  events.sort(order);
  lastAdded = id; adding = false; shown = day; draft.title = draft.day = draft.time = '';
  status = `Added ${title} on ${day} at ${spoken(time)}.`;
  save(); render('cal-status');
}
const inviteLine = (e, who) => `Send ${who} an invite: ${e.title}, ${e.day} at ${spoken(e.time)}.`;
function sendInvite() {
  const e = ev(), who = draft.who.trim();
  if (!who) { status = 'Say who to invite.'; return render('cal-status'); }
  // A person's own tap gets the shell's ask-first sheet too; the agent's tap was already asked by the runner.
  if (personal && osConfirm) {
    return osConfirm({ gate: 'send', readback: inviteLine(e, who) }).then((ok) => {
      if (ok) invited(e, who); else { status = 'Not sent.'; render('cal-status'); }
    });
  }
  invited(e, who);
}
function invited(e, who) {
  if (!e.invited.some((w) => w.toLowerCase() === who.toLowerCase())) e.invited.push(who);
  lastInvite = { id: e.id, who }; inviting = false; draft.who = '';
  status = `Invite sent to ${who}.`;
  save(); render('cal-status');
}

// Delete everything always asks: the agent's run was asked by the runner; a person's own tap asks here. No confirm, no delete.
const clearLine = (n) => (!n ? 'Your calendar is already empty.' : n === 1 ? 'Delete the one event in your calendar?' : `Delete all ${n} events from your calendar?`);
async function clearAll() {
  if (!events.length) { status = clearLine(0); render('cal-status'); return false; }
  if (!personal) return cleared();
  if (!osConfirm) return false;
  if ((await osConfirm({ gate: 'delete', readback: clearLine(events.length) })) !== true) {
    status = 'Nothing deleted.'; render('cal-status'); return false;
  }
  return cleared();
}
async function cleared() {
  const n = events.length;
  try { await kv.set('events', []); }
  catch {
    status = "I couldn't save that, so nothing was deleted.";
    render('cal-status');
    return false;
  }
  events = []; open = null; picking = adding = inviting = false; clash = null; lastMoved = lastAdded = lastInvite = null; before = null;
  status = `Deleted ${n === 1 ? 'the one event' : `all ${n} events`}. Your calendar is empty.`;
  render('cal-status');
  return true;
}

function render(focusId) {
  const e = ev();
  const days = DAYS.map((d) => {
    const on = d === shown && !adding;
    const b = dayBtn(`cal-day-${d}`, d, d === TODAY ? ', today' : '', () => show(d));
    b.setAttribute('aria-pressed', String(on));
    return b;
  });
  let body;
  if (adding) {
    body = [el('h3', { id: 'cal-add-h', tabIndex: -1, textContent: 'Add an event' }),
      ...field('cal-what', 'What', 'title'), ...field('cal-when-day', 'Day', 'day'), ...field('cal-when-time', 'Time', 'time'),
      el('div', { className: 'choices' }, btn('cal-save', 'Save', addEvent),
        btn('cal-cancel', 'Cancel', () => { adding = false; status = ''; render('cal-day-h'); }))];
  } else if (e) {
    body = [el('h3', { id: 'cal-ev-h', tabIndex: -1, textContent: e.title }),
      el('p', { id: 'cal-ev-when' }, lastMoved?.id === e.id ? el('mark', { className: 'changed', textContent: e.day }) : el('span', { textContent: e.day }),
        el('span', { textContent: ` at ${spoken(e.time)}${e.with ? `, with ${e.with}` : ''}.${e.invited.length ? ` Invited: ${e.invited.join(', ')}.` : ''}` })),
      el('div', { className: 'choices' },
        btn('cal-close', 'Close', () => { open = null; picking = inviting = false; clash = null; status = ''; render('cal-day-h'); }),
        btn('cal-move', 'Move', () => { picking = true; inviting = false; clash = null; draft.to = e.time; render('cal-pick-h'); }),
        btn('cal-invite', 'Invite', () => { inviting = true; picking = false; clash = null; render('cal-who'); }))];
    if (clash) {
      body.push(el('p', { id: 'cal-clash', tabIndex: -1, textContent: clashLine(clash, e) }),
        el('div', { className: 'choices' }, btn('cal-anyway', 'Move anyway', () => doMove(clash.day, clash.time)),
          btn('cal-keep', `Keep it on ${e.day}`, () => { clash = null; picking = false; status = `${e.title} stays on ${e.day}.`; render('cal-status'); })));
    } else if (picking) {
      body.push(el('h4', { id: 'cal-pick-h', tabIndex: -1, textContent: `Move ${e.title} to` }), ...field('cal-to-time', 'At', 'to'),
        el('div', { className: 'cal-grid', role: 'group', 'aria-label': 'Days' }, ...DAYS.map((d) => {
          const b = dayBtn(`cal-to-${d}`, d, d === e.day ? ', now' : '', () => pickDay(d));
          if (d === e.day) b.setAttribute('aria-current', 'true');
          return b;
        })));
    } else if (inviting) {
      body.push(...field('cal-who', 'Who to invite', 'who'), btn('cal-send', 'Send invite', sendInvite, 'choice yes'));
    }
  } else {
    const on = events.filter((x) => x.day === shown);
    body = [el('h3', { id: 'cal-day-h', tabIndex: -1, textContent: shown === TODAY ? `${shown}, today` : shown }),
      el('ol', { id: 'cal-list' }, ...(on.length
        ? on.map((x) => el('li', {}, btn(`cal-ev-${x.id}`, `${x.title}, ${spoken(x.time)}`, () => { open = x.id; status = ''; render('cal-ev-h'); })))
        : [el('li', { textContent: 'Nothing on.' })]))];
    if (events.length) body.push(el('div', { className: 'choices' }, btn('cal-clear', 'Delete every event', () => { clearing = clearAll(); })));
  }
  root.querySelector('#cal-days').replaceChildren(...days);
  root.querySelector('#cal-body').replaceChildren(...body);
  // One voice: inside the OS, a person's result goes to the shell's #say (the one live region); the agent's own run says it via ctx.say.
  $('cal-status').textContent = osSay ? '' : status;
  if (osSay && personal && status) osSay(status);
  const target = focusId && $(focusId);
  target?.scrollIntoView?.({ block: focusId === 'cal-pick-h' ? 'start' : 'nearest', behavior: still() ? 'auto' : 'smooth' });
  if (target && personal) target.focus?.({ preventScroll: true });
  personal = false;
}

// ---------- the app ----------
async function openEvent(ctx, e) {
  if (open !== e.id) { await ctx.tap($(`cal-day-${e.day}`)); await ctx.tap($(`cal-ev-${e.id}`)); }
}
async function pickOne(ctx, said) {
  const found = matches(events, said);
  if (!found.length) { const at = heardTime(said); throw new Error(at ? `Nothing's at ${spoken(at)} this week.` : `There's nothing called ${said} this week.`); }
  if (found.length === 1) return found[0];
  const c = await ctx.choose(`${found.map((x) => `${x.title} on ${x.day}`).join(' or ')}?`, found.map((x) => ({ label: `${x.title} on ${x.day}`, id: x.id })));
  if (!c) throw new Error('No event chosen.');
  return events.find((x) => x.id === c.id);
}
const dayParam = { type: 'string', description: 'A day of this week, like Wednesday, or today or tomorrow' };

const app = {
  id: 'calendar',
  name: 'Calendar',

  async mount(r, os) {
    root = r; kv = os.kv; osConfirm = os.confirm || null; osSay = os.say || null;
    // Tokens only (os/contract.md §2.1); the buttons reuse the shell's .choice.
    const style = el('style', { textContent: `#app-calendar{padding:0 var(--gutter)}#app-calendar ol{padding:0}
#app-calendar li{padding:0.25rem 0}#app-calendar label,#app-calendar h4{display:block;margin-top:var(--gutter)}
#app-calendar .choices{margin:0.25rem 0}#app-calendar li .choice{width:100%;justify-items:start;text-align:start}
#app-calendar .cal-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr));gap:0.5rem;margin:0.25rem 0}
#app-calendar .choice{border-color:var(--c-slat)}#app-calendar .choice{overflow-wrap:anywhere;hyphens:auto}#app-calendar .choice[aria-pressed="true"]{border-color:var(--c-ink);border-width:calc(var(--bw-talk) * 2);background:var(--c-board-press);color:var(--c-ink);text-decoration:underline;text-decoration-thickness:calc(var(--bw-talk) * 1.5);text-underline-offset:0.3em}#app-calendar .choice.yes{border-color:var(--c-accent)}
#app-calendar .cal-grid .choice[aria-current]{border-style:dashed}
#app-calendar h3,#app-calendar h4{font-size:var(--fs-title);margin:var(--gutter) 0 0.25rem}
#app-calendar label,#app-calendar p{font-size:var(--fs-sheet)}#cal-status:empty{margin:0}
#app-calendar mark.changed{background:var(--c-mark);color:var(--c-on-mark);border-radius:var(--r-cell);padding:0 0.25rem}
.cal-fly{position:fixed;z-index:20;pointer-events:none;padding:var(--pad-tile);border-radius:var(--r-btn);background:var(--c-accent);color:var(--c-on-accent);font-weight:700;font-size:var(--fs-sheet);white-space:nowrap}
#app-calendar input{box-sizing:border-box;width:100%;padding:0 var(--gutter);min-height:var(--h-link);font:inherit;font-size:var(--fs-sheet);background:var(--c-board);color:var(--c-ink);border:var(--bw-talk) solid var(--c-ink);border-radius:var(--r-btn)}` });
    root.append(style, el('h2', { id: 'calendar-h', textContent: 'Calendar' }),
      el('p', { id: 'cal-status' }),
      el('div', { className: 'choices' },
        btn('cal-next', "What's next", () => { const n = nextOf(events); open = n?.id ?? null; adding = picking = inviting = false; clash = null;
          if (n) shown = n.day; status = n ? '' : 'Nothing else this week.'; render(n ? 'cal-ev-h' : 'cal-status'); }),
        btn('cal-add', 'Add an event', () => { adding = true; open = null; picking = inviting = false; clash = null; status = ''; render('cal-add-h'); })),
      el('div', { id: 'cal-days', className: 'cal-grid', role: 'group', 'aria-label': 'Days' }),
      el('div', { id: 'cal-body' }));
    events = ((await kv.get('events')) || []).map((e) => ({ ...e, date: e.date || dateForDay(e.day) })).sort(order);
    render();
  },

  read() {
    const e = ev();
    const s = status ? `${status} ` : '';
    if (adding) return `${s}Add an event: what, day and time, then Save.`;
    if (e && clash) return clashLine(clash, e);
    if (e && picking) return `${s}Moving ${e.title}. Pick a day.`;
    if (e && inviting) return `${s}Who should I invite to ${e.title}?`;
    if (e) return `${s}${e.title}, ${e.day} at ${spoken(e.time)}${e.with ? `, with ${e.with}` : ''}.${e.invited.length ? ` Invited: ${e.invited.join(', ')}.` : ''}`;
    return `${s}${dayLine(events, shown)}`;
  },
  place() {
    const e = ev();
    if (adding) return { where: 'Calendar, adding an event', item: 'what', next: 'add' };
    if (e) return { where: e.title, item: `${e.day} at ${spoken(e.time)}`, next: clash || picking ? 'move' : e.with && !e.invited.includes(e.with) ? 'invite' : 'move' };
    const on = events.filter((x) => x.day === shown);
    return { where: `Calendar, ${shown}`, item: on[0]?.title, n: on.length ? 1 : undefined, of: on.length || undefined, next: on.length ? 'move' : 'add' };
  },
  state() {
    return {
      today: TODAY, now: NOW, days: DAYS.slice(), shown, open, picking, clash: clash && { day: clash.day, time: clash.time, with: clash.with.map((x) => x.id) },
      adding, inviting, events: events.map((e) => ({ ...e, invited: e.invited.slice() })), next: nextOf(events)?.id ?? null,
      lastMoved: lastMoved && { ...lastMoved }, lastAdded, lastInvite: lastInvite && { ...lastInvite },
    };
  },
  async seed() {
    if (!events.length && (await kv.get('events')) === undefined) events = SEED.map((e) => ({ ...e, invited: [] })); // a cleared calendar stays empty
    await kv.set('events', events);
    render();
  },
  async reset() {
    events = []; shown = TODAY; open = null; picking = adding = inviting = false; clash = null;
    lastMoved = lastAdded = lastInvite = null; status = ''; before = null;
    draft = { title: '', day: '', time: '', to: '', who: '' };
    await kv.set('events', undefined);
    await this.seed();
  },

  actions: {
    whatsOn: {
      describe: "Say what's on today, or on a named day this week",
      say: "what's on today",   // what a person would say (offer.js)
      doing: 'Reading your day',
      hint: 'The days are buttons under the heading. Pick one to hear it.',
      params: { type: 'object', properties: { day: dayParam } },
      async run(p, ctx) {
        const d = dayOf(p.day);
        if (!d) throw new Error(`I don't know the day ${p.day}.`);
        await ctx.tap($(`cal-day-${d}`));
        await ctx.say(dayLine(events, d));
      },
      verify(s, p) {
        const d = dayOf(p.day, s.today);
        return (s.shown === d && s.open === null && !s.adding) || `Calendar shows ${s.shown}, not ${d}.`;
      },
      more: (s, p) => moreLine(s.events, dayOf(p.day, s.today)),
    },
    next: {
      describe: "Say what's next in the calendar",
      say: "what's next",
      doing: "Finding what's next",
      hint: "What's next is the first button under the heading.",
      params: { type: 'object', properties: {} },
      async run(p, ctx) {
        await ctx.tap($('cal-next'));
        const e = ev();
        await ctx.say(e ? `Next is ${e.title}, ${e.day} at ${spoken(e.time)}.` : 'Nothing else this week.');
      },
      verify: (s) => s.open === s.next || "Calendar didn't open what's next.",
      more: (s) => { const e = s.events.find((x) => x.id === s.next); return e ? moreLine(s.events, e.day) : moreLine(s.events, s.today); },
    },
    add: {
      describe: 'Add an event to the calendar',
      say: 'add an event on Friday',
      doing: 'Adding to your calendar',
      hint: 'Add an event is the second button under the heading. Fill in what, day and time, then Save.',
      params: {
        type: 'object',
        properties: { title: { type: 'string', description: 'What it is, like Coffee with Ana' }, day: dayParam,
          time: { type: 'string', description: 'The time, like 10am or 14:30' } },
        required: ['title', 'day', 'time'],
      },
      async run(p, ctx) {
        await ctx.tap($('cal-add'));
        for (const [id, v] of [['cal-what', p.title], ['cal-when-day', p.day], ['cal-when-time', p.time]]) { await ctx.tap($(id)); await ctx.type($(id), v); }
        await ctx.tap($('cal-save'));
        if (adding) throw new Error(status || "It didn't save.");
        await ctx.say(status);
      },
      verify(s, p) {
        const e = s.events.find((x) => x.id === s.lastAdded);
        return (e && e.title === p.title.trim() && e.day === dayOf(p.day, s.today) && e.date === eventDate(p.day) && e.time === timeOf(p.time)) || "The event isn't in the calendar.";
      },
    },
    move: {
      describe: 'Move an event to another day, and optionally another time',
      say: 'move lunch to Wednesday',
      doing: 'Moving an event',
      hint: 'Open the event, then Move is the second button, then pick the day',
      params: {
        type: 'object',
        properties: { event: { type: 'string', description: 'The event as the person said it, like lunch with Mum' }, day: dayParam,
          time: { type: 'string', description: 'A new time, only if the person said one' } },
        required: ['event', 'day'],
      },
      async run(p, ctx) {
        const to = dayOf(p.day), date = eventDate(p.day);
        if (!to) throw new Error(`I don't know the day ${p.day}.`);
        if (!date) throw new Error(`I don't know the date ${p.day}.`);
        if (p.time && !timeOf(p.time)) throw new Error(`I don't know the time ${p.time}.`);
        const e = await pickOne(ctx, p.event);
        const time = timeOf(p.time) || e.time;
        if (e.day === to && e.date === date && e.time === time) throw new Error(`${e.title} is already on ${to} at ${spoken(time)}.`);
        before = { id: e.id, day: e.day, date: e.date, time: e.time };
        await openEvent(ctx, e);
        await ctx.tap($('cal-move'));
        targetDate = date;
        try {
          if (p.time) { await ctx.tap($('cal-to-time')); await ctx.type($('cal-to-time'), time); }
          const hit = clashes(events, e.id, to, time, e.mins);
          if (!hit.length) await ctx.say(events.some((x) => x.day === to && x.id !== e.id) ? `${to} at ${spoken(time)} is free.` : `${to}'s free.`);
          await ctx.tap($(`cal-to-${to}`));
          if (clash) {
            const c = await ctx.choose(clashLine(clash, e), [{ label: 'Move anyway' }, { label: `Keep it on ${e.day}` }]);
            if (c?.label !== 'Move anyway') { await ctx.tap($('cal-keep')); throw new Error(`Not moved. ${e.title} stays on ${e.day}.`); }
            await ctx.tap($('cal-anyway'));
          }
          // A statement, never a question: no sheet is open, so a "yes" would go nowhere. "tell Mum" plans the message.
          await ctx.say(e.with ? `Moved to ${to}. To let ${e.with} know, say "tell ${e.with}".` : `Moved to ${to}.`);
        } finally { targetDate = null; }
      },
      verify(s, p) {
        const m = s.lastMoved, d = dayOf(p.day, s.today);
        const e = m && s.events.find((x) => x.id === m.id);
        if (!e || !matches(s.events, p.event).some((x) => x.id === e.id)) return 'Nothing was moved.';
        if (e.day !== d || m.to !== d) return `${e.title} is on ${e.day}, not ${d}.`;
        if (hasDate(p.day) && !eventDate(p.day)) return 'That date is invalid or outside this demo week.';
        const date = eventDate(p.day);
        if (date && e.date !== date) return `${e.title} is on ${e.date}, not ${date}.`;
        return (!p.time || e.time === timeOf(p.time)) || `${e.title} is at ${spoken(e.time)}.`;
      },
      async undo(ctx) {
        if (!before) return;
        const e = events.find((x) => x.id === before.id);
        await openEvent(ctx, e);
        await ctx.tap($('cal-move'));
        await ctx.tap($('cal-to-time')); await ctx.type($('cal-to-time'), before.time);
        targetDate = before.date;
        try { await ctx.tap($(`cal-to-${before.day}`)); } finally { targetDate = null; }
        if (clash) await ctx.tap($('cal-anyway'));
        before = null;
      },
    },
    clear: {
      describe: 'Delete every event in the calendar, after asking',
      doing: 'Clearing your calendar',
      gate: 'delete',
      hint: 'Delete every event is the last button under the day. I ask first.',
      params: { type: 'object', properties: {} },
      readback: (s) => clearLine(s.events.length),
      async run(p, ctx) {
        if (!events.length) throw new Error(clearLine(0));
        if (open || adding) await ctx.tap($(`cal-day-${shown}`));
        clearing = null;
        await ctx.tap($('cal-clear'));
        if (!(await clearing)) throw new Error(status || 'Nothing deleted.');
        await ctx.say(status);
      },
      verify: (s) => s.events.length === 0 || 'Some events are still there.',
      done: () => '', // it already said how many went
    },
    invite: {
      describe: 'Send someone an invite to an event, or tell them its new time',
      say: 'invite Sam to lunch',
      doing: 'Sending an invite',
      gate: 'send',
      hint: 'Open the event, then Invite is the third button. Say who, then Send invite.',
      params: {
        type: 'object',
        properties: { event: { type: 'string', description: 'The event as the person said it' }, who: { type: 'string', description: 'Who gets the invite, like Mum' } },
        required: ['event', 'who'],
      },
      readback(s, p) {
        const e = matches(s.events, p.event)[0];
        return e ? inviteLine(e, p.who) : `There's nothing called ${p.event} this week.`;
      },
      async run(p, ctx) {
        const e = matches(events, p.event)[0]; // the same event the readback named
        if (!e) throw new Error(`There's nothing called ${p.event} this week.`);
        await openEvent(ctx, e);
        await ctx.tap($('cal-invite'));
        await ctx.tap($('cal-who')); await ctx.type($('cal-who'), p.who);
        await ctx.tap($('cal-send'));
      },
      verify(s, p) {
        const e = matches(s.events, p.event)[0], i = s.lastInvite, who = String(p.who).trim().toLowerCase();
        return (e && i && i.id === e.id && i.who.toLowerCase() === who && e.invited.some((w) => w.toLowerCase() === who)) || "The invite didn't send.";
      },
    },
  },
};
export default app;
