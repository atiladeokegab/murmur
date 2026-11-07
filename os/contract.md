# Murmur OS contract

This is the contract between the shell, the agent and the apps. It is the source of truth on `main`. To
change it, send a change request to Zeus; never edit it silently. Rev 3 (13:30): `step:next`, `task:done`
`line` and `undo`, `confirm` `fingerprint` and `byHand`, the hand-tap rule for gates (§7) and the host (§9). Spec: Murmur OS §3.3 and §8.1.

The code is in `public/sdk/` (import everything from `public/sdk/index.js`). The worked example is
`public/apps/hello/`, and `test/sdk.test.js` runs it end to end.

## 1. Paths

| What | Where | Owner |
|---|---|---|
| SDK: bus, registry, ctx, cursor, kv, load, runAction | `public/sdk/*.js` | build-murmur |
| Shell: board, work panel, gestures, Your look, Back | `public/os/`, `public/index.html`, `public/app.css` | build-murmur |
| Agent: reserved words, planner, task runner, undo, workflows, teach | `public/agent/` (browser), `lib/agent/` (server) | build-agent |
| An app | `public/apps/<id>/index.js`, one ES module, `export default` the app object | its builder |
| App list, in board order | `public/apps/apps.js` (one id per line; append yours) | everyone |
| Server routes | `server.js`, `lib/` | build-agent |

## 2. The app object

```js
export default {
  id: 'messages',            // /^[a-z][a-z0-9]*$/ (no underscores: tool names split on "__")
  name: 'Messages',          // what the person hears
  async mount(root, os) {},  // render once into root (a <section>); see §2.1
  read() {},                 // string: plain words for what is on screen now
  place() {},                // { where, item?, n?, of?, next? }: "Mum's chat", "your reply", 2, 2, 'send'
  state() {},                // a JSON snapshot. verify, readback, undo and the eval read this, nothing else
  async seed() {},           // put the demo data in (invented people only); idempotent
  async reset() {},          // wipe the app's data and seed again (the demo reset calls this)
  actions: {
    reply: {
      describe: 'Reply to the open chat',   // imperative. The model's tool description and Teach me's words
      doing: 'Replying to Mum',             // REQUIRED. The step label: 2 to 5 words, present tense, shown and spoken as is
      params: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      gate: null,                           // null | 'send' | 'pay' | 'call' | 'delete'
      hint: 'The reply box is under the last message',   // Teach me says this, then waits for the person's tap
      readback(state, params) {},           // gated actions: the exact words read before the ask. Default: read()
      async run(params, ctx) {},            // presses controls through ctx only; see §3
      verify(state, params) {},             // true = pass. A string = fail with that reason. Anything else = fail
      async undo(ctx, params) {},           // optional; goes back through ctx too. Gated actions have none
    },
  },
};
```

`registry.register()` checks all of this and throws a clear error on load. Required fields: id, name,
mount, read, place, state, seed, reset, and at least one action. Each action needs describe, doing, run
and verify, plus a gate from the list.

### 2.1 Mount: accessible by construction

- `mountApp(app, host, os)` creates `<section class="app" id="app-<id>" data-app="<id>" hidden>`, calls
  `mount(root, os)` once, and then needs an `<h2>` inside it. The h2 is the app's name and gets
  `tabindex=-1`. The section is labelled by it, and `open_app` moves focus to it.
- `os` is `{ kv, bus, say(text) }`. Keep `root` in module scope, because `run` uses it.
- Use real `button`, `a`, `textarea` and `input` elements, each named by a visible `<label>` or by its text.
  Use `aria-label` only for icon buttons. Source order is reading order. Every target is at least
  `var(--h-link)` (64 px). Use only the tokens in `app.css`; write no colour or size values in an app.
- Reading content: each sentence is its own element (an `li`, or a `span` with `data-n`), so TalkBack's
  position is "sentence n of m". Mark a changed word with `<mark class="changed">`.
- The app re-renders from its own state. It never reads the bus to decide what to show.

## 3. ctx: the agent's hands

`createCtx({ app, root, bus, kv, cursor, ask, choose, speak, signal })`. The agent builds one per step. Apps only receive it.

