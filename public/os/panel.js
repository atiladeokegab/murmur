// The work panel's model: bus events in, what the panel shows out. Pure, so the order of a task is testable.
export const IDLE = Object.freeze({ on: false, place: '', step: '', n: 0, of: 0, lines: [], ticks: [], done: null, ok: null });

/** "Mum's chat · your reply · 2 of 2" from an app's place(). */
export function placeLine(p = {}) {
  return [p.where, p.item, p.n && p.of ? `${p.n} of ${p.of}` : ''].filter(Boolean).join(' · ');
}

export function reduce(s, name, e = {}) {
  switch (name) {
    case 'task:start': return { ...IDLE, on: true, task: e.task, step: 'Starting', place: s.place };
    case 'step:next': return { ...s, step: e.label };
    case 'step:start': return { ...s, step: e.label || s.step, n: e.n, of: e.of };
    case 'step:verified': return { ...s, ticks: [...s.ticks, { label: s.step, ok: true }] };
    case 'step:failed': return { ...s, step: e.reason, ticks: [...s.ticks, { label: s.step, ok: false }] };
    case 'say': return s.on ? { ...s, lines: [...s.lines, e.text] } : s;
    case 'place': return { ...s, place: placeLine(e) };
    case 'task:done': return { ...s, on: false, ok: !!e.ok, step: e.line || (e.ok ? 'Done.' : e.reason || 'Stopped.'),
      done: { line: e.line || (e.ok ? 'Done.' : e.reason || 'Stopped.'), undo: e.undo || null } };
    case 'undo': return { ...s, done: s.done && { ...s.done, undo: null, line: e.ok ? 'Undone.' : "Couldn't undo that." } };
    default: return s;
  }
}
