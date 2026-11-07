// The device token for /api/* (server: lib/guard.js). Entered once by opening the link with ?code=…; kept in
// localStorage and sent as x-murmur-token on every same-origin /api/ fetch, so no caller has to know about it.
const KEY = 'murmur.token';

export function installToken({ win = globalThis.window } = {}) {
  if (!win?.fetch || win.fetch.murmurToken) return;
  try {
    const url = new URL(win.location.href);
    const code = url.searchParams.get('code');
    if (code) {
      win.localStorage.setItem(KEY, code);
      url.searchParams.delete('code');
      win.history?.replaceState(null, '', url); // the code leaves the address bar
    }
  } catch { /* no storage: the routes answer 401 and the phone says so */ }
  const base = win.fetch.bind(win);
  const wrapped = (input, init = {}) => {
    let token = null;
    try { token = win.localStorage.getItem(KEY); } catch { /* none */ }
    const href = typeof input === 'string' ? input : input?.url || '';
    const api = new URL(href, win.location.href);
    if (!token || api.origin !== win.location.origin || !api.pathname.startsWith('/api/')) return base(input, init);
    const headers = new Headers(init.headers || (typeof input === 'object' ? input.headers : undefined));
    headers.set('x-murmur-token', token);
    return base(input, { ...init, headers });
  };
  wrapped.murmurToken = true;
  win.fetch = wrapped;
}
