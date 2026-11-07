// Loading and mounting. The app list is public/apps/apps.js; each app mounts once into its own section.
export async function loadApps(registry, ids, base = new URL('../apps/', import.meta.url)) {
  for (const id of ids) registry.register((await import(new URL(`${id}/index.js`, base))).default);
  return registry.list();
}

/** Mount one app into `host`: a hidden <section> with a focusable heading the app fills. Returns the root. */
export async function mountApp(app, host, os) {
  const doc = host.ownerDocument;
  const root = doc.createElement('section');
  root.className = 'app';
  root.dataset.app = app.id;
  root.id = `app-${app.id}`;
  root.hidden = true;
  host.append(root);
  await app.mount(root, os);
  const h = root.querySelector('h2');
  if (!h) throw new Error(`app ${app.id}: mount() must render an <h2> with the app's name`);
  h.tabIndex = -1; // open_app moves focus here
  root.setAttribute('aria-labelledby', h.id ||= `app-${app.id}-h`);
  return root;
}