| Call | Does |
|---|---|
| `await ctx.tap(el, name?)` | Refuses anything outside this app's root, anything that is not a control, and anything disabled. Emits `tap {app, control}`, moves the amber ring onto the control (220 ms glide, 0 with reduced motion) and clicks it. `name` defaults to the control's accessible name |
| `await ctx.type(el, text)` | Into a textarea or input inside the root: focus, set `el.value`, dispatch a bubbling `input` event (so apps listen to `input`). Call `tap` first so the ring shows where |
| `await ctx.say(text)` | Emits `say {app, text}` (the record: status region, Inside), then awaits the host's `speak(text, signal)`, which settles when the sentence has been said. Rejects with `AbortError` on Stop, so a sentence-by-sentence read loop stops by itself |
| `await ctx.choose(question, choices)` | Ambiguity ("Sam or Samira?"). `choices` is `[{ label, ...yourData }]`. Resolves to the chosen object, or `null` if none. Emits `ask {app, question, choices, result}`. On `null`, throw an Error with the reason ("No one chosen.") so the step fails in words |
| `await ctx.confirm(gate, readback)` | The ask-first sheet. Resolves true or false and emits `confirm {app, gate, readback, result}`. The runner calls it for every gate. An app calls it only for its own choice inside an action |
| `ctx.kv` | This app's storage: `get(k)`, `set(k, v)` (undefined deletes), `all()`, all async. Area `app.<id>` on the browser-kv port (localStorage key `murmur:app.<id>:<k>`) |
| `ctx.root`, `ctx.signal` | The app's section, and the Stop signal. After Stop, every ctx call throws `AbortError` |

Rule: `run` changes the app only by pressing its controls through ctx. It never sets app state directly.
The person and the agent use the same door.

## 4. The registry and the tools

```js
const registry = createRegistry();
await loadApps(registry, ids);          // ids from public/apps/apps.js; dynamic import of apps/<id>/index.js
registry.register(app) / get(id) / list()
registry.tools()                        // [{ name, description, parameters }] JSON schema, lower-case types
registry.resolve(name)                  // { builtin, schema } | { app, key, action, schema } | null
validate(schema, params)                // { ok, params, errors, dropped }: unknown keys dropped and listed
```

- App tools are named `<app>__<action>` (for example `hello__write`). The description is
  `"<App name>: <describe>"`, plus `" (the person is asked first: <gate>)"` when gated.
- OS tools are run by the agent, never by an app: `open_app {app: enum of ids}`, `read_screen {}`,
  `where {}`, `say {text}`, `ask {question}`, `save_workflow {name}`, `run_workflow {name}`,
  `explain {question}`.
- Gemini: wrap the tools as `[{ functionDeclarations: registry.tools() }]`. If the endpoint rejects
  lower-case JSON-schema types, upper-case them in `lib/agent/` and leave the SDK alone.
- A name that `resolve` returns null for does not exist. The agent says "I can't do that in <App>"
  and lists that app's `describe`s.

## 5. runAction: the only way an app action runs

```js
const r = await runAction({ registry, name, params, bus, ctxFor: (app) => createCtx({...}), n, of });
// r = { ok, params? } | { ok:false, reason, cancelled?, stopped? }
```

The order is fixed, and the agent's runner cannot skip a step:

1. Resolve the name. Unknown → `step:failed {reason:"I can't do that here."}`.
2. Validate. Bad → `step:failed {reason:"<App> needs …"}`.
3. `step:start`.
4. Gate → `ctx.confirm(gate, readback(state(), params))`. A no → `step:failed {cancelled:true, reason:"Not sent."}`.
5. `run`.
6. `verify(state(), params)`. Pass → `step:verified {ms}` and then `place`. Fail or throw → `step:failed {reason}`.

The task runner in `public/agent/` owns everything around a step: `heard`, `task:start`, the plan, OS tools,
the 1.2 s pacing, pay's fingerprint (inside the `ask` it hands to ctx), undo, `memory` and `task:done`.

## 6. The bus

