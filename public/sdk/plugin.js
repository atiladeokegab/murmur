// Plug-ins: an app written to os/contract.md, added at runtime. It passes the same registry checks as a built-in
// app, mounts into its own section with its own kv area, and its actions become tools straight away.
// Only modules we serve ourselves under /plugins/ load: the trust boundary is the origin, not the app.
import { mountApp } from './load.js';
import { appKv } from './kv.js';
import { browserKV } from '../ports/browser-kv.js';
import BUILT_IN from '../apps/apps.js';   // names a plug-in may never take, even before that app is on this phone
// Removable means installApp itself registered this very app object. Never the saved list, which a page can write:
// a forged {id:'hello'|'phone'|'look'} row cannot make a built-in, or anything the shell registers, removable.
const ADDED = new WeakSet();
const added = (o, id) => ADDED.has(o.registry.get(id));

export const PLUGINS = new URL('../plugins/', import.meta.url);   // /plugins/ in the browser
const AREA = 'os.plugins';
// An action named like money or messages must ask first with the right gate; a plug-in may not opt out or
// downgrade (pay is the only gate that checks the fingerprint, so money must be pay, never send or call).
const MONEY = /pay|buy|purchase|order|book|checkout|transfer|money/i;
// Anything named to destroy (deleteAll, clearData, removeItem) asks first with delete, or the stricter pay.
const DESTROY = /delete|remove|clear|erase|wipe/i;
const needs = (k) => (MONEY.test(k) ? ['pay'] : /send/i.test(k) ? ['send', 'pay'] : /call/i.test(k) ? ['call', 'pay'] : DESTROY.test(k) ? ['delete', 'pay'] : null);
// One plug-in module: lower-case folders and a .js file, nothing else. No %, dots, query or hash: the server
// decodes %2e%2e%2f after the URL check, so an encoded path could step outside /plugins/.
const PATH = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.js$/;

/** The agent's builtin tool (public/agent/plan.js BUILTINS shape). */
export const INSTALL_APP = {
  describe: 'Add an app to the phone from the app list, by its name',
  params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
};

/** The agent's builtin tool: remove_app {name}. It asks first through the same delete sheet as the Remove button. */
export const REMOVE_APP = {
  describe: 'Take an added app off the phone, by its name',
  params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
};

// A spoken name against an app's id, name and manifest words, in whole words either way: "the taxi app" and "Corner"
// find theirs, "taxidermy" and "cabbage" find nothing. Bounded to the first 80 characters heard.
const words = (s) => String(s || '').toLowerCase().slice(0, 80).match(/[a-z0-9]+/g) || [];
const within = (run, ws) => run.length > 0 && ws.some((_, i) => run.every((w, k) => ws[i + k] === w));
const heard = (name) => { const q = words(name); return (x) => [x.id, x.name, ...(x.words || [])].some((a) => within(words(a), q) || within(q, words(a))); };
/** Every app in list a spoken name could mean. The callers act only on exactly one. */
export const appsHeard = (list, name) => list.filter(heard(name));
const which = (hits) => ({ ok: false, say: `Which one: ${hits.map((x) => x.name).join(' or ')}?` });

const port = (o) => o.port || browserKV({ prefix: 'murmur' });
// The saved list is a trust boundary too: anything but an array of { id, path } strings is dropped, never fatal at boot.
async function installed(o) {
  let v;
  try { v = await port(o).get(AREA, 'installed'); } catch { return []; }
  return Array.isArray(v) ? v.filter((x) => typeof x?.id === 'string' && typeof x.path === 'string') : [];
}

function checkGates(app) {
  for (const [k, a] of Object.entries(app?.actions || {})) {
    const need = needs(k);
    if (need && !need.includes(a.gate)) throw new Error(`app ${app.id}: ${k} must have a gate of ${need.join(' or ')}`);
  }
}

/**
 * Install one plug-in.
 * @param {string} url  same-origin module under /plugins/, e.g. '/plugins/taxi/index.js'
 * @param {{registry, host: Element, os?: (app, kv) => object, port?, persist?: boolean, confirm?, removed?}} o
 *   os(app, kv) builds the `os` handed to mount (the shell's own, so confirm and say work the same).
 *   With confirm({app, gate, readback}) => Promise<boolean>, the app gets a Remove button as its last control;
 *   removed(result) hears how it went ({ ok, id, say, cancelled? }).
 * @returns {Promise<{id, name, actions: string[], url, root, kv}>}  throws with a reason on any refusal
 */
