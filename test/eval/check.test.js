import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVENTS } from '../../public/sdk/bus.js';
import { checkTrace, validateTasks } from './check.js';

const step = { scope: 1, task: 't1', action: 'messages__send', app: 'messages', params: {}, gate: 'send' };
const bus = (name, extra = {}) => ({ kind: 'bus', name, ...step, ...extra });
const run = (extra = {}) => ({ kind: 'run', ...step, ...extra });
const verify = (extra = {}) => ({ kind: 'verify', ...step, result: true, state: { sent: true }, observedState: { sent: true }, ...extra });
const readback = (extra = {}) => ({ kind: 'readback', ...step, state: { draft: 'hello' }, observedState: { draft: 'hello' }, text: 'Send to Mum: hello', expected: 'Send to Mum: hello', actual: 'Send to Mum: hello', same: true, ...extra });
const confirmed = (gate = 'send') => [bus('step:start'), { kind: 'gate:open', scope: 1, task: 't1', gate, at: 0 }, readback(), bus('confirm', { gate, readback: 'Send to Mum: hello', at: 650, result: true })];
const completed = () => [...confirmed(), run(), verify(), bus('step:verified'), bus('task:done', { ok: true })];

test('30 distinct goal-based tasks have executable state assertions', () => {
  validateTasks(JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url))));
  assert.throws(() => validateTasks({ tasks: [] }), /exactly 30/);
  const data = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url)));
  data.tasks[0].app = 'mesages';
  assert.throws(() => validateTasks(data), /unknown eval app/);
  data.tasks[0].app = 'messages';
  data.tasks[1].id = data.tasks[0].id;
  assert.throws(() => validateTasks(data), /duplicate task id/);
  data.tasks[1].id = 'messages-draft-exact-person';
  data.tasks.find(task => task.gap === 'reserved words inside content').gap = 'ordinary message';
  assert.throws(() => validateTasks(data), /Missing Appendix A eval gap/);
});

test('a real verified and confirmed action counts', () => {
  assert.deepEqual(checkTrace(completed(), { requiresVerifiedStep: true }), []);
});

test('a tick alone, or a truthy verify result, never counts', () => {
  assert.match(checkTrace([bus('step:start'), bus('step:verified')]).join(), /no matching successful verify/);
  assert.match(checkTrace([...confirmed(), run(), verify({ result: 'yes' }), bus('step:verified')]).join(), /no matching successful verify/);
});

test('a gate cannot borrow an earlier step confirmation or reuse its own', () => {
  assert.match(checkTrace([bus('confirm', { result: true }), bus('step:start'), run()]).join(), /without one fresh accepted confirmation/);
  assert.match(checkTrace([...confirmed(), run(), run()]).join(), /without one fresh accepted confirmation/);
});

test('a later step cannot reuse confirmation or verification from an earlier step', () => {
  const sendAgain = (record) => ({ ...record, scope: 2 });
  const trace = [...confirmed(), bus('step:start', { scope: 2 }), sendAgain(run()), sendAgain(verify()), sendAgain(bus('step:verified'))];
  assert.match(checkTrace(trace).join(), /without one fresh accepted confirmation/);
  const wrongTask = completed();
  wrongTask[3].task = 't2';
  assert.match(checkTrace(wrongTask).join(), /confirmation has no matching step|run has no matching step|verify has no matching action run|tick has no matching successful verify/);
});

test('duplicate verify calls cannot justify one tick', () => {
  assert.match(checkTrace([...confirmed(), run(), verify(), verify(), bus('step:verified')]).join(), /verify was called more than once|tick has no matching successful verify/);
});

test('malformed trace records, unknown bus events and app mismatches fail closed', () => {
  assert.match(checkTrace([null, { kind: 'mystery' }]).join(), /malformed record|unknown trace record/);
  assert.match(checkTrace([{ kind: 'bus', name: 'step:verified' }]).join(), /no matching successful verify/);
  assert.match(checkTrace([{ kind: 'bus', name: 'fake:verified' }]).join(), /unknown bus event/);
  const wrongApp = completed();
  wrongApp[4].app = 'writer';
  assert.match(checkTrace(wrongApp).join(), /run app differs from the step app/);
  wrongApp[4].app = 'messages';
  wrongApp[5].app = 'writer';
  assert.match(checkTrace(wrongApp).join(), /verify app differs from the step app/);
});

test('known OS builtins may start without app run or verify records, but cannot produce success ticks', () => {
  const start = bus('step:start', { app: null, action: 'read_screen', params: {}, gate: null });
  assert.deepEqual(checkTrace([start]), []);
  const tick = bus('step:verified', { app: null, action: 'read_screen', gate: null });
  assert.match(checkTrace([start, tick]).join(), /OS builtin tick has no real app verification/);

  const forged = [start, run({ app: null, action: 'read_screen', gate: null }),
    verify({ app: null, action: 'read_screen', gate: null }), tick];
  assert.match(checkTrace(forged).join(), /OS builtin has no app action run|OS builtin has no app verifier|OS builtin tick has no real app verification/);
});

