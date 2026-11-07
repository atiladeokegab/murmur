// PLAYWRIGHT=/absolute/path/to/playwright/index.mjs node test/eval/run.js [base-url]
// With no URL, start the real server locally. Its normal provider selection uses GEMINI_API_KEY.
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkTrace, validateTasks } from './check.js';
import { installProbe } from './probe.js';

const data = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url)));
validateTasks(data);
const tasks = process.env.EVAL_TASK ? data.tasks.filter((task) => task.id === process.env.EVAL_TASK) : data.tasks;
if (!tasks.length) throw new Error(`No task matches EVAL_TASK=${process.env.EVAL_TASK}`);
const TIMEOUT = 20000;
const UV_TIMEOUT = 70000;
const results = [];
const diagnostics = [];
let browser, server, provider;
let url = process.argv[2];

async function runtime(page, fn, argument) {
  return page.evaluate(({ source, argument }) => {
    const murmur = window.__murmur || window.murmur;
    return new Function('murmur', 'argument', `return (${source})(murmur, argument);`)(murmur, argument);
  }, { source: fn.toString(), argument });
}

async function say(page, text, path = 'speech') {
  return runtime(page, (murmur, { text, path }) => {
    const probe = window.__eval;
    const id = (probe.jobNumber || 0) + 1;
    probe.jobNumber = id;
    probe.jobs ||= {};
    probe.jobs[id] = { settled: false, traceStart: probe.trace.length };
    Promise.resolve().then(() => murmur.agent.hear(text, { path })).then(
      result => { probe.jobs[id] = { settled: true, result }; },
      error => { probe.jobs[id] = { settled: true, error: String(error?.message || error) }; });
    return id;
  }, { text, path });
}

async function settle(page, id) {
  await page.waitForFunction(id => window.__eval.jobs[id]?.settled, id, { timeout: TIMEOUT });
  const job = await page.evaluate(id => window.__eval.jobs[id], id);
  if (job.error) throw new Error(job.error);
  return job.result;
}

async function waitFor(page, condition, jobId, expectedQuestion) {
  if (['gate', 'question', 'choice'].includes(condition)) {
      const result = await page.waitForFunction(({ kind, jobId, settledIsSuccess, expectedQuestion }) => {
      const pending = (window.__murmur || window.murmur).sheet.pending();
      if (pending && pending.kind === (kind === 'gate' ? 'confirm' : 'choose')) return { ok: true };
      const job = jobId && window.__eval.jobs?.[jobId];
      if (kind === 'question' && job?.traceStart != null) {
        const wanted = expectedQuestion?.trim().toLocaleLowerCase();
        const question = window.__eval.trace.slice(job.traceStart).some(event => {
          if (event.kind !== 'bus') return false;
          const text = event.name === 'ask' ? event.question : event.name === 'say' ? event.text : null;
          if (typeof text !== 'string') return false;
          return wanted ? text.trim().toLocaleLowerCase() === wanted : event.name === 'ask' || /\?\s*$/.test(text);
        });
        if (question) return { ok: true };
      }
        if (job?.settled) return { ok: settledIsSuccess, reason: `Hear job ${jobId} settled without a pending ${kind} sheet.` };
      return false;
      }, { kind: condition, jobId, settledIsSuccess: condition === 'question', expectedQuestion }, { timeout: TIMEOUT });
    const settled = await result.jsonValue();
    if (!settled.ok) throw new Error(settled.reason);
  } else if (condition === 'reading') {
    await page.waitForFunction(() => window.__eval.trace.some(e => e.kind === 'bus' && e.name === 'say' && e.app === 'writer'), null, { timeout: TIMEOUT });
  }
}

async function typed(page, text) {
  await page.getByRole('button', { name: /^type instead$/i }).click();
  const input = page.getByRole('textbox', { name: /type|tell murmur|your task|what do you need/i });
  await input.fill(text);
  await input.press('Enter');
}

async function repeatProposalTrigger(page, count) {
  for (let i = 0; i < count; i++) {
    const start = await page.evaluate(() => window.__eval.trace.length);
    const id = await say(page, 'Read my last page in Writer.');
    await settle(page, id);
    const trace = await page.evaluate(start => window.__eval.trace.slice(start), start);
    const failures = checkTrace(trace, { requiresVerifiedStep: true });
    if (failures.length) throw new Error(`Proposal setup was not verified: ${failures.join(' | ')}`);
  }
}

