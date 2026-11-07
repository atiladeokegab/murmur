// "What can I do?": the open app's own declared actions, said the way a person would ask for them. It only reads
// the registry (as describeRegistry does), so nothing runs and nothing is remembered, and a plug-in gets it for free.
import { describeRegistry } from './plan.js';

export const OFFER_MAX = 4;

/** "Read the new message in the open chat, sentence by sentence." -> "read the new message" */
export function asSaid(describe) {
  const s = String(describe || '').split(/[,;:(]|\.\s/)[0].trim().replace(/[.!?]+$/, '')
    .replace(/^Say (?=what)/i, '').replace(/\s+in the open \w+$/i, '');
  return s.charAt(0).toLowerCase() + s.slice(1);
}

const list = (xs) => (xs.length < 3 ? xs.join(' or ') : `${xs.slice(0, -1).join(', ')}, or ${xs.at(-1)}`);

/**
 * An action's own spoken words: its optional `say` (a string, or (state) => string; empty means "not here, now"),
 * else its describe, shortened. An app that throws or returns something odd falls back to describe.
 */
export function spokenAs(x, state) {
  if (!('say' in x)) return asSaid(x.describe);
  try { const s = typeof x.say === 'function' ? x.say(state) : x.say; return typeof s === 'string' ? s.trim() : s == null ? '' : asSaid(x.describe); } catch { return asSaid(x.describe); }
}

/** What to say for the open app (its first four actions, in its own order), or for the board when none is open. */
export function offerLine(registry, appId = null) {
  const apps = describeRegistry(registry);
  const app = appId && apps.find((a) => a.id === appId);
  if (app) {
    const raw = (Array.isArray(registry) ? registry : registry.list?.() || Object.values(registry)).find((a) => a.id === appId);
    let state; try { state = raw.state?.(); } catch { /* no state: say falls back */ }
    const can = [...new Set(Object.values(raw.actions || {}).map((x) => spokenAs(x, state)).filter(Boolean))].slice(0, OFFER_MAX);
    return `${can.length ? `Here you can: ${list(can)}.` : `In ${app.name}, ask in your own words.`} Or say go home.`;
  }
  const today = apps.some((a) => a.id === 'calendar') ? ", or say what's on today" : '';
  return `On the board: ${list(apps.map((a) => a.name))}. Say an app's name to open it${today}.`;
}
