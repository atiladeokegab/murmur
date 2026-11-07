// The deterministic provider: Murmur's lines with no API key. Same reply shape as the Gemini path:
// { say, action } where action is one of
//   { type: 'open', tile } | { type: 'draft', to, text? } | { type: 'pay', item }
//   { type: 'read' } | { type: 'where' } | { type: 'stop' } | { type: 'resume' } | { type: 'edit', from, to }
//   { type: 'send' } | { type: 'yes' } | { type: 'no' } | null

const has = (t, ...words) => words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(t));

export function chat(input) {
  const t = String(input || '').trim();
  let m;
  if (!t) return { say: "I didn't catch that. Hold the bar and try again.", action: null };
  if ((m = t.match(/\b(?:change|replace|swap)\s+(.+?)\s+(?:to|with|for)\s+(.+?)[.!?]*$/i))) {
    return { say: `Changing ${m[1]} to ${m[2]}.`, action: { type: 'edit', from: m[1], to: m[2] } };
  }
  if (has(t, 'where am i', 'where was i')) return { say: '', action: { type: 'where' } };
  if (/^(stop|pause|quiet|hush)\b/i.test(t)) return { say: 'Stopped.', action: { type: 'stop' } };
  if (has(t, 'carry on', 'continue', 'keep going', 'go on', 'resume')) return { say: '', action: { type: 'resume' } };
  if (/^(yes|yeah|yep|do it|go ahead|ok|okay|sure)\b/i.test(t)) return { say: '', action: { type: 'yes' } };
  if (/^(no|nope|cancel|not now|don't)\b/i.test(t)) return { say: 'Okay, I left it.', action: { type: 'no' } };
  if (/^send\b/i.test(t)) return { say: '', action: { type: 'send' } };
  if (has(t, 'read it', 'read that', 'read again', 'from the top')) return { say: '', action: { type: 'read' } };
  if ((m = t.match(/\b(?:tell|message|text|send)\s+mum\s+(?:that\s+)?(.{3,})$/i))) {
    const text = m[1].replace(/^./, (c) => c.toUpperCase()).replace(/([^.!?])$/, '$1.');
    return { say: `I'll send Mum: ${text} Send it?`, action: { type: 'draft', to: 'mum', text } };
  }
  if (has(t, 'mum', 'mom', 'mother')) return { say: '', action: { type: 'draft', to: 'mum' } };
  if (has(t, 'beans', 'coffee', 'usual')) return { say: '', action: { type: 'pay', item: 'beans' } };
  if (has(t, 'notes?', 'note', 'list')) return { say: '', action: { type: 'open', tile: 'notes' } };
  if (has(t, 'bus', 'work', 'directions')) return { say: '', action: { type: 'open', tile: 'bus' } };
  if (has(t, 'uber', 'ride', 'taxi', 'cab', 'home')) return { say: '', action: { type: 'open', tile: 'ride' } };
  if (has(t, 'sam')) return { say: '', action: { type: 'open', tile: 'sam' } };
  if (has(t, 'weather', 'rain', 'coat')) return { say: '', action: { type: 'open', tile: 'weather' } };
  if (has(t, 'hello', 'hi', 'hey', 'morning', 'evening')) return { say: 'Hello. Tap your top tile, or tell me what you need.', action: null };
  return { say: "I can't do that one yet. I can read your notes, message Mum, or order your beans.", action: null };
}

/** The line Murmur says when the menu opens. Written to be heard, not read. */
export function menuLine({ part = 'day', top = '', moved = [] } = {}) {
  const hello = { morning: 'Morning.', afternoon: 'Afternoon.', evening: 'Evening.', night: 'Hello.' }[part] || 'Hello.';
  if (moved.length) return `${hello} ${moved[0]} moved up, you've done it a lot this week. ${top} is still first.`;
  return `${hello} ${top} is first. Tap it, or hold the bar and tell me.`;
}
