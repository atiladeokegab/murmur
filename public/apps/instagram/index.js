// Instagram, by voice: hear the new photos with their captions, and like one. Liking needs no gate (nothing is sent
// to anyone). Name is text only: no logo, no brand colour. Every post is invented. Contract: os/contract.md.
const fresh = () => ({
  at: -1,
  posts: [
    { id: 'p1', from: 'Priya', photo: 'A long beach at low tide, two dogs running', caption: 'Morning walk by the sea.', liked: false },
    { id: 'p2', from: 'Tomas', photo: 'A bowl of ramen on a wooden table', caption: 'Found the best noodles in town.', liked: false },
    { id: 'p3', from: 'Priya', photo: 'A lighthouse at sunset', caption: 'Made it to the end of the pier.', liked: false },
  ],
});
let s = fresh(), root = null, os = null, body = null;
const q = (sel) => root && root.querySelector(sel);
const save = () => os?.kv?.set('state', s);
const line = (p) => `${p.from}: ${p.photo}. ${p.caption}`;

const app = {
  id: 'instagram',
  name: 'Instagram',
  async mount(r, o) {
    root = r; os = o;
    const saved = await os?.kv?.get('state');
    if (saved?.posts) s = saved;
    root.append(el('h2', { id: 'ig-h' }, 'Instagram'), body = el('div', { className: 'app-body' }));
    render();
  },
  async seed() { s = fresh(); await save(); render(); },
  async reset() { s = fresh(); await save(); render(); },
  state: () => structuredClone(s),
  read: () => `${s.posts.length} new posts. ${s.posts.map(line).join(' ')}`,
  place: () => ({ where: 'Instagram', item: s.at >= 0 ? `${s.posts[s.at].from}'s post` : 'the feed', n: s.at + 1, of: s.posts.length, next: s.at >= 0 ? 'like' : 'whatsNew' }),

  actions: {
    whatsNew: {
      describe: 'Read the new Instagram posts with their captions ("what\'s new")',
      doing: 'Reading the new posts',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Each post is a button in the feed under the Instagram heading',
      async run(p, ctx) {
        for (const x of s.posts) { await ctx.tap(q(`[data-post="${x.id}"]`)); await ctx.say(line(x)); }
      },
      verify: (st) => st.at === st.posts.length - 1 || 'The feed was not read.',
    },
    like: {
      describe: 'Like the post just read ("like it")',
      doing: 'Liking the post',
      params: { type: 'object', properties: {} },
      gate: null,
      hint: 'Like is the button under the post that is read',
      async run(p, ctx) {
        if (s.at < 0) throw new Error('Say what\'s new first, then like it.');
        await ctx.tap(q('#ig-like'));
        await ctx.say(`Liked ${s.posts[s.at].from}'s post.`);
      },
      verify: (st) => (st.at >= 0 && st.posts[st.at].liked) || 'It was not liked.',
    },
  },
};
export default app;

// ---------- the screen ----------
function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('aria-') || k.startsWith('data-') || k === 'for') n.setAttribute(k, String(v));
    else if (k === 'onclick') n.addEventListener('click', v);
    else n[k] = v;
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const PAD = 'padding-inline: clamp(0.25rem, 4vw, 1rem)', ROW = 'border-top: 0';
const button = (text, props = {}) => el('button', { type: 'button', className: 'app-btn', style: PAD, ...props }, text);

function render() {
  if (!body) return;
  const cur = s.posts[s.at];
  body.replaceChildren(
    ...[el('ul', { className: 'app-list', 'aria-label': 'Your feed' }, s.posts.map((x, i) => el('li', { style: ROW, className: i === s.at ? 'is-current' : '' },
      button([el('b', { className: 'app-title' }, x.from), el('span', { className: 'app-why' }, ` ${x.photo}. ${x.caption}${x.liked ? ' Liked.' : ''}`)],
        { 'data-post': x.id, 'aria-pressed': String(i === s.at), onclick: () => { s.at = i; save(); render(); } })))),
    cur ? button(cur.liked ? `Liked ${cur.from}'s post` : `Like ${cur.from}'s post`, { id: 'ig-like', className: 'app-btn primary', 'aria-pressed': String(cur.liked),
      onclick: () => { cur.liked = true; save(); render(); } }) : null].filter(Boolean));
}
