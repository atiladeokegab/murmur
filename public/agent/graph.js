// The person's graph: who and what Murmur knows about them, on this device only.
// An in-memory graph answers at once; SurrealDB (embedded WASM, IndexedDB) loads after the phone is ready, keeps it
// across reloads and takes every write. If it never loads, the memory graph is the whole thing and nothing breaks.

import { NO_GO } from './demo-plan.js';

// A view of the Librarian, never a second memory (spec §3.4): it mirrors only what the Librarian keeps (your look,
// a proposal you said Yes to), only while learning is on. Health, money and government never enter (refusal()'s list too).
const HEALTH = /\b(health\w*|diabet\w*|pain\w*|medic\w*|diagnos\w*|symptom\w*|ill(?:ness)?|sick\w*|doctor|gp|nhs|prescri\w*|pills?|asthma|cancer|depress\w*|anxi\w*|therap\w*|hospital|blind\w*|sight|disab\w*|condition)\b/i;
const MONEY = /\b(bank\w*|money|balance|account|card|pay\w*|salary|loan|debt|sort code|savings?|\d+\s*(?:pounds?|quid|euros?|dollars?|pence|p))\b|[£$€]/i;
const GOV = /\b(passport|benefits?|universal credit|pension|tax\w*|hmrc|council|dvla|visa|immigration|court|police|vote|voting)\b/i;
export const EDGES = ['knows', 'prefers', 'usually', 'lives_at', 'goes_to'];
export const graphAllowed = (from, edge, to) => EDGES.includes(edge) && ![from, to].some((t) => [HEALTH, MONEY, GOV, NO_GO].some((re) => re.test(t)));

