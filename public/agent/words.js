// Reserved words: the OS's, never the model's (spec §2). Deterministic; nothing reaches the planner before this.
// A reserved phrase counts only when it is the whole utterance, or is followed by a sentence break or by another
// reserved phrase ("Stop. Where am I?"). Inside content ("tell Mum to stop worrying") it is content.

const PHRASES = {
  stop: ['stop', 'stop it', 'stop that', 'stop reading', 'stop now', 'cancel', 'hang on', 'wait'],
  where: ['where am i', 'where was i', 'where are we'],
  undo: ['undo', 'undo that', 'undo it', 'take that back'],
  carry_on: ['carry on', 'continue', 'keep going', 'go on', 'resume'],
  again: ['again', 'say again', 'say that again', 'repeat', 'repeat that', 'sorry again', 'pardon'],
  more: ['more', 'tell me more', 'say more', 'explain', 'explain that', 'longer', 'more detail', 'in more detail'],
  take_over: ["i'll do it", 'i will do it', 'let me do it', "i'll take over", 'let me'],
};
// Confirm words open nothing by themselves: they only count while a gate is open (see hear()). Never ok or mm.
const CONFIRM = { yes: ['yes', 'yes please', 'yes send it', 'yes do it', 'yes pay', 'yes call'],
  send: ['send', 'send it', 'send that'], pay: ['pay', 'pay it', 'pay now'], call: ['call', 'call them', 'call now'] };
const DENY = ['no', 'no thanks', "don't", "don't send it", 'not now', 'leave it'];
const FILLER = new Set(['um', 'uh', 'er', 'erm', 'please', 'murmur', 'hey', 'now', 'okay', 'ok', 'so']);
export const GATE_GRACE_MS = 500;

const norm = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' .,!?;:]/g, ' ');
const tokens = (s) => s.split(/\s+/).filter(Boolean);

// Longest phrase first, so "stop reading" wins over "stop".
const TABLE = Object.entries(PHRASES).flatMap(([kind, list]) => list.map((p) => ({ kind, words: tokens(p) })))
  .sort((a, b) => b.words.length - a.words.length);
const CONFIRM_TABLE = Object.entries(CONFIRM).flatMap(([word, list]) => list.map((p) => ({ kind: 'confirm', word, words: tokens(p) })))
  .concat(DENY.map((p) => ({ kind: 'deny', words: tokens(p) })))
  .sort((a, b) => b.words.length - a.words.length);

/** Split into words, keeping sentence breaks as '.' tokens. Fillers go. */
function wordsOf(text) {
  return tokens(norm(text).replace(/[.,!?;:]+/g, ' . ')).filter((w) => !FILLER.has(w));
}

function matchAt(ws, i, table) {
  for (const row of table) if (row.words.every((w, k) => ws[i + k] === w)) return row;
  return null;
}

/**
 * Read the OS's words off the front of an utterance.
 * @returns {{ words: Array<{kind:string, word?:string}>, rest: string }} words in order; rest is content for the planner.
 * With `gate` open ({openedAt}), confirm and deny words count too; a confirm in the first 0.5 s is ignored.
 */
export function hear(text, { gate = null, now = Date.now() } = {}) {
  const ws = wordsOf(text);
  const table = gate ? CONFIRM_TABLE.concat(TABLE).sort((a, b) => b.words.length - a.words.length) : TABLE;
  const found = [];
  let i = 0;
  while (i < ws.length) {
    if (ws[i] === '.') { i++; continue; }
    const row = matchAt(ws, i, table);
    if (!row) break;
    const j = i + row.words.length;
    // A phrase followed by content with no break is content: "stop worrying", "send Mum a note".
    if (j < ws.length && ws[j] !== '.' && !matchAt(ws, j, table)) break;
    if (row.kind === 'confirm') {
      const early = now - gate.openedAt < GATE_GRACE_MS;
      const fits = row.word === 'yes' || row.word === gate.gate; // "pay" cannot confirm a send
      found.push(early ? { kind: 'ignored', reason: 'early' } : fits ? { kind: 'confirm', word: row.word } : { kind: 'ignored', reason: 'wrong-word' });
    } else found.push({ kind: row.kind });
    i = j;
  }
  if (!found.length) return { words: [], rest: String(text || '').trim() };
  // Rest keeps the person's own words: drop as many leading words as were consumed.
  const consumed = ws.slice(0, i).filter((w) => w !== '.').length;
  const original = tokens(String(text || '').replace(/[.,!?;:]+/g, ' '));
  let k = 0;
  for (let n = 0; k < original.length && n < consumed; k++) if (!FILLER.has(norm(original[k]).trim())) n++;
  while (k < original.length && FILLER.has(norm(original[k]).trim())) k++;
  return { words: found, rest: original.slice(k).join(' ') };
}
