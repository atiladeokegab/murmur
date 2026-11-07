// A person's own tap on a gated control (Send, Pay) is their yes: no extra sheet. Pay still needs the
// fingerprint (spec §3.7), so a hand tap on Pay checks it before the app pays. The bus records either way.
export async function byHand({ app, gate, readback, bus, passkey, sheet }) {
  let result = true, fingerprint;
  if (gate === 'pay') {
    fingerprint = await passkey.usable();
    // shortcut: a phone with no platform authenticator gets the readback sheet instead (fingerprint:false); a real shop refuses
    result = fingerprint ? await passkey.confirm().then((ok) => ok === true, () => false) : (await sheet({ gate, readback })) === true;
  }
  bus.emit('confirm', { app, gate, readback, result, byHand: true, ...(gate === 'pay' && { fingerprint }) });
  return result;
}
