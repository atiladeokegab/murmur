import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus, createRegistry, createCtx, controlName, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import calendar, { dayOf, timeOf, matches, heardTime } from '../public/apps/calendar/index.js';
import appIds from '../public/apps/apps.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

const example = JSON.parse(readFileSync(new URL('../public/apps/calendar/state.example.json', import.meta.url)));

// One phone with only Calendar on it. answers: the ask-first sheet's yes/no; picks: the choice sheet's labels.
async function phone({ answers = [], picks = [], confirm } = {}) {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(calendar);
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const kv = appKv('calendar', port);
  const root = await mountApp(calendar, doc.body, { kv, bus, say: (text) => bus.emit('say', { text }), confirm });
  await calendar.reset();
  const ask = async () => answers.shift() ?? false;
  const choose = async ({ choices }) => { const want = picks.shift(); const i = choices.findIndex((c) => c === want); return i < 0 ? null : i; };
  const ctxFor = (app) => createCtx({ app, root, bus, kv, cursor: { async moveTo() {}, hide() {} }, ask, choose, signal: new AbortController().signal });
  const run = (name, params) => runAction({ registry, name, params, bus, ctxFor, n: 1, of: 1 });
  const said = () => bus.log.filter((e) => e.name === 'say').map((e) => e.payload?.text ?? e.text);
  const last = (name) => bus.log.filter((e) => e.name === name).at(-1);
  return { root, bus, run, said, last, ctxFor, s: () => calendar.state() };
}
const ev = (s, id) => s.events.find((e) => e.id === id);

test('calendar: is on the board, and the seeded state is exactly state.example.json', async () => {
  assert.ok(appIds.includes('calendar'));
  const { s } = await phone();
  assert.deepEqual(s(), example);
});

test('calendar: real heading, named day buttons with pressed state, every action has doing, describe and hint', async () => {
  const { root } = await phone();
  assert.equal(root.querySelector('h2').textContent, 'Calendar');
  assert.equal(controlName(root.querySelector('#cal-day-Monday')), 'Monday, today');
  assert.equal(root.querySelector('#cal-day-Wednesday').textContent, 'Wed', 'short visible name, full name in aria-label');
  assert.equal(controlName(root.querySelector('#cal-day-Wednesday')), 'Wednesday');
  assert.equal(root.querySelector('#cal-day-Monday').getAttribute('aria-pressed'), 'true');
  assert.equal(controlName(root.querySelector('#cal-next')), "What's next");
  for (const [k, a] of Object.entries(calendar.actions)) {
    assert.ok(a.describe && a.hint, k);
    assert.ok(a.doing.split(' ').length >= 2 && a.doing.split(' ').length <= 5, k);
  }
  assert.equal(calendar.actions.move.hint, 'Open the event, then Move is the second button, then pick the day');
  assert.equal(calendar.actions.invite.gate, 'send');
});

test("calendar: what's on today, on a named day, and what's next", async () => {
  const { run, said, s } = await phone();
  assert.equal((await run('calendar__whatsOn', {})).ok, true);
  assert.equal(said().at(-1), 'Nothing today. Next is Lunch with Mum on Tuesday at 12:30 pm.');
  assert.equal((await run('calendar__whatsOn', { day: 'thursday' })).ok, true);
  assert.equal(said().at(-1), 'Thursday: Book club at 7 pm.');
  assert.equal(calendar.read(), 'Thursday: Book club at 7 pm.');
  assert.equal((await run('calendar__whatsOn', { day: 'Someday' })).ok, false);
  assert.equal((await run('calendar__next', {})).ok, true);
  assert.equal(s().open, 'lunch');
  assert.equal(said().at(-1), 'Next is Lunch with Mum, Tuesday at 12:30 pm.');
});

