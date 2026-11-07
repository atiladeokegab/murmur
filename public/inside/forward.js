// Phone side: send every bus event to the relay so /inside sees it. Batches per frame; never throws into the OS.
// Usage from the shell: forward((handler) => bus.on('*', handler)) — whatever subscribe-to-all the bus offers.
export function forward(subscribe, { url = '/api/bus', fetchFn = globalThis.fetch } = {}) {
  let queue = [], timer = null;
  const flush = () => {
    timer = null;
    const events = queue.splice(0, 50);
    if (events.length) fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }), keepalive: true }).catch(() => {});
    if (queue.length) timer = setTimeout(flush, 0);
  };
  return subscribe((type, data) => {
    const e = typeof type === 'string' ? { type, ...(data || {}) } : type; // (type, data) or one {type, ...} object
    queue.push(JSON.parse(JSON.stringify(e)));
    if (!timer) timer = setTimeout(flush, 30);
  });
}
