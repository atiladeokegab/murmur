import { ChannelIterator, ConnectionUnavailableError, Features, LiveDispatcher, Publisher, RpcEngine, SqonError, SurrealSqonError, UnexpectedConnectionError, framesToChunks, parseRpcError } from "./surrealdb.js";
import init, { SurrealWasmEngine } from "./native.js";

//#region src-ts/wrap-sqon-error.ts
/**
* Execute a function and wrap any thrown {@link SqonError} in a {@link SurrealSqonError}.
*/
function wrapSqonError(fn) {
	try {
		return fn();
	} catch (error) {
		if (error instanceof SqonError) throw new SurrealSqonError(error);
		throw error;
	}
}

//#endregion
//#region src-ts/engine.ts
/**
* The engine implementation responsible for communicating with an embedded
* WebAssembly build of SurrealDB.
*/
var WebAssemblyEngine = class extends RpcEngine {
	#broker;
	#publisher = new Publisher();
	#live = new LiveDispatcher();
	#abort;
	#options;
	#initPromise;
	constructor(broker, context, options) {
		super(context);
		this.#broker = broker;
		this.#options = options;
	}
	features = new Set([
		Features.LiveQueries,
		Features.Sessions,
		Features.Transactions,
		Features.Api,
		Features.ExportImportRaw,
		Features.SqlDialects
	]);
	open(state) {
		this.#abort?.abort();
		this.#abort = new AbortController();
		this._state = state;
		this.#initPromise = this.#initialize(state, this.#abort.signal);
	}
	async close() {
		this._state = void 0;
		this.#abort?.abort();
		this.#abort = void 0;
		await this.#initPromise?.catch(() => {});
		this.#initPromise = void 0;
		await this.#broker.close();
		this.#live.clear();
		this.#publisher.publish("disconnected");
	}
	ready() {}
	subscribe(event, listener) {
		return this.#publisher.subscribe(event, listener);
	}
	liveQuery(id) {
		const channel = new ChannelIterator(() => {
			unsub1();
			unsub2();
		});
		const unsub1 = this.#live.subscribe(id.toString(), (msg) => {
			channel.submit(msg);
		});
		const unsub2 = this.#publisher.subscribe("disconnected", () => {
			channel.cancel();
		});
		return channel;
	}
	async send(request) {
		if (!this.#broker.isConnected) throw new ConnectionUnavailableError();
		const id = this._context.uniqueId();
		const payload = wrapSqonError(() => this._context.codecs.cbor.encode({
			id,
			...request
		}));
		const response = await this.#broker.execute(payload);
		const decoded = wrapSqonError(() => this._context.codecs.cbor.decode(response));
		if (decoded && typeof decoded === "object" && "error" in decoded) throw parseRpcError(decoded.error);
		return decoded;
	}
	/**
	* Run a query, yielding each batch of rows as the engine produces it.
	*
	* The base implementation awaits the whole answer and then hands it over in
	* one piece, which for an embedded engine means holding an entire `SELECT`
	* in memory before JavaScript sees a single row. The module can stream, so
	* this drives that instead: time-to-first-row becomes the cost of one batch
	* rather than of the whole result.
	*
	* Nothing runs ahead of this loop. Reading a frame is what drives the query
	* inside the module, so a consumer that stops iterating stops the scan, and
	* one that abandons it cancels the query outright.
	*/
	query(query, session, txn) {
		return framesToChunks(this.#queryFrames(query, session, txn));
	}
	async *#queryFrames(query, session, txn) {
		if (!this.#broker.isConnected) throw new ConnectionUnavailableError();
		const id = this._context.uniqueId();
		const payload = wrapSqonError(() => this._context.codecs.cbor.encode({
			id,
			method: "query_stream",
			params: [query.query, query.bindings],
			session,
			txn
		}));
		const reader = (await this.#broker.queryStream(payload)).getReader();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				yield wrapSqonError(() => this._context.codecs.cbor.decode(value));
			}
		} finally {
			await reader.cancel().catch(() => {});
		}
	}
	async importSql(data) {
		if (data instanceof ReadableStream) {
			const reader = data.getReader();
			const decoder = new TextDecoder();
			let sql = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				sql += decoder.decode(value, { stream: true });
			}
			return this.#broker.importSql(sql + decoder.decode());
		}
		if (data instanceof Blob) return this.#broker.importSql(await data.text());
		return this.#broker.importSql(data);
	}
	async exportSql(options) {
		const payload = wrapSqonError(() => this._context.codecs.cbor.encode(options));
		const sql = await this.#broker.exportSql(payload);
		return new Response(sql);
	}
	async #initialize(state, signal) {
		try {
			await this.#broker.connect(state.url.toString(), this.#options, (data) => {
				const payload = wrapSqonError(() => this._context.codecs.cbor.decode(data));
				if (payload.id) this.#live.dispatch(payload.id.toString(), payload.action === "KILLED" ? {
					queryId: payload.id,
					action: "KILLED"
				} : {
					queryId: payload.id,
					action: payload.action,
					recordId: payload.record,
					value: payload.result
				});
			});
			if (signal.aborted) {
				await this.#broker.close();
				return;
			}
			this.#publisher.publish("connected");
		} catch (err) {
			this.#publisher.publish("error", new UnexpectedConnectionError(err));
			this.#publisher.publish("disconnected");
		}
	}
};