test('calendar: "Move lunch with Mum to Wednesday" is free, moved, verified, offers to tell Mum, and undoes', async () => {
  const p = await phone();
  const r = await p.run('calendar__move', { event: 'lunch with Mum', day: 'Wednesday' });
  assert.deepEqual(r.ok, true, r.reason);
  assert.deepEqual(p.said().slice(-2), ["Wednesday's free.", 'Moved to Wednesday. To let Mum know, say "tell Mum".']);
  assert.equal(ev(p.s(), 'lunch').day, 'Wednesday');
  assert.deepEqual(p.s().lastMoved, { id: 'lunch', from: 'Tuesday', to: 'Wednesday', time: '12:30' });
  assert.equal(p.last('step:verified').action, 'calendar__move');
  assert.equal(calendar.place().next, 'invite');
  assert.equal(p.root.querySelector('#cal-day-Wednesday').getAttribute('aria-pressed'), 'true', 'the event\'s day stays pressed while it is open');
  assert.equal(p.root.querySelector('mark').textContent, 'Wednesday');
  await calendar.actions.move.undo(p.ctxFor(calendar));
  assert.equal(ev(p.s(), 'lunch').day, 'Tuesday');
  // the verify is the app's truth: a state where it didn't move fails with a reason
  assert.equal(typeof calendar.actions.move.verify(calendar.state(), { event: 'lunch', day: 'Wednesday' }), 'string');
});

test('calendar: an absolute date keeps the requested date and noon when moved', async () => {
  const p = await phone();
  const r = await p.run('calendar__move', { event: 'lunch with Mum', day: '12 November 2026', time: 'noon' });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual({ day: ev(p.s(), 'lunch').day, date: ev(p.s(), 'lunch').date, time: ev(p.s(), 'lunch').time },
    { day: 'Thursday', date: '2026-11-12', time: '12:00' });
  assert.equal(calendar.actions.move.verify(p.s(), { event: 'lunch with Mum', day: '12 November 2026', time: 'noon' }), true);
  await calendar.actions.move.undo(p.ctxFor(calendar));
  assert.deepEqual({ day: ev(p.s(), 'lunch').day, date: ev(p.s(), 'lunch').date, time: ev(p.s(), 'lunch').time },
    { day: 'Tuesday', date: '2026-11-10', time: '12:30' });
  const prefixed = await p.run('calendar__move', { event: 'lunch with Mum', day: 'Thursday 12 November 2026' });
  assert.equal(prefixed.ok, true, prefixed.reason);
  assert.deepEqual({ day: ev(p.s(), 'lunch').day, date: ev(p.s(), 'lunch').date }, { day: 'Thursday', date: '2026-11-12' });
});

test('calendar: invalid, conflicting, and out-of-week explicit dates fail without changing events', async () => {
  const p = await phone();
  const before = structuredClone(p.s().events);
  for (const day of ['Thursday 29 February 2027', 'Thursday 19 November 2026', 'Tuesday 12 November 2026', 'Thursday29February2027', 'Thursday 19 Nov 2026', 'Thursday 2026/11/19']) {
    const r = await p.run('calendar__move', { event: 'lunch with Mum', day });
    assert.equal(r.ok, false, `${day} must fail closed`);
    assert.deepEqual(p.s().events, before, `${day} must not move or rewrite the event`);
    assert.equal(p.s().lastMoved, null, `${day} must not report a move`);
  }
});

test('calendar: add and read reject invalid or unsupported dates without a success tick', async () => {
  const p = await phone();
  const before = structuredClone(p.s().events);
  for (const day of ['19 November 2026', 'Thursday 29 February 2027', 'Tuesday 12 November 2026', 'Thursday 19 Nov 2026', 'Thursday 2026/11/19']) {
    for (const [action, params] of [
      ['add', { title: 'Dentist', day, time: 'noon' }],
      ['whatsOn', { day }],
    ]) {
      const ticks = p.bus.log.filter((e) => e.name === 'step:verified').length;
      const result = await p.run(`calendar__${action}`, params);
      assert.equal(result.ok, false, `${action}: ${day} must fail closed`);
      assert.deepEqual(p.s().events, before, `${action}: ${day} must preserve every event`);
      assert.equal(p.bus.log.filter((e) => e.name === 'step:verified').length, ticks);
    }
  }
});

