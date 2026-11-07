// Mine: your saved workflows, read in plain words. Pure; tested in test/apps-mine.test.js.
// The agent layer saves workflows (toolkit saveSkill); Mine shows, explains, runs and deletes them.
// A workflow here: { name, steps: [{ app, action, params }] }.

export const SEED = () => [
  { name: 'My morning', steps: [
    { app: 'calendar', action: 'whatsOn', params: {} },
    { app: 'messages', action: 'openChat', params: { id: 'mum' } },
    { app: 'messages', action: 'read', params: {} },
  ] },
];

export const fresh = (workflows = SEED()) => ({ workflows, selected: null, explained: null, lastRun: null });

const norm = (t) => String(t || '').trim().toLowerCase().replace(/^(my|the)\s+/, '');
export const find = (s, name) => s.workflows.find((w) => norm(w.name) === norm(name)) || null;

const NAMES = { mum: 'Mum', sam: 'Sam', samira: 'Samira' };
const who = (p) => (p.who === '$who' ? 'someone' : NAMES[p.id] || p.who || 'the chat');
const WORDS = {
  'messages.openChat': (p) => `open ${who(p)}'s chat`,
  'messages.read': () => 'read the new message',
  'messages.reply': (p) => `write "${p.text}"`,
  'messages.replace': (p) => `change ${p.from} to ${p.to}`,
  'messages.send': () => 'send it, after I ask you',
  'writer.openChapter': (p) => `open chapter ${p.n}`,
  'writer.readLastPage': () => 'read the last page of your book',
  'writer.where': () => 'say where you are',
  'writer.carryOn': () => 'carry on reading',
  'writer.dictate': (p) => `write down "${p.text}"`,
  'writer.change': (p) => `change ${p.from} to ${p.to}`,
  'writer.newChapter': (p) => (p.title ? `start a chapter called ${p.title}` : 'start a new chapter'),
  'calendar.whatsOn': (p) => `say what's on ${p.day || 'today'}`,
  'calendar.add': (p) => `add ${p.title} on ${p.day} at ${p.time}`,
  'calendar.move': (p) => `move ${p.what || 'the plan'} to ${p.to}`,
  'calendar.invite': (p) => `invite ${p.who}, after I ask you`,
};

/** One step in plain words. Unknown steps fall back to the action's own describe, lower-cased. */
export function stepWords(step, describe) {
  const f = WORDS[`${step.app}.${step.action}`];
  if (f) return f(step.params || {});
  return (describe || `${step.action} in ${step.app}`).replace(/^\w/, (c) => c.toLowerCase());
}

/** "My morning: say what's on today, then open Mum's chat, then read the new message." */
export function explain(w, describeOf = () => '') {
  if (!w.steps.length) return `${w.name} has no steps yet.`;
  return `${w.name}: ${w.steps.map((st) => stepWords(st, describeOf(st))).join(', then ')}.`;
}

export const gated = (w, gateOf = () => null) => w.steps.some((st) => gateOf(st) || /^(send|invite|pay|call|delete)$/.test(st.action));

export function read(s) {
  if (!s.workflows.length) return 'Mine. Nothing saved yet. Do something once, then say "save that as" and a name.';
  return `Mine, ${s.workflows.length} saved: ${s.workflows.map((w) => w.name).join(', ')}.`;
}

export function place(s) {
  const i = s.workflows.findIndex((w) => w.name === s.selected);
  return { where: 'Mine', item: i >= 0 ? s.workflows[i].name : 'your workflows', n: i + 1, of: s.workflows.length, next: i >= 0 ? 'run' : 'explain' };
}

export function remove(s, name) {
  const w = find(s, name);
  if (!w) return false;
  s.workflows = s.workflows.filter((x) => x !== w);
  if (s.selected === w.name) s.selected = null;
  return true;
}
