// The demo provider: utterance to plan, offline and deterministic (spec §3.1, the first fallback).
// It speaks in slots (who, text, from, to, ...) and fills each action's real params from its JSON schema,
// so it keeps working when an app renames a param. Plans come back in the planner's shape:
//   { kind: 'task' | 'teach' | 'refuse' | 'unknown', plan: [{ tool, params }], say? }
// It covers the demo script (spec §6) and the eval's utterances; anything else is said, never guessed.

import { SEP } from './plan.js';

const SYN = {
  who: ['name', 'contact', 'who', 'person', 'chat', 'to', 'with', 'recipient'],
  text: ['text', 'body', 'message', 'draft', 'content', 'reply'],
  from: ['from', 'find', 'old', 'word', 'target', 'search'],
  to: ['to', 'replacement', 'new', 'with', 'by', 'replace'],
  event: ['event', 'title', 'what', 'meeting', 'name'],
  day: ['day', 'date', 'when', 'to', 'newday', 'newdate'],
  time: ['time', 'at', 'hour'],
  item: ['item', 'what', 'product', 'name'],
  quantity: ['quantity', 'qty', 'count', 'n', 'amount'],
  shop: ['shop', 'store', 'place', 'from', 'at', 'cafe', 'vendor'],
  place: ['place', 'destination', 'to', 'where', 'name'],
  origin: ['from', 'origin'],
  flight: ['flight', 'time', 'id', 'which'],
};
const NUM = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
const name = (s) => cap(s.replace(/'s$/i, ''));
const clean = (s) => s.replace(/^(?:the|my|a)\s+/i, '');

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
  const left = Object.keys(slots).filter((k) => !used.has(k) && typeof slots[k] === 'string');
  const free = props.filter((p) => !(p in params) && action.params.properties[p].type === 'string');
  if (left.length === 1 && free.length === 1) params[free[0]] = slots[left[0]];
  // A time the schema has no field for stays part of the day, so nothing said is lost.
  if (slots.time && !Object.values(params).includes(slots.time) && slots.day && Object.values(params).includes(slots.day)) {
    const k = Object.keys(params).find((p) => params[p] === slots.day);
    params[k] = `${slots.day} at ${slots.time}`;
  }
  for (const [p, d] of Object.entries(action.params?.properties || {})) {
    if (d.type === 'number' || d.type === 'integer') if (typeof params[p] === 'string') params[p] = Number(params[p]) || 1;
  }
  return params;
}

const DAY = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)';
// Real money stays with the person. The phone's own Bank app (invented money) is in scope: its words pass only when
// it is installed (BANK_WORDS), so with no Bank app "bank" and "balance" are still refused.
const NO_GO = /\b(transfer (?:\w+ )?(?:[£€$]|\d+|money|funds|pounds|quid|euros|dollars)|wire (?:\w+ )?(?:[£€$]|\d+|money|funds|cash|pounds|quid|euros|dollars)|iban|account numbers?|sort code|my pin|pin (?:number|code)|card numbers?|online banking|(?:log|sign)(?:ging)? ?in(?:to)? (?:to )?(?:my |an? |the )?(?:\w+ )?(?:account|bank)|between (?:my )?accounts|overdraft|doctor|gp|prescription|medication|diagnos\w*|nhs|benefits|universal credit|tax return|hmrc|passport|driving licence|council tax|savings|mortgage|loan|credit card|pin number|move (?:my |some )?money|barclays|hsbc|lloyds|natwest|santander|monzo|starling|nationwide|halifax|revolut|tsb|metro bank|first direct|virgin money|co-?op bank|american express|amex|paypal|chase (?:bank|account|balance|card|app)|my chase|(?:current|joint|another|other|bank) account|(?:from|to|into) (?:my |an? |the )?accounts?|gbp|usd|eur)\b/i;
const BANK_WORDS = /\b(bank|banking|balance)\b/i;
// Credentials never go, in words or in digits: a sort code (12-34-56, but not a date: "on 07-11-26"), an 8-digit account number, a 13 to 19 digit card, an IBAN.
const CREDENTIALS = /\b(sort code|account numbers?|my pin|pin (?:number|code)|card numbers?|iban|(?<!\b(?:on|date|dated|the)\s+)\d\d-\d\d-\d\d|\d{8}|(?:\d[ -]?){12,18}\d|[a-z]{2}\d\d(?: ?[a-z0-9]{4}){3,7}(?: ?[a-z0-9]{1,3})?)\b/i;
// Money with a money verb is real money unless the phone's own Bank plans it ("Pay Sam 20 pounds"); a message may say it.
const MONEY = /\b(?:wire|transfer|send|pay|give|move)\b.*(?:[£€$]\s*\d|\b(?:pounds?|quid|euros?|dollars?|pence)\b)/i;
// Never stored: a symptom or a diagnosis goes nowhere but a message the person sends.
// Clinical words only, so an idiom ("a pain in the neck", "sick of the rain") is still a note.
const HEALTH = /\b(diagnos\w*|symptoms?|medications?|my condition|\d+ ?mg|diabet\w*|asthma|cancer|tumou?rs?|dementia|epilep\w*|insulin|blood pressure|heart (?:condition|disease)|hiv|hospital appointment)\b/i;
// A second request behind a message: it starts with a verb of its own ("..., then check my Barclays balance").
const REQUEST = /^(?:(?:and|then|also|after that|please)\s+)*(?:check|move|transfer|wire|pay|send|give|log|sign|open|show|tell me|what|how|read|get|book|renew|order|apply|cancel|freeze|close|remember|note|write|save)\b/i;
const REFUSE = { kind: 'refuse', plan: [], say: "I don't do banking, health or government. Those stay with you." };

