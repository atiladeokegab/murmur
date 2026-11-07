// Every app is an MCP server. The GUI-to-MCP adapter turns each app's registered on-screen actions into MCP tools:
// names and JSON schemas come from the same registry the agent plans with, so a new app is new tools with no code here.
// A call drives the real GUI on a phone through the room bus (remote:run); the phone presses the controls through the
// agent's runner and answers remote:result. Gates (send, pay, call, delete) still ask on the phone and fail closed.
//   stdio:  node mcp/server.js   (talks to MURMUR_URL, default http://127.0.0.1:8080, over its /mcp)
//   HTTP:   POST /mcp on the Murmur server (streamable HTTP, stateless)
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { describeRegistry, SEP } from '../public/agent/plan.js';
import { ANSWER_MS } from '../public/os/remote-run.js';
import ids from '../public/apps/apps.js';

/** The phone's apps, described the way the agent sees them. */
export async function loadRegistry() {
  const apps = [];
  for (const id of ids) { try { apps.push((await import(`../public/apps/${id}/index.js`)).default); } catch { /* not merged */ } }
  return describeRegistry(apps);
}

const ROOM = { type: 'string', description: 'Which phone: the room it was opened with (/?room=...). Default "stage".' };
/** One MCP tool per app action: app__action, its own params schema plus room. */
export function toolsFrom(described) {
  return described.flatMap((a) => a.actions.map((x) => ({
    name: `${a.id}${SEP}${x.name}`,
    description: `${a.name}: ${x.describe}.${x.gate ? ` Gated (${x.gate}): the person must say yes on the phone${x.gate === 'pay' ? ' and give their fingerprint' : ''}, or this returns declined or timed out.` : ''}`,
    inputSchema: { ...x.params, type: 'object', properties: { ...(x.params?.properties || {}), room: ROOM } },
  })));
}

const reply = (r) => ({ isError: !r.ok, content: [{ type: 'text', text: JSON.stringify(r) }] });

export function createMcpServer({ tools, call }) {
  const server = new Server({ name: 'murmur', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    if (!tools.some((t) => t.name === name)) return reply({ ok: false, status: 'rejected', reason: `unknown tool ${name}` });
    const { room = 'stage', ...params } = args;
    if (!/^[\w-]{1,32}$/.test(String(room))) return reply({ ok: false, status: 'rejected', reason: 'bad room' });
    return reply(await call(name, params, String(room).toLowerCase()));
  });
  return server;
}

/** In-process call: publish remote:run on the relay, wait for the phone's remote:result. */
export function relayCall(relay, { waitMs = ANSWER_MS + 15000 } = {}) {
  return (tool, params, room) => new Promise((resolve) => {
    if (!relay.watching(room)) return resolve({ ok: false, status: 'no phone', reason: `No phone is open in room "${room}". Open Murmur with /?room=${room}.` });
    const id = randomUUID();
    let timer;
    const off = relay.listen((ev, r) => { if (ev.type === 'remote:result' && ev.id === id && r === room) { off(); clearTimeout(timer); const { type, at, ...out } = ev; resolve(out); } });
    timer = setTimeout(() => { off(); resolve({ id, ok: false, status: 'timed out', reason: 'The phone did not answer in time.' }); }, waitMs);
    relay.publish({ type: 'remote:run', id, tool, params }, room);
  });
}

/** POST /mcp: stateless streamable HTTP, a fresh server per request. */
export async function handleHttp(req, res, body, opts) {
  const server = createMcpServer(opts);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

// stdio: Claude Desktop, Claude Code or Cursor start this; each call goes to the running Murmur server's /mcp.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.env.MURMUR_URL || 'http://127.0.0.1:8080';
  const token = process.env.MURMUR_TOKEN || '';
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const tools = toolsFrom(await loadRegistry());
  const call = async (name, params, room) => {
    const client = new Client({ name: 'murmur-stdio', version: '0.1.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base), { requestInit: { headers: token ? { 'x-murmur-token': token } : {} } }));
      const r = await client.callTool({ name, arguments: { ...params, room } }, undefined, { timeout: ANSWER_MS + 30000 });
      return JSON.parse(r.content?.[0]?.text || '{}');
    } catch (e) { return { ok: false, status: 'failed', reason: `Murmur at ${base}: ${String(e.message || e).slice(0, 120)}` }; }
    finally { await client.close().catch(() => {}); }
  };
  await createMcpServer({ tools, call }).connect(new StdioServerTransport());
}
