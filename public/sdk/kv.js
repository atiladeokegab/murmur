// Each app's own storage, on the toolkit's browser-kv port. Area `app.<id>`; nothing is shared between apps.
import { browserKV } from '../ports/browser-kv.js';

export function appKv(id, port = browserKV({ prefix: 'murmur' })) {
  const area = `app.${id}`;
  return { get: (k) => port.get(area, k), set: (k, v) => port.set(area, k, v), all: () => port.getAll(area) };
}
