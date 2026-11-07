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

/** What to say for the open app (its first four actions, in its own order), or for the board when none is open. */
export function offerLine(registry, appId = null) {
  const apps = describeRegistry(registry);
  const app = appId && apps.find((a) => a.id === appId);
  if (app) {
    const can = [...new Set(app.actions.map((x) => asSaid(x.describe)).filter(Boolean))].slice(0, OFFER_MAX);
    return `${can.length ? `Here you can: ${list(can)}.` : `${app.name} has nothing to ask for yet.`} Or say go home.`;
  }
  const today = apps.some((a) => a.id === 'calendar') ? ", or say what's on today" : '';
  return `On the board: ${list(apps.map((a) => a.name))}. Say an app's name to open it${today}.`;
}
