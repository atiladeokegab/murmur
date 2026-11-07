// Gemini over REST, server-side only. The key never leaves this process; content is never logged.
import * as demo from './demo.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
export const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';
export const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts';
export const VOICE = process.env.GEMINI_VOICE || 'Aoede';
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

// ---------- Live: the browser talks to Gemini directly with a one-use token minted here ----------
export const LIVE_PERSONA = PERSONA + `
You can act on the phone with the tools. When the person asks for something a tool does, call it at once,
then say the tool's "say" line in your own words, briefly. Never read out tool results as data.
The person may whisper or mumble: guess the likely meaning and act; ask only when two readings are equally likely.`;

export const LIVE_TOOLS = [{ functionDeclarations: [
  { name: 'open_tile', description: 'Open one of the tiles on the menu.',
    parameters: { type: 'OBJECT', properties: { tile: { type: 'STRING', enum: TILES } }, required: ['tile'] } },
  { name: 'read_note', description: 'Read the open note or message draft aloud from the start, or open the notes first.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'where_am_i', description: 'Say which sentence of the open note or draft the person is on.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'stop_reading', description: 'Stop reading aloud.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'carry_on', description: 'Carry on reading from where it stopped.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'edit_text', description: 'Change a word or phrase in the open note or message draft, e.g. "change Tuesday to Wednesday".',
    parameters: { type: 'OBJECT', properties: { from: { type: 'STRING' }, to: { type: 'STRING' } }, required: ['from', 'to'] } },
  { name: 'draft_message', description: 'Draft a WhatsApp message to Mum. Put the cleaned-up message in text; leave text empty to reply to her latest message.',
    parameters: { type: 'OBJECT', properties: { text: { type: 'STRING' } } } },
  { name: 'send', description: 'Send the open draft, or confirm the open payment. Only after the person clearly says send or yes.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'cancel', description: 'Close what is open without sending or paying.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'start_pay', description: 'Start ordering the usual coffee beans. The phone asks for Face ID or fingerprint before paying.',
    parameters: { type: 'OBJECT', properties: { item: { type: 'STRING', enum: ['beans'] } } } },
] }];

export async function liveToken(key) {
  const now = Date.now();
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60000).toISOString(),
      newSessionExpireTime: new Date(now + 60000).toISOString(),
      liveConnectConstraints: {
        model: `models/${LIVE_MODEL}`,
        config: {
          responseModalities: ['AUDIO'],
          systemInstruction: { parts: [{ text: LIVE_PERSONA }] },
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
          tools: LIVE_TOOLS,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const j = await res.json();
  if (!j.name) throw new Error('token missing');
  return { token: j.name, model: LIVE_MODEL, voice: VOICE, persona: LIVE_PERSONA, tools: LIVE_TOOLS };
}

/** Murmur's line as Gemini TTS audio: base64 16-bit PCM plus its sample rate. */
export async function tts(key, text) {
  const res = await fetch(`${API}/${TTS_MODEL}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Say warmly and briskly, like a friend close by: ${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
    }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const part = (await res.json()).candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error('tts empty');
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1]) || 24000;
  return { audio: part.inlineData.data, rate };
}
