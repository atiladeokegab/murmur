// GPT live: OpenAI Realtime over WebRTC with a short-lived secret from /api/openai-session.
// The model hears and speaks; every tool call runs through Murmur's own agent (onTool). Any failure throws to the caller.
const CALLS = 'https://api.openai.com/v1/realtime/calls';

/** One Realtime server event in, the replies to send back out. Pure, so it is tested without WebRTC. */
export async function handleEvent(ev, { onTool, onHeard, onCaption }) {
  if (ev.type === 'conversation.item.input_audio_transcription.completed' && ev.transcript) onHeard?.(ev.transcript.trim());
  if (ev.type === 'response.output_audio_transcript.done' && ev.transcript) onCaption?.(ev.transcript.trim());
  if (ev.type !== 'response.function_call_arguments.done') return [];
  let args = {};
  try { args = JSON.parse(ev.arguments || '{}'); } catch { /* the model sent bad JSON: run with none */ }
  let out;
  try { out = await onTool(ev.name, args); } catch (e) { out = { say: "That didn't go through. Say it another way and I'll try again.", note: String(e.message || e) }; // a failed action never claims Done (Prometheus) }
  return [{ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(out) } },
    { type: 'response.create' }];
}

export function createGpt(hooks) {
  let pc = null, dc = null, mic = null, audio = null;
  const send = (m) => dc?.readyState === 'open' && dc.send(JSON.stringify(m));
  async function connect() {
    const r = await fetch('/api/openai-session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!r.ok) throw new Error(`gpt session ${r.status}`);
    const { token } = await r.json();
    pc = new RTCPeerConnection();
    audio = Object.assign(document.createElement('audio'), { autoplay: true });
    pc.ontrack = (e) => { audio.srcObject = e.streams[0]; hooks.onStream?.('out', e.streams[0]); };
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    pc.addTrack(mic.getTracks()[0]);
    hooks.onStream?.('mic', mic);
    dc = pc.createDataChannel('oai-events');
    let chain = Promise.resolve();
    dc.onmessage = (e) => { chain = chain.then(async () => { for (const m of await handleEvent(JSON.parse(e.data), hooks)) send(m); }).catch(() => {}); };
    const opened = new Promise((res, rej) => { dc.onopen = res; setTimeout(() => rej(new Error('gpt open timeout')), 8000); });
    await pc.setLocalDescription(await pc.createOffer());
    const sdp = await fetch(CALLS, { method: 'POST', body: pc.localDescription.sdp, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/sdp' } });
    if (!sdp.ok) throw new Error(`gpt call ${sdp.status}`);
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdp.text() });
    await opened;
  }
  return {
    get connected() { return dc?.readyState === 'open'; },
    async start() { if (!this.connected) { try { await connect(); } catch (e) { this.close(); throw e; } } if (mic) mic.getTracks()[0].enabled = true; },
    /** Murmur's own line (a gate, a late "Sent."), said in the GPT voice. */
    say(text) { send({ type: 'response.create', response: { instructions: `Say exactly this, nothing else: ${text}` } }); },
    hush() { send({ type: 'response.cancel' }); send({ type: 'output_audio_buffer.clear' }); },
    mute(on) { if (mic) mic.getTracks()[0].enabled = !on; },
    close() { mic?.getTracks().forEach((t) => t.stop()); dc?.close(); pc?.close(); pc = dc = mic = null; if (audio) audio.srcObject = null; },
  };
}

// Gemini Live's tool names, said the way Murmur's agent already understands them.
const SAID = {
  open_tile: (a) => `open ${a.tile || ''}`, read_note: () => 'read my notes', where_am_i: () => 'where am I',
  stop_reading: () => 'stop', carry_on: () => 'carry on', edit_text: (a) => `change ${a.from || ''} to ${a.to || ''}`,
  draft_message: (a) => (a.text ? `text Mum ${a.text}` : 'reply to Mum'), send: () => 'send', cancel: () => 'cancel',
  start_pay: () => 'order my usual beans',
};
/** A tool call as the words the agent hears. */
export const toUtterance = (name, args = {}) => (SAID[name] ? SAID[name](args) : String(args.request || '')).trim();