export async function installApp(url, o) {
  const { registry, host, os = (app, kv) => ({ kv, say() {} }), persist = true } = o;
  const href = new URL(url, globalThis.location?.href ?? PLUGINS).href;
  if (!href.startsWith(PLUGINS.href) || !PATH.test(href.slice(PLUGINS.href.length))) throw new Error(`Refused ${url}: plug-ins load only from ${PLUGINS.pathname} on this site.`);
  const app = (await import(href)).default;
  checkGates(app);
  if (BUILT_IN.includes(app.id)) throw new Error(`app ${app.id}: that name belongs to an app that comes with the phone`);
  registry.register(app);                    // the built-in rules: id, fields, gates; throws on an id collision
  ADDED.add(app);
  let root, kv;
  try {
    kv = appKv(app.id, port(o));
    root = await mountApp(app, host, os(app, kv));
    await app.seed();
    if (o.confirm) {
      const doc = root.ownerDocument, b = doc.createElement('button');
      b.type = 'button'; b.className = 'app-btn quiet'; b.id = `app-${app.id}-remove`;
      b.textContent = `Remove ${app.name} from your phone`;
      b.addEventListener('click', async () => o.removed?.(await removeApp(app.id, o, o.confirm)));
      root.append(b);
    }
    if (persist) {   // inside the try: a failed save rolls the install back, so the list and the phone agree
      const list = (await installed(o)).filter((x) => x.id !== app.id);
      await port(o).set(AREA, 'installed', [...list, { id: app.id, path: href.slice(PLUGINS.href.length) }]); // origin-free
    }
  } catch (e) {
    registry.unregister(app.id);
    ADDED.delete(app);
    (root ?? host.querySelector?.(`#app-${app.id}`))?.remove?.();   // a mount that threw left its section behind
    throw e;
  }
  return { id: app.id, name: app.name, actions: Object.keys(app.actions), url, root, kv };
}

/** Remove a plug-in: its tools, its section, its kv data and its place in the installed list. Built-in apps are refused. */
export async function uninstallApp(id, o) {
  const list = await installed(o);
  if (!added(o, id) || !list.some((x) => x.id === id)) throw new Error(`${id} is not an added app.`);
  await port(o).set(AREA, 'installed', list.filter((x) => x.id !== id));   // first: if the save fails, nothing changed
  ADDED.delete(o.registry.get(id));
  o.registry.unregister(id);
  o.host?.querySelector(`#app-${id}`)?.remove?.();
  const kv = appKv(id, port(o));   // its data goes with it: a reinstall starts clean
  try { for (const k of Object.keys(await kv.all())) await kv.set(k, undefined); } catch (e) {   // the phone is already clean; say so
    throw Object.assign(new Error(`its data was not cleared: ${e.message}`), { removed: true });
  }
  return { id };
}

/** A person's Remove: asks first with gate delete, then uninstalls. Never throws: { ok, id, say, cancelled? }. */
export async function removeApp(id, o, confirm = o.confirm) {
  const app = o.registry.get(id);
  if (!app) return { ok: false, id, say: "That app isn't on your phone." };
  if (!added(o, id) || !(await installed(o)).some((x) => x.id === id)) return { ok: false, id, say: `${app.name} came with the phone, so it stays.` };
  if ((await confirm({ app: id, gate: 'delete', readback: `Remove ${app.name} from your phone?` })) !== true) return { ok: false, id, cancelled: true, say: 'Kept it.' };
  try { await uninstallApp(id, o); } catch (e) {
    return e.removed ? { ok: true, id, say: `Removed ${app.name}, but some of its data could not be cleared.` } : { ok: false, id, say: `I couldn't remove ${app.name}. It is still on your phone.` };
  }
  return { ok: true, id, say: `Removed ${app.name}.` };
}

/** On boot: install everything in the saved list. One broken plug-in is skipped and reported, never fatal. */
export async function restoreApps(o) {
  const out = [];
  for (const { path } of await installed(o)) {   // installed() already dropped malformed entries
    try { out.push(await installApp(new URL(path, PLUGINS).href, { ...o, persist: false })); } catch (e) { console.warn('plug-in not restored', path, e.message); }
  }
  return out;
}

/** The manifest: [{ id, name, url, words, describe }], url relative to the manifest. */
export async function availableApps(o = {}) {
  const at = new URL('index.json', PLUGINS);
  const list = (await import(at.href, { with: { type: 'json' } })).default;
  const have = new Set((await installed(o)).map((x) => x.id));
  return list.map((p) => ({ ...p, url: new URL(p.url, at).href, installed: have.has(p.id) }));
}

/** install_app {name}: resolve a spoken name through the manifest and install. Never throws: { ok, say, id? }. */
export async function installByName(name, o) {
  const list = await availableApps(o);
  const hits = appsHeard(list, name), p = hits[0];
  if (hits.length > 1) return which(hits);
  if (!p) return { ok: false, say: `I can't find ${name}. I can add ${list.map((x) => x.name).join(', ')}.` };
  if (p.installed || o.registry.get(p.id)) return { ok: true, id: p.id, say: `${p.name} is already on your phone.` };
  try {
    const r = await installApp(p.url, o);
    return { ok: true, ...r, say: `Added ${r.name}. You can ask it to ${p.describe}.` };
  } catch (e) {
    return { ok: false, say: `I couldn't add ${p.name}. ${e.message}` };
  }
}

/** remove_app {name}: an added app by spoken name, then removeApp (asks first). A built-in gets "came with the phone". */
export async function removeByName(name, o, confirm = o.confirm) {
  const added = appsHeard((await availableApps(o)).filter((x) => x.installed), name);
  const hits = added.length ? added : appsHeard(o.registry.list(), name), p = hits[0];
  if (hits.length > 1) return which(hits);
  if (!p) return { ok: false, say: `There's no ${name} on your phone.` };
  return removeApp(p.id, o, confirm);
}