test('calendar: add and read accept a date in the demo week; add verifies its exact date', async () => {
  const p = await phone();
  const params = { title: 'Dentist', day: 'Thursday 12 November 2026', time: 'noon' };
  assert.equal((await p.run('calendar__add', params)).ok, true);
  assert.equal(ev(p.s(), 'dentist').date, '2026-11-12');
  assert.equal((await p.run('calendar__whatsOn', { day: params.day })).ok, true);
  assert.match(p.said().at(-1), /Dentist at 12 pm/);
  const wrong = p.s();
  ev(wrong, 'dentist').date = '2026-11-19';
  assert.notEqual(calendar.actions.add.verify(wrong, params), true);
});

test('calendar: a clash is said and asked; keep fails in words, move anyway moves', async () => {
  const keep = await phone({ picks: ['Keep it on Friday'] });
  const r = await keep.run('calendar__move', { event: 'Call Sam', day: 'Thursday' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Not moved/);
  assert.equal(keep.last('ask').payload?.question ?? keep.last('ask').question, 'Thursday has Book club at 7 pm. Move Call Sam anyway?');
  assert.equal(ev(keep.s(), 'callsam').day, 'Friday');
  const go = await phone({ picks: ['Move anyway'] });
  assert.equal((await go.run('calendar__move', { event: 'Call Sam', day: 'Thursday' })).ok, true);
  assert.equal(ev(go.s(), 'callsam').day, 'Thursday');
  // a new time that avoids the clash is just free
  const t = await phone();
  assert.equal((await t.run('calendar__move', { event: 'call sam', day: 'Thursday', time: '5pm' })).ok, true);
  assert.equal(ev(t.s(), 'callsam').time, '17:00');
  assert.equal(t.said().at(-2), 'Thursday at 5 pm is free.');
  assert.equal((await t.run('calendar__move', { event: 'the dentist', day: 'Monday' })).ok, false);
});

test('calendar: invite is gated with a readback from state; no means nothing sent', async () => {
  const no = await phone({ answers: [false] });
  const r = await no.run('calendar__invite', { event: 'lunch with Mum', who: 'Mum' });
  assert.equal(r.ok, false);
  assert.equal(r.cancelled, true);
  assert.deepEqual(ev(no.s(), 'lunch').invited, []);
  const yes = await phone({ answers: [true] });
  await yes.run('calendar__move', { event: 'lunch with Mum', day: 'Wednesday' });
  assert.equal((await yes.run('calendar__invite', { event: 'lunch with Mum', who: 'Mum' })).ok, true);
  const c = yes.last('confirm');
  assert.equal(c.payload?.readback ?? c.readback, 'Send Mum an invite: Lunch with Mum, Wednesday at 12:30 pm.');
  assert.deepEqual(ev(yes.s(), 'lunch').invited, ['Mum']);
  assert.deepEqual(yes.s().lastInvite, { id: 'lunch', who: 'Mum' });
});

test("calendar: a person's own Send invite tap gets the shell's ask-first sheet with the same readback", async () => {
  for (const yes of [false, true]) {
    const asked = [];
    const { root, s, said } = await phone({ confirm: async (q) => { asked.push(q); return yes; } });
    const tap = async (id) => { root.querySelector(`#${id}`).dispatchEvent({ type: 'click', isTrusted: true }); await new Promise((r) => setTimeout(r)); };
    await tap('cal-day-Tuesday'); await tap('cal-ev-lunch'); await tap('cal-invite');
    const who = root.querySelector('#cal-who'); who.value = 'Mum'; who.dispatchEvent(new Event('input'));
    await tap('cal-send');
    assert.deepEqual(asked, [{ gate: 'send', readback: 'Send Mum an invite: Lunch with Mum, Tuesday at 12:30 pm.' }]);
    assert.deepEqual(ev(s(), 'lunch').invited, yes ? ['Mum'] : []);
    // one live region: the person's result goes to the shell's say once, never a second role=status in the app
    assert.deepEqual(said().filter((t) => /^(Invite sent|Not sent)/.test(t)), [yes ? 'Invite sent to Mum.' : 'Not sent.']);
    assert.equal(root.querySelector('#cal-status').getAttribute('role'), null);
    assert.equal(root.querySelector('#cal-status').textContent, '');
  }
});

test('calendar: add an event, a bad day fails in words, and reset brings the seed back', async () => {
  const p = await phone();
  assert.equal((await p.run('calendar__add', { title: 'Coffee with Ana', day: 'wed', time: '10am' })).ok, true);
  assert.deepEqual(ev(p.s(), 'coffeewithana'), { id: 'coffeewithana', title: 'Coffee with Ana', day: 'Wednesday', date: '2026-11-11', time: '10:00', mins: 60, with: null, invited: [] });
  const bad = await p.run('calendar__add', { title: 'Swim', day: 'Blursday', time: '8am' });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /which day/);
  await calendar.reset();
  assert.deepEqual(calendar.state(), example);
});

