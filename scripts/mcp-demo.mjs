// The MCP adapter's showcase: an MCP client drives the Messages app on a real phone.
// Open the phone at /?room=mcp-demo, then: node scripts/mcp-demo.mjs  (MURMUR_URL, MURMUR_TOKEN as for the server)
// The send stops on the phone's "Send it?" until someone taps yes there; no yes comes back as declined or timed out.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const base = process.env.MURMUR_URL || 'http://127.0.0.1:8080';
const token = process.env.MURMUR_TOKEN || '';
const room = process.env.ROOM || 'mcp-demo';
const client = new Client({ name: 'murmur-mcp-demo', version: '0.1.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base), { requestInit: { headers: token ? { 'x-murmur-token': token } : {} } }));

const { tools } = await client.listTools();
console.log(`${tools.length} tools from ${base}, for example:`, tools.filter((t) => t.name.startsWith('messages__')).map((t) => t.name).join(', '));

let ok = true;
for (const [name, args, note] of [
  ['messages__openChat', { id: 'mum', who: 'Mum' }, ''],
  ['messages__reply', { text: "I'll be home by six" }, ''],
  ['messages__send', {}, ' (waiting for a yes on the phone)'],
]) {
  console.log(`> ${name} ${JSON.stringify(args)}${note}`);
  const r = await client.callTool({ name, arguments: { ...args, room } }, undefined, { timeout: 120000 });
  const out = JSON.parse(r.content[0].text);
  console.log(`  ${out.status}${out.line ? `: ${out.line}` : ''}${out.reason ? `: ${out.reason}` : ''}`);
  if (!out.ok) { ok = false; break; }
}
await client.close();
process.exit(ok ? 0 : 1);
