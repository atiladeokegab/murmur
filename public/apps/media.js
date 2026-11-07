// The phone's media apps (Spotify, Podcasts, Audible, BBC Sounds, Netflix, YouTube), all from one maker: a screen in
// Murmur's own look (names as text only, no logos or colours) and play, pause, next and what's playing by voice.
// Every song, show and episode is invented. Nothing is gated: playing is the person's own, and nothing leaves the phone.
// shortcut: what is playing lives in memory, so a reload starts each app over; keep it in kv if that matters.
export function createMedia({ id, name, items, noun = 'track' }) {
  const fresh = () => ({ at: 0, playing: false, said: null, note: '' });
  let s = fresh(), root = null, os = null, body = null;
  const q = (sel) => root && root.querySelector(sel);
  const now = () => items[s.at];
  const DO = {
    play: () => { s.playing = true; return `Playing ${now()}.`; },
    pause: () => { s.playing = false; return `Paused ${name}.`; },
    next: () => { s.at = (s.at + 1) % items.length; s.playing = true; return `Playing ${now()}.`; },
    playing: () => { s.said = 'playing'; return s.playing ? `Playing ${now()}.` : `Nothing is playing on ${name}. Next up is ${now()}.`; },
  };
  const LABEL = { play: 'Play', pause: 'Pause', next: `Next ${noun}`, playing: "What's playing" };
  const press = (c, e) => { s.note = DO[c](); render(); if (e?.isTrusted) os?.say?.(s.note); }; // a person's tap speaks; the agent's run says it

  function el(tag, props = {}, ...kids) {
    const n = root.ownerDocument.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role') n.setAttribute(k, String(v));
      else if (k === 'onclick') n.addEventListener('click', v);
      else n[k] = v;
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
    return n;
  }
  function render() {
    if (!body) return;
    const had = root.contains(root.ownerDocument.activeElement) && root.ownerDocument.activeElement.id;
    body.replaceChildren(
      el('p', { className: 'app-done', 'aria-live': 'polite' }, s.note),
      el('p', { className: 'app-why', id: `${id}-now` }, s.playing ? `Now playing: ${now()}` : `Paused. Up next: ${now()}`),
      el('ol', { className: 'app-list', 'aria-label': `Up next on ${name}` }, items.map((t, i) => el('li', { 'aria-current': i === s.at ? 'true' : 'false' }, i === s.at ? el('b', {}, t) : t))),
      ...Object.keys(DO).map((c) => el('button', { type: 'button', id: `${id}-${c}`, className: c === 'play' ? 'app-btn primary' : 'app-btn', style: 'padding-inline: clamp(0.25rem, 4vw, 1rem)', onclick: (e) => press(c, e) }, LABEL[c])));
    if (had) q(`#${had}`)?.focus();
  }
  const action = (c, describe, say, doing, verify) => ({
    describe, say, doing, params: { type: 'object', properties: {} }, gate: null, hint: `${LABEL[c]} is a button on ${name}`,
    async run(p, ctx) { await ctx.tap(q(`#${id}-${c}`)); await ctx.say(s.note); },
    verify: (st) => verify(st) || `${name} did not do that.`,
  });
  return {
    id, name,
    async mount(r, o) { root = r; os = o; root.append(el('h2', { id: `${id}-h` }, name), body = el('div', { className: 'app-body' })); render(); },
    async seed() { render(); },
    async reset() { s = fresh(); render(); },
    state: () => ({ ...s, now: now() }),
    read: () => (s.playing ? `Playing ${now()}.` : `Paused. Up next is ${now()}.`),
    place: () => ({ where: name, item: now(), next: s.playing ? 'pause' : 'play' }),
    // Step lines are shared by every media app: the boot voice warm says each fixed line once, under a daily cap.
    actions: {
      play: action('play', `Play on ${name}`, `Play ${name}`, 'Pressing Play', (st) => st.playing),
      pause: action('pause', `Pause ${name}`, `Pause ${name}`, 'Pausing', (st) => !st.playing),
      next: action('next', `Play the next ${noun} on ${name}`, `Next ${noun} on ${name}`, 'Playing the next one', (st) => st.playing),
      playing: action('playing', `Say what is playing on ${name}`, `What's playing on ${name}`, "Checking what's playing", (st) => st.said === 'playing'),
    },
  };
}
