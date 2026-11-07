// Gallery: the phone's photos, by voice. A grid, then one photo full size, each said in one line. Read-only: no gates.
// Sending a photo is Messages' draft and send (the send gate asks once); the planner chains the two.
import { controls, h, placeLine, swap, style } from '../shop/ui.js';
import { PHOTOS, photoOf, lineOf } from './photos.js';

// Each scene is a few gradients: sky, ground and a shape or two. No images, no people's faces.
const CSS = `.g-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--gap,12px)}
.g-grid .m-app-btn{display:flex;flex-direction:column-reverse;gap:6px;align-items:stretch;padding:6px}
.g-scene{aspect-ratio:4/3;border-radius:10px;width:100%}
.g-big{aspect-ratio:4/3;border-radius:14px;width:100%;margin:8px 0}
.g-beach{background:radial-gradient(circle at 78% 22%,#ffd84d 0 9%,transparent 10%),linear-gradient(#8fd3ff 0 45%,#2a7fc4 45% 62%,#f1d39a 62%)}
.g-pasta{background:radial-gradient(circle at 50% 55%,#f6c453 0 22%,#e05a2b 23% 27%,#fff 28% 40%,transparent 41%),linear-gradient(#6b4a2f,#3d2a1b)}
.g-bookclub{background:repeating-linear-gradient(90deg,#c0392b 0 8%,#27ae60 8% 14%,#2980b9 14% 22%,#f39c12 22% 28%) top/100% 35% no-repeat,radial-gradient(ellipse at 50% 75%,#8b5a2b 0 40%,transparent 41%),#f3ead8}
.g-park{background:radial-gradient(circle at 25% 40%,#2e6b3a 0 12%,transparent 13%),radial-gradient(circle at 70% 35%,#2e6b3a 0 15%,transparent 16%),linear-gradient(#cfe3f2 0 50%,#e8f1ec 50%)}
.g-canal{background:linear-gradient(#ff8a3d 0 30%,#d9465f 30% 50%,#3b2d5c 50% 52%,#4a6fa5 52%)}
.g-garden{background:radial-gradient(circle at 30% 45%,#ffcc00 0 7%,#7a4a00 7% 9%,transparent 10%),radial-gradient(circle at 62% 38%,#ffcc00 0 8%,#7a4a00 8% 10%,transparent 11%),linear-gradient(#bfe6ff 0 55%,#4f9a3a 55%)}
.g-cake{background:repeating-linear-gradient(90deg,transparent 0 9%,#fff4a8 9% 10%,transparent 10% 13%) 30% 20%/40% 18% no-repeat,radial-gradient(ellipse at 50% 70%,#f7a1c4 0 30%,#fff 31% 34%,transparent 35%),#3a2f4f}`;

export function createGallery() {
  let root = null, body = null, doc = null, ui = null, s = {};
  const fresh = () => ({ view: 'grid', photo: null });
  const on = {
    open(id) { s.photo = id; s.view = 'photo'; render(); },
    back() { s.view = 'grid'; s.photo = null; render(); },
  };
  function render() {
    if (!root) return;
    ui.clear();
    const E = (t, p, ...k) => h(doc, t, p, ...k);
    const kids = [placeLine(doc, app.place().where, 'Gallery')];
    if (s.view === 'grid') {
      kids.push(E('div', { className: 'g-grid' }, PHOTOS.map((p) => {
        const b = ui.btn('open', `${p.short[0].toUpperCase()}${p.short.slice(1)}, ${p.day}`, on.open, { arg: p.id });
        b.append(E('div', { className: `g-scene g-${p.id}`, role: 'img', 'aria-label': p.caption }));
        return b;
      })));
    } else {
      const p = PHOTOS.find((x) => x.id === s.photo);
      kids.push(E('div', { className: `g-big g-${p.id}`, role: 'img', 'aria-label': p.caption }), E('p', {}, lineOf(p)), ui.btn('back', 'Back to all photos', on.back));
    }
    swap(body, kids);
  }
  const app = {
    id: 'gallery', name: 'Gallery',
    async mount(el) {
      root = el; doc = el.ownerDocument; ui = controls(doc); style(doc);
      if (!doc.getElementById?.('g-css')) doc.head?.append(h(doc, 'style', { id: 'g-css', textContent: CSS }));
      body = h(doc, 'div', { className: 'm-app-body' });
      root.append(h(doc, 'h2', { id: 'gallery-h', textContent: 'Gallery' }), body);
      render();
    },
    read() {
      if (s.view === 'photo') return lineOf(PHOTOS.find((x) => x.id === s.photo));
      return `Your gallery: ${PHOTOS.length} photos. The newest, from ${PHOTOS[0].day}: ${PHOTOS[0].caption}. Say which one, like the beach or the book club.`;
    },
    place() {
      if (s.view === 'photo') return { where: 'Gallery', item: PHOTOS.find((x) => x.id === s.photo).short, n: PHOTOS.findIndex((x) => x.id === s.photo) + 1, of: PHOTOS.length, next: null };
      return { where: 'Gallery', item: 'photos', n: 1, of: PHOTOS.length, next: 'show' };
    },
    state() { return structuredClone(s); },
    async seed() { s = fresh(); render(); },
    async reset() { await app.seed(); },
    actions: {
      browse: {
        describe: 'Open the gallery and hear what photos there are', say: 'open my gallery', doing: 'Opening photos',
        params: { type: 'object', properties: {} }, gate: null,
        hint: 'Your photos are buttons in a grid, newest first',
        async run(p, ctx) { if (s.view !== 'grid') await ctx.tap(ui.find('back')); },
        verify: (st) => st.view === 'grid' || 'The gallery is not showing.',
      },
      show: {
        describe: 'Show one photo full size and say what is in it, the last photo by default', say: 'show me my last photo', doing: 'Finding it',
        params: { type: 'object', properties: { photo: { type: 'string', description: 'Which photo as said, like the beach, or last' } } }, gate: null,
        hint: 'Each photo in the grid is a button; it opens full size',
        async run(p, ctx) {
          const ph = photoOf(p.photo);
          if (s.view !== 'grid') await ctx.tap(ui.find('back'));
          await ctx.tap(ui.find('open', ph.id));
        },
        verify: (st, p) => (st.view === 'photo' && st.photo === photoOf(p.photo).id) || 'The photo is not showing.',
      },
    },
  };
  for (const x of Object.values(app.actions)) x.done ??= () => app.read();
  s = fresh();
  return app;
}
export default createGallery();
