// Hello: the stub app that walks the whole contract (os/contract.md). Copy this folder to start an app.
// One invented person (Sam), one text box, one gated Send.
let root = null, kv = null, box = null, sendBtn = null, sentList = null;
let draft = '', sent = [], before = '';

function el(tag, props = {}, ...kids) {
  const n = root.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (k.startsWith('aria-') || k === 'for') n.setAttribute(k, v); else n[k] = v;
  for (const k of kids) n.append(k);
  return n;
}
function render() {
  if (box.value !== draft) box.value = draft;
  sentList.replaceChildren(...sent.map((t) => el('li', { textContent: t })));
}

const app = {
  id: 'hello',
  name: 'Hello',

  async mount(r, os) {
    root = r; kv = os.kv;
    box = el('textarea', { id: 'hello-box' });
    box.addEventListener('input', () => { draft = box.value; });
    sendBtn = el('button', { type: 'button', className: 'app-btn primary', id: 'hello-send', textContent: 'Send to Sam' });
    sendBtn.addEventListener('click', async () => {   // a person's tap is their own yes; the agent is gated by the runner
      if (!draft.trim()) return;
      sent.push(draft);
      await kv.set('sent', sent);
      render();
    });
    sentList = el('ul', { id: 'hello-sent', 'aria-label': 'Sent to Sam' });
    root.append(
      el('h2', { id: 'hello-h', textContent: 'Hello' }),
      el('label', { for: 'hello-box', textContent: 'Your message to Sam' }), box,
      sendBtn, sentList);
    sent = (await kv.get('sent')) || [];
    render();
  },

  read() {
    return draft ? `Hello. Your message to Sam says: ${draft}` : 'Hello. Your message to Sam is empty.';
  },
  place() {
    return { where: 'Hello', item: 'your message to Sam', next: draft ? 'send' : 'write' };
  },
  state() {
    return { draft, sent: sent.slice(), lastSent: sent.at(-1) ?? null };
  },
  async seed() { draft = ''; sent = []; await kv.set('sent', sent); render(); },
  async reset() { await this.seed(); },

  actions: {
    write: {
      describe: 'Write a message to Sam',
      doing: 'Writing to Sam',
      hint: 'The message box is under the heading.',
      params: { type: 'object', properties: { text: { type: 'string', description: 'The message' } }, required: ['text'] },
      async run(p, ctx) {
        before = draft;
        await ctx.tap(box, 'Your message to Sam');
        await ctx.type(box, p.text);
      },
      verify: (s, p) => s.draft === p.text || 'The message box did not take it.',
      async undo(ctx) { await ctx.type(box, before); },
    },
    send: {
      describe: 'Send the message to Sam',
      doing: 'Sending to Sam',
      gate: 'send',
      hint: 'Send is the button under the message box.',
      params: { type: 'object', properties: {} },
      readback: (s) => `Send to Sam: ${s.draft}`,
      async run(p, ctx) { await ctx.tap(sendBtn); },
      verify: (s) => (s.draft !== '' && s.lastSent === s.draft) || 'It did not send.',
    },
  },
};
export default app;