/** The money, health and government line, whoever plans: the server checks it before the model, too. */
export function refusal(utterance, apps, context = {}) {
  const raw = String(utterance || '').trim();
  const bank = apps.some((a) => a.id === 'bank');
  if (!NO_GO.test(raw) && !CREDENTIALS.test(raw) && !MONEY.test(raw) && !HEALTH.test(raw) && !(BANK_WORDS.test(raw) && !bank)) return null;
  // The words of a message are content, not the request: "Tell Sam: I switched from Monzo" sends. Credentials never go.
  // ... unless a second request rides behind it, after a later sentence or "then", "and", "also":
  // "Text Sam then check my Barclays balance", "Tell Sam: hi. Then check my Barclays balance". The body a colon opens
  // is the message ("Tell Sam: Pay £20 tomorrow."), never a request of its own.
  const later = raw.split(/[.!?]\s+|,?\s+(?:and then|then|after that|and also|also|and)\s+/i).slice(1)
    .some((x) => REQUEST.test(x.trim()) && (NO_GO.test(x) || MONEY.test(x) || HEALTH.test(x)));
  const p = CREDENTIALS.test(raw) || later ? null : plan(raw, apps, context, false);
  if (p?.kind !== 'task') return REFUSE;
  if (p.plan.every((x) => x.tool.startsWith(`messages${SEP}`))) return null;
  // The phone's Bank paying a payee in its own words is invented money; nothing else with money or health goes.
  return bank && !NO_GO.test(raw) && !HEALTH.test(raw) && p.plan.every((x) => x.tool.startsWith(`bank${SEP}`)) ? null : REFUSE;
}
const GARBLED = /\.\.\.|…|\[(?:unintelligible|inaudible|noise)\]|^\W*$/i;

/**
 * @param {string} utterance  what was said, after the reserved words came off
 * @param {Array} apps        describeRegistry(registry)
 * @param {{ app?: string, workflows?: string[] }} context  the open app, saved tile names
 */
export function demoPlan(utterance, apps, context = {}) {
  const raw = String(utterance || '').trim();
  if (!raw) return { kind: 'unknown', plan: [], say: 'Sorry, again?' };
  const no = refusal(raw, apps, context);
  if (no) return no;
  if (GARBLED.test(raw)) return { kind: 'unknown', plan: [], say: "Sorry, I didn't catch that. Again?" };
  const teach = raw.match(/^how (?:do|can|would|should) i\s+(.+?)[?.!]*$/i);
  if (teach) {
    const inner = planOrWords(teach[1], apps, context, true);
    return inner.kind === 'task' ? { kind: 'teach', plan: inner.plan } : inner;
  }
  const whole = planOrWords(raw, apps, context, false);
  if (whole.kind !== 'unknown') return whole;
  // Two requests in one breath: "Add a flat white, then read my basket".
  const parts = raw.split(/,?\s+(?:and then|then|and)\s+|,\s+(?=what|where|read)/i).filter(Boolean);
  if (parts.length > 1) {
    const each = parts.map((p) => planOrWords(p, apps, context, false));
    if (each.every((p) => p.kind === 'task')) return { kind: 'task', plan: each.flatMap((p) => p.plan) };
  }
  return whole;
}

// The hand-written words first (refusal() reads those alone). Where they miss, or name an app this phone does not have ("read my basket" with
// no Shop), any installed app's own action words (its name, say and describe) plan it, so a plug-in plans for free.
function planOrWords(said, apps, context, dry) {
  const r = plan(said, apps, context, dry);
  const missing = r.kind === 'task' && r.plan.some((x) => x.tool.includes(SEP) && !apps.some((a) => a.id === x.tool.split(SEP)[0]));
  if (!missing && !(r.kind === 'unknown' && (r.say?.startsWith(MISS) || r.say?.startsWith(NO_APP)))) return r;
  const t = said.trim().replace(/[.!?]+$/, '');
  // An answer to a slot question ("Where to?" "The station") finishes the ask it answers.
  const again = context.asked && planOrWords(`${context.asked} ${t}`, apps, { ...context, asked: null }, dry);
  let w = byWords(t, apps, context.app);
  // "I don't have X" yields only to the open app's own action ("open a chapter" in Writer), never to a guess elsewhere
  if (w && r.say?.startsWith(NO_APP) && !w.plan.every((x) => x.tool === 'ask' || (x.tool === 'open_app' ? x.params.app : x.tool.split(SEP)[0]) === context.app)) w = null;
  return w || (again?.kind === 'task' ? again : null) || r;
}

const MISS = "I can't do that one yet.", NO_APP = "I don't have";
const STOP = new Set('my the a an to of for in on at it is me please and with from your some what usual'.split(' ')); // "order my usual": the usual one
const stem = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const words = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/'/g, '').split(/[^a-z0-9]+/).filter(Boolean).map(stem);

/** "add milk", "cancel my taxi": the first word said must be the action's verb (its name, or the first word of its say
 * or describe); then the most words in common wins, the open app on a tie. Still tied: "Which one: A or B?". */
