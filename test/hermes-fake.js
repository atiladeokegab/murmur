// A just-enough DOM root for Hermes's app tests: innerHTML, one delegated click listener, and
// querySelector for [data-act="x"][data-arg="y"]. Clicking goes through the app's own listener,
// so a test proves the button exists, is enabled and is wired, the same path the agent's tap takes.
import { memKV } from '../public/apps/shop/ui.js';

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function fakeRoot() {
  let html = '', listener = null;
  const root = {
    get innerHTML() { return html; }, set innerHTML(v) { html = v; },
    ownerDocument: null,
    addEventListener(type, fn) { if (type === 'click') listener = fn; },
    querySelector(sel) {
      const want = [...sel.matchAll(/\[data-(act|arg)="((?:[^"\\]|\\.)*)"\]/g)].map((m) => [m[1], m[2].replace(/\\"/g, '"')]);
      for (const tag of html.match(/<button\b[^>]*>/g) || []) {
        const attrs = Object.fromEntries([...tag.matchAll(/data-(act|arg)="([^"]*)"/g)].map((m) => [m[1], unesc(m[2])]));
        if (want.every(([k, v]) => attrs[k] === v)) {
          const el = { dataset: attrs, disabled: /\sdisabled\b/.test(tag), tag,
            closest: () => el, click() { if (!el.disabled) listener?.({ target: el }); } };
          return el;
        }
      }
      return null;
    },
    text() { return unesc(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); },
  };
  return root;
}

// The agent's ctx as the spec describes it: tap a real control or fail loudly.
export function fakeCtx(log = []) {
  return {
    log, kv: memKV(),
    async tap(el) { if (!el) throw new Error('tap: no such control'); log.push(el.dataset.act); el.click(); await null; },
    async type() {}, async say(t) { log.push(`say:${t}`); }, async confirm() { return true; },
  };
}

// Run one action the way the runner does: gate check stays the runner's, then run, then verify.
export async function act(app, name, params = {}, ctx = fakeCtx()) {
  const a = app.actions[name];
  if (!a) throw new Error(`no action ${name}`);
  await a.run(params, ctx);
  return a.verify(app.state(), params);
}