const LINE = {
  knows: (e) => `you text ${e.to}`, prefers: (e) => `you like ${e.to}`, usually: (e) => `you ${e.to}`,
  lives_at: (e) => `${e.from} lives at ${e.to}`, goes_to: (e) => `you go to ${e.to}`,
};
const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}` : xs[0] || '');
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());

/** The short answer (one line per kind, the strongest first) and the full one ("tell me more"). */
export function sayAbout(edges) {
  if (!edges.length) return { short: 'Nothing yet.', more: 'Nothing yet.' };
  const top = (k) => edges.filter((e) => e.edge === k).sort((a, b) => b.weight - a.weight)[0];
  const k = top('knows'), short = [k && `${LINE.knows(k)} most`, top('prefers') && LINE.prefers(top('prefers')), top('usually') && LINE.usually(top('usually'))].filter(Boolean);
  return { short: `${cap(list(short.length ? short : [LINE[edges[0].edge](edges[0])]))}.`, more: `${cap(list(edges.map((e) => LINE[e.edge](e))))}.` };
}

/** Your look as preferences: what the graph says you like. */
export const lookPrefs = (look = {}) => [look.answers === 'detailed' ? 'long answers' : 'short answers', `text at ${look.size || 100}%`,
  look.speaker === 'reader' ? 'your screen reader speaking' : 'Murmur speaking'];

/**
 * @param {{ emit?(type, data) }} [bus]  gets `graph:relate` { from, edge, to } on every kept relate
 * @param {() => Promise<boolean>|boolean} [learning]  the Librarian's learning switch; off means no write at all
 */
export function createGraph({ bus, learning = () => false } = {}) {
  const edges = new Map(); // `${from}|${edge}|${to}` -> { from, edge, to, weight }
  let db = null, engine = 'fallback';
  const key = (e) => `${e.from}|${e.edge}|${e.to}`;
  const write = (fn) => db && fn(db).catch((e) => console.warn('[graph] write failed', e?.name));

  async function store(d, e) {
    const a = d.rid(e.from), b = d.rid(e.to);
    await d.query(`UPSERT $a SET name = $from; UPSERT $b SET name = $to; DELETE ${e.edge} WHERE in = $a AND out = $b;
      RELATE $a->${e.edge}->$b SET edge = $edge, weight = $weight;`, { a, b, ...e });
  }

  return {
    get engine() { return engine; },
    /** Remembers from -edge-> to; again strengthens it. Learning off, health, money, government and unknown edges: nothing. */
    async relate(from, edge, to) {
      [from, to] = [String(from).trim(), String(to).trim()];
      if (!from || !to || !graphAllowed(from, edge, to) || !(await learning())) return false;
      const e = edges.get(key({ from, edge, to })) || { from, edge, to, weight: 0 };
      e.weight++;
      edges.set(key(e), e);
      write((d) => store(d, e));
      bus?.emit?.('graph:relate', { from, edge, to });
      return true;
    },
    /** Every edge, the strongest first. */
    about() { return [...edges.values()].sort((a, b) => b.weight - a.weight).map((e) => ({ ...e })); },
    /** The edges a node (or a phrase in one, "check the bus") is part of, without deleting them. */
    find(node) { const n = String(node).toLowerCase().trim(); return n ? this.about().filter((e) => [e.from, e.to].some((t) => t.toLowerCase().includes(n))) : []; },
    /** Deletes those edges. The caller asks first (the delete gate). */
    forget(node) {
      const gone = this.find(node);
      for (const e of gone) { edges.delete(key(e)); write((d) => d.query(`DELETE ${e.edge} WHERE in = $a AND out = $b`, { a: d.rid(e.from), b: d.rid(e.to) })); }
      return gone.length;
    },
    /** Boot: your look, which the Librarian already keeps in your profile. */
    async seed({ look = {} } = {}) { for (const p of lookPrefs(look)) await this.relate('you', 'prefers', p); },
    /** The Librarian's own events: only a proposal you said Yes to becomes an edge. A send, a tap or a run never does. */
    listen(on) {
      on('memory', (e) => { if (e?.response?.id === 'first:transit' && e.response.answer === 'Yes') this.relate('you', 'usually', 'check the bus first in the morning'); });
    },
    /** A look change: the old preference goes, the new one is remembered. */
    async lookChanged(look) {
      const now = lookPrefs(look);
      for (const e of this.about()) if (e.edge === 'prefers' && !now.includes(e.to)) this.forget(e.to);
      for (const p of now) if (!edges.has(key({ from: 'you', edge: 'prefers', to: p }))) await this.relate('you', 'prefers', p);
    },
    /** After ready: the real engine. Reads what IndexedDB kept, then writes through. Fails soft to the memory graph. */
    async load() {
      try {
        const [{ Surreal, RecordId }, { createWasmWorkerEngines }] = await Promise.all([import('../vendor/surreal/surrealdb.js'), import('../vendor/surreal/wasm.js')]);
        const d = new Surreal({ engines: createWasmWorkerEngines() }); // IndexedDB needs the engine in a dedicated worker
        await d.connect('indxdb://murmur-graph');
        await d.use({ namespace: 'murmur', database: 'graph' });
        d.rid = (t) => new RecordId('node', t);
        await d.query(['node', ...EDGES].map((t) => `DEFINE TABLE IF NOT EXISTS ${t}${t === 'node' ? '' : ' TYPE RELATION'};`).join(' '));
        const [kept] = await d.query(`SELECT edge, weight, in.name AS from, out.name AS to FROM ${EDGES.join(', ')}`);
        for (const e of kept || []) if (graphAllowed(e.from, e.edge, e.to)) edges.set(key(e), { from: e.from, edge: e.edge, to: e.to, weight: Math.max(Number(e.weight) || 1, edges.get(key(e))?.weight || 0) });
        for (const e of edges.values()) await store(d, e);
        db = d; engine = 'surreal';
      } catch (e) { console.info('[graph] engine fallback', e?.name || e, e?.message); }
      console.info(`graph engine: ${engine}`);
      return engine;
    },
  };
}
