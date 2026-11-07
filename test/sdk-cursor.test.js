import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCursor } from '../public/sdk/cursor.js';

test('the first ring is drawn on its control, not at 0,0', async () => {
  const props = {};
  const ring = { hidden: false, dataset: {}, style: { setProperty: (k, v) => { props[k] = v; } }, setAttribute() {}, getBoundingClientRect() {} };
  const win = { matchMedia: () => ({ matches: false }), requestAnimationFrame: (f) => setTimeout(f, 0), addEventListener() {} };
  const doc = { defaultView: win, createElement: () => ring, body: { append() {} } };
  const el = { isConnected: true, scrollIntoView() {}, getClientRects: () => [1], getBoundingClientRect: () => ({ left: 16, top: 406, width: 358, height: 105 }) };
  await createCursor(doc).moveTo(el, 'Sam');
  assert.equal(ring.hidden, false);
  assert.deepEqual(props, { '--x': '16px', '--y': '406px', '--w': '358px', '--h': '105px' });
});
