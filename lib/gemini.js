// Gemini over REST, server-side only. The key never leaves this process; content is never logged.
import * as demo from './demo.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
export const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const ACTIONS = ['open', 'draft', 'pay', 'read', 'where', 'stop', 'resume', 'edit', 'send', 'yes', 'no'];
const TILES = ['notes', 'mum', 'bus', 'ride', 'beans', 'sam', 'weather'];

export const PERSONA = `You are Murmur, a phone companion for a person with little or no sight.
Speak like a warm, quick friend: one short sentence, at most 20 words, a little wit is fine.
Never say "your request has been processed", never list options at length, never mention being an AI.
Anything that sends a message or spends money must be confirmed by the person; you only propose it.
Never ask for or repeat health, banking or government details.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    say: { type: 'STRING' },
    action: {
      type: 'OBJECT', nullable: true,
      properties: {
        type: { type: 'STRING', enum: ACTIONS },
        tile: { type: 'STRING', enum: TILES },
        to: { type: 'STRING' }, text: { type: 'STRING' }, from: { type: 'STRING' }, item: { type: 'STRING' },
      },
      required: ['type'],
    },
  },
  required: ['say'],
};

async function generate(key, prompt, schema) {
  const res = await fetch(`${API}/${MODEL}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PERSONA }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 200,
        ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}) },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
}

/** Keep only actions the app knows, with their known fields. */
export function cleanAction(a) {
  if (!a || !ACTIONS.includes(a.type)) return null;
  const out = { type: a.type };
  for (const k of ['tile', 'to', 'text', 'from', 'item']) if (typeof a[k] === 'string' && a[k]) out[k] = a[k].slice(0, 500);
  if (a.type === 'open' && !TILES.includes(out.tile)) return null;
  if (a.type === 'edit' && !(out.from && 'to' in a)) return null;
  if (a.type === 'edit') out.to = String(a.to || '');
  return out;
}

export async function chat(key, text, context = {}) {
  const prompt = `Tiles: notes (read my notes), mum (message Mum), bus (bus to work), ride (Uber home), ` +
    `beans (order the usual coffee beans, asks first), sam (call Sam), weather.\n` +
    `Screen now: ${String(context.screen || 'menu').slice(0, 40)}.\n` +
    `For a draft to Mum put the clean message in action.text (fix messy dictation). ` +
    `"change X to Y" while reading or drafting is action edit. Leave say empty when the action speaks for itself.\n` +
    `Person said: """${String(text).slice(0, 600)}"""`;
  const out = JSON.parse(await generate(key, prompt, SCHEMA));
  return { say: String(out.say || '').slice(0, 300), action: cleanAction(out.action) };
}

export async function menuLine(key, info) {
  const fallback = demo.menuLine(info);
  const prompt = `Write the one sentence Murmur says as the menu opens this ${info.part}. ` +
    `The top tile is "${info.top}".` + (info.moved?.length ? ` "${info.moved[0]}" moved up overnight because it was done most days this week; say so.` : '') +
    ` Plain text only, under 22 words. Example: "${fallback}"`;
  const s = (await generate(key, prompt)).trim().replace(/^"|"$/g, '');
  return s || fallback;
}
