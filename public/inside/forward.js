// Phone side: send every bus event to the relay so /inside sees it. Batches; never throws into the OS.
// Usage from the shell: const off = forward(bus);
export function forward(bus, { url = '/api/bus', fetchFn = globalThis.fetch, token = tokenOf() } = {}) {
  const headers = { 'content-type': 'application/json', ...(token && { 'x-murmur-token': token }) };
  let queue = [], timer = null;
  const flush = () => {
    timer = null;
    const events = queue.splice(0, 50); // the relay takes at most 50 per POST
    if (events.length) {
      try {
        Promise.resolve(fetchFn(url, { method: 'POST', headers, body: JSON.stringify({ events }), keepalive: true })).catch(() => {});
      } catch {}
    }
    if (queue.length) timer = setTimeout(flush, 0);
  };
  return bus.on('*', (name, ev) => {
    queue.push({ type: name, ...ev });
    if (!timer) timer = setTimeout(flush, 30);
  });
}

// The relay's MURMUR_TOKEN, when the server sets one: open the phone as /?t=TOKEN once and it is kept.
export function tokenOf(loc = globalThis.location, store = globalThis.localStorage) {
  try {
    const t = new URLSearchParams(loc?.search || '').get('t');
    if (t) store?.setItem('murmur.t', t);
    return t || store?.getItem('murmur.t') || '';
  } catch { return ''; }
}
