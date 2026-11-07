// Narration comes from the apps, not the model (spec §3.2): step labels are each action's `doing`, done lines
// the app's read(), and where-am-I is place(). The runner speaks them; this file only words place().

/** place() -> "Mum's chat, your reply, sentence 2 of 2. Next: send it?" */
export function placeLine(p) {
  if (!p) return "You're on the board.";
  if (typeof p === 'string') return p;
  const bits = [p.where, p.item, p.n && p.of ? `sentence ${p.n} of ${p.of}` : null].filter(Boolean);
  const next = ''; // the lead, 7 Nov: never tell people where buttons are; Murmur just does it
  return `${bits.join(', ') || "You're on the board"}.${next}`;
}
