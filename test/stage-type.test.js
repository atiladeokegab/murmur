// /stage's "Tell Murmur" box: one remote:hear on the room bus reaches the phone live and is never replayed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { publish, stream } from '../lib/relay.js';

const client = () => {
  const lines = [], res = { writeHead() {}, write: (l) => lines.push(l) }, req = { on: (ev, fn) => { if (ev === 'close') res.close = fn; } };
  return { req, res, lines, events: () => lines.filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5))) };
};

test('remote:hear goes live to the room, not kept, so a rejoining phone never re-runs it', () => {
  const room = 'type-test', a = client();
  stream(a.req, a.res, room);
  assert.equal(publish({ type: 'remote:hear', text: 'play Spotify' }, room), true);
  assert.deepEqual(a.events().map((e) => [e.type, e.text]), [['remote:hear', 'play Spotify']]);
  assert.equal(publish({ type: 'remote:hear', text: '  ' }, room), false, 'empty text is dropped');
  assert.equal(publish({ type: 'remote:hear', text: 'x'.repeat(900) }, room), true);
  assert.equal(a.events().at(-1).text.length, 300, 'capped');
  const b = client();
  stream(b.req, b.res, room);
  assert.deepEqual(b.events(), [], 'nothing replayed');
  a.res.close(); b.res.close();
});