`createBus()` returns `{ on(name, fn) → off, emit(name, payload), log }`. `on('*', (name, ev) => …)` sees
every event (Inside's relay uses it). An unknown event name throws. `emit` adds `t` (ms since epoch). `log`
keeps the last 500 events. A listener that throws is logged and never stops the runner. Payloads must be
plain JSON.

| Event | Payload | Emitted by |
|---|---|---|
| `heard` | `{ text, raw?, path: 'live' \| 'speech' \| 'typed', ms? }` | voice |
| `task:start` | `{ task, utterance, plan: [{ name, params }] }` | agent |
| `step:next` | `{ task, label }`: the next step, said before it runs ("Ask me" announces it) | agent |
| `step:start` | `{ task?, action, app, n, of, label, params, gate, dropped }` | runAction |
| `tap` | `{ app, control }` | ctx.tap |
| `step:verified` | `{ task?, action, app, n, of, ms }` | runAction |
| `step:failed` | `{ task?, action, app?, n, of, reason, cancelled?, stopped? }` | runAction, agent |
| `confirm` | `{ app, gate, readback, result, fingerprint?, byHand? }`: `fingerprint` is set for `pay` (true when a passkey checked it); `byHand` when the person tapped the control | ctx.confirm, shell (`os.confirm`) |
| `ask` | `{ app?, question, choices?, result }` | ctx.choose, agent (OS tool `ask`) |
| `say` | `{ app?, text }` | ctx.say, agent |
| `place` | `{ app, where, item?, n?, of?, next? }` | runAction, agent (`where`, open_app) |
| `memory` | `{ observation }` \| `{ proposal }` \| `{ workflow }` | agent (Librarian) |
| `undo` | `{ task?, action, ok }` | agent |
| `task:done` | `{ task, ms, ok, reason?, line?, undo? }`: always ends a task (done, failed or stopped). `line` is the Done line ("Sent to Sam."); `undo: { label, until }` (ms since epoch) offers Undo until then | agent |

`task` is a string id the agent makes (`t-<timestamp>`). runAction leaves it out, and the agent adds it by
wrapping the bus it passes in. The shell's work panel numbers steps from `n` and `of`. Its "Done in N s"
comes from `task:done.ms`, measured from the offer, or from the utterance for a spoken task.

## 7. Decisions the spec left open

1. **`doing` is a separate required field** (the 2-to-5-word label), and `describe` stays imperative for the
   model. Present tense generated from `describe` reads badly. Two fields are cheap.
2. **The SDK owns the single-step executor (`runAction`).** Gate, validate and verify live in one place
   that every caller shares, so "no gated action without a confirm" is true by construction, and
   `test/sdk.test.js` checks it. The agent owns plans and tasks.
3. **The readback comes from the app** (`action.readback(state, params)`, defaulting to `read()`), never from
   the model.
4. **`verify` returns `true` or a reason string.** Only a literal `true` passes, so a sloppy truthy value
   cannot tick.
5. **The bus is closed.** Event names are fixed above, and emitting an unknown name throws. I added three
   events beyond §8.1: `heard` (Inside's first column), `tap` (Inside's "control the cursor pressed") and
   `undo`.
6. **`task:done {ok}` ends every task**, including a failure or a Stop, so the panel and the timer have one
   end signal.
7. **Stop is an AbortSignal through ctx.** Every ctx call checks it, so an app needs no Stop code.
8. **Apps mount once and stay mounted**, hidden when they are not open. State survives navigation, and
   `open_app` only unhides the app and moves focus to its h2. Back closes the app (the shell owns history).
9. **Each app gets its own kv area** (`app.<id>`) on the browser-kv port. Apps share nothing. The Librarian
   keeps its own `aat:` keys, and an app never writes there.
10. **The app list is `public/apps/apps.js`**, loaded by dynamic import, and its order is the board order. One
    line per app keeps merges trivial.

Also decided:
- **Speech is a call and the bus is the record** (rev 2, 12:55). Whoever wants a sentence heard calls the voice's
  `speak(text, signal)`, through `ctx.say` for apps and directly for the agent. The `say` event only records it.
  The voice layer never speaks because it heard a `say` event, so nothing is said twice.
- **Ambiguity is resolved inside `run` with `ctx.choose`** (rev 2). It is not a special return value, so
  `runAction` still verifies every step.
- Ids have no underscores.
- `seed()` is idempotent, and `reset()` wipes and then calls seed.
- **Send, pay, call and delete ALWAYS ask, a person's own tap included** (the lead's rule; rev 3, corrected
  13:40). The app calls `await os.confirm({ gate, readback })` before it acts, and acts only on `true`. A hand
  tap shows the same readback sheet ("Send to Sam: …", Yes or No), because a mis-tap by someone who cannot see
  is the risk. The only difference is that a hand tap has no 0.5 s grace. `confirm` is recorded with `byHand: true`.
  When the agent pressed the control, `os.confirm` answers yes at once, because the runner already asked
  through `ctx.confirm` (the grant is scoped to that one synthetic click).
