// Read and write by voice: sentences, where am I, change X to Y. Pure; tested in test/notes.test.js.

export function sentences(text) {
  return (String(text).match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || []).map((s) => s.trim()).filter(Boolean);
}

/** "Sentence 3 of 8, the part about lunch with Mum." */
export function whereAmI(text, index) {
  const all = sentences(text);
  if (!all.length) return 'This one is empty.';
  const i = Math.min(Math.max(index, 0), all.length - 1);
  const gist = all[i].replace(/[.!?]+$/, '').split(/\s+/).slice(0, 5).join(' ').toLowerCase();
  return `Sentence ${i + 1} of ${all.length}, the part that starts "${gist}".`;
}

/**
 * Replace the first whole-word, case-insensitive match of `from` with `to`, preferring the sentence at
 * `index`. Keeps a leading capital. Returns { text, index, changed } where index is the edited sentence.
 */
export function replaceWord(text, from, to, index = 0) {
  const all = sentences(text);
  const esc = String(from).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!esc) return { text, index, changed: false };
  const re = new RegExp(`\\b${esc}\\b`, 'i');
  const order = [index, ...all.keys()].filter((i, k, a) => i >= 0 && i < all.length && a.indexOf(i) === k);
  for (const i of order) {
    const m = all[i].match(re);
    if (!m) continue;
    const word = /^[A-Z]/.test(m[0]) ? to.charAt(0).toUpperCase() + to.slice(1) : to;
    all[i] = all[i].replace(re, word);
    return { text: all.join(' '), index: i, changed: true };
  }
  return { text, index, changed: false };
}