test('only canonical OS builtin names may start with app:null', () => {
  const invented = bus('step:start', { app: null, action: 'invented_builtin', params: {}, gate: null });
  assert.match(checkTrace([invented]).join(), /malformed OS builtin step/);
});

test('SDK bus event additions are recognized by the checker', () => {
  assert.ok(EVENTS.includes('step:next'));
  assert.deepEqual(checkTrace([{ kind: 'bus', name: 'step:next' }]), []);
});

test('a gate requires the registered readback from current app state to match what was confirmed', () => {
  assert.deepEqual(checkTrace(completed()), []);
  assert.match(checkTrace([...confirmed().filter(record => record.kind !== 'readback'), run(), verify(), bus('step:verified')]).join(), /exact registered app readback|without exactly one matching app readback/);
  assert.match(checkTrace([...confirmed().map(record => record.kind === 'readback' ? { ...record, state: { draft: 'old' } } : record), run(), verify(), bus('step:verified')]).join(), /other than the real app state/);
  assert.match(checkTrace([...confirmed().map(record => record.kind === 'readback' ? { ...record, actual: 'Send to Mum: different' } : record), run(), verify(), bus('step:verified')]).join(), /did not use the exact registered app readback/);
  assert.match(checkTrace([...confirmed().map(record => record.kind === 'readback' ? { ...record, same: false } : record), run(), verify(), bus('step:verified')]).join(), /did not match its expected text|exact registered app readback/);
  assert.match(checkTrace([...confirmed().map(record => record.kind === 'readback' ? { ...record, state: { probeError: 'copy failed' }, observedState: { probeError: 'copy failed' } } : record), run(), verify(), bus('step:verified')]).join(), /omitted the real app state/);
});

test('early yes and missing fingerprint fail even if the app claims success', () => {
  const early = completed();
  early[3].at = 50;
  assert.match(checkTrace(early).join(), /before the readback/);
  const payment = [...confirmed('pay').map(record => record.name === 'step:start' ? { ...record, gate: 'pay' } : record), run({ gate: 'pay' }), verify(), bus('step:verified'), bus('task:done', { ok: true })];
  assert.match(checkTrace(payment).join(), /without user verification/);
  payment.splice(3, 0, { kind: 'fingerprint', scope: 1, task: 't1', at: 500, verified: true });
  assert.deepEqual(checkTrace(payment), []);
  const missingClock = completed();
  delete missingClock[3].at;
  assert.match(checkTrace(missingClock).join(), /readback window elapsed/);
});

test('verify must use the same params and actual state as the action', () => {
  assert.match(checkTrace([...confirmed(), run(), verify({ params: { text: 'other' } }), bus('step:verified')]).join(), /no matching action run/);
  assert.match(checkTrace([...confirmed(), run(), verify({ state: { sent: false } }), bus('step:verified')]).join(), /real app state/);
  assert.match(checkTrace([...confirmed(), run(), verify({ state: undefined, observedState: undefined }), bus('step:verified')]).join(), /omitted the real app state/);
});

test('the task stops on a broken control and cannot report successful completion', () => {
  assert.deepEqual(checkTrace([...confirmed(), run(), verify({ result: 'Input did not change' }), bus('step:failed'), bus('task:done', { ok: false })]), []);
  assert.match(checkTrace([...confirmed(), run(), verify({ result: false }), bus('step:failed'), bus('task:done', { ok: true })]).join(), /failed task reported success/);
  assert.match(checkTrace([...confirmed(), bus('step:failed'), run()]).join(), /after the task failed/);
  assert.match(checkTrace([...confirmed(), run(), verify({ result: false }), bus('step:failed'), bus('step:verified')]).join(), /tick has no matching successful verify/);
});

test('no-op, sensitive refusal and dry-run explanations cannot produce false greens', () => {
  assert.match(checkTrace(null).join(), /trace is missing/);
  assert.match(checkTrace([], { requiresVerifiedStep: true }).join(), /no real app action/);
  assert.match(checkTrace(completed(), { noGatedRuns: true }).join(), /no-send\/no-pay/);
  assert.match(checkTrace(completed(), { dryRun: true }).join(), /explanation executed/);
  assert.match(checkTrace([bus('memory')], { noMemory: true }).join(), /sensitive task was remembered/);
  assert.match(checkTrace([{ kind: 'fault', fault: 'blocked real input event' }]).join(), /unexpected fault/);
  assert.deepEqual(checkTrace([{ kind: 'fault', fault: 'blocked real input event' }], { fault: 'block-reply-input' }), []);
});