export function byWords(t, apps, here) {
  const content = words(t).filter((w) => !STOP.has(w));
  if (!content.length) return null;
  const hits = [];
  // each app's own nouns (its id, name and action names): "delete that message" names Messages, so no other app claims it
  const nouns = new Map(apps.map((a) => [a.id, new Set([...words(a.id), ...words(a.name), ...(a.actions || []).flatMap((x) => words(x.name))])]));
  for (const a of apps) for (const x of a.actions || []) {
    const name = words(x.name), say = words(x.say), all = new Set([...name, ...say, ...words(x.describe), ...words(a.name), ...words(a.id)]);
    if (![...name, say[0], words(x.describe)[0]].includes(content[0])) continue;
    const nums = Object.values(x.params?.properties || {}).some((d) => d.type === 'number' || d.type === 'integer');
    if ((nums && content.some((w) => !all.has(w))) || (x.gate === 'pay' && x.params?.required?.length)) continue; // a spoken number, and money with a slot, stay with the hand-written words
    const n = new Set(content.filter((w) => all.has(w))).size;
    const f = fit(t, x, all), strays = content.filter((w) => !all.has(w));
    if (strays.length && !f.free) continue; // words it has no place for ("next bus", "new paragraph") are not this action
    if (strays.some((w) => apps.some((b) => b.id !== a.id && nouns.get(b.id).has(w)))) continue; // another app's noun
    if (x.gate && content.length > 1 && !content.slice(1).some((w) => all.has(w))) continue; // a gated action needs its own noun, not the verb alone ("delete the last word")
    if (f.gap && Object.keys(f.params).length) continue; // a slot guessed but another still missing ("send Sam 20 quid" as an invite)
    if (n >= 2 || name.includes(content[0]) || say[0] === content[0]) hits.push({ a, x, n, ...f }); // one word alone must be its own verb
  }
  if (!hits.length) return null;
  const top = Math.max(...hits.map((h) => h.n));
  let best = hits.filter((h) => h.n === top);
  if (best.length > 1 && best.some((h) => h.a.id === here)) best = best.filter((h) => h.a.id === here);
  if (best.length > 1 && best.some((h) => !h.gap)) best = best.filter((h) => !h.gap); // "add milk": the Grocer's item, not an event with no day
  if (best.length > 1) {
    const one = (h) => `${h.x.say || h.x.describe.charAt(0).toLowerCase() + h.x.describe.slice(1)} in ${h.a.name}`;
    return { kind: 'unknown', plan: [], say: `Which one: ${best.slice(0, 3).map(one).join(' or ')}?` };
  }
  const { a, x, params, gap } = best[0];
  if (gap) {
    const props = x.params?.properties || {}, question = props[gap]?.description ? `${props[gap].description.replace(/[.?]*$/, '')}?` : `Say it in full, like: ${x.describe.charAt(0).toLowerCase()}${x.describe.slice(1).replace(/[.?]*$/, '')}.`;
    return { kind: 'task', plan: [{ tool: 'open_app', params: { app: a.id } }, { tool: 'ask', params: { question } }], asked: t };
  }
  return { kind: 'task', plan: [{ tool: `${a.id}${SEP}${x.name}`, params }] };
}

// What is left once the action's own words go is its one string slot: "add milk" -> item: milk.
function fit(t, x, all) {
  let left = t.split(/\s+/).filter((w) => !all.has(words(w)[0])).join(' ').replace(/^(?:(?:my|the|a|an|to|for|some|of)\s+)+/i, '').trim();
  if (words(left).every((w) => STOP.has(w)) || /^(?:an?\s+)?(?:item|word|tile|thing|something|one|chapter|event|place|name)$/i.test(left)) left = ''; // "take an item out": which item? ask
  const props = x.params?.properties || {}, need = x.params?.required || [];
  const slot = need.find((k) => props[k]?.type === 'string'); // only a required slot takes free words: "new paragraph" is no chapter title
  const choices = slot && props[slot].enum, said = new Set(words(t));
  const pick = choices?.find((v) => words(v).every((w) => said.has(w))); // "use a dark background": theme dark
  const params = choices ? (pick ? { [slot]: pick } : {}) : left && slot ? { [slot]: left } : {};
  return { params, slot, free: choices ? !!pick : !!(left && slot), gap: need.find((k) => !(k in params)) };
}

