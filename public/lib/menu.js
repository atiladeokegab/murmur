// Menu ranking from the Librarian's episodic log. Pure: same code in the browser and in tests.
// Each log entry the app writes: { t, type, weight, data: { tile, via } }.

const DAY = 86400000;
const PARTS = [[5, 'morning'], [12, 'afternoon'], [17, 'evening'], [22, 'night']];

export function daypart(date) {
  const h = date.getHours();
  let part = 'night';
  for (const [from, name] of PARTS) if (h >= from) part = name;
  return h < 5 ? 'night' : part;
}

export const dayKey = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

const plural = (part) => (part === 'night' ? 'nights' : part + 's');
const recent = (entries, now) => entries.filter((e) => e.data && e.data.tile && now - e.t < 7 * DAY && e.t <= now);

function score(entries, id, now) {
  const part = daypart(new Date(now));
  let s = 0;
  for (const e of entries) {
    if (e.data.tile !== id) continue;
    const age = (now - e.t) / DAY;
    s += (e.weight || 1) * 0.5 ** (age / 7) * (daypart(new Date(e.t)) === part ? 3 : 1);
  }
  return s;
}

/** How many separate days in the last week this tile was used in this daypart. */
function daysUsed(entries, id, now) {
  const part = daypart(new Date(now));
  const days = new Set();
  for (const e of recent(entries, now)) {
    if (e.data.tile === id && daypart(new Date(e.t)) === part) days.add(dayKey(new Date(e.t)));
  }
  return days.size;
}

/** Usual time of day as "HH:MM" (median of this daypart's uses), or '' when there is no habit yet. */
export function usualTime(entries, id, now) {
  const part = daypart(new Date(now));
  const mins = recent(entries, now)
    .filter((e) => e.data.tile === id && daypart(new Date(e.t)) === part)
    .map((e) => { const d = new Date(e.t); return d.getHours() * 60 + d.getMinutes(); })
    .sort((a, b) => a - b);
  if (mins.length < 2) return '';
  const m = mins[Math.floor(mins.length / 2)];
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function reason(entries, id, now, starter) {
  const n = daysUsed(entries, id, now);
  const part = daypart(new Date(now));
  if (n >= 4) return `You do this most ${plural(part)}`;
  if (n >= 2) return `You did this ${n} ${plural(part)} this week`;
  return starter;
}

/** Order the menu: highest score first; ties keep the given order. The first is Now. */
export function rankMenu(entries, menuIds, now) {
  return menuIds
    .map((id, i) => ({ id, i, s: score(entries, id, now) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.id);
}

/** Tiles that moved up between two orders, with how far. */
export function movedUp(prev, next) {
  return next
    .map((id, i) => ({ id, by: prev.indexOf(id) - i }))
    .filter((m) => prev.includes(m.id) && m.by > 0);
}

/**
 * The menu only re-orders once a day (on the first open of a new day), never while on screen.
 * state: { day, order } or null. Returns { state, moved } where moved lists tiles that went up.
 */
export function dailyMenu(state, entries, menuIds, now, { force = false } = {}) {
  const day = dayKey(new Date(now));
  const kept = state && state.order ? state.order.filter((id) => menuIds.includes(id)) : [];
  const order = [...kept, ...menuIds.filter((id) => !kept.includes(id))];
  if (state && state.day === day && !force) return { state: { day, order }, moved: [] };
  const next = rankMenu(entries, order, now);
  return { state: { day, order: next }, moved: state ? movedUp(order, next) : [] };
}

/**
 * Habits worth a tile: something done by voice on 3+ days this week that is not on the menu yet.
 * catalogue: tiles with { id, habit }; skip: ids already on the menu, declined or snoozed.
 */
export function proposals(entries, catalogue, skip, now) {
  const out = [];
  for (const t of catalogue) {
    if (!t.habit || skip.includes(t.id)) continue;
    const byPart = {};
    for (const e of recent(entries, now)) {
      if (e.data.tile !== t.id) continue;
      const p = daypart(new Date(e.t));
      (byPart[p] ||= new Set()).add(dayKey(new Date(e.t)));
    }
    const [part, days] = Object.entries(byPart).sort((a, b) => b[1].size - a[1].size)[0] || [];
    if (days && days.size >= 3) out.push({ id: t.id, text: `You ${t.habit} most ${plural(part)}. Add a tile?` });
  }
  return out;
}

/**
 * A week of invented use ending yesterday, shaped around the current time so the demo works at any hour:
 * notes stay first, Order beans climbs (the last three days at this hour), weather becomes a proposal.
 */
export function seedWeek(now) {
  // Centre the week on now's time of day, kept 15 minutes inside its daypart so no entry crosses into another.
  const d0 = new Date(now);
  const m = d0.getHours() * 60 + d0.getMinutes();
  const [lo, hi] = m < 300 ? [0, 300] : m >= 1320 ? [1320, 1440] : PARTS.reduce((r, [h], i) =>
    (m >= h * 60 ? [h * 60, (PARTS[i + 1] ? PARTS[i + 1][0] : 24) * 60] : r), [300, 720]);
  const base = now + (Math.min(Math.max(m, lo + 15), hi - 15) - m) * 60000;
  const out = [];
  const at = (daysAgo, minutes, tile, via = 'tile') =>
    out.push({ t: base - daysAgo * DAY + minutes * 60000, type: 'saved-action', weight: 3, data: { tile, via } });
  for (let d = 7; d >= 1; d--) {
    at(d, -8, 'notes'); at(d, -6, 'notes');
    if (d !== 4) at(d, 4, 'mum');
    if (d <= 3) { at(d, 9, 'beans'); at(d, 11, 'beans'); }
    if (d % 2) at(d, 12, 'bus');
    if (d >= 2 && d <= 6) at(d, -12, 'weather', 'talk');
  }
  return out;
}
