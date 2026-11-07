// Narration is a function of bus events, not of the model (spec §3.2): step labels come from the action's
// describe, done lines from the app's read(). The model writes nothing the person hears except a reply to a question.

/** place() -> "Mum's chat, your reply, sentence 2 of 2. Next: send it?" */
export function placeLine(p) {
  if (!p) return "You're on the board.";
  if (typeof p === 'string') return p;
  const bits = [p.where, p.item, p.n && p.of ? `sentence ${p.n} of ${p.of}` : null].filter(Boolean);
  const next = p.next ? ` Next: ${p.next.replace(/[?.]$/, '')}?` : '';
  return `${bits.join(', ') || "You're on the board"}.${next}`;
}

export function attachNarration(bus, voice) {
  let offered = '';
  const offs = [
    bus.on('say', (e) => e.text && voice.say(e.text)),
    bus.on('step:next', (e) => { offered = e.label; voice.say(e.label); }),
    bus.on('step:start', (e) => { if (e.label && e.label !== offered && !e.gate) voice.say(e.label); offered = ''; }),
    bus.on('task:done', (e) => e.line && voice.say(e.line)),
  ];
  return () => offs.forEach((off) => off?.());
}
