import test from 'node:test';
import assert from 'node:assert/strict';

test('a path ending in / serves that folder\'s index.html; a folder without one is still a 404; no way out of public/', async () => {
  const { server } = await import('../server.js');
  await new Promise((r) => server.listen(0, r));
  const get = (p) => fetch(`http://localhost:${server.address().port}${p}`);
  try {
    const demo = await get('/os/demo/');
    assert.equal(demo.status, 200);
    assert.match(demo.headers.get('content-type'), /text\/html/);
    assert.match(await demo.text(), /Demo controls/i);
    assert.equal((await get('/os/')).status, 404, 'a folder with no index.html');
    assert.equal((await get('/')).status, 200, 'the phone page still loads');
    assert.notEqual((await get('/%2e%2e/server.js')).status, 200, 'no path out of public/');
  } finally { server.close(); }
});
