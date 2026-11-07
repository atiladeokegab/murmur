// Plug-ins: an app written to os/contract.md, added at runtime. It passes the same registry checks as a built-in
// app, mounts into its own section with its own kv area, and its actions become tools straight away.
// Only modules we serve ourselves under /plugins/ load: the trust boundary is the origin, not the app.
import { mountApp } from './load.js';
import { appKv } from './kv.js';
import { browserKV } from '../ports/browser-kv.js';

export const PLUGINS = new URL('../plugins/', import.meta.url);   // /plugins/ in the browser
const AREA = 'os.plugins';
// An action named like money or messages must ask first; a plug-in may not opt out.
const RISKY = /pay|send|transfer|call|buy|purchase|order|book|checkout/i;

/** The agent's builtin tool (public/agent/plan.js BUILTINS shape). */
export const INSTALL_APP = {
  describe: 'Add an app to the phone from the app list, by its name',
  params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
};

const port = (o) => o.port || browserKV({ prefix: 'murmur' });
const installed = async (o) => (await port(o).get(AREA, 'installed')) || [];

function checkGates(app) {
  for (const [k, a] of Object.entries(app?.actions || {})) {
    if (RISKY.test(k) && !a.gate) throw new Error(`app ${app.id}: ${k} moves money or messages, so it must have a gate`);
  }
}

/**
 * Install one plug-in.
 * @param {string} url  same-origin module under /plugins/, e.g. '/plugins/taxi/index.js'
 * @param {{registry, host: Element, os?: (app, kv) => object, port?, persist?: boolean}} o
 *   os(app, kv) builds the `os` handed to mount (the shell's own, so confirm and say work the same)
 * @returns {Promise<{id, name, actions: string[], url, root, kv}>}  throws with a reason on any refusal
 */
export async function installApp(url, o) {
  const { registry, host, os = (app, kv) => ({ kv, say() {} }), persist = true } = o;
  const href = new URL(url, globalThis.location?.href ?? PLUGINS).href;
  if (!href.startsWith(PLUGINS.href)) throw new Error(`Refused ${url}: plug-ins load only from ${PLUGINS.pathname} on this site.`);
  const app = (await import(href)).default;
  checkGates(app);
  registry.register(app);                    // the built-in rules: id, fields, gates; throws on an id collision
  let root, kv;
  try {
    kv = appKv(app.id, port(o));
    root = await mountApp(app, host, os(app, kv));
    await app.seed();
  } catch (e) {
    registry.unregister(app.id);
    root?.remove?.();
    throw e;
  }
  if (persist) {
    const list = (await installed(o)).filter((x) => x.id !== app.id);
    await port(o).set(AREA, 'installed', [...list, { id: app.id, path: href.slice(PLUGINS.href.length) }]); // origin-free
  }
  return { id: app.id, name: app.name, actions: Object.keys(app.actions), url, root, kv };
}

/** Remove a plug-in: its tools, its section, its kv data and its place in the installed list. Built-in apps are refused. */
export async function uninstallApp(id, o) {
  const list = await installed(o);
  if (!list.some((x) => x.id === id)) throw new Error(`${id} is not an added app.`);
  o.registry.unregister(id);
  o.host?.querySelector(`#app-${id}`)?.remove?.();
  await port(o).set(AREA, 'installed', list.filter((x) => x.id !== id));
  const kv = appKv(id, port(o));   // its data goes with it: a reinstall starts clean
  for (const k of Object.keys(await kv.all())) await kv.set(k, undefined);
  return { id };
}

/** On boot: install everything in the saved list. One broken plug-in is skipped and reported, never fatal. */
export async function restoreApps(o) {
  const out = [];
  for (const { path } of await installed(o)) {
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
  const q = String(name || '').toLowerCase();
  const list = await availableApps(o);
  const p = list.find((x) => [x.id, x.name.toLowerCase(), ...(x.words || [])].some((w) => q.includes(w) || (q.length > 2 && w.includes(q))));
  if (!p) return { ok: false, say: `I can't find ${name}. I can add ${list.map((x) => x.name).join(', ')}.` };
  if (p.installed || o.registry.get(p.id)) return { ok: true, id: p.id, say: `${p.name} is already on your phone.` };
  try {
    const r = await installApp(p.url, o);
    return { ok: true, ...r, say: `Added ${r.name}. You can ask it to ${p.describe}.` };
  } catch (e) {
    return { ok: false, say: `I couldn't add ${p.name}. ${e.message}` };
  }
}