async function runTask(task, url) {
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 757 }, reducedMotion: task.reducedMotion ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  await page.clock.install({ time: new Date('2026-11-07T09:00:00Z') });
  const pageErrors = [];
  let beforeAll = null;
  page.on('pageerror', error => pageErrors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await installProbe(page);
    await runtime(page, async murmur => { await murmur.reset(); });
    if (task.app !== 'os' && !await runtime(page, (murmur, app) => !!murmur.registry.get(app), task.app)) throw new Error(`App unavailable: ${task.app}`);
    for (const utterance of task.setup || []) {
      const id = await say(page, utterance);
      await settle(page, id);
      const setupTrace = await page.evaluate(() => window.__eval.trace);
      const failures = checkTrace(setupTrace, { requiresVerifiedStep: true });
      if (setupTrace.filter(e => e.kind === 'bus' && e.name === 'task:done').at(-1)?.ok !== true) failures.push('Setup did not complete successfully.');
      if (failures.length) throw new Error(`Task setup was not verified: ${failures.join(' | ')}`);
    }
    if (task.id === 'proposal-never-persists') {
      await repeatProposalTrigger(page, 3);
      await page.waitForFunction(() => window.__eval.trace.some(e => e.kind === 'bus' && e.name === 'memory' && e.proposal), null, { timeout: TIMEOUT });
    }
    beforeAll = await page.evaluate(() => window.__eval.snapshot());
    const initialProposal = await page.evaluate(() => window.__eval.trace.filter(e => e.kind === 'bus' && e.name === 'memory' && e.proposal).at(-1)?.proposal || null);
    await page.evaluate(() => window.__eval.clear());
    if (task.captureResumePosition) await runtime(page, murmur => {
      const probe = window.__eval;
      const off = murmur.bus.on('say', event => {
        if (event.app !== 'writer') return;
        off();
        const app = murmur.registry.get('writer');
        probe.interruption = { state: structuredClone(app.state()), place: structuredClone(app.place()), text: event.text };
        // Stop on the real sentence event, before its speech can finish or advance the page.
        Promise.resolve(murmur.agent.hear('stop', { path: 'speech' })).then(
          () => { probe.interruption.stopped = true; },
          error => { probe.interruption.error = String(error.message || error); });
      });
    });
    if (task.fault) {
      if (task.fault !== 'block-reply-input') throw new Error(`Unknown real-control fault: ${task.fault}`);
      await page.evaluate(() => window.__eval.breakControl('[data-app="messages"] textarea'));
    }
    let mainJob;
    if (task.input === 'typed') {
      await typed(page, task.utterance);
      await page.waitForFunction(() => window.__eval.trace.some(e => e.kind === 'bus' && e.name === 'task:done'), null, { timeout: TIMEOUT });
    } else mainJob = await say(page, task.utterance);

    const jobs = mainJob ? [mainJob] : [];
    let activeJob = mainJob;
    let resumeAt = null;
    for (const followup of task.followups || []) {
      if (task.captureResumePosition && followup.say === 'stop') {
        await page.waitForFunction(() => window.__eval.interruption?.stopped || window.__eval.interruption?.error, null, { timeout: TIMEOUT });
        const interruption = await page.evaluate(() => window.__eval.interruption);
        if (interruption.error) throw new Error(interruption.error);
        if (mainJob) await settle(page, mainJob);
        continue;
      }
      if (followup.when === 'done' && mainJob) { await settle(page, mainJob); mainJob = null; }
      else if (followup.when) await waitFor(page, followup.when, activeJob, followup.expectedQuestion);
      if (followup.afterMs) await page.waitForTimeout(followup.afterMs);
      if (followup.fingerprint !== undefined) await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: followup.fingerprint });
      if (followup.check === 'still-gated') {
        const pending = await runtime(page, murmur => murmur.sheet.pending());
        const state = await page.evaluate(() => window.__eval.snapshot());
        if (pending?.kind !== 'confirm' || !same(state.messages?.lastSent, beforeAll.messages?.lastSent)) errors.push('An early yes closed the gate or sent the message.');
      }
      if (followup.back) await page.goBack({ waitUntil: 'domcontentloaded' });
      if (Object.hasOwn(followup, 'pick')) {
        const pending = await runtime(page, murmur => murmur.sheet.pending());
        if (followup.pick === null) {
          if (pending?.kind === 'choose') await runtime(page, murmur => murmur.sheet.no());
        }
        else {
          const index = pending?.choices?.findIndex(choice => String(choice.label || choice).toLowerCase() === String(followup.pick).toLowerCase());
          if (index < 0) errors.push(`Choice not offered: ${followup.pick}`);
          else await runtime(page, (murmur, i) => murmur.sheet.choose(i), index);
        }
      }
      if (followup.say) {
        if (task.captureResumePosition && followup.say === 'carry on') resumeAt = await page.evaluate(() => window.__eval.trace.length);
        const id = await say(page, followup.say);
        jobs.push(id);
        activeJob = id;
        if (followup.say === 'pay' && followup.fingerprint === false) {
          await page.waitForFunction(() => window.__eval.trace.some(e => e.kind === 'bus' && e.name === 'say' && /not you|not read|try again|not paid|haven.t paid/i.test(e.text)), null, { timeout: UV_TIMEOUT });
          await runtime(page, murmur => murmur.sheet.no());
        }
      }
      if (followup.repeatTrigger) await repeatProposalTrigger(page, followup.repeatTrigger);
      if (followup.reload) {
        for (const id of jobs) await settle(page, id);
        jobs.length = 0;
        mainJob = null;
        const previousTrace = await page.evaluate(() => window.__eval.trace);
        const scopeOffset = Math.max(0, ...previousTrace.map(event => event.scope || 0)) + 1;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await installProbe(page, { scopeOffset });
        await page.evaluate(previous => window.__eval.trace.push(...previous), previousTrace);
      }
    }
    if (task.outcome === 'clarification') {
      const pending = await runtime(page, murmur => murmur.sheet.pending());
      if (pending?.kind === 'choose') await runtime(page, murmur => murmur.sheet.no());
      else await waitFor(page, 'question', activeJob);
    }
    for (const id of jobs) await settle(page, id);
    const afterAll = await page.evaluate(() => window.__eval.snapshot());
    const trace = await page.evaluate(() => window.__eval.trace);
    errors.push(...checkTrace(trace, task));
    const state = app => {
      if (!Object.hasOwn(afterAll, app)) throw new Error(`App unavailable: ${app}`);
      return afterAll[app];
    };
    const before = app => {
      if (!Object.hasOwn(beforeAll, app)) throw new Error(`Initial app state unavailable: ${app}`);
      return beforeAll[app];
    };
    for (const expression of task.assertions) {
      try {
        if (new Function('state', 'before', 'same', 'allStates', 'beforeAll', `return (${expression});`)(state, before, same, () => afterAll, beforeAll) !== true) errors.push(`State assertion: ${expression}`);
      } catch (error) { errors.push(`State assertion ${expression}: ${error.message}`); }
    }
    const events = trace.filter(e => e.kind === 'bus');
    const speech = events.filter(e => e.name === 'say').map(e => e.text).join('\n');
    if (task.speech?.matches && !new RegExp(task.speech.matches, 'i').test(speech)) errors.push(`Missing spoken outcome: ${task.speech.matches}`);
    if (task.speech?.fromState) {
      const [app, path] = task.speech.fromState;
      const value = path.split('.').reduce((value, key) => value?.[key], state(app));
      if (typeof value !== 'string' || !value || !speech.includes(value)) errors.push(`Speech does not include actual ${app}.state().${path}`);
    }
    if (!events.some(e => e.name === 'heard' && (e.text === task.utterance || e.raw === task.utterance))) errors.push('No heard event records the actual eval utterance.');
    const completions = events.filter(e => e.name === 'task:done');
    if (!completions.length && !task.dryRun && !['refusal', 'clarification'].includes(task.outcome)) errors.push('No task completion event.');
    if (task.outcome === 'failed' && !events.some(e => e.name === 'step:failed' && !e.cancelled && !e.stopped)) errors.push('The broken control did not produce a failed step.');
    if (task.outcome === 'cancelled' && !completions.some(e => e.ok === false)) errors.push('The stopped task did not report unsuccessful completion.');
    if (task.outcome === 'refusal' && (trace.some(e => e.kind === 'run') || events.some(e => e.name === 'step:failed' && /network|fetch|timeout|server|provider/i.test(e.reason || '')))) errors.push('A tool run or provider error cannot count as a refusal.');
    if (task.gate) {
      const confirmations = events.filter(e => e.name === 'confirm' && e.gate === task.gate.kind);
      const accepted = confirmations.filter(e => e.result === true);
      if (task.gate.accepted && accepted.length !== 1) errors.push('Expected exactly one accepted confirmation.');
      if (!task.gate.accepted && accepted.length) errors.push('A rejected gate was accepted.');
      const readback = confirmations.map(e => e.readback).join('\n');
      for (const text of task.gate.readbackIncludes || []) if (!readback.toLowerCase().includes(text.toLowerCase())) errors.push(`Gate readback omitted: ${text}`);
      if (task.gate.readbackFromState && !trace.some(e => e.kind === 'readback' && e.same === true && confirmations.some(c => c.scope === e.scope))) errors.push('Payment readback differs from the registered app readback for the live state.');
    }
    if (task.dryRun) {
      const names = task.dryRunActions || [];
      const hints = await page.evaluate(names => {
        const registry = (window.__murmur || window.murmur).registry;
        return names.map(name => {
          const resolved = registry.resolve(name);
          return resolved?.action?.hint || null;
        });
      }, names);
      if (!names.length) errors.push('The dry-run case has no expected registered actions.');
      if (hints.length !== names.length || hints.some(hint => !hint || !speech.includes(hint))) errors.push('The dry run did not speak hints from its expected registered actions.');
      if (!/do it|walk you through|teach you/i.test(speech)) errors.push('The dry run did not offer to act or teach the person.');
      if (trace.some(e => e.kind === 'run')) errors.push('The dry run executed an action instead of explaining it.');
    }
    if (task.heardBeforeEdit) {
      const heard = trace.findIndex(e => e.kind === 'bus' && e.name === 'heard');
      const edited = trace.findIndex(e => e.kind === 'run' && e.app === 'writer');
      if (heard < 0 || edited < heard) errors.push('No heard record before the Writer edit.');
    }
    if (task.boardVisible && await runtime(page, murmur => murmur.current()) !== null) errors.push('Back did not return to the board.');
    if (task.inputPath && !events.some(e => e.name === 'heard' && e.path === task.inputPath)) errors.push('The typed UI did not record the typed input path.');
    if (task.providerDisclosure && !new RegExp(task.providerDisclosure.matches, 'i').test(speech)) errors.push('Offline travel results were not disclosed as demo data.');
    if (task.reducedMotionHonoured) {
      const motion = await page.evaluate(() => ({ reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        moving: [...document.querySelectorAll('.agent-cursor, .changed, [data-n], .tile')].filter(el => {
          const s = getComputedStyle(el);
          return [...s.transitionDuration.split(','), ...s.animationDuration.split(',')].some(value => parseFloat(value) > 0);
        }).map(el => el.className) }));
      if (!motion.reduced || motion.moving.length) errors.push(`Reduced motion still animates: ${motion.moving.join(', ')}`);
    }
    if (task.proposalSuppressed) {
      if (!initialProposal?.id) errors.push('No real proposal was seeded.');
      const responses = events.filter(e => e.name === 'memory' && e.response?.id === initialProposal?.id);
      if (!responses.some(e => e.response.answer === 'suppress')) errors.push('Never was not recorded as a persistent suppression.');
      if (events.some(e => e.name === 'memory' && e.proposal?.id === initialProposal?.id)) errors.push('The suppressed proposal returned.');
    }
    if (task.asksBeforeSlotUse) {
      const expectedQuestion = task.followups?.find(followup => followup.when === 'question')?.expectedQuestion?.trim().toLocaleLowerCase();
      const asked = trace.findIndex(e => e.kind === 'bus' && (
        e.name === 'ask' ? String(e.question || '').trim().toLocaleLowerCase() === expectedQuestion
          : e.name === 'say' && String(e.text || '').trim().toLocaleLowerCase() === expectedQuestion));
      const recipientRun = trace.findIndex(e => e.kind === 'run' && e.action === 'messages__openChat');
      if (asked < 0 || recipientRun <= asked) errors.push('The workflow used a recipient before asking who.');
    }
    if (task.workflowRuns && completions.length < 2) errors.push('The saved workflow did not run to completion.');
    if (task.captureResumePosition) {
      const interrupted = await page.evaluate(() => window.__eval.interruption);
      const resumed = resumeAt === null ? null : trace.slice(resumeAt).find(e => e.kind === 'bus' && e.name === 'say' && e.app === 'writer');
      const position = interrupted?.place;
      const sentence = interrupted?.state?.sentence;
      const text = interrupted?.state?.chapters?.[interrupted.state.chapter]?.text;
      const sentences = typeof text === 'string' ? text.split(/(?<=[.!?])\s+/) : [];
      if (!position || position.n !== sentence + 1 || sentences[sentence] !== interrupted.text) errors.push('Interrupted sentence does not match the captured app state and place.');
      if (!resumed || resumed.text !== interrupted?.text) errors.push('Carry on restarted or skipped the interrupted sentence.');
      const where = events.filter(e => e.name === 'place' && e.app === 'writer' && e.n === position?.n && e.of === position?.of);
      if (!where.length) errors.push('Where am I did not report the captured reading position.');
    }
    errors.push(...pageErrors.map(error => `Browser error: ${error}`));
    const failureEvidence = errors.length ? await page.evaluate(before => ({
      trace: structuredClone(window.__eval.trace), before, after: structuredClone(window.__eval.snapshot()),
      pageErrors: [...window.__eval.trace.filter(e => e.kind === 'bus' && e.name === 'step:failed').map(e => e.reason)],
      status: document.querySelector('[role="status"]')?.textContent || '',
    }), beforeAll) : null;
    return { errors, diagnostics: failureEvidence };
  } catch (error) {
    try {
      error.diagnostics = await page.evaluate(({ before, message }) => ({
        error: message, trace: structuredClone(window.__eval?.trace || []), before,
        after: window.__eval?.snapshot?.() || null, status: document.querySelector('[role="status"]')?.textContent || '',
      }), { before: beforeAll, message: error.message });
    } catch { error.diagnostics = { error: error.message }; }
    throw error;
  } finally { await context.close(); }
}