function plan(said, apps, context, dry) {
  // Asides that only say what not to do: the plan already does only what was asked.
  let raw = said.trim().replace(/[.,]?\s*(?:don't|do not) (?:book|buy|pay|send) anything\.?$/i, '').replace(/\s+without paying\.?$/i, '');
  raw = raw.replace(/^(?:yes,?\s+)?(?:just\s+)?do it[:,.]?\s+(?=\S)/i, ''); // "Do it: move lunch" after a teach offer
  let here = context.app && apps.some((a) => a.id === context.app) ? context.app : null;
  let m;
  if ((m = raw.match(/^in\s+(?:my\s+)?(?:reply|message|draft|chat)\s+(?:to|with)\s+\w+[,:]?\s+(.+)$/i))) { here = 'messages'; raw = m[1]; }
  else if ((m = raw.match(/^in\s+(?:the\s+)?(writer|messages|notes|calendar|shop)[,:]?\s+(.+)$/i))) { here = m[1].toLowerCase() === 'notes' ? 'writer' : m[1].toLowerCase(); raw = m[2]; }
  let t = raw.replace(/[.!?]+$/, '');
  const tail = raw.slice(t.length);
  // Content keeps the person's own ending: "at three?" stays a question.
  const body = (s) => { const x = cap(s.trim()); return /[.!?]$/.test(x) ? x : x + (t.endsWith(s) ? tail.slice(0, 1) || '.' : '.'); };
  const step = (appId, names, slots = {}) => {
    const x = findAction(apps.find((a) => a.id === appId), names);
    return { tool: `${appId}${SEP}${x ? x.name : names[0]}`, params: fill(x, slots) };
  };
  const task = (p) => ({ kind: 'task', plan: p });

  if ((m = t.match(/^save (?:that|this|it) as\s+(.+)$/i))) {
    return task([{ tool: 'save_workflow', params: { name: cap(m[1]), slot: /\b(someone|somebody|anyone|a person)\b/i.test(m[1]) } }]);
  }
  if ((m = t.match(/^what'?s in\s+(?!(?:my |the )?(?:calendar|diary|basket)\b)(.+)$/i)) || (m = t.match(/^what does\s+(.+?)\s+do$/i))) return task([{ tool: 'explain', params: { name: m[1] } }]);
  if ((m = t.match(/^(?:change|edit)\s+(.+?)[:,]?\s+(?:drop|remove|take out|skip)\s+(?:the\s+)?(.+)$/i))) {
    return task([{ tool: 'edit_workflow', params: { name: m[1], drop: m[2] } }]);
  }
  if ((m = t.match(/^(?:run|start|do)\s+(.+)$/i)) && isWorkflow(m[1], context)) return task([{ tool: 'run_workflow', params: { name: m[1] } }]);
  if (/what (?:do you|does murmur) (?:know|remember) about me|what murmur knows about me/i.test(t)) return task([{ tool: 'recall', params: {} }]);

  // The OS's own verbs
  // Install: "install X", "add X app", or "Add Northline Taxis" (capitalised words: a name, not "a flat white").
  if (((m = t.match(/^(?:install|download)\s+(?:the\s+)?(.+?)(?:\s+app)?$/i)) || (m = t.match(/^(?:add|get(?!\s+rid\b))\s+(?:the\s+)?(.+?)\s+app$/i)) ||
       (m = t.match(/^(?:[Aa]dd|[Gg]et)\s+(?:the\s+)?([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*)+)$/))) && !apps.some((a) => a.name.toLowerCase() === m[1].toLowerCase())) {
    return task([{ tool: 'install_app', params: { name: m[1] } }]);
  }
  if (/^(?:what are |list |say )?(?:my |the )?(?:tiles|routines|workflows)$/i.test(t) || /^what (?:tiles|routines) do i have$/i.test(t)) return task([{ tool: 'list_workflows', params: {} }]);
  if ((m = t.match(/^(?:remove|delete|forget)\s+(?:the\s+|my\s+)?(.+?)(?:\s+(?:tile|routine|workflow))?$/i)) && isWorkflow(m[1], context)) return task([{ tool: 'remove_workflow', params: { name: m[1] } }]);
  if ((m = t.match(/^(?:remove|delete|uninstall|get rid of)\s+(?:the\s+|my\s+)?(.+?)(?:\s+app)?$/i)) && apps.some((a) => a.name.toLowerCase() === m[1].toLowerCase() || a.id === m[1].toLowerCase())) return task([{ tool: 'remove_app', params: { name: m[1] } }]);
  if (/^(?:go |take me |get me |bring me )?(?:back )?(?:home|back to (?:the )?(?:board|home))$|^(?:show|open) (?:the )?(?:board|home)$/i.test(t)) return task([{ tool: 'go_home', params: {} }]);
  if ((m = t.match(/^(?:turn |switch )?(?:the )?(?:sounds?|haptics|vibrations?|sounds? and (?:haptics|vibrations?))\s+(on|off)$/i)) ||
      (m = t.match(/^(?:turn|switch)\s+(on|off)\s+(?:the )?(?:sounds?|haptics|vibrations?)/i))) return task([{ tool: 'sound', params: { on: m[1].toLowerCase() === 'on' } }]);
  if (/^(?:mute|be quiet with the sounds|no (?:more )?sounds)$/i.test(t)) return task([{ tool: 'sound', params: { on: false } }]);
  if (/^undo (?:the )?last (?:thing|change|step)$/i.test(t)) return task([{ tool: 'undo', params: {} }]);

  // Your look: every setting is a step on its visible row.
  if (apps.some((a) => a.id === 'look')) {
    const look = (names, slots) => task([step('look', names, slots)]);
    const cant = /^i can'?t (?:read|see) (?:this|that|it|anything)(?: properly| very well)?[,.]?\s*/i;
    if (cant.test(t) && !t.replace(cant, '')) return look(['textBigger']);
    if (cant.test(t)) t = t.replace(cant, ''); // "I can't read this, make it bigger"
    if (/^(?:make )?(?:it|everything|things) (?:bigger|larger)$|^(?:bigger|larger) (?:writing|letters|words|font)$/i.test(t)) return look(['textBigger']);
    if ((m = t.match(/^(?:set|make)\s+(?:the\s+)?text(?:\s+size)?\s+(?:to\s+)?(\d{3})\s*(?:%|percent)?$/i))) return look(['setText'], { percent: Number(m[1]) });
    // Anchored, so content ("text Sam I'm speeding up", "tell Mum to turn off the light") never changes a setting.
    const TXT = '(?:make |turn |set )?(?:the |my )?(?:text|writing|font|letters|words)(?: size)?';
    const VOX = '(?:make |set )?(?:the |your )?(?:voice|speech|talking)';
    if (new RegExp(`^${TXT} (?:bigger|larger|up)$|^(?:bigger|larger) text$|^zoom in$|^(?:increase|enlarge) ${TXT}$`, 'i').test(t)) return look(['textBigger']);
    if (new RegExp(`^${TXT} (?:smaller|down)$|^smaller text$|^zoom out$|^(?:decrease|reduce|shrink) ${TXT}$`, 'i').test(t)) return look(['textSmaller']);
    if (new RegExp(`^${VOX} (?:faster|quicker)$|^(?:speak|talk) (?:faster|quicker|more quickly)$|^speed up$`, 'i').test(t)) return look(['voiceFaster']);
    if (new RegExp(`^${VOX} slower$|^(?:speak|talk) (?:slower|more slowly)$|^slow down$`, 'i').test(t)) return look(['voiceSlower']);
    if ((m = t.match(/^(?:(?:switch|change|make|use|set|turn|go)(?:\s+(?:it|everything|the|screen|phone|colou?rs?|theme|to|into|on))*\s+)?(yellow on black|yellow|high contrast|dark|light|white|black)(?:\s+(?:mode|theme|colou?rs?))?$/i)) &&
        (/^(?:switch|change|make|use|set|turn|go)\b/i.test(t) || /\s(?:mode|theme|colou?rs?)$|^yellow on black$|^high contrast$/i.test(t))) {
      const c = m[1].toLowerCase(), colours = /yellow|contrast/.test(c) ? 'yellow' : /light|white/.test(c) ? 'light' : 'dark';
      return look(['colours'], { colours });
    }
    if (/^(?:let |use |switch to )?(?:my |the )?(?:screen ?reader|talkback)(?: speak| talk)?$/i.test(t)) return look(['whoSpeaks'], { who: 'reader' });
    if (/^(?:you speak|murmur speaks?|speak (?:to me )?again|talk to me again)$/i.test(t)) return look(['whoSpeaks'], { who: 'murmur' });
    if (/^(?:just do it|do things? (?:for me|without asking)|stop asking)(?: from now on)?$/i.test(t)) return look(['howMuch'], { mode: 'just' });
    if (/^(?:ask me(?: first)?(?: before you do things)?|always ask)$/i.test(t)) return look(['howMuch'], { mode: 'ask' });
    if (/^(?:give me |i want |use )?(?:longer|detailed|more detailed|long) answers$|^(?:tell me|say) more (?:every time|from now on)$/i.test(t)) return look(['answers'], { length: 'detailed' });
    if (/^(?:keep it short|(?:give me |i want |use )?(?:short|shorter|brief) answers|be brief)$/i.test(t)) return look(['answers'], { length: 'short' });
    if (/^teach me(?: (?:from now on|how to do things|instead))?$/i.test(t)) return look(['howMuch'], { mode: 'teach' });
    if (/^(?:stop|pause|turn off) learning$|^don'?t learn\b/i.test(t)) return look(['learning'], { on: false });
    if (/^(?:start|resume|turn on) learning(?: again)?$/i.test(t)) return look(['learning'], { on: true });
    if (/^forget (?:that|it|the first thing)$/i.test(t)) return look(['forget']);
    if (/^(?:open |show )?(?:my |your )?(?:look|settings)$/i.test(t)) return task([{ tool: 'open_app', params: { app: 'look' } }]);
  }

  // Messages. "Draft" stops at the draft; "text", "message", "tell" go on to the send gate.
  const msg = (who, text, send) => {
    const steps = [step('messages', ['openChat', 'open'], { who: name(who) })];
    if (text) steps.push(step('messages', ['reply', 'draft', 'write'], { text: body(text) }));
    else if (dry) steps.push(step('messages', ['reply', 'draft', 'write']));
    else return task([...steps, { tool: 'ask', params: { question: 'What should it say?' } }]);
    if (send) steps.push(step('messages', ['send']));
    return task(steps);
  };
  if ((m = raw.match(/^draft\s+(?:a\s+)?(?:message|text|reply|note)\s+(?:to|for)\s+(\w+)[:,]?\s+([\s\S]+)$/i))) return msg(m[1], m[2], false);
  if ((m = raw.match(/^(?:tell|message|text)\s+(\w+)[:]\s+([\s\S]+)$/i))) return msg(m[1], m[2], true);
  if ((m = t.match(/^(?:send|text)\s+(\w+)\s+a\s+(?:message|text|note)\s+(?:saying|that|to say)?\s*(.+)$/i)) ||
      (m = t.match(/^(?:send|write)\s+(?:a\s+)?(?:message|text|note)\s+to\s+(\w+)\s+(?:saying|that|to say)\s*(.+)$/i))) return msg(m[1], m[2], true);
  // After a Calendar move with someone, a bare "tell Mum" says what moved (the move's done line suggests it).
  if ((m = t.match(/^(?:tell|text|message|let)\s+(\w+)(?:\s+know)?$/i)) && context.moved) return msg(m[1], `${context.moved.what} is now on ${context.moved.day} at ${context.moved.time}.`, true);
  if ((m = t.match(/^(?:send|write)\s+(?:a\s+)?(?:message|text|note)\s+to\s+(\w+)$/i))) return msg(m[1], '', true);
  if ((m = t.match(/^write\s+to\s+(?!(?:my|the|a|an)\b)(\w+)(?:[,:]?\s+(.{2,}))?$/i))) return msg(m[1], m[2] || '', true); // a person, not the Writer
  if ((m = t.match(/^let\s+(\w+)\s+know\s+(?:that\s+)?(.{2,})$/i))) return msg(m[1], m[2], true);
  if (/^(?:read|check|play)\s+(?:me\s+)?(?:my\s+|the\s+)?(?:new\s+|latest\s+|unread\s+)?(?:messages?|texts?)$|^(?:do i have|have i got|are there|got)?\s*any\s+(?:new\s+)?(?:messages|texts)$|^(?:what are |what's in )?my (?:messages|texts)$/i.test(t)) {
    return task([step('messages', ['read'], { new: true })]);
  }
  if ((m = t.match(/^(?:text|message|msg|tell)\s+(?!it\b|that\b)(\w+)\s+(?:that\s+|saying\s+|and\s+(?:say|tell (?:him|her|them))(?:\s+that)?\s+)?(.{2,})$/i))) {
    return msg(m[1], m[2].replace(/^to\s+/i, ''), true);
  }
  if ((m = t.match(/^read\s+(?:me\s+)?(?!(?:my|the|me|new|latest|last)\b)(\w+?)(?:'s|s)?\s+(?:latest\s+|last\s+|new\s+)?(?:message|messages|text|texts|chat)$/i)) ||
      (m = t.match(/^what did\s+(?:my\s+)?(\w+)\s+(?:say|write|send)(?:\s+me)?$/i)) ||
      (m = t.match(/^(?:any|are there any|do i have any|have i got any)\s+(?:new\s+)?(?:messages|texts)\s+from\s+(?:my\s+)?(\w+)$/i)) ||
      (m = t.match(/^read\s+(?:me\s+)?(?:my\s+|the\s+)?(?:latest\s+|last\s+|new\s+)?(?:messages?|texts?)\s+from\s+(\w+)$/i)) || (m = t.match(/^(?:open|show)\s+(\w+)'s\s+chat$/i))) {
    return task([step('messages', ['openChat', 'open'], { who: name(m[1]) }), step('messages', ['read'])]);
  }
  // "Reply to that message": no words to send yet, so ask, and the answer is the reply (drafted, never sent unasked).
  if (/^(?:reply|answer|respond)(?:\s+to\s+(?:that|this|the|it|her|him|them)(?:\s+(?:message|text|one))?)?$/i.test(t)) return { ...task([{ tool: 'ask', params: { question: 'What should I say?' } }]), asked: 'reply' };
  if ((m = raw.match(/^(?:reply|answer|respond)(?:\s+with)?[:,]?\s+(.+)$/i))) return task([step('messages', ['reply', 'draft'], { text: body(m[1].replace(/[.!?]+$/, '')) })]);
  if (/^send(?: it| that| the reply)?$/i.test(t)) return task([step(here || 'messages', ['send'])]);
  if ((m = t.match(/^(?:call|ring|phone)\s+(\w+)$/i))) return task([step('messages', ['call'], { who: name(m[1]) })]);

  // Calendar (before the generic "change X to Y")
  if ((m = t.match(/^invite\s+(\w+)\s+to\s+(.+)$/i))) return task([step('calendar', ['invite'], { who: name(m[1]), event: clean(m[2]) })]);
  // "Change lunch to Friday", "Put lunch on Friday": a move only when it names an event and a day ("Change Tuesday to Wednesday" is a word edit)
  if ((m = t.match(new RegExp(`^(?:change|reschedule|move|put|shift|push)\\s+(?:my\\s+|the\\s+)?((?:.*\\s)?(?:lunch|meeting|dinner|appointment|coffee|event|\\d{1,2} ?(?:am|pm)|\\w+ o'clock)(?:\\s.*)?)(?:\\s+(?:back|forward))?\\s+(?:to|for|on|until)\\s+${DAY}$`, 'i')))) {
    return task([step('calendar', ['move', 'reschedule'], { event: clean(m[1]), day: cap(m[2]) })]);
  }
  if ((m = t.match(/^(?:move|reschedule|shift|push)\s+(?:my\s+)?(.+?)(?:\s+(?:back|forward|on))?\s+(?:to|until|till)\s+(.+)$/i)) && (here === 'calendar' || !here || /lunch|meeting|dinner|appointment|coffee|event/i.test(m[1]))) {
    const at = m[2].match(/^(.+?)\s+at\s+(.+)$/);
    return task([step('calendar', ['move', 'reschedule'], at ? { event: clean(m[1]), day: cap(at[1]), time: at[2] } : { event: clean(m[1]), day: cap(m[2]) })]);
  }
  if (/^move (?:a|my|the) (?:meeting|event|appointment)$/i.test(t)) return task([step('calendar', ['move', 'reschedule'])]);
  if ((m = t.match(new RegExp(`^what'?s (?:on|happening)(?:\\s+(?:my|the)\\s+calendar)?(?:\\s+${DAY})?$`, 'i'))) ||
      (m = t.match(new RegExp(`^(?:what (?:have i|do i have) (?:got )?(?:on )?|am i (?:busy|free) |what am i doing |what'?s my day (?:like )?|(?:is there )?anything on |do i have anything (?:on )?|what'?s in (?:my |the )?(?:calendar|diary) (?:for )?)${DAY}$`, 'i'))) ||
      (m = t.match(new RegExp(`^what(?:'?s| does| is) my day look(?:ing)? like(?: ${DAY})?$`, 'i'))) || (m = t.match(/^what'?s in (?:my |the )?(?:calendar|diary)()$/i))) {
    return task([step('calendar', ['whatsOn', 'today', 'list', 'read'], { day: cap(m[1] || 'today') })]);
  }
  if (/^(?:what'?s|when'?s|what is|when is) (?:my )?next(?: (?:appointment|event|meeting|thing))?(?: on my calendar)?$/i.test(t)) return task([step('calendar', ['next', 'whatsNext', 'whatsOn'])]);
  if ((m = t.match(new RegExp(`^(?:add|put)\\s+(.+?)\\s+(?:on|for)\\s+${DAY}(?:\\s+at\\s+(.+))?$`, 'i')))) {
    const at = m[3] && clock(m[3]);
    return task([step('calendar', ['add', 'create'], { event: cap(m[1].replace(/^an?\s+/i, '')), day: cap(m[2]), ...(at ? { time: at } : {}) })]);
  }

  if (/^read (?:me )?(?:the )?next (?:one|message)$/i.test(t)) return task([step('messages', ['read'], { new: true })]);
  if (/^read (?:me )?(?:my |the |that )?(?:last )?(?:message )?again$/i.test(t)) return task([step('messages', ['read'])]);
  // The clock answers itself.
  if (/^what(?:'?s| is) the time$|^what time is it$/i.test(t)) return task([{ tool: 'say', params: { text: `It's ${new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}.` } }]);
  if (/^what day is it(?: today)?$|^what(?:'?s| is) (?:the date|today'?s date|today)$/i.test(t)) return task([{ tool: 'say', params: { text: `It's ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.` } }]);

  // The Writer
  if ((m = raw.match(/^(?:write|note|take a note|add a note|dictate)(?:\s+in\s+(?:the\s+|my\s+)?(?:writer|notes|book))?[:,]?\s+([\s\S]+)$/i))) {
    if (/^in\s+(?:the\s+|my\s+)?(?:writer|notes|book)$/i.test(m[1].trim())) return { ...task([{ tool: 'open_app', params: { app: 'writer' } }, { tool: 'ask', params: { question: 'What should I write?' } }]), asked: 'write' }; // the place, not the words
    return task([step('writer', ['dictate', 'write', 'add'], { text: corrected(m[1].trim()) })]);
  }
  if (/^read (?:me )?(?:my |the )?last page(?: in (?:the )?writer)?$/i.test(t) || /^read (?:me )?back (?:what i (?:wrote|said|dictated)|my writing)$/i.test(t) || /^read (?:me )?(?:my )?(?:book|notes|writing|page)$/i.test(t)) {
    return task([step('writer', ['readLastPage', 'readLast', 'read'])]);
  }
  if ((m = t.match(/^(?:open|go to|read)\s+(?:a\s+|the\s+)?chapter\s+(?:number\s+)?(\d+|[a-z]+)$/i))) { // "open a chapter" asked, "two" answered
    const n = /^\d/.test(m[1]) ? Number(m[1]) : UNITS[m[1].toLowerCase()];
    if (n) return task([step('writer', ['openChapter'], { n })]);
  }
  if (/^(?:new|start a new) chapter$/i.test(t)) return task([step('writer', ['newChapter', 'chapter'])]);

  // Edits in whatever app is open: Messages by default.
  if ((m = t.match(/^(?:change|replace|swap)\s+(.+?)\s+(?:to|with|for)\s+(.+)$/i))) {
    return task([step(here === 'writer' ? 'writer' : 'messages', ['replace', 'change', 'edit'], { from: m[1], to: m[2] })]);
  }
  if (/^read (?:it|that|this)$/i.test(t)) return task([step(here || 'messages', ['read'])]);

  // Shop
  if ((m = t.match(/^(?:order|get|buy)\s+(?:me\s+)?(?:my|the)\s+usual(?:\s+(?!from\b|at\b)\w+)?(?:\s+(?:from|at)\s+(.+))?$/i)) ||
      /^(?:order|reorder)\s+(?:the\s+)?(?:same|last)(?:\s+again)?$/i.test(t)) {
    return task([step('shop', ['orderUsual', 'usual', 'reorder', 'order'], m?.[1] ? { shop: m[1] } : {}), step('shop', ['pay', 'checkout'])]);
  }
  if ((m = t.match(/^(?:add|put)\s+(one|two|three|four|five|six|an?|\d+)?\s*([^,]+?)(?:\s+(?:at|from)\s+([^,]+?))?(?:\s+(?:to|in)\s+(?:my\s+|the\s+)?basket)?$/i)) && !/\bon (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)$/i.test(t)) {
    const slots = { item: cap(m[2]), quantity: Number(m[1]) || NUM[String(m[1] || 'one').toLowerCase()] || 1 };
    if (m[3]) slots.shop = m[3];
    return task([step('shop', ['add', 'addToBasket', 'addItem'], slots)]);
  }
  if (/^read (?:me )?(?:my |the )?basket$/i.test(t) || /^what'?s in (?:my |the )?basket$/i.test(t)) return task([step('shop', ['readBasket', 'basket', 'read'])]);
  if (/^(?:pay|check ?out)$/i.test(t)) return task([step('shop', ['pay', 'checkout'])]);
  if (/^(?:track|where'?s) my order$/i.test(t)) return task([step('shop', ['track'])]);

  // Places (read-only). "Directions to" stays Transit's while Transit is on the phone.
  if (apps.some((a) => a.id === 'places')) {
    const at = (names, said) => task([step('places', names, said ? { place: clean(said.trim()) } : {})]);
    if ((m = t.match(/^how far(?: away)? is\s+(.+?)(?:\s+from here)?$/i))) return at(['howFar'], m[1]);
    if ((m = t.match(/^(?:what'?s |what is |tell me )?(?:the )?(?:route|way|walking route)\s+to\s+(.+)$/i)) ||
        ((m = t.match(/^directions\s+to\s+(.+)$/i)) && !apps.some((a) => a.id === 'transit'))) return at(['route'], m[1]);
    if (/^(?:what'?s|what is|anything) (?:nearby|near (?:me|here)|around here)$/i.test(t)) return at(['nearby']);
    if ((m = t.match(/^is\s+(.+?)\s+open(?: now| today)?$/i)) || (m = t.match(/^when (?:does|do)\s+(.+?)\s+(?:open|close)$/i)) ||
        (m = t.match(/^(?:what are )?(?:the )?opening (?:hours|times) (?:for|of|at)\s+(.+)$/i))) return at(['hours'], m[1]);
  }

  // Transit
  if ((m = t.match(/\bnext bus(?:\s+to\s+(?:the\s+)?([a-z' ]+?))?(?:,|\s+and\b|$)/i)) || /^bus to work$/i.test(t)) {
    return task([step('transit', ['nextBus', 'next', 'bus'], m?.[1] ? { place: cap(m[1].trim()) } : {})]);
  }
  if ((m = t.match(/^(?:directions|take me|get me|get)\s+(?:to\s+)?(?:the\s+)?(.+)$/i))) return task([step('transit', ['directions', 'route'], { place: cap(m[1]) })]);
  if ((m = t.match(/when (?:should|do|can) i leave(?:\s+(?:for|to)\s+(?:the\s+)?([a-z' ]+))?$/i))) return task([step('transit', ['whenToLeave', 'leave'], m[1] ? { place: cap(m[1].trim()) } : {})]);

  // Taxi (a plug-in) and the Bank
  if ((m = t.match(/^(?:book|get|call|order)\s+(?:me\s+)?(?:a\s+)?(?:taxi|cab)(?:\s+(?:to\s+)?(?:the\s+)?(.+))?$/i))) {
    return task([step('taxi', ['book'], m[1] ? { to: m[1].toLowerCase() } : {})]);
  }
  // The phone's Bank: "Open the bank", "What's my balance", "Recent payments", "Freeze my card"
  if (/^(?:open|go to|show)\s+(?:the\s+|my\s+)?(?:murmur\s+)?bank(?:\s+app)?$/i.test(t) ||
    /^(?:what'?s|what is|check|tell me|read|say|how much is)\s+(?:in\s+)?(?:my\s+|the\s+)?(?:(?:murmur\s+)?bank\s+)?balance$|^how much (?:money )?(?:have i got|do i have)(?: in (?:the|my) bank)?$/i.test(t)) return task([step('bank', ['balance'], {})]);
  if (/^(?:read |what are |show )?(?:my |the )?(?:recent|last) (?:bank )?(?:payments|transactions|spending)$|^what have i (?:spent|paid)(?: recently)?$/i.test(t)) return task([step('bank', ['recent'], {})]);
  if (/^freeze (?:my |the )?(?:bank )?card$/i.test(t)) return task([step('bank', ['freezeCard'], {})]);
  // "Pay Sam twenty pounds", "Pay Samira five pounds fifty", "Send Sam £20 please", "... from Murmur Bank"
  if ((m = t.replace(/\s+from (?:the |my )?(?:murmur )?bank$/i, '').match(/^(?:pay|send|give)\s+(\w+)\s+(?:£\s*)?(\d+(?:\.\d\d)?|[a-z -]+?)(?:\s+(?:pounds?|quid)(?:\s+(?:and\s+)?(?!please\b)(\d\d|[a-z -]+?)(?:\s+p(?:ence)?)?)?)?(?:,?\s+please)?$/i))
    && money(m[2]) > 0 && (!m[3] || (money(m[3]) > 0 && money(m[3]) < 100))) {
    return task([step('bank', ['payPerson', 'pay'], { who: name(m[1]), amount: money(m[2]) + (m[3] ? money(m[3]) / 100 : 0) })]);
  }

  // Travel
  if ((m = t.match(/^(?:pick|choose|take|book|hold)\s+(?:the\s+)?(\d{1,2}[:.]\d\d)(?:\s+(?:flight|one))?$/i))) return task([step('travel', ['hold', 'book', 'pick'], { flight: m[1].replace('.', ':') })]);
  if ((m = t.match(/^(?:find|search|look for)\s+(?:me\s+)?(?:a\s+)?flights?\s+(?:from\s+(\w+)\s+)?to\s+(\w+)(?:\s+(?:for|on)\s+(.+))?$/i))) {
    const slots = { place: cap(m[2]) };
    if (m[1]) slots.origin = cap(m[1]);
    if (m[3]) slots.day = m[3];
    return task([step('travel', ['findFlights', 'search', 'find'], slots)]);
  }
  if (/^(?:when'?s|when is|what time is|show me|where'?s|tell me about|check)\s+my\s+flight$/i.test(t) && apps.some((a) => a.id === 'travel')) return task([{ tool: 'open_app', params: { app: 'travel' } }]);
  if ((m = t.match(/^(?:book|hold)\s+(?!on$)(?:the\s+)?(.+)$/i))) return task([step('travel', ['hold', 'book', 'pick'], { flight: m[1] })]);

  if ((m = t.match(/^(?:open|go to|show|play|start)\s+(?:the\s+|my\s+)?(.+?)(?:\s+app)?(?:\s+and\s+.+)?$/i))) {
    const app = apps.find((a) => [a.id, a.name.toLowerCase(), a.name.toLowerCase().replace(/^the\s+/, '')].includes(m[1].toLowerCase()));
    if (app) return task([{ tool: 'open_app', params: { app: app.id } }]);
    if (/^(?:open|go to)\b/i.test(t)) return { kind: 'unknown', plan: [], say: `I don't have ${cap(m[1])} on this phone.` };
  }

  const names = ['messages', 'calendar', 'look'].map((id) => apps.find((a) => a.id === id)?.name).filter(Boolean);
  return { kind: 'unknown', plan: [], say: `${MISS} Try ${names.join(', ') || 'Messages'}.` };
}

/** Dictation clean-up: fix words, never meaning. "behind the blue door. No, the green door." -> green. */
export function corrected(text) {
  const m = text.match(/^([\s\S]*?\b)(\w+)((?:\s+\w+)?)([.!?])\s+no,?\s+(?:the\s+|a\s+|an\s+)?(\w+)((?:\s+\w+)?)[.!?]?$/i);
  if (!m || m[3].trim().toLowerCase() !== m[6].trim().toLowerCase()) return text;
  return `${m[1]}${m[5]}${m[3]}${m[4]}`;
}

const UNITS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, a: 1 };
/** "three", "3:30", "10am" -> "3pm", "3:30pm", "10am": a bare 1 to 7 is the afternoon (a dentist at three). */
function clock(s) {
  const m = String(s).trim().match(/^(\d{1,2}|[a-z]+)(?:[:.](\d\d)|\s+(thirty|fifteen|forty five))?\s*(am|pm|a\.m\.|p\.m\.|o'?clock|in the (?:morning|afternoon|evening))?$/i);
  const h = m && (/^\d/.test(m[1]) ? Number(m[1]) : UNITS[m[1].toLowerCase()]);
  if (!h || h > 23) return null;
  const mm = m[2] || { thirty: '30', fifteen: '15', 'forty five': '45' }[m[3]?.toLowerCase()] || '';
  const ap = /^a|morning/i.test(m[4] || '') ? 'am' : /^p|afternoon|evening/i.test(m[4] || '') || (h >= 1 && h <= 7) ? 'pm' : h <= 12 ? 'am' : '';
  return `${h}${mm ? `:${mm}` : ''}${ap}`;
}
/** "20", "twenty", "twenty five", "a hundred" -> a number; 0 if it is not money words. */
function money(s) {
  if (/^\d/.test(s)) return Number(s);
  let n = 0;
  for (const w of s.toLowerCase().split(/[\s-]+/).filter((x) => x !== 'and')) {
    if (!(w in UNITS)) return 0;
    n = w === 'hundred' ? (n || 1) * 100 : n + UNITS[w];
  }
  return n;
}

const isWorkflow = (n, ctx) => (ctx.workflows || []).some((w) => w.toLowerCase() === n.toLowerCase());
