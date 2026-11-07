// Hermes's test phone: the real SDK (registry, mountApp, createCtx, runAction, bus) on test/fake-dom.js,
// with fresh app instances so each test owns its clock and state.
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

export async function phone(apps, { answers = [] } = {}) {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const roots = {}, taps = [], asked = [];
  let agentPress = false; // as the shell: a press the agent made was already asked by the runner
  const cursor = { async moveTo(el, name) { taps.push(name); agentPress = true; }, hide() {} };
  const ask = async (q) => { asked.push(q); return answers.shift() ?? false; };
  for (const app of apps) {
    registry.register(app);
    roots[app.id] = await mountApp(app, doc.body, { kv: appKv(app.id, port), bus, say: (text) => bus.emit('say', { text }),
      confirm: (q) => (agentPress ? (agentPress = false, Promise.resolve(true)) : ask({ ...q, byHand: true })) });
    await app.seed();
  }
  const ctxFor = (app) => createCtx({ app, root: roots[app.id], bus, kv: appKv(app.id, port), cursor, ask, signal: new AbortController().signal });
  const run = (name, params = {}) => runAction({ registry, name, params, bus, ctxFor });
  // A person's own tap: find the button by its visible text inside the app, and click it.
  const press = async (id, text) => {
    agentPress = false;
    const b = [...roots[id].all()].find((n) => n.tagName === 'BUTTON' && n.textContent.startsWith(text));
    if (!b) throw new Error(`no button "${text}" in ${id}`);
    b.click();
    await new Promise((r) => setTimeout(r)); // let an async handler (os.confirm) settle
  };
  return { doc, bus, roots, taps, asked, run, press, port };
}

// Contract §8 checks for one app object.
export function checkContract(assert, app, gated) {
  for (const k of ['mount', 'read', 'place', 'state', 'seed', 'reset']) assert.equal(typeof app[k], 'function', k);
  for (const [name, a] of Object.entries(app.actions)) {
    for (const k of ['describe', 'doing', 'hint']) assert.ok(typeof a[k] === 'string' && a[k], `${name}.${k}`);
    const words = a.doing.split(/\s+/).length;
    assert.ok(words >= 2 && words <= 5, `${name}.doing is 2 to 5 words`);
    assert.equal(a.params?.type, 'object', `${name}.params`);
    assert.equal(typeof a.verify, 'function');
    if (a.gate) { assert.equal(typeof a.readback, 'function', `${name}.readback`); assert.equal(a.undo, undefined, `${name} gated, no undo`); }
  }
  assert.deepEqual(Object.entries(app.actions).filter(([, a]) => a.gate).map(([n]) => n), gated);
}
