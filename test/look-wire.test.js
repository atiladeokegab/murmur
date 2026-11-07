import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { wireExtras } from '../public/os/wire.js';
import { FIRST_WORDS } from '../public/os/onboard/index.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

test('wireExtras mounts Your look, syncs the shell look, wraps the voice, speaks first open once, binds the demo', async () => {
  const doc = fakeDocument();
  doc.addEventListener = () => {};
  const appsEl = doc.createElement('main'), status = doc.createElement('p'), clockEl = doc.createElement('time');
  doc.body.append(appsEl, status, clockEl);
  const bus = createBus(), registry = createRegistry();
  const kv = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const { librarian, datastore } = createToolkit({ kv: browserKV({ storage: fakeStorage() }) });
  await datastore.runMigrations();
  const spoken = [];
  const speak = async (t) => { spoken.push(t); return true; };
  const settings = { size: 100, theme: 'dark', rate: 1, speaker: 'murmur', agency: 'just', planner: 'auto' };
  let saved = 0, days = 0, resets = 0;
  const w = await wireExtras({ bus, registry, speak, settings, save: () => saved++, kv, appsEl, librarian, datastore, status, clockEl,
    board: { reset: async () => resets++, nextMorning: async () => days++ } });
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(registry.get('look') && doc.getElementById('app-look'), 'Your look is registered and mounted');
  assert.equal(registry.get('look').state().agency, 'just', "the shell's choice came across on first boot");
  assert.deepEqual(spoken.filter((t) => t === FIRST_WORDS), [FIRST_WORDS], 'first open spoke once');

  await w.demo.mode();
  assert.equal(settings.speaker, 'reader', 'Mode flipped who speaks and the shell look follows');
  assert.ok(saved > 0);
  assert.ok(bus.log.some((e) => e.name === 'step:verified' && e.action === 'look__whoSpeaks'));
  await w.say('Sent.');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  await w.demo.mode();
  await w.say('Sent.');
  assert.equal(status.getAttribute('aria-live'), 'off');

  await w.demo.nextMorning();
  await w.demo.reset();
  assert.deepEqual([days, resets], [1, 1]);
  clockEl.click(); clockEl.click(); clockEl.click();
  assert.equal(doc.getElementById('demo-panel').hidden, false, 'three taps on the clock open the panel');

  const again = await wireExtras({ bus, registry, speak, settings, kv, appsEl, status });
  assert.equal(appsEl.children.filter((c) => c.id === 'app-look').length, 1, 'never mounts twice');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(spoken.filter((t) => t === FIRST_WORDS).length, 2, 'reset re-armed first open, so the next boot says it again');
  w.off(); again.off();
});
