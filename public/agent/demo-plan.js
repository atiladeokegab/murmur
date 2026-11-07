// The demo provider: utterance to plan, offline and deterministic (spec §3.1, the first fallback).
// It speaks in slots (who, text, from, to, ...) and fills each action's real params from its JSON schema,
// so it keeps working when an app renames a param. Plans come back in the planner's shape:
//   { kind: 'task' | 'teach' | 'refuse' | 'unknown', plan: [{ tool, params }], say? }

import { SEP } from './plan.js';

const SYN = {
  who: ['name', 'contact', 'who', 'person', 'chat', 'to', 'with'],
  text: ['text', 'body', 'message', 'draft', 'content', 'reply'],
  from: ['from', 'find', 'old', 'word', 'target', 'search'],
  to: ['to', 'replacement', 'new', 'with', 'by', 'replace'],
  event: ['event', 'title', 'what', 'meeting', 'name'],
  day: ['day', 'date', 'when', 'to', 'newday', 'newdate'],
  item: ['item', 'what', 'product', 'name'],
  place: ['place', 'destination', 'to', 'where', 'name'],
  origin: ['from', 'origin'],
  flight: ['flight', 'time', 'id', 'which'],
};

const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
const sentence = (s) => cap(s.trim().replace(/^(that|saying|to say)\s+/i, '').replace(/^to\s+/i, '')).replace(/([^.!?])$/, '$1.');
const name = (s) => cap(s.replace(/'s$/i, ''));

function findAction(app, names) {
  if (!app) return null;
  const lc = (s) => s.toLowerCase();
  for (const n of names) { const x = app.actions.find((a) => lc(a.name) === lc(n)); if (x) return x; }
  for (const n of names) { const x = app.actions.find((a) => lc(a.name).includes(lc(n))); if (x) return x; }
  return null;
}

function fill(action, slots) {
  if (!action) return { ...slots };
  const props = Object.keys(action.params?.properties || {});
  const params = {}, used = new Set();
  for (const p of props) {
    const s = Object.keys(slots).find((k) => !used.has(k) && (SYN[k] || [k]).includes(p.toLowerCase()));
    if (s) { params[p] = slots[s]; used.add(s); }
  }
  const left = Object.keys(slots).filter((k) => !used.has(k));
  const free = props.filter((p) => !(p in params) && action.params.properties[p].type === 'string');
  if (left.length === 1 && free.length === 1) params[free[0]] = slots[left[0]];
  return params;
}

function make(apps) {
  const appBy = (id) => apps.find((a) => a.id === id);
  // A step in `appId`, picking the first action that exists among `names`. Missing ones stay named so the
  // validator drops them in the app's own words instead of this file guessing.
  return (appId, names, slots = {}) => {
    const x = findAction(appBy(appId), names);
    return { tool: `${appId}${SEP}${x ? x.name : names[0]}`, params: fill(x, slots) };
  };
}

const DAY = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)';
const NO_GO = /\b(bank|banking|balance|transfer (money|funds)|account number|sort code|overdraft|doctor|gp|prescription|medication|diagnos\w*|nhs|benefits|universal credit|tax return|hmrc|passport|driving licence|council tax)\b/i;

/**
 * @param {string} utterance  what was said, after the reserved words came off
 * @param {Array} apps        describeRegistry(registry)
 * @param {{ app?: string, workflows?: string[] }} context  the open app, saved tile names
 */
export function demoPlan(utterance, apps, context = {}) {
  // "Do it: move lunch to Wednesday" after a teach offer is the instruction itself.
  const t = String(utterance || '').trim().replace(/[.!?]+$/, '').replace(/^(?:yes,?\s+)?(?:just\s+)?do it[:,.]?\s+(?=\S)/i, '');
  const step = make(apps);
  const here = context.app && apps.some((a) => a.id === context.app) ? context.app : null;
  let m;
  if (!t) return { kind: 'unknown', plan: [], say: 'Sorry, again?' };
  if (NO_GO.test(t)) return { kind: 'refuse', plan: [], say: "I don't do banking, health or government. Those stay with you." };

  if ((m = t.match(/^how (?:do|can|would|should) i\s+(.+)$/i))) {
    const inner = demoPlan(m[1], apps, context);
    return inner.kind === 'task' ? { kind: 'teach', plan: inner.plan } : inner;
  }
  if ((m = t.match(/^save (?:that|this|it) as\s+(.+)$/i))) {
    return task([{ tool: 'save_workflow', params: { name: cap(m[1]), slot: /\b(someone|somebody|anyone|a person)\b/i.test(m[1]) } }]);
  }
  if ((m = t.match(/^what'?s in\s+(.+)$/i)) || (m = t.match(/^what does\s+(.+?)\s+do$/i))) return task([{ tool: 'explain', params: { name: m[1] } }]);
  if ((m = t.match(/^(?:change|edit)\s+(.+?)[:,]?\s+(?:drop|remove|take out|skip)\s+(?:the\s+)?(.+)$/i))) {
    return task([{ tool: 'edit_workflow', params: { name: m[1], drop: m[2] } }]);
  }
  if ((m = t.match(/^(?:run|start|do)\s+(.+)$/i)) && isWorkflow(m[1], context)) return task([{ tool: 'run_workflow', params: { name: m[1] } }]);
  if (/what do you (know|remember) about me/i.test(t)) return task([{ tool: 'recall', params: {} }]);

  // Messages
  if ((m = t.match(/^(?:send|text)\s+(\w+)\s+a\s+(?:message|text|note)\s+(?:saying|that|to say)?\s*(.+)$/i)) ||
      (m = t.match(/^(?:send|write)\s+(?:a\s+)?(?:message|text|note)\s+to\s+(\w+)\s+(?:saying|that|to say)?\s*(.+)$/i)) ||
      (m = t.match(/^(?:text|message|msg|tell|send)\s+(?!it\b|that\b)(\w+(?:'s)?)\s+(.{2,})$/i))) {
    return task([step('messages', ['openChat', 'open'], { who: name(m[1]) }),
      step('messages', ['reply', 'draft', 'write'], { text: sentence(m[2]) }),
      step('messages', ['send'])]);
  }
  if ((m = t.match(/^read\s+(\w+)'s\s+(?:message|messages|text|chat)$/i)) || (m = t.match(/^what did\s+(\w+)\s+(?:say|write)$/i)) ||
      (m = t.match(/^read\s+(?:my\s+)?(?:messages?|texts?)\s+from\s+(\w+)$/i)) || (m = t.match(/^(?:open|show)\s+(\w+)'s\s+chat$/i))) {
    return task([step('messages', ['openChat', 'open'], { who: name(m[1]) }), step('messages', ['read'])]);
  }
  if ((m = t.match(/^(?:reply|answer|respond)(?:\s+with)?[:,]?\s+(.+)$/i))) return task([step('messages', ['reply', 'draft'], { text: sentence(m[1]) })]);
  if (/^send(?: it| that| the reply)?$/i.test(t)) return task([step(here || 'messages', ['send'])]);
  if ((m = t.match(/^(?:call|ring|phone)\s+(\w+)$/i))) return task([step('messages', ['call'], { who: name(m[1]) })]);

  // Calendar (before the generic "change X to Y")
  if ((m = t.match(new RegExp(`^(?:move|change|shift)\\s+(?:my\\s+)?(.+?)\\s+(?:to|until)\\s+${DAY}$`, 'i'))) && !/^(the )?word\b/i.test(m[1]) && (here === 'calendar' || !here || /lunch|meeting|dinner|appointment|call|coffee/i.test(m[1]))) {
    return task([step('calendar', ['move', 'reschedule'], { event: m[1].replace(/^(the|my)\s+/i, ''), day: cap(m[2]) })]);
  }
  if (/^move (?:a|my) (?:meeting|event)$/i.test(t)) return task([step('calendar', ['move', 'reschedule'])]);
  if ((m = t.match(new RegExp(`^what'?s (?:on|happening)(?:\\s+${DAY})?$`, 'i'))) || /^what'?s next$/i.test(t)) {
    return task([step('calendar', ['whatsOn', 'today', 'list', 'next'], m?.[1] ? { day: cap(m[1]) } : {})]);
  }
  if ((m = t.match(new RegExp(`^(?:add|put)\\s+(.+?)\\s+(?:on|for)\\s+${DAY}$`, 'i')))) {
    return task([step('calendar', ['add', 'create'], { event: cap(m[1]), day: cap(m[2]) })]);
  }

  // Edits in whatever app is open: Messages by default.
  if ((m = t.match(/^(?:change|replace|swap)\s+(.+?)\s+(?:to|with|for)\s+(.+)$/i))) {
    return task([step(here === 'writer' ? 'writer' : 'messages', ['replace', 'change', 'edit'], { from: m[1], to: m[2] })]);
  }

  // The Writer
  if (/^read (?:me )?(?:the )?last page$/i.test(t) || /^read (?:me )?(?:my )?(?:book|notes|writing)$/i.test(t)) {
    return task([step('writer', ['readLastPage', 'readLast', 'read'])]);
  }
  if (/^(?:new|start a new) chapter$/i.test(t)) return task([step('writer', ['newChapter', 'chapter'])]);
  if ((m = t.match(/^(?:write|note|take a note|add a note|dictate)[:,]?\s+(.+)$/i))) return task([step('writer', ['dictate', 'write', 'add'], { text: sentence(m[1]) })]);
  if (/^read (?:it|that|this)$/i.test(t)) return task([step(here || 'messages', ['read'])]);

  // Shop
  if (/^(?:order|get|buy)\s+(?:me\s+)?(?:my|the)\s+usual(?:\s+\w+)?$/i.test(t) || /^(?:order|reorder)\s+(?:the\s+)?(?:same|last)(?:\s+again)?$/i.test(t)) {
    return task([step('shop', ['orderUsual', 'usual', 'reorder', 'order']), step('shop', ['pay', 'checkout'])]);
  }
  if ((m = t.match(/^(?:add|put)\s+(?:a\s+|an\s+)?(.+?)\s+(?:to|in)\s+(?:my\s+|the\s+)?basket$/i))) return task([step('shop', ['add', 'addToBasket'], { item: m[1] })]);
  if (/^(?:pay|check ?out)$/i.test(t)) return task([step('shop', ['pay', 'checkout'])]);
  if (/^(?:track|where'?s) my order$/i.test(t)) return task([step('shop', ['track'])]);

  // Transit
  if (/\b(?:next|when'?s the|when is the)\s+bus\b/i.test(t) || /^bus to work$/i.test(t)) return task([step('transit', ['nextBus', 'next', 'bus'])]);
  if ((m = t.match(/^(?:directions|take me|how do i get|get me|get)\s+(?:to\s+)?(?:the\s+)?(.+)$/i))) return task([step('transit', ['directions', 'route'], { place: m[1] })]);
  if (/when (?:should|do) i leave/i.test(t)) return task([step('transit', ['whenToLeave', 'leave'])]);

  // Travel
  if ((m = t.match(/^(?:find|search|look for)\s+(?:me\s+)?(?:a\s+)?flights?\s+(?:from\s+(\w+)\s+)?to\s+(\w+)/i))) {
    return task([step('travel', ['findFlights', 'search', 'find'], m[1] ? { origin: cap(m[1]), place: cap(m[2]) } : { place: cap(m[2]) })]);
  }
  if ((m = t.match(/^(?:book|hold)\s+(?:the\s+)?(.+)$/i))) return task([step('travel', ['hold', 'book', 'pick'], { flight: m[1] })]);

  if ((m = t.match(/^(?:open|go to|show)\s+(?:the\s+|my\s+)?(.+)$/i))) {
    const app = apps.find((a) => [a.id, a.name.toLowerCase(), a.name.toLowerCase().replace(/^the\s+/, '')].includes(m[1].toLowerCase()));
    return app ? task([{ tool: 'open_app', params: { app: app.id } }]) : { kind: 'unknown', plan: [], say: `There's no ${m[1]} on this phone.` };
  }
  if ((m = t.match(/^(?:run|start|do)\s+(.+)$/i))) return task([{ tool: 'run_workflow', params: { name: m[1] } }]);

  const names = apps.slice(0, 3).map((a) => a.name);
  return { kind: 'unknown', plan: [], say: `I can't do that one yet. Try ${names.join(', ') || 'Messages'}.` };
}

const task = (plan) => ({ kind: 'task', plan });
const isWorkflow = (n, ctx) => (ctx.workflows || []).some((w) => w.toLowerCase() === n.toLowerCase().replace(/^my\s+/, 'my ') || w.toLowerCase() === n.toLowerCase());
