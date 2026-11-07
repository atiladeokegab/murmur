// The board's day (spec §3.4 and the demo's "next morning" beat). Day 1 after a reset. Next morning moves to
// day 2 with a seeded week of history, and the habit in it becomes one proposal: "You check the bus first most
// mornings. Put the bus first?". It proposes and never acts. The tile moves only on a yes, and it carries "UP"
// for that day. The history holds app ids and nothing else, so no content can reach it (the privacy floor).

export const HABIT = { app: 'transit', text: 'You check the bus first most mornings. Put the bus first?' };
// A week of invented mornings: which apps were opened, in order. The bus comes first on 5 of 7.
export const WEEK = [
  ['transit', 'messages', 'calendar'], ['transit', 'messages'], ['messages', 'transit'], ['transit', 'calendar'],
  ['transit', 'messages'], ['writer', 'transit'], ['transit', 'messages', 'calendar'],
];
const MOST = 4; // "most mornings": first on at least 4 of the 7
const fresh = () => ({ day: 1, order: null, week: [], proposal: null, up: [], never: [] });
const spoken = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`; };

/**
 * @param {object} o
 * @param {object} o.kv        { get(k), set(k, v) }, all async: the board's own area (os.board)
 * @param {object} o.registry  list() and get(id): the mounted apps
 * @param {object} o.bus       emits `memory` { proposal } and { response }
 */
export function createDay({ kv, registry, bus }) {
  let s = fresh();
  const ids = () => registry.list().map((a) => a.id);
  const save = () => kv.set('board', s);

  /** How many mornings in the history began with this app. */
  const firstOn = (app) => s.week.filter((m) => m[0] === app).length;

  function propose() {
    const app = HABIT.app, id = `first:${app}`;
    if (!registry.get(app) || s.never.includes(id) || order()[0] === app || firstOn(app) < MOST) return null;
    s.proposal = { id, app, text: HABIT.text, options: ['Yes', 'Not now', 'Never'] };
    bus.emit('memory', { proposal: { ...s.proposal, options: s.proposal.options.slice() } });
    return s.proposal;
  }

  /** The board order: the saved order, with any app it doesn't know yet added in registry order. */
  function order() {
    const all = ids(), kept = (s.order || []).filter((id) => all.includes(id));
    return [...kept, ...all.filter((id) => !kept.includes(id))];
  }

  return {
    /** Loads the saved day; call once at boot, before the first render. */
    async load() { s = { ...fresh(), ...((await kv.get('board')) || {}) }; return this; },
    get day() { return s.day; },
    get proposal() { return s.proposal && { ...s.proposal }; },
    get up() { return s.up.slice(); },
    order,
    /** The registered apps in board order, for the shell's tiles. */
    apps() { return order().map((id) => registry.get(id)); },

    /** Day 1: every app back to its seed, the board back to its first order, no history, no proposal. */
    async reset() {
      for (const app of registry.list()) await app.reset();
      s = fresh();
      await save();
    },

    /** Day 2 and on: a seeded week of history, and the proposal it earns (or null). */
    async nextMorning() {
      s.day += 1;
      s.week = WEEK.map((m) => m.slice());
      s.up = []; s.proposal = null; // "UP" lasts a day
      const p = propose();
      await save();
      return p && { ...p };
    },

    /** Yes / Not now / Never to the open proposal. Only yes moves the tile. */
    async respond(answer) {
      const p = s.proposal, a = String(answer).trim().toLowerCase();
      if (!p || !['yes', 'not now', 'never'].includes(a)) return { ok: false };
      if (a === 'yes') { s.order = [p.app, ...order().filter((id) => id !== p.app)]; s.up = [p.app]; }
      if (a === 'never') s.never.push(p.id);
      s.proposal = null;
      bus.emit('memory', { response: { id: p.id, answer: a } });
      await save();
      return { ok: true, moved: a === 'yes', order: order() };
    },

    /**
     * The board's Now line for one app, or null: { title, why }. Calendar gives the next event, Messages the unread.
     * The shell's tilesNow can call this before the app's own now().
     */
    lineFor(id) {
      const app = registry.get(id);
      if (!app) return null;
      const st = app.state();
      if (id === 'calendar') {
        const e = st.events?.find((x) => x.id === st.next);
        return e ? { title: e.title, why: `${e.day} at ${spoken(e.time)}` } : null;
      }
      if (id === 'messages') {
        const news = (st.chats || []).filter((c) => c.unread);
        if (!news.length) return null;
        const c = news[0], last = c.messages.filter((m) => m.from === 'them').at(-1);
        const n = news.reduce((k, x) => k + x.unread, 0);
        return { title: `${n} new message${n === 1 ? '' : 's'}`, why: `${c.name}: ${last?.text ?? ''}`.trim() };
      }
      return null;
    },
    /** Every Now line for today, in board order: [{ app, title, why }]. */
    now() { return order().map((id) => ({ app: id, ...this.lineFor(id) })).filter((x) => x.title); },
  };
}
