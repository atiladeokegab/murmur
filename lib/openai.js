// GPT live: OpenAI's Realtime voice. The server mints a short-lived client secret; the key never leaves the server.
// Docs (7 Nov 2026): POST /v1/realtime/client_secrets, then the browser posts its SDP to /v1/realtime/calls with the secret.
import { LIVE_TOOLS, PERSONA } from './gemini.js';
import { PROFILE, whoAmI } from '../public/lib/profile.js';
import { CONTACTS } from '../public/lib/tiles.js';
import { PHONE_APPS } from '../public/agent/phone-apps.js';

export const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1';
export const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';

// The phone tool carries any ask to Murmur's own agent, which runs the apps (and /stage shows them).
const PHONE = { type: 'function', name: 'phone', description: 'The phone itself: it sees and runs every app (calendar, weather, mail and messages, notifications, gallery, maps and nearby places, rides, food, music, bank, clock). Call it for anything about the person\'s day, phone or surroundings, and for every yes, no, name, stop or undo. Pass what the person said, word for word.',
  parameters: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'] } };

const lower = (p) => (Array.isArray(p) ? p.map(lower) : p && typeof p === 'object' ? Object.fromEntries(Object.entries(p).map(([k, v]) => [k, k === 'type' ? String(v).toLowerCase() : lower(v)])) : p); // arrays stay arrays: enum lists (OpenAI 400'd on an object)
/** Gemini Live's tools in OpenAI's shape ({ type: 'function', name, description, parameters }), then the phone tool. */
export const REALTIME_TOOLS = [...LIVE_TOOLS.flatMap((t) => t.functionDeclarations).map((f) => ({ type: 'function', name: f.name, description: f.description, parameters: lower(f.parameters) })), PHONE];

export const REALTIME_PERSONA = PERSONA + `
You are Murmur's voice. Keep every reply to one short, warm sentence. Never say you can't: always give an answer.
For anything the person asks the phone to do, and for every yes, no, name, stop or undo, call the phone tool at once
with their words, then say the tool's "say" line in your own words, briefly. Never read tool results out as data.
You cannot see the phone, the calendar, the weather, mail, places or anything nearby yourself: only the phone tool can. For any of those, call the phone tool FIRST, before you say anything, then say its line. Never guess, never say all clear or nothing to do without it, and never say you can't see something.
Only pure general knowledge (facts, maths, spelling, ideas, advice that is not medical or financial) you answer yourself, in one or two short sentences.
Everything you know about the person (all invented): ${whoAmI(PROFILE)} Home: ${PROFILE.home}. Work: ${PROFILE.work}. Right now: ${PROFILE.area}, ${PROFILE.near}.
Their contacts: ${Object.values(CONTACTS).map((c) => `${c.name} (${c.rel})`).join(', ')}. A name not on the list is a new contact: still message them.
Apps on the phone: Messages, Phone, Calendar, Clock, Maps, Weather, Notes, Writer, Bank, Shop, Notifications, Gallery, ${PHONE_APPS.map((a) => a.name).join(', ')}.
The phone can draft any text (messages, emails, notes, posts), read notifications, pick and send photos, book rides, order food, play music and set alarms and reminders: always call the phone tool for these.`;

export async function session(key, { fetchFn = fetch } = {}) {
  const res = await fetchFn('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 600 }, session: {
      type: 'realtime', model: REALTIME_MODEL, instructions: REALTIME_PERSONA,
      audio: { output: { voice: REALTIME_VOICE } }, tools: REALTIME_TOOLS, tool_choice: 'auto' } }),
  });
  if (!res.ok) throw new Error(`session ${res.status}`);
  const j = await res.json();
  const token = j.value || j.client_secret?.value;
  if (!token) throw new Error('session missing secret');
  return { token, model: REALTIME_MODEL, expires_at: j.expires_at };
}
