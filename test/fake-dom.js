// Just enough DOM for the SDK tests in node: elements, ids, labels, events, click, value, simple selectors.
class Node {
  constructor(doc, tag) { this.ownerDocument = doc; this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
    this.attrs = {}; this.listeners = {}; this.dataset = {}; this.style = { setProperty() {} }; this.hidden = false; this._text = ''; this.disabled = false; }
  get id() { return this.attrs.id || ''; } set id(v) { this.attrs.id = v; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); } set textContent(v) { this._text = String(v); this.children = []; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
  append(...kids) { for (const k of kids) { if (typeof k === 'string') this._text += k; else { k.parentNode = this; this.children.push(k); } } }
  replaceChildren(...kids) { this.children = []; this._text = ''; this.append(...kids); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  *all() { for (const c of this.children) { yield c; yield* c.all(); } }
  matches(sel) {
    return sel.split(',').some((s) => {
      const m = /^\s*([a-z0-9]*)(?:\[([a-z-]+)(?:="([^"]*)")?\])?\s*$/i.exec(s);
      if (!m) return false;
      const [, tag, attr, val] = m;
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if (attr === 'href' && val === undefined) return 'href' in this.attrs;
      if (attr) return val === undefined ? attr in this.attrs : this.attrs[attr] === val;
      return true;
    });
  }
  querySelector(sel) { for (const n of this.all()) if (sel.startsWith('#') ? n.id === sel.slice(1) : n.matches(sel)) return n; return null; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  dispatchEvent(e) { for (let x = this; x; x = x.parentNode) for (const fn of x.listeners[e.type] || []) fn(e); return true; }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click', { bubbles: true })); }
  focus() { this.ownerDocument.activeElement = this; }
  get labels() { const id = this.id; return id ? [...this.ownerDocument.body.all()].filter((n) => n.tagName === 'LABEL' && n.attrs.for === id) : []; }
}
class Field extends Node { constructor(d, t) { super(d, t); this.value = ''; } }
export function fakeDocument() {
  const doc = { activeElement: null };
  doc.createElement = (tag) => (/^(textarea|input|select)$/i.test(tag) ? new Field(doc, tag) : new Node(doc, tag));
  doc.body = new Node(doc, 'body');
  doc.getElementById = (id) => doc.body.querySelector(`#${id}`);
  return doc;
}
export function fakeStorage() {
  const m = new Map();
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
