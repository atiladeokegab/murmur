// Phone side: send every bus event to the relay so /inside sees it. Batches; never throws into the OS.
// Usage from the shell: const off = forward(bus);
export function forward(bus, { url = '/api/bus', fetchFn = globalThis.fetch } = {}) {
  let queue = [], timer = null;
  const flush = () => {
    timer = null;
    const events = queue.splice(0, 50); // the relay takes at most 50 per POST
    if (events.length) {
      try {
        Promise.resolve(fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }), keepalive: true })).catch(() => {});
      } catch {}
    }
    if (queue.length) timer = setTimeout(flush, 0);
  };
  return bus.on('*', (name, ev) => {
    queue.push({ type: name, ...ev });
    if (!timer) timer = setTimeout(flush, 30);
  });
}