//#endregion
//#region src-ts/common.ts
function readNotifications(engine, handle, signal) {
	let cancelled = false;
	let reader = null;
	let resolveExited;
	const exitedPromise = new Promise((resolve) => {
		resolveExited = resolve;
	});
	const cancel = () => {
		cancelled = true;
		reader?.cancel().catch(() => {});
		return exitedPromise;
	};
	(async () => {
		try {
			reader = engine.notifications().getReader();
			while (!cancelled && !signal?.aborted) {
				const { done, value } = await reader.read();
				if (done || cancelled || signal?.aborted) break;
				handle(value);
			}
			if (!cancelled && !signal?.aborted) await reader.cancel();
		} catch {} finally {
			resolveExited?.();
		}
	})();
	return cancel;
}
let initPromise;
/**
* Initialize the WebAssembly module. Safe to call multiple times; the module
* is only initialized once and subsequent calls return the same promise.
*
* The module is left to resolve itself. `@surrealdb/wasm-native` locates it
* beside its own loader, which is the one place that knows where it is: a
* bundler rewrites that reference to the asset it emitted, and a plain
* `<script type="module">` fetches it from the package.
*/
async function initializeLibrary() {
	if (initPromise === void 0) initPromise = init();
	await initPromise;
}

//#endregion
//#region src-ts/local/local-broker.ts
var LocalEngineBroker = class {
	#engine;
	#active = false;
	#cancelNotifications;
	#abortController;
	get isConnected() {
		return this.#active && !!this.#engine;
	}
	async connect(url, options, onNotification) {
		this.#cancelNotifications?.();
		this.#abortController?.abort();
		this.#engine?.free();
		await initializeLibrary();
		this.#engine = await SurrealWasmEngine.connect(url.toString(), options);
		this.#active = true;
		this.#abortController = new AbortController();
		this.#cancelNotifications = readNotifications(this.#engine, onNotification, this.#abortController.signal);
	}
	execute(payload) {
		if (!this.#active || !this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.execute(payload);
	}
	async queryStream(payload) {
		if (!this.#active || !this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.query_stream(payload);
	}
	async importSql(data) {
		if (!this.#active || !this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.import(data);
	}
	async exportSql(options) {
		if (!this.#active || !this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.export(options);
	}
	async close() {
		this.#active = false;
		this.#abortController?.abort();
		this.#abortController = void 0;
		await this.#cancelNotifications?.();
		this.#cancelNotifications = void 0;
		this.#engine?.free();
		this.#engine = void 0;
	}
};

//#endregion
//#region src-ts/worker/worker-contract.ts
const RequestType = {
	CONNECT: "connect",
	EXECUTE: "execute",
	QUERY_STREAM: "queryStream",
	IMPORT_SQL: "importSql",
	EXPORT_SQL: "exportSql",
	CLOSE: "close"
};
const ResponseType = {
	READY: "ready",
	RESPONSE: "response",
	NOTIFICATION: "notification",
	ERROR: "error"
};

//#endregion
//#region src-ts/worker/worker-broker.ts
/**
* The frames of one query, pulled over `port` a frame at a time.
*
* Nothing arrives on the channel until this asks for it, so the reader's pace is
* the query's pace rather than the worker's: the next frame is requested only
* once the previous one has been taken. Cancelling asks the worker to abandon the
* query, which is what a consumer walking away amounts to.
*/
function frameStream(port) {
	let pending;
	return new ReadableStream({
		start(controller) {
			port.onmessage = (event) => {
				const reply = event.data;
				const settle = pending;
				pending = void 0;
				if ("error" in reply) {
					port.close();
					settle?.reject(reply.error);
					return;
				}
				if ("done" in reply) {
					port.close();
					controller.close();
				} else controller.enqueue(reply.value);
				settle?.resolve();
			};
		},
		pull() {
			return new Promise((resolve, reject) => {
				pending = {
					resolve,
					reject
				};
				port.postMessage({ pull: true });
			});
		},
		cancel() {
			pending = void 0;
			port.postMessage({ cancel: true });
			port.close();
		}
	});
}
var WorkerEngineBroker = class {
	#worker;
	#ready = Promise.resolve();
	#markReady;
	#promiseResolvers = /* @__PURE__ */ new Map();
	/**
	* Correlates a reply with the request that asked for it.
	*
	* Only has to be unique among the requests this broker has outstanding to
	* its worker, which is why it is a counter of its own rather than the
	* SDK's: these ids never leave the pair.
	*/
	#nextRequestId = 0;
	#handleNotification;
	get isConnected() {
		return !!this.#worker;
	}
	async connect(url, options, onNotification) {
		this.#handleNotification = onNotification;
		this.#worker = options?.createWorker?.() ?? new Worker(new URL(
			/* @vite-ignore */
			"./worker-agent.js",
			import.meta.url
		), { type: "module" });
		this.#ready = new Promise((resolve) => {
			this.#markReady = resolve;
		});
		this.#worker.addEventListener("message", (event) => {
			this.#handleMessage(event.data);
		});
		await this.#send({
			type: RequestType.CONNECT,
			data: {
				url,
				options: {
					...options,
					createWorker: void 0
				}
			}
		});
	}
	execute(payload) {
		if (!this.#worker) throw new ConnectionUnavailableError();
		return this.#send({
			type: RequestType.EXECUTE,
			data: { payload }
		}, [payload.buffer]);
	}
	async queryStream(payload) {
		if (!this.#worker) throw new ConnectionUnavailableError();
		const { port1, port2 } = new MessageChannel();
		await this.#send({
			type: RequestType.QUERY_STREAM,
			data: {
				payload,
				port: port2
			}
		}, [payload.buffer, port2]);
		return frameStream(port1);
	}
	async importSql(data) {
		if (!this.#worker) throw new ConnectionUnavailableError();
		return this.#send({
			type: RequestType.IMPORT_SQL,
			data: { data }
		});
	}
	async exportSql(options) {
		if (!this.#worker) throw new ConnectionUnavailableError();
		return this.#send({
			type: RequestType.EXPORT_SQL,
			data: { options }
		}, [options.buffer]);
	}
	async close() {
		if (this.#worker) await this.#send({
			type: RequestType.CLOSE,
			data: void 0
		});
		this.#worker?.terminate();
		this.#worker = void 0;
		this.#promiseResolvers.clear();
		this.#handleNotification = void 0;
		this.#ready = Promise.resolve();
		this.#markReady = void 0;
	}
	#handleMessage(message) {
		switch (message.type) {
			case ResponseType.READY:
				this.#markReady?.();
				break;
			case ResponseType.RESPONSE: {
				const resolver = this.#promiseResolvers.get(message.id);
				if (resolver) {
					this.#promiseResolvers.delete(message.id);
					resolver.resolve(message.data);
				}
				break;
			}
			case ResponseType.ERROR: {
				const resolver = this.#promiseResolvers.get(message.id);
				if (resolver) {
					this.#promiseResolvers.delete(message.id);
					resolver.reject(message.error);
				}
				break;
			}
			case ResponseType.NOTIFICATION:
				this.#handleNotification?.(message.data);
				break;
		}
	}
	async #send(request, transfer) {
		await this.#ready;
		this.#nextRequestId += 1;
		const id = String(this.#nextRequestId);
		const message = {
			id,
			...request
		};
		this.#worker?.postMessage(message, transfer ? { transfer } : void 0);
		return new Promise((resolve, reject) => {
			this.#promiseResolvers.set(id, {
				resolve: (value) => resolve(value),
				reject
			});
		});
	}
};

