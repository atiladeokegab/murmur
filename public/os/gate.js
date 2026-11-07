// Gates on a person's own tap, and the fingerprint every pay needs (spec §3.7, the lead's rule).
// Send, pay, call and delete always ask, a person's own tap included: a mis-tap by someone who cannot see is
// the risk. A hand tap only skips the 0.5 s grace; the readback sheet still shows. The bus records either way.
export async function byHand({ app, gate, readback, bus, sheet }) {
  const a = await sheet({ gate, readback, grace: false });
  const result = a === true || a?.result === true;
  bus.emit('confirm', { app, gate, readback, result, byHand: true, ...(typeof a?.fingerprint === 'boolean' && { fingerprint: a.fingerprint }) });
  return result;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// One pay attempt after Yes. Stop or Back cancels it at once, and a fingerprint that says yes after that pays nothing.
// The fingerprint check gets the attempt's signal, so a Stop before it starts the prompt means no prompt at all.
export function payAttempt(fingerprint) {
  const ac = new AbortController();
  const stopped = new Promise((res) => ac.signal.addEventListener('abort', () => res(false), { once: true }));
  const check = new Promise((res) => res(fingerprint(ac.signal))).then((ok) => ok === true, () => false);
  return { result: Promise.race([check, stopped]), cancel: () => ac.abort() };
}

// The fingerprint, failing closed on both paths. A saved passkey is asked for; with none, making one IS the ask.
// No authenticator, a cancel, or no answer in 20 s: nothing is paid. The spoken yes never stands alone.
export async function checkFingerprint({ passkey, say, wait = sleep, ms = 20000, signal }) {
  const NONE = {};
  let late = false;
  // One deadline covers the availability check and the fingerprint, so a hung available() never stalls a pay.
  // shortcut: a timed-out WebAuthn prompt is not aborted (passkey.js takes no signal); the pay is refused either way
  const check = (async () => {
    const can = passkey.has() || await passkey.available().catch(() => false);
    if (late || signal?.aborted) return false; // Stop or the deadline came first: never start a WebAuthn prompt
    if (!can) return NONE;
    return passkey.confirm().then((v) => v === true, () => false);
  })();
  const stopped = new Promise((res) => signal?.addEventListener('abort', () => res(false), { once: true }));
  const ok = await Promise.race([check, wait(ms).then(() => { late = true; return false; }), stopped]);
  if (signal?.aborted) return false; // Stop already spoke for itself
  if (ok === NONE) { say("This phone can't check a fingerprint, so I can't pay."); return false; }
  if (!ok) say('No fingerprint, so nothing was paid.');
  return ok;
}
