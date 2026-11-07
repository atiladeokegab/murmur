// ElevenLabs text to speech: Flash v2.5 (lowest latency) on the streaming endpoint, as 24 kHz 16-bit PCM,
// the same { audio, rate } shape gemini.tts returns, so the phone's playPcm needs no change.
export const MODEL = 'eleven_flash_v2_5';
export const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'Xb7hH8MSUJpSbSDYk0k2'; // Alice: premade, British, clear and calm
const RATE = 24000;

export async function tts(key, text) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=pcm_${RATE}`, {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/json', 'xi-api-key': key },
    body: JSON.stringify({ text, model_id: MODEL }),
  });
  if (!res.ok) throw new Error(`elevenlabs ${res.status}`);
  const pcm = Buffer.from(await res.arrayBuffer());
  if (!pcm.length) throw new Error('elevenlabs empty');
  return { audio: pcm.toString('base64'), rate: RATE };
}
