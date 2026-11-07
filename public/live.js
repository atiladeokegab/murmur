// Murmur's live voice: Gemini Live over a browser WebSocket with a one-use token from our server.
// Hold the bar: the mic streams 16 kHz PCM. Let go: the turn ends. Press again while it talks: it stops (barge-in).
// Any failure throws to the caller, which falls back to Web Speech + /api/chat.

const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

// ---------- audio out: queue 16-bit PCM chunks back to back ----------
let outCtx = null, nextAt = 0;
const playing = new Set();
export function audioOut() {
  outCtx ||= new AudioContext();
  if (outCtx.state === 'suspended') outCtx.resume();
  return outCtx;
}
export function playPcm(b64, rate = 24000) {
  const ctx = audioOut();
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const pcm = new Int16Array(bytes.buffer, 0, bytes.byteLength >> 1);
  if (!pcm.length) return Promise.resolve();
  const buf = ctx.createBuffer(1, pcm.length, rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.connect(ctx.destination);
  nextAt = Math.max(nextAt, ctx.currentTime + 0.03);
  src.start(nextAt);
  nextAt += buf.duration;
  playing.add(src);
  return new Promise((r) => { src.onended = () => { playing.delete(src); r(); }; });
}
export function stopAudio() {
  for (const s of playing) { try { s.stop(); } catch { /* already stopped */ } }
  playing.clear();
  nextAt = 0;
}
export const isPlaying = () => playing.size > 0;

// ---------- audio in: mic -> 16 kHz Int16 -> base64 ----------
const WORKLET = `registerProcessor('pcm16', class extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.n = 0; }
  process(inputs) {
    const x = inputs[0][0];
    if (x) { this.buf.push(new Float32Array(x)); this.n += x.length; }
    if (this.n >= 1600) {                       // 100 ms at 16 kHz
      const out = new Int16Array(this.n); let o = 0;
      for (const b of this.buf) for (let i = 0; i < b.length; i++) out[o++] = Math.max(-1, Math.min(1, b[i])) * 0x7fff;
      this.port.postMessage(out.buffer, [out.buffer]); this.buf = []; this.n = 0;
    }
    return true;
  }
});`;
const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

async function openMic(onChunk) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
  const node = new AudioWorkletNode(ctx, 'pcm16');
  node.port.onmessage = (e) => onChunk(b64(e.data));
  ctx.createMediaStreamSource(stream).connect(node);
  return () => { stream.getTracks().forEach((t) => t.stop()); ctx.close(); };
}

// ---------- the session ----------
export function createLive({ onTool, onCaption, onHeard, onTurnEnd }) {
  let ws = null, ready = null, closeMic = null, caption = '', heard = '';
  const after = [];

  function runAfter() { while (after.length) after.shift()(); }

  async function connect() {
    const r = await fetch('/api/live-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!r.ok) throw new Error(`live token ${r.status}`);
    const t = await r.json();
    const sock = new WebSocket(`${t.url || WS}?access_token=${encodeURIComponent(t.token)}`);
    let chain = Promise.resolve();
    ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('live setup timeout')), 6000);
      sock.onopen = () => sock.send(JSON.stringify({ setup: {
        model: `models/${t.model}`,
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: t.voice } } } },
        systemInstruction: { parts: [{ text: t.persona }] },
        tools: t.tools,
        inputAudioTranscription: {}, outputAudioTranscription: {},
      } }));
      sock.onerror = () => { clearTimeout(timer); reject(new Error('live socket error')); };
      sock.onclose = (e) => { clearTimeout(timer); reject(new Error(`live closed ${e.code}`)); if (ws === sock) ws = null; };
      sock.onmessage = (e) => { chain = chain.then(async () => {
        const msg = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text());
        if (msg.setupComplete) { clearTimeout(timer); resolve(); }
        handle(sock, msg);
      }).catch(() => {}); };
    });
    ws = sock;
    await ready;
  }

  async function handle(sock, msg) {
    const sc = msg.serverContent;
    if (sc) {
      for (const p of sc.modelTurn?.parts || []) {
        if (p.inlineData?.data) playPcm(p.inlineData.data, Number(/rate=(\d+)/.exec(p.inlineData.mimeType || '')?.[1]) || 24000);
      }
      if (sc.inputTranscription?.text) { heard += sc.inputTranscription.text; onHeard && onHeard(heard.trim()); }
      if (sc.outputTranscription?.text) { caption += sc.outputTranscription.text; }
      if (sc.interrupted) stopAudio();
      if (sc.turnComplete) {
        if (caption.trim()) onCaption && onCaption(caption.trim());
        caption = ''; heard = '';
        // Local work that must wait for Murmur to finish speaking (e.g. reading a note aloud) runs now.
        const wait = () => (isPlaying() ? setTimeout(wait, 150) : runAfter());
        wait();
        onTurnEnd && onTurnEnd();
      }
    }
    if (msg.toolCall?.functionCalls?.length) {
      const functionResponses = [];
      for (const fc of msg.toolCall.functionCalls) {
        let response;
        try { response = await onTool(fc.name, fc.args || {}); } catch (e) { response = { error: String(e.message || e) }; }
        functionResponses.push({ id: fc.id, name: fc.name, response });
      }
      if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ toolResponse: { functionResponses } }));
    }
    if (msg.goAway && ws === sock) { ws = null; sock.close(); }
  }

  return {
    get connected() { return !!ws && ws.readyState === WebSocket.OPEN; },
    /** Start a turn: barge in on anything playing, connect if needed, stream the mic. */
    async start() {
      stopAudio();
      audioOut();
      if (!this.connected) await connect();
      heard = '';
      closeMic = await openMic((data) => ws && ws.readyState === WebSocket.OPEN &&
        ws.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } })));
    },
    /** End the turn: stop the mic and tell the model the person has finished. */
    stop() {
      if (closeMic) { closeMic(); closeMic = null; }
      if (this.connected) ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    },
    sendText(text) { if (this.connected) ws.send(JSON.stringify({ realtimeInput: { text } })); },
    afterTurn(fn) { after.push(fn); setTimeout(() => { if (!isPlaying() && after.includes(fn)) runAfter(); }, 4000); },
    hush() { stopAudio(); },
    close() { if (ws) ws.close(); ws = null; },
  };
}