test('calendar: day, time and event matching', () => {
  assert.equal(dayOf('tomorrow'), 'Tuesday');
  assert.equal(dayOf('Weds'), 'Wednesday');
  assert.equal(dayOf('nope'), null);
  assert.equal(dayOf('um Wednesday'), 'Wednesday');
  assert.equal(dayOf('Wednesday please'), 'Wednesday');
  assert.equal(dayOf('please'), null);
  assert.equal(timeOf('7:30 pm'), '19:30');
  assert.equal(timeOf('12am'), '00:00');
  assert.equal(timeOf('25:00'), null);
  assert.deepEqual(matches(example.events, 'Mum').map((e) => e.id), ['lunch']);
  assert.deepEqual(matches(example.events, 'my book club').map((e) => e.id), ['bookclub']);
  // a time names the event at that time ("move my 12:30"); a bare 1 to 7 is afternoon
  assert.deepEqual(matches(example.events, '12:30').map((e) => e.id), ['lunch']);
  assert.deepEqual(matches(example.events, "my seven o'clock").map((e) => e.id), ['bookclub', 'callsam']);
  assert.deepEqual(matches(example.events, '3pm meeting'), []);
  assert.equal(heardTime("three o'clock"), '15:00');
  assert.equal(heardTime('lunch'), null);
});

test('calendar: "move my 12:30" finds the event by its time; a time with nothing on says so', async () => {
  const p = await phone();
  assert.equal((await p.run('calendar__move', { event: '12:30', day: 'Wednesday' })).ok, true);
  assert.equal(ev(p.s(), 'lunch').day, 'Wednesday');
  const none = await p.run('calendar__move', { event: '3pm', day: 'Thursday' });
  assert.equal(none.ok, false);
  assert.match(none.reason, /Nothing's at 3 pm this week/);
});

test('calendar: delete every event is gated with a count; no keeps them, yes empties it and it stays empty', async () => {
  const no = await phone({ answers: [false] });
  const r = await no.run('calendar__clear', {});
  assert.equal(r.cancelled, true);
  assert.equal(no.s().events.length, 3);
  const c = no.last('confirm');
  assert.equal(c.payload?.readback ?? c.readback, 'Delete all 3 events from your calendar?');
  const yes = await phone({ answers: [true] });
  assert.equal((await yes.run('calendar__clear', {})).ok, true);
  assert.deepEqual(yes.s().events, []);
  assert.ok(yes.said().includes('Deleted all 3 events. Your calendar is empty.'));
  await calendar.seed(); // the next boot does not refill it
  assert.deepEqual(calendar.state().events, []);
  const again = await yes.run('calendar__clear', {});
  assert.equal(again.ok, false);
});

test("calendar: a person's own Delete every event tap asks first; no confirm means nothing is deleted", async () => {
  for (const yes of [false, true]) {
    const asked = [];
    const { root, s } = await phone({ confirm: async (q) => { asked.push(q); return yes; } });
    root.querySelector('#cal-clear').dispatchEvent({ type: 'click', isTrusted: true }); await new Promise((r) => setTimeout(r));
    assert.deepEqual(asked, [{ gate: 'delete', readback: 'Delete all 3 events from your calendar?' }]);
    assert.equal(s().events.length, yes ? 0 : 3);
  }
  const bare = await phone(); // mounted without the shell's confirm: fail closed
  bare.root.querySelector('#cal-clear').dispatchEvent({ type: 'click', isTrusted: true }); await new Promise((r) => setTimeout(r));
  assert.equal(bare.s().events.length, 3);
});