//#endregion
//#region src-ts/index.ts
/**
* Configure the `mem` and `indxdb` WebAssembly engines for the JavaScript SDK.
*
* @param options Optional connection options to configure the WebAssembly engines.
* @example
* ```ts
* import { Surreal, createRemoteEngines } from "./surrealdb.js";
* import { createWasmEngines } from "@surrealdb/wasm";
*
* const db = new Surreal({
*     engines: {
*         ...createRemoteEngines(),
*         ...createWasmEngines(),
*     },
* });
* ```
*/
const createWasmEngines = (options) => {
	const createEngine = (ctx) => new WebAssemblyEngine(new LocalEngineBroker(), ctx, options);
	return {
		mem: createEngine,
		indxdb: createEngine
	};
};
/**
* Configure the `mem` and `indxdb` WebAssembly WebWorker engines for the JavaScript SDK.
*
* @param options Optional connection options to configure the WebAssembly engines.
* @example
* ```ts
* import { Surreal, createRemoteEngines } from "./surrealdb.js";
* import { createWasmWorkerEngines } from "@surrealdb/wasm";
*
* const db = new Surreal({
*     engines: {
*         ...createRemoteEngines(),
*         ...createWasmWorkerEngines(),
*     },
* });
* ```
*/
const createWasmWorkerEngines = (options) => {
	const createEngine = (ctx) => new WebAssemblyEngine(new WorkerEngineBroker(), ctx, options);
	return {
		mem: createEngine,
		indxdb: createEngine
	};
};

//#endregion
export { WebAssemblyEngine, createWasmEngines, createWasmWorkerEngines };