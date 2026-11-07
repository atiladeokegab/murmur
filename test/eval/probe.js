// Attach after Murmur has exposed its live runtime. All app calls, event emissions and WebAuthn calls
// still go to the original implementations; the probe only records their evidence.
export async function installProbe(page, { scopeOffset = 0 } = {}) {
  await page.waitForFunction(() => {
    const r = window.__murmur || window.murmur;
    return !!(r && r.bus && r.registry);
  }, null, { timeout: 15000 });
  await page.evaluate(() => (window.__murmur || window.murmur).ready);
  return page.evaluate((scopeOffset) => {
    if (window.__eval?.installed) return window.__eval;

    const runtime = window.__murmur || window.murmur;
    const registry = runtime.registry;
    const apps = typeof registry?.list === 'function' ? registry.list() : Array.isArray(runtime.apps) ? runtime.apps : Object.values(runtime.apps || {});
    const trace = [];
    const clones = (value) => {
      if (value === undefined) return undefined;
      try { return structuredClone(value); }
      catch { try { return JSON.parse(JSON.stringify(value)); } catch { return '[state could not be copied]'; } }
    };
    const now = () => Date.now();
    let scope = scopeOffset;
    let current = null;
    let pendingAsk = null, lastAsk = null;
    const steps = new Map();
    const controlBlockers = new Set();
    const record = (entry, captured = { scope, task: current?.task }) => {
      const evidence = { ...entry, scope: captured.scope, task: captured.task, at: now() };
      trace.push(evidence);
      return evidence;
    };
    const matchingStep = (name, params, phase) => [...steps.values()].reverse().find((s) =>
      s.action === name && JSON.stringify(s.params) === JSON.stringify(params) &&
      (phase === 'run' ? !s.runStarted : phase === 'verify' ? s.runStarted && !s.verifyStarted : !s.runStarted)) || { scope, task: current?.task };
    const safeState = (app) => {
      try { return clones(app.state()); }
      catch (error) { return { probeError: String(error?.message || error) }; }
    };

    runtime.bus.on('*', (name, event) => {
      if (name === 'step:start') {
        scope++;
        current = { task: event.task, action: event.action, app: event.app, params: clones(event.params), gate: event.gate ?? null, n: event.n, of: event.of };
        steps.set(scope, { ...current, scope, runStarted: false, verifyStarted: false });
      }
      const matched = event.action
        ? [...steps.values()].reverse().find((s) => s.action === event.action && s.app === event.app &&
          (event.task == null || s.task === event.task) && (event.n == null || s.n === event.n) &&
          (name !== 'step:verified' || s.verifyStarted))
        : name === 'confirm' && (pendingAsk || lastAsk)?.gate === event.gate && (pendingAsk || lastAsk)?.app === event.app
          ? steps.get((pendingAsk || lastAsk).scope)
        : current;
      const captured = { scope: matched?.scope ?? scope, task: event.task ?? matched?.task };
      record({ ...clones(event), kind: 'bus', name }, captured);
      if (name === 'confirm') {
        const step = steps.get(captured.scope);
        if (step?.readbackEvidence) {
          step.readbackEvidence.expected = step.readbackEvidence.text;
          step.readbackEvidence.actual = event.readback;
          step.readbackEvidence.same = step.readbackEvidence.text === event.readback;
        }
      }
      if (name === 'confirm') { lastAsk = pendingAsk || matched; pendingAsk = null; }
    });

    for (const app of apps) {
      const originalRead = app.read;
      if (Object.values(app.actions || {}).some((action) => action.gate && !action.readback)) {
        app.read = function (...args) {
          const step = steps.get(scope);
          const capture = step?.app === app.id && step.gate && !step.runStarted && !step.readbackCaptured;
          const state = capture ? safeState(app) : undefined;
          const result = Reflect.apply(originalRead, this, args);
          if (capture) {
            step.readbackCaptured = true;
            step.readbackEvidence = record({ kind: 'readback', action: step.action, app: app.id, params: clones(step.params), state, observedState: safeState(app), text: clones(result), expected: clones(result), actual: undefined, same: false }, { scope: step.scope, task: step.task });
          }
          return result;
        };
      }
      for (const [key, action] of Object.entries(app.actions || {})) {
      const name = `${app.id}__${key}`;
      const originalRun = action.run;
      const originalVerify = action.verify;
      const originalReadback = action.readback;
      const gate = action.gate ?? null;
      if (gate && originalReadback) action.readback = function (...args) {
        const invocation = matchingStep(name, args[1], 'readback');
        const step = steps.get(invocation.scope);
        const captureEvidence = step && !step.runStarted && !step.readbackCaptured;
        if (!captureEvidence) return Reflect.apply(originalReadback, this, args);
        const state = clones(args[0]), observedState = safeState(app), params = clones(args[1]);
        const capture = (text) => {
          step.readbackCaptured = true;
          if (text && typeof text === 'object' && Object.hasOwn(text, 'thrown')) {
            step.readbackEvidence = record({ kind: 'readback', action: name, app: app.id, params, state, observedState, text: clones(text), expected: null, actual: null, same: false }, invocation);
          } else step.readbackEvidence = record({ kind: 'readback', action: name, app: app.id, params, state, observedState, text: clones(text), expected: clones(text), actual: undefined, same: false }, invocation);
        };
        const result = Reflect.apply(originalReadback, this, args);
        if (result && typeof result.then === 'function') result.then(capture, (error) => capture({ thrown: String(error?.message || error) }));
        else capture(result);
        return result;
      };
      action.run = function (...args) {
        const invocation = matchingStep(name, args[0], 'run');
        const step = steps.get(invocation.scope);
        if (step) step.runStarted = true;
        record({ kind: 'run', action: name, app: app.id, params: clones(args[0]), gate, state: safeState(app) }, invocation);
        return Reflect.apply(originalRun, this, args);
      };
      action.verify = function (...args) {
        const invocation = matchingStep(name, args[1], 'verify');
        const step = steps.get(invocation.scope);
        if (step) step.verifyStarted = true;
        const state = clones(args[0]);
        const observedState = safeState(app);
        const params = clones(args[1]);
        const capture = (result) => record({ kind: 'verify', action: name, app: app.id, params, state, observedState, result: clones(result) }, invocation);
        try {
          const result = Reflect.apply(originalVerify, this, args);
          if (result && typeof result.then === 'function') { result.then(capture, (error) => capture({ thrown: String(error?.message || error) })); return result; }
          capture(result);
          return result;
        } catch (error) {
          capture({ thrown: String(error?.message || error) });
          throw error;
        }
      };
      }
    }

    const opened = new Set();
    const captureOpen = (invocation) => {
      if (!invocation?.scope || !steps.get(invocation.scope)?.gate) return;
      const pending = runtime.sheet?.pending?.();
      if (pending?.kind !== 'confirm' || opened.has(invocation.scope)) return;
      if (pending.gate && steps.get(invocation.scope)?.gate !== pending.gate) return;
      const visible = [...document.querySelectorAll('dialog,[role="dialog"]')].find((el) =>
        el.open || el.getAttribute('aria-modal') === 'true' || el.getClientRects().length > 0);
      if (!visible) return;
      opened.add(invocation.scope);
      const captured = { scope: invocation.scope, task: invocation.task };
      record({ kind: 'gate:open', gate: pending.gate, title: visible.querySelector('h1,h2,[role="heading"]')?.textContent || '' }, captured);
    };
    const originalAsk = runtime.host?.ask;
    if (typeof originalAsk === 'function') {
      try {
        runtime.host.ask = function (...args) {
          const invocation = { scope, task: current?.task, app: args[0]?.app, gate: args[0]?.gate };
          pendingAsk = invocation;
          const result = Reflect.apply(originalAsk, this, args);
          queueMicrotask(() => captureOpen(invocation));
          if (result && typeof result.then === 'function') result.then(() => {
            lastAsk = invocation;
            if (pendingAsk === invocation) pendingAsk = null;
          }, () => { if (pendingAsk === invocation) pendingAsk = null; });
          return result;
        };
      } catch { /* the document observer still captures dialogs opened by the host */ }
    }
    const observer = new MutationObserver(() => captureOpen(pendingAsk || { scope, task: current?.task }));
    observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });

    const credentials = navigator.credentials;
    for (const method of ['create', 'get']) {
      const original = credentials?.[method];
      if (!original) continue;
      const wrapped = function (...args) {
        const invocation = { scope, task: current?.task };
        const result = Reflect.apply(original, this, args);
        const capture = (credential) => {
          let verified = false;
          try {
            const response = credential.response;
            const authData = method === 'get' ? response.authenticatorData : response.getAuthenticatorData?.();
            if (authData) verified = (new Uint8Array(authData)[32] & 0x04) !== 0;
          } catch { /* no authenticator UV evidence means no pass */ }
          record({ kind: 'fingerprint', method, verified, userVerification: args[0]?.publicKey?.userVerification || null }, invocation);
        };
        if (result && typeof result.then === 'function') result.then(capture, (error) => record({ kind: 'fingerprint', method, verified: false, error: String(error?.message || error) }, invocation));
        else capture(result);
        return result;
      };
      try { credentials[method] = wrapped; } catch { /* browser does not permit wrapping this method */ }
    }

    const api = {
      installed: true,
      trace,
      snapshot() { return Object.fromEntries(apps.map((app) => [app.id, safeState(app)])); },
      clear() {
        trace.length = 0;
        opened.clear();
        for (const block of controlBlockers) document.removeEventListener('input', block, true);
        controlBlockers.clear();
      },
      breakControl(selector = '[data-app="messages"] textarea') {
        document.querySelector(selector); // Validate selector syntax now; the control may be created by a later render.
        let recorded = false;
        const block = (event) => {
          if (!(event.target instanceof Element) || !event.target.matches(selector) || !event.target.matches('textarea,input,[contenteditable="true"]')) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          event.stopPropagation();
          if (!recorded) {
            recorded = true;
            record({ kind: 'fault', fault: 'blocked real input event', control: selector });
          }
        };
        document.addEventListener('input', block, true);
        controlBlockers.add(block);
        return true;
      },
    };
    window.__eval = api;
    return api;
  }, scopeOffset);
}
