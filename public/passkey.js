// Face ID / fingerprint before paying, with a platform passkey (WebAuthn, user verification required).
// shortcut: the shop is simulated, so the assertion is checked on the phone (UV flag) and not verified by a server;
// a real shop verifies the signature server-side against a server-issued challenge.

const KEY = 'murmur:passkey';
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const random = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function available() {
  try {
    return !!(window.PublicKeyCredential && isSecureContext &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

export const hasPasskey = () => { try { return !!localStorage.getItem(KEY); } catch { return false; } };

/** Make the passkey once. Creating it already asks for Face ID or fingerprint. */
export async function setup(signal) {
  const cred = await navigator.credentials.create({ signal, publicKey: {
    challenge: random(32),
    rp: { name: 'Murmur' },
    user: { id: random(16), name: 'murmur-user', displayName: 'You' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
    timeout: 60000,
  } });
  localStorage.setItem(KEY, b64u(cred.rawId));
  return true;
}

/** Ask the phone to check it is you. Resolves true only when the authenticator verified the user. */
export async function confirm(signal) {
  try { return await check(signal); } catch { return false; } // a withdrawn or refused prompt is a no
}
async function check(signal) {
  if (!hasPasskey()) return setup(signal);
  const a = await navigator.credentials.get({ signal, publicKey: {
    challenge: random(32),
    allowCredentials: [{ type: 'public-key', id: unb64u(localStorage.getItem(KEY)) }],
    userVerification: 'required',
    timeout: 60000,
  } });
  const flags = new Uint8Array(a.response.authenticatorData)[32];
  return (flags & 0x04) !== 0; // UV: the face or finger matched, not just presence
}
