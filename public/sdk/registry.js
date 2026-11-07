// The registry: apps in, tools out. The model can only call what an app declared (os/contract.md §Registry).
export const GATES = [null, 'send', 'pay', 'call', 'delete'];
const EMPTY = { type: 'object', properties: {} };
const str = (description) => ({ type: 'string', description });

// OS tools, run by the agent, not by an app. open_app's enum is filled from the registered ids.
export const BUILTINS = {
  open_app: { description: 'Open one of the apps on the phone.', params: { type: 'object', properties: { app: str('App id') }, required: ['app'] } },
  read_screen: { description: 'Read what is on the screen now, in plain words.', params: EMPTY },
  where: { description: 'Say where the person is: app, item, sentence n of m, what comes next.', params: EMPTY },
  say: { description: 'Say one short sentence to the person. Only to answer a question.', params: { type: 'object', properties: { text: str('Under 20 words') }, required: ['text'] } },
  ask: { description: 'Ask the person one short question and wait for the answer.', params: { type: 'object', properties: { question: str('Under 15 words') }, required: ['question'] } },
  save_workflow: { description: 'Save the last task as a named tile on the board.', params: { type: 'object', properties: { name: str('What the person called it') }, required: ['name'] } },
  run_workflow: { description: 'Run a saved workflow by name.', params: { type: 'object', properties: { name: str('Workflow name') }, required: ['name'] } },
  explain: { description: 'Explain how to do something step by step without doing it.', params: { type: 'object', properties: { question: str('What the person asked') }, required: ['question'] } },
};

const ID = /^[a-z][a-z0-9]*$/;        // no underscores, so `<app>__<action>` always splits once
const KEY = /^[a-zA-Z][a-zA-Z0-9]*$/;

function check(app) {
  const bad = (m) => { throw new Error(`app ${app && app.id}: ${m}`); };
  if (!app || !ID.test(app.id || '')) bad('id must match /^[a-z][a-z0-9]*$/');
  if (BUILTINS[app.id]) bad('id clashes with an OS tool');
  if (!app.name) bad('name is required');
  for (const f of ['mount', 'read', 'place', 'state', 'seed', 'reset']) if (typeof app[f] !== 'function') bad(`${f}() is required`);
  if (!app.actions || !Object.keys(app.actions).length) bad('at least one action is required');
  for (const [k, a] of Object.entries(app.actions)) {
    if (!KEY.test(k)) bad(`action "${k}" must match /^[a-zA-Z][a-zA-Z0-9]*$/`);
    if (!a.describe) bad(`${k}.describe is required`);
    if (!a.doing) bad(`${k}.doing is required (2 to 5 words, present tense)`);
    if (typeof a.run !== 'function' || typeof a.verify !== 'function') bad(`${k}.run and ${k}.verify are required`);
    if (!GATES.includes(a.gate ?? null)) bad(`${k}.gate must be one of ${GATES.join(', ')}`);
    if (a.params && a.params.type !== 'object') bad(`${k}.params must be a JSON schema of type object`);
  }
}

/** Validate model-supplied params against a JSON schema. Unknown keys are dropped and listed, never passed on. */
export function validate(schema = EMPTY, value) {
  const errors = [], dropped = [];
  function walk(s, v, path) {
    if (s.enum && !s.enum.includes(v)) { errors.push(`${path} must be one of ${s.enum.join(', ')}`); return undefined; }
    switch (s.type) {
      case 'object': {
        if (!v || typeof v !== 'object' || Array.isArray(v)) { errors.push(`${path} must be an object`); return undefined; }
        const out = {};
        for (const k of Object.keys(v)) {
          if (!s.properties || !(k in s.properties)) { dropped.push(path ? `${path}.${k}` : k); continue; }
          const w = walk(s.properties[k], v[k], path ? `${path}.${k}` : k);
          if (w !== undefined) out[k] = w;
        }
        for (const k of s.required || []) if (!(k in out)) errors.push(`${path ? path + '.' : ''}${k} is required`);
        return out;
      }
      case 'array':
        if (!Array.isArray(v)) { errors.push(`${path} must be a list`); return undefined; }
        return s.items ? v.map((x, i) => walk(s.items, x, `${path}[${i}]`)) : v;
      case 'string': if (typeof v === 'string') return v; break;
      case 'integer': if (Number.isInteger(v)) return v; break;
      case 'number': if (typeof v === 'number' && Number.isFinite(v)) return v; break;
      case 'boolean': if (typeof v === 'boolean') return v; break;
      default: return v;
    }
    errors.push(`${path} must be a ${s.type}`);
    return undefined;
  }
  const out = walk(schema, value ?? {}, '');
  return { ok: !errors.length, params: out || {}, errors, dropped };
}

export function createRegistry() {
  const apps = new Map();
  return {
    register(app) {
      check(app);
      if (apps.has(app.id)) throw new Error(`app ${app.id}: already registered`);
      apps.set(app.id, app);
      return app;
    },
    get: (id) => apps.get(id),
    list: () => [...apps.values()],
    /** Function declarations (JSON schema) for the planner: the OS tools, then `<app>__<action>` for every action. */
    tools() {
      const ids = [...apps.keys()];
      const out = Object.entries(BUILTINS).map(([name, b]) => ({ name, description: b.description,
        parameters: name === 'open_app' ? { ...b.params, properties: { app: { ...b.params.properties.app, enum: ids } } } : b.params }));
      for (const app of apps.values()) {
        for (const [k, a] of Object.entries(app.actions)) {
          out.push({ name: `${app.id}__${k}`, description: `${app.name}: ${a.describe}${a.gate ? ` (the person is asked first: ${a.gate})` : ''}`,
            parameters: a.params || EMPTY });
        }
      }
      return out;
    },
    /** A tool name to what runs it: { builtin } or { app, key, action }; null when nothing declared it. */
    resolve(name) {
      if (BUILTINS[name]) return { builtin: name, schema: name === 'open_app' ? { ...BUILTINS.open_app.params, properties: { app: { type: 'string', enum: [...apps.keys()] } } } : BUILTINS[name].params };
      const [id, key, extra] = String(name).split('__');
      const app = apps.get(id);
      const action = app && extra === undefined && Object.hasOwn(app.actions, key) ? app.actions[key] : null;
      return action ? { app, key, action, schema: action.params || EMPTY } : null;
    },
  };
}
