// First open: one spoken sentence, only once. No welcome screens and no tutorial (spec §7).
export const FIRST_WORDS = 'Tap anywhere and tell me what you need.';

const defaultKv = async () => {
  const { browserKV } = await import('../../ports/browser-kv.js');
  const port = browserKV({ prefix: 'murmur' });
  return { get: (k) => port.get('os.onboard', k), set: (k, v) => port.set('os.onboard', k, v) };
};

/** Says the first words if they have never been said on this phone. Resolves true when it spoke. */
export async function firstOpen({ kv, say } = {}) {
  kv ||= await defaultKv();
  if (await kv.get('said')) return false;
  await kv.set('said', true); // marked first, so an interrupted sentence is never said twice
  await say(FIRST_WORDS);
  return true;
}

/** The demo reset calls this so the next open is a first open again. */
export async function rearm({ kv } = {}) {
  kv ||= await defaultKv();
  await kv.set('said', undefined);
}
