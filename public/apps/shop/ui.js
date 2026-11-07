// Shared by Shop, Transit and Travel: real buttons, one click path for the person and the agent.
// shortcut: lives under apps/shop because Hermes owns only these folders; move into sdk/ if the SDK grows a kit.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

// Attribute order is fixed (data-act, then data-arg) so find() and the tests can rely on it.
export function btn(act, label, arg) {
  const a = arg == null ? '' : ` data-arg="${esc(arg)}"`;
  return `<button type="button" class="m-app-btn" data-act="${esc(act)}"${a}>${esc(label)}</button>`;
}

export function find(root, act, arg) {
  const sel = `[data-act="${act}"]` + (arg == null ? '' : `[data-arg="${String(arg).replace(/"/g, '\\"')}"]`);
  return root.querySelector(sel);
}

// One delegated listener per root; handlers get the button's data-arg.
export function wire(root, handlers) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-act]');
    const h = b && handlers[b.dataset.act];
    if (h) h(b.dataset.arg);
  });
}

export const money = (p) => `£${p % 100 ? (p / 100).toFixed(2) : p / 100}`; // "£88", not "£88.00", when spoken

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];
export const num = (n) => WORDS[n] ?? (n < 60 ? TENS[Math.floor(n / 10)] + (n % 10 ? `-${WORDS[n % 10]}` : '') : String(n));
export const minutes = (n) => (n <= 0 ? 'now' : n === 1 ? 'in one minute' : `in ${num(n)} minutes`);

// "ten past", "half past", "quarter to", "nine forty": how a friend says a clock time.
export function spokenTime(d) {
  const h = d.getHours() % 12 || 12, m = d.getMinutes(), next = (h % 12) + 1;
  if (m === 0) return `${num(h)} o'clock`;
  if (m === 15) return 'quarter past';
  if (m === 30) return 'half past';
  if (m === 45) return 'quarter to';
  if (m < 30 && m % 5 === 0) return `${num(m)} past`;
  if (m > 30 && m % 5 === 0) return `${num(60 - m)} to ${num(next)}`;
  return `${num(h)} ${m < 10 ? `oh ${num(m)}` : num(m)}`;
}

export const CSS = `
.m-app { max-width: var(--w-column, 720px); margin: 0 auto; padding: var(--gutter, 16px); font-family: var(--f-read, system-ui); line-height: var(--lh, 1.4); color: var(--c-ink); }
.m-app h1 { font-size: var(--fs-h1, 1.75rem); margin: 0 0 .25em; }
.m-app h2 { font-size: var(--fs-title, 1.375rem); margin: 1em 0 .25em; }
.m-app .m-app-place { color: var(--c-quiet); margin: 0 0 1em; }
.m-app ul { list-style: none; padding: 0; margin: 0; }
.m-app li { border-top: 1px solid var(--c-slat); padding: .5em 0; display: flex; flex-wrap: wrap; gap: .5em; align-items: center; justify-content: space-between; }
.m-app-btn { min-height: var(--h-link, 64px); min-width: 64px; padding: 0 1em; font: inherit; font-weight: 700; color: var(--c-ink); background: var(--c-board); border: 2px solid var(--c-slat); border-radius: var(--r-btn, 12px); cursor: pointer; }
.m-app-btn:focus-visible { outline: var(--ring, 4px) solid var(--c-focus); outline-offset: var(--ring-off, 3px); }
.m-app-btn[data-main] { background: var(--c-accent); color: var(--c-on-accent); border-color: var(--c-accent); }
.m-app-btn:disabled { opacity: .5; cursor: default; }
.m-app .m-app-total { font-family: var(--f-time, monospace); font-size: var(--fs-title, 1.375rem); }
`;
let styled = false;
export function style(doc = globalThis.document) {
  if (styled || !doc?.head) return;
  styled = true;
  const s = doc.createElement('style');
  s.textContent = CSS;
  doc.head.append(s);
}

// In-memory kv with the browser-kv contract, for when the OS gives none (tests, a bare page).
export function memKV() {
  const m = new Map();
  return {
    async get(a, k) { return m.get(`${a}:${k}`); },
    async set(a, k, v) { if (v === undefined) m.delete(`${a}:${k}`); else m.set(`${a}:${k}`, structuredClone(v)); },
    async getAll(a) { const o = {}; for (const [k, v] of m) if (k.startsWith(`${a}:`)) o[k.slice(a.length + 1)] = v; return o; },
  };
}
