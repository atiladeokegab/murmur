// Dev only: a fake Gemini Live server (WebSocket by hand, node:http) for testing live.js without a key.
// Each finished turn plays the next scripted tool call, then speaks the tool's "say" line back.
import http from 'node:http';
import crypto from 'node:crypto';

const SCRIPT = [
  { heard: 'message mum', call: { name: 'draft_message', args: {} } },
  { heard: 'change one to two', call: { name: 'edit_text', args: { from: 'one', to: 'two' } } },
  { heard: 'where am I', call: { name: 'where_am_i', args: {} } },
];
const log = { setup: null, audioChunks: 0, turns: 0, toolResponses: [], text: [] };

function frame(str) {
  const p = Buffer.from(str);
  const head = p.length < 126 ? Buffer.from([0x81, p.length])
    : p.length < 65536 ? Buffer.from([0x81, 126, p.length >> 8, p.length & 255])
    : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(p.length)); return b; })()]);
  return Buffer.concat([head, p]);
}
function parse(buf) { // returns [messages, rest]
  const out = [];
  while (buf.length >= 2) {
    let len = buf[1] & 127, off = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    const masked = buf[1] & 128;
    const need = off + (masked ? 4 : 0) + len;
    if (buf.length < need) break;
    const mask = masked ? buf.subarray(off, off + 4) : null;
    const data = Buffer.from(buf.subarray(off + (masked ? 4 : 0), need));
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
    out.push({ op: buf[0] & 15, data });
    buf = buf.subarray(need);
  }
  return [out, buf];
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(log));
});
server.on('upgrade', (req, socket) => {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const send = (o) => socket.write(frame(JSON.stringify(o)));
  let rest = Buffer.alloc(0), turn = 0;
  const silence = Buffer.alloc(4800).toString('base64'); // 100 ms at 24 kHz
  socket.on('data', (d) => {
    const [msgs, r] = parse(Buffer.concat([rest, d])); rest = r;
    for (const m of msgs) {
      if (m.op === 8) { socket.end(); return; }
      if (m.op !== 1 && m.op !== 2) continue;
      const msg = JSON.parse(m.data.toString());
      if (msg.setup) { log.setup = msg.setup; send({ setupComplete: {} }); }
      if (msg.realtimeInput?.audio) log.audioChunks++;
      if (msg.realtimeInput?.text) log.text.push(msg.realtimeInput.text);
      if (msg.realtimeInput?.audioStreamEnd) {
        const step = SCRIPT[turn++ % SCRIPT.length]; log.turns++;
        send({ serverContent: { inputTranscription: { text: step.heard } } });
        send({ toolCall: { functionCalls: [{ id: `call-${turn}`, ...step.call }] } });
      }
      if (msg.toolResponse) {
        const r = msg.toolResponse.functionResponses[0]; log.toolResponses.push(r);
        const say = r.response.say || 'Done.';
        send({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: silence } }] } } });
        send({ serverContent: { outputTranscription: { text: say } } });
        send({ serverContent: { turnComplete: true } });
      }
    }
  });
  socket.on('error', () => {});
});
const port = Number(process.env.PORT) || 8790;
server.listen(port, () => console.log(`fake live on ws://localhost:${port}`));
