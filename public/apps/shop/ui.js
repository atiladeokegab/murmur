// Shared by Shop, Transit and Travel: real elements, one direct listener per control (os/contract.md §2.1).
// shortcut: lives under apps/shop because Hermes owns only these folders; move into sdk/ if the SDK grows a kit.

/** h(doc, 'li', { id, className, 'aria-x': … }, ...kids): a real element. */
export function h(doc, tag, props = {}, ...kids) {
  const n = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v != null) { if (k.startsWith('aria-') || k.startsWith('data-') || k === 'for' || k === 'role') n.setAttribute(k, v); else n[k] = v; }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}

/** A per-app control table: btn() makes a named button and files it under (act, arg) so run() can find it. */
export function controls(doc) {
  const map = new Map();
  return {
    clear() { map.clear(); },
    btn(act, label, onClick, { arg = null, main = false } = {}) {
      const b = h(doc, 'button', { type: 'button', className: main ? 'm-app-btn m-app-main' : 'm-app-btn', textContent: label });
      b.addEventListener('click', () => onClick(arg));
      map.set(`${act}|${arg ?? ''}`, b);
      return b;
    },
    find(act, arg = null) { return map.get(`${act}|${arg ?? ''}`) || null; },
  };
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
.m-app-body ul, .m-app-body ol { list-style: none; padding: 0; margin: 0; }
.m-app-body li { border-top: var(--bw-talk) solid var(--c-slat); padding: var(--pad-tile); display: flex; flex-wrap: wrap; gap: var(--ring); align-items: center; justify-content: space-between; }
.m-app .m-app-place { color: var(--c-quiet); }
.m-app-btn { min-height: var(--h-link); min-width: var(--h-link); padding: var(--pad-tile); font: inherit; font-weight: 700; color: var(--c-ink); background: var(--c-board); border: var(--bw-talk) solid var(--c-slat); border-radius: var(--r-btn); cursor: pointer; }
.m-app-btn:focus-visible { outline: var(--ring) solid var(--c-focus); outline-offset: var(--ring-off); }
.m-app-main { background: var(--c-accent); color: var(--c-on-accent); border-color: var(--c-accent); }
.m-app-total { font-family: var(--f-time); font-size: var(--fs-title); }
`;
let styled = false;
export function style(doc = globalThis.document) {
  if (styled || !doc?.head) return;
  styled = true;
  const s = doc.createElement('style');
  s.textContent = CSS;
  doc.head.append(s);
}

// In-memory kv with the appKv shape (get, set, all), for a bare mount with no OS.
export function memKV() {
  const m = new Map();
  return {
    async get(k) { return structuredClone(m.get(k)); },
    async set(k, v) { if (v === undefined) m.delete(k); else m.set(k, structuredClone(v)); },
    async all() { return Object.fromEntries(m); },
  };
}
