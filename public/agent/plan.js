// Plans: the tool list generated from the registry, and validation of a plan against each action's JSON schema.
// Pure and serialisable, so the server planner and the browser runner share it. An app with no `delete` action
// cannot be asked to delete: the tools are the registry, nothing else.

export const SEP = '__';

// Murmur's own tools, beside one per app action (spec §3.1).
import { INSTALL_APP } from '../sdk/plugin.js';

export const BUILTINS = {
  open_app: { describe: 'Open an app', params: { type: 'object', properties: { app: { type: 'string' } }, required: ['app'] } },
  read_screen: { describe: 'Read what is on screen', params: { type: 'object', properties: {} } },
  where: { describe: 'Say where you are', params: { type: 'object', properties: {} } },
  say: { describe: 'Answer in one short sentence', params: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  ask: { describe: 'Ask the person one short question', params: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] } },
  save_workflow: { describe: 'Save the last task as a tile', params: { type: 'object', properties: { name: { type: 'string' }, slot: { type: 'boolean' } }, required: ['name'] } },
  run_workflow: { describe: 'Run a saved tile', params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  explain: { describe: "Say what's in a saved tile", params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  edit_workflow: { describe: 'Drop a step from a saved tile', params: { type: 'object', properties: { name: { type: 'string' }, drop: { type: 'string' } }, required: ['name', 'drop'] } },
  install_app: INSTALL_APP,
  recall: { describe: 'Say what Murmur remembers about you', params: { type: 'object', properties: {} } },
  list_workflows: { describe: 'Say the saved tiles', params: { type: 'object', properties: {} } },
  remove_workflow: { describe: 'Remove a saved tile (asks first)', params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  go_home: { describe: 'Go back to the home board', params: { type: 'object', properties: {} } },
  sound: { describe: 'Turn sounds and vibration on or off', params: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'] } },
  // The OS's own verbs, also reserved words: a plan of just one of these runs as the word, never as a task.
  stop: { describe: 'Stop what Murmur is doing', params: { type: 'object', properties: {} } },
  undo: { describe: 'Undo the last change', params: { type: 'object', properties: {} } },
  carry_on: { describe: 'Carry on where you left off', params: { type: 'object', properties: {} } },
};
export const WORD_TOOLS = new Set(['stop', 'undo', 'carry_on']);

/**
 * The serialisable view of the registry: what the planner sees. Accepts the SDK registry as an array of apps,
 * a { id: app } map, or anything with list().
 * shortcut: adapts to the §3.3 app shape; if os/contract.md names the registry differently, change only here.
 */
export function describeRegistry(registry) {
  const apps = Array.isArray(registry) ? registry : typeof registry?.list === 'function' ? registry.list() : Object.values(registry || {});
  return apps.map((a) => ({
    id: a.id, name: a.name || a.id,
    actions: Object.entries(a.actions || {}).map(([name, x]) => ({
      name, describe: typeof x.describe === 'string' ? x.describe : name,
      params: x.params || { type: 'object', properties: {} }, gate: x.gate || null, hint: x.hint || '',
    })),
  }));
}

/** Gemini function declarations from the described registry. */
export function toolsFor(apps) {
  const up = (s) => {
    if (!s || typeof s !== 'object') return s;
    const out = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === 'type' && typeof v === 'string') out.type = v.toUpperCase();
      else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([p, d]) => [p, up(d)]));
      else if (k === 'items') out.items = up(v);
      else if (['enum', 'required', 'description'].includes(k)) out[k] = v;
    }
    return out;
  };
  const decl = (name, describe, params, extra = '') => ({ name, description: describe + extra, parameters: up(params) });
  return [
    ...Object.entries(BUILTINS).map(([n, b]) => decl(n, b.describe, n === 'open_app'
      ? { ...b.params, properties: { app: { type: 'string', enum: apps.map((x) => x.id) } } } : b.params)),
    ...apps.flatMap((a) => a.actions.map((x) => decl(`${a.id}${SEP}${x.name}`, `${a.name}: ${x.describe}`, x.params,
      x.gate ? ` (asks the person first: ${x.gate})` : ''))),
  ];
}

function checkType(v, s) {
  if (!s || !s.type) return true;
  if (s.enum && !s.enum.includes(v)) return false;
  switch (s.type) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'integer': return Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    case 'array': return Array.isArray(v) && (!s.items || v.every((x) => checkType(x, s.items)));
    case 'object': return v && typeof v === 'object' && !Array.isArray(v);
    default: return true;
  }
}

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const listWords = (xs) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')}, or ${xs.at(-1)}`;

/** "I can't do that in Messages. I can open a chat, read it, or reply." */
export function cantLine(app) {
  return `I can't do that in ${app.name}. I can ${listWords(app.actions.slice(0, 3).map((x) => lowerFirst(x.describe.split(",")[0])))}.`;
}

/**
 * Keep only steps the registry can run, with only the params their schema declares.
 * @param {Array<{tool:string, params?:object}>} plan
 * @param {{dryRun?: boolean}} [opts]  a teach dry run keeps steps with params still to come
 * @returns {{ steps: Array<{tool, app, action, params, gate}>, dropped: Array<{tool, reason, say}> }}
 */
export function validatePlan(plan, apps, { dryRun = false } = {}) {
  const steps = [], dropped = [];
  for (const step of Array.isArray(plan) ? plan : []) {
    const tool = String(step?.tool || '');
    const raw = step?.params && typeof step.params === 'object' ? step.params : {};
    let spec, app = null, action = tool;
    if (tool === 'open_app' && !apps.some((x) => x.id === raw.app)) { dropped.push({ tool, reason: 'unknown app' }); continue; } // model noise like "the board"
    if (BUILTINS[tool]) spec = BUILTINS[tool];
    else {
      const [id, name] = tool.split(SEP);
      app = apps.find((a) => a.id === id);
      const x = app?.actions.find((y) => y.name === name);
      if (!app) { dropped.push({ tool, reason: 'unknown app', say: "That app isn't on this phone." }); continue; }
      if (!x) { dropped.push({ tool, reason: 'unknown action', say: cantLine(app) }); continue; }
      spec = x; action = name;
    }
    const props = spec.params?.properties || {};
    const params = {}, extra = [];
    for (const [k, v] of Object.entries(raw)) {
      if (!(k in props)) extra.push(k);
      else if (checkType(v, props[k])) params[k] = typeof v === 'string' ? v.slice(0, 1000) : v;
      else extra.push(k);
    }
    const missing = dryRun ? [] : (spec.params?.required || []).filter((k) => !(k in params));
    if (missing.length) {
      dropped.push({ tool, reason: `missing ${missing.join(', ')}`, say: app ? cantLine(app) : "I didn't get all of that. Again?" });
      continue;
    }
    if (extra.length) dropped.push({ tool, reason: `dropped params ${extra.join(', ')}`, say: '' });
    steps.push({ tool, app: app?.id || null, action, params, gate: spec.gate || null });
  }
  return { steps, dropped };
}
