// Phone: the shell's own settings as an app, so the agent reaches every one the person can (native access).
// Real buttons on a real page; the agent presses them through ctx like any app. Left off the board: the link
// under the board opens it. Your look's rows are the look app's own tools (look__*).
export function createPhone(os) {
  // os: { stop(), where(), noLook(on), isNoLook(), sound(on), isSound() } from the shell
  let root = null, b = {}, wheres = 0, stops = 0, want = 0;
  const el = (tag, props = {}, ...kids) => {
    const n = root.ownerDocument.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (k.startsWith('aria-')) n.setAttribute(k, v); else n[k] = v;
    n.append(...kids);
    return n;
  };
  const render = () => {
    b.sound.textContent = os.isSound() ? 'Sounds: on' : 'Sounds: off';
    b.sound.setAttribute('aria-pressed', String(os.isSound()));
    b.noLook.textContent = os.isNoLook() ? 'No-look mode: on' : 'No-look mode: off';
    b.noLook.setAttribute('aria-pressed', String(os.isNoLook()));
  };
  const btn = (id, text, on) => {
    const x = el('button', { type: 'button', id: `phone-${id}`, className: 'app-btn', textContent: text });
    x.addEventListener('click', async () => { await on(); render(); });
    return (b[id] = x);
  };
  const toggle = (key, is) => ({
    params: { type: 'object', properties: { on: { type: 'boolean', description: 'true to turn it on' } }, required: ['on'] },
    async run(p, ctx) { if (is() !== p.on) await ctx.tap(b[key]); },
    verify: (s, p) => s[key] === p.on || 'It did not change.',
  });
  return {
    id: 'phone',
    name: 'Phone',
    async mount(r) {
      root = r;
      root.append(el('h2', { id: 'phone-h', textContent: 'Phone' }),
        btn('sound', '', () => os.sound(!os.isSound())),
        btn('noLook', '', () => os.noLook(!os.isNoLook())),
        btn('where', 'Where am I?', async () => { wheres++; await os.where(); }), // counted on the press: speaking it can take seconds
        btn('stop', 'Stop what Murmur is doing', async () => { stops++; await os.stop(); }));
      render();
    },
    read: () => `Phone. Sounds are ${os.isSound() ? 'on' : 'off'}. No-look mode is ${os.isNoLook() ? 'on' : 'off'}.`,
    place: () => ({ where: 'Phone' }),
    state: () => ({ sound: os.isSound(), noLook: os.isNoLook(), wheres, stops }),
    async seed() { if (root) render(); },
    async reset() { if (!os.isSound()) await os.sound(true); if (os.isNoLook()) await os.noLook(false); if (root) render(); },
    actions: {
      sound: { describe: 'Turn Murmur\'s sounds on or off (the haptics stay)', doing: 'Changing sounds', hint: 'Sounds is the first button on the Phone page.', ...toggle('sound', os.isSound) },
      noLook: { describe: 'Turn no-look mode on or off: tap anywhere to talk, swipe to stop', doing: 'Changing no-look mode', hint: 'No-look mode is the second button on the Phone page.', ...toggle('noLook', os.isNoLook) },
      where: { describe: 'Say where the person is now', doing: 'Saying where you are', hint: 'Where am I is on the Phone page.',
        params: { type: 'object', properties: {} }, async run(p, ctx) { want = wheres + 1; await ctx.tap(b.where); }, verify: (s) => s.wheres >= want || 'It did not say.' },
      stop: { describe: 'Stop what Murmur is doing now', doing: 'Stopping', hint: 'Stop is on the Phone page, and the Stop bar is at the top.',
        params: { type: 'object', properties: {} }, async run(p, ctx) { want = stops + 1; await ctx.tap(b.stop); }, verify: (s) => s.stops >= want || 'It did not stop.' },
    },
  };
}