try {
  const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
  if (!url) {
    ({ server } = await import(new URL('../../server.js', import.meta.url)));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, 'localhost', resolve); });
    url = `http://localhost:${server.address().port}/`;
  }
  const evalUrl = new URL(url);
  if (evalUrl.hostname === '127.0.0.1') evalUrl.hostname = 'localhost';
  evalUrl.searchParams.set('quiet', '');
  url = evalUrl.href;
  browser = await chromium.launch({ headless: true });
  // Detect a missing shell seam once; 30 identical startup timeouts obscure the real failure.
  const preflight = await browser.newPage();
  const startupErrors = [];
  preflight.on('pageerror', error => startupErrors.push(error.message));
  try {
    await preflight.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await preflight.waitForFunction(() => {
      const r = window.__murmur || window.murmur;
      return !!(r?.bus && r?.registry && r?.agent?.hear && r?.sheet?.pending && r?.reset);
    }, null, { timeout: TIMEOUT });
    const health = await preflight.request.get(new URL('/health', url).href);
    provider = (await health.json()).provider;
    console.log(`Configured provider: ${provider}; input: utterance transcripts and typed UI; virtual WebAuthn.`);
  } catch (error) { throw new Error([error.message, ...startupErrors].join(' | ')); }
  finally { await preflight.close(); }
  for (const task of tasks) {
    let errors;
    try {
      const outcome = await runTask(task, url);
      errors = outcome.errors;
      if (outcome.diagnostics) diagnostics.push({ id: task.id, ...outcome.diagnostics });
    } catch (error) {
      errors = [error.message];
      if (error.diagnostics) diagnostics.push({ id: task.id, ...error.diagnostics });
    }
    results.push({ id: task.id, errors });
    console.log(`${errors.length ? 'FAIL' : 'PASS'} ${task.id}${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  }
} catch (error) {
  for (const task of tasks) results.push({ id: task.id, errors: [`Eval could not start: ${error.message}`] });
  for (const result of results) console.log(`FAIL ${result.id}: ${result.errors.join(' | ')}`);
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
}
const right = results.filter(result => !result.errors.length).length;
console.log(`${right} of ${tasks.length} right`);
if (diagnostics.length) {
  const dir = await mkdtemp(join(tmpdir(), 'murmur-eval-'));
  const path = join(dir, 'failures.json');
  const product = url ? await fetch(new URL('/health', url).href).then(response => response.json()).catch(() => null) : null;
  await writeFile(path, JSON.stringify({ url, provider, product, diagnostics }, null, 2));
  console.log(`Failure evidence: ${path}`);
}
if (right !== tasks.length) process.exitCode = 1;