- **Every pay needs a yes AND the fingerprint, and fails closed** (spec §3.7, the lead's rule), on the hand
  path and the agent path alike (`public/os/gate.js` `checkFingerprint`). A saved passkey is asked for. With
  none, making one (`setup()`) is the fingerprint ask. A cancel, or no answer in 20 s, says "No fingerprint, so
  nothing was paid." No platform authenticator says "This phone can't check a fingerprint, so I can't pay."
  Either way nothing is paid and the agent is free. The spoken or tapped yes never stands alone.
- **The shell owns the gate sheet** (rev 3). Every gate the runner meets goes through `ctx.confirm`, which
  calls the shell's sheet: the readback said aloud, a yes in the first 0.5 s ignored, the passkey for `pay`,
  and the `confirm` event. The agent does not draw its own sheet or check its own fingerprint.
- Tools use JSON schema with lower-case types.

## 8. Checklist for a new app (copy `public/apps/hello/`)

- [ ] `id`, `name`, and an `<h2>` with the name in `mount`
- [ ] every control is real and named, at least 64 px, source order is reading order, tokens only
- [ ] `read()` and `place()` in plain words; `state()` is JSON and holds everything verify needs
- [ ] `seed()` and `reset()` with invented people only. No health or government. A simulated Bank only: invented money, and every pay needs a yes and the fingerprint (the lead, 13:15)
- [ ] each action has `describe`, `doing` (2 to 5 words), `params` schema, `hint`, `run` through ctx, and `verify`
- [ ] gated actions (`send`, `pay`, `call`, `delete`) have a `readback` and no `undo`, and the control's own
      handler awaits `os.confirm({ gate, readback })` before it acts
- [ ] one line in `public/apps/apps.js`, and a test like `test/sdk.test.js` that runs each action through
      `runAction`

## 9. The host: what the shell passes to the agent (rev 3)

The shell imports `public/agent/index.js` and calls `createAgent(host)` once, after every app has mounted:

| `host` field | What it is |
|---|---|
| `registry`, `bus` | the shell's registry and bus |
| `ctxFor(app, hooks?)` | a ctx for `app`. It opens the app first, so the agent works where the person can see. `hooks` may set `signal` (Stop), `choose` and `speak`; leave `ask` out, so gates reach the shell's sheet (§7). An `AbortSignal` alone also works |
| `speak(text, signal?)` | the one voice; resolves `false` when Stop cut it off |
| `librarian` | the Librarian from the toolkit (memory, Your look profile) |
| `os` | `{ open(id), current() }`: open an app (focus to its h2) and the open app's id or null |
| `fingerprint()` | `passkey.confirm()`, for a gate the agent judges risky beyond `pay` |
| `agency()` | `'ask' \| 'just' \| 'teach'`, from Your look |
| `onGate(sheet \| null)`, `onChoose(choice \| null)` | legacy: the shell still shows them, until the agent asks through ctx |

`createAgent` returns at least `{ hear(text, {path}), stop(), takeOver(), undo(), carryOn(), yes(), no(),
pick(i), workflows }`. The shell calls `stop` for the Stop bar, Back during a task and the "stop" verb;
`undo` for the Done line's Undo; `takeOver` when the person touches an app mid-task; `carryOn` for "carry
on" and the swipe right.

**Native access.** Every setting the shell owns is a tool. The shell registers an app, `phone`
(`public/os/phone.js`, left off the board), whose actions are `phone__sound {on}`, `phone__noLook {on}`,
`phone__where` and `phone__stop`. Your look's rows are the look app's `look__*` tools. The runner presses these
through ctx like any other app, so the cursor shows them and verify proves them.
