// Phone side: send every bus event to the relay so /inside sees it. Batches; never throws into the OS.
// Usage: const room = roomFrom(location); if (room) forward(bus, { room }). A phone with no room forwards nothing.
// The device token (MURMUR_TOKEN) rides on main's fetch wrapper (public/agent/token.js), so fetch is looked up per call.
// ?room=stage or #stage -> 'stage'; anything else -> null.
export function roomFrom(loc) {
  let r = '';
  try { r = new URLSearchParams(loc.search).get('room') || String(loc.hash || '').replace(/^#/, ''); } catch {}
  return /^[\w-]{1,32}$/.test(r) ? r.toLowerCase() : null;
}

export function forward(bus, { room = 'stage', url = `/api/bus?room=${encodeURIComponent(room)}`, fetchFn = (...a) => globalThis.fetch(...a) } = {}) {
  const headers = { 'content-type': 'application/json' };
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

