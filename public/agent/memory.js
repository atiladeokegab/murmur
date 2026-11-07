// Memory (spec §3.4): one Librarian `agent-task` observation per finished task, with the privacy floor:
// app, action names, hour, weekday and success. Never message bodies, note text, amounts or addresses: the
// observation is built from a whitelist, so content cannot reach it even by mistake.
// Proposals are Yes / Not now / Never. "Never" is kept, so that proposal never returns.

// App id -> the toolkit taxonomy category the Librarian keys memory on. Murmur has no finance, health or
// government app; anything unknown is 'other'.
const CATEGORY = { messages: 'social', writer: 'productivity', notes: 'productivity', calendar: 'productivity', mine: 'productivity',
  shop: 'shopping', transit: 'reference', travel: 'reference' };
const SAFE_NAME = /^[a-z][a-z0-9_]*(__[a-zA-Z0-9_]+)?$/;
export const JUST_DO_IT_AFTER = 3;

/** The observation for a finished task. Only these fields, only these shapes. */
export function observationOf({ apps = [], actions = [], success = false }, now = new Date()) {
  const app = String(apps[0] || 'board');
  const names = actions.map(String).filter((a) => SAFE_NAME.test(a)).slice(0, 12);
  return {
    type: 'agent-task',
    origin: app,
    category: CATEGORY[app] || 'other',
    text: '',
    data: { task: `${app}: ${names.map((n) => n.split('__').pop()).join(', ')}`, app, actions: names,
      hour: now.getHours(), weekday: now.getDay(), success: !!success },
  };
}

/**
 * Wire memory to the bus. Logs on task:done, emits `memory` events for the inside view, and drafts the
 * "Just do it" proposal after three identical runs.
 * @param {{ librarian, bus, kv?, clock? }} o  kv: { get(k), set(k,v) } for Murmur's own proposal counts
 */
export function attachMemory({ librarian, bus, kv = mapKV(), clock = { now: () => Date.now() } }) {
  const off = bus.on('task:done', async (e) => {
    if (!e.actions?.length) return;
    const obs = observationOf(e, new Date(clock.now()));
    let res;
    try { res = await librarian.logObservation(obs); } catch (err) { res = { logged: false, reason: err.message }; }
    bus.emit('memory', { observation: { type: obs.type, category: obs.category, ...obs.data }, logged: !!res?.logged, reason: res?.reason });
    if (e.success && res?.logged) await countRun(obs.data.task);
  });

  async function countRun(task) {
    const counts = (await kv.get('runs')) || {};
    counts[task] = (counts[task] || 0) + 1;
    await kv.set('runs', counts);
    const never = (await kv.get('never')) || [];
    const soon = (await kv.get('notNow')) || {};
    const key = `just-do-it:${task}`;
    if (counts[task] >= JUST_DO_IT_AFTER && !never.includes(key) && !((soon[key] || 0) > clock.now())) {
      bus.emit('memory', { proposal: { id: key, text: 'Want me to just do this one from now on?', options: ['Yes', 'Not now', 'Never'] } });
    }
  }

  return {
    off,
    /** Yes / Not now / Never on any proposal: Murmur's own or the Librarian's. */
    async respond(id, answer) {
      const a = { yes: 'accept', 'not now': 'declineOnce', never: 'suppress' }[String(answer).toLowerCase()];
      if (!a) return { ok: false };
      if (String(id).startsWith('just-do-it:')) {
        if (a === 'suppress') await kv.set('never', [...new Set([...((await kv.get('never')) || []), id])]);
        if (a === 'declineOnce') await kv.set('notNow', { ...((await kv.get('notNow')) || {}), [id]: clock.now() + 86400000 });
        if (a === 'accept') await kv.set('justDoIt', [...new Set([...((await kv.get('justDoIt')) || []), id.slice(11)])]);
        bus.emit('memory', { response: { id, answer: a } });
        return { ok: true, justDoIt: a === 'accept' };
      }
      const r = await librarian.respondToProposal(id, a);
      bus.emit('memory', { response: { id, answer: a } });
      return r;
    },
    /** Tasks the person said "just do it" to. */
    async justDoIt(task) { return ((await kv.get('justDoIt')) || []).includes(task); },
    /** "What do you know about me?" in plain words, from the log itself. */
    async recall() {
      const log = await librarian.recentObservations?.() ?? null;
      const counts = (await kv.get('runs')) || {};
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (!top.length) return log?.length ? 'Only which apps you used, and when. Nothing you wrote.' : 'Nothing yet.';
      return `Only what you did, never what you wrote: ${top.map(([t, n]) => `${t.split(':')[0]} ${n} time${n > 1 ? 's' : ''}`).join(', ')}.`;
    },
    stopLearning: (paused = true) => librarian.setMemoryPaused(paused),
  };
}

function mapKV() {
  const m = new Map();
  return { async get(k) { return m.get(k); }, async set(k, v) { m.set(k, v); } };
}
