import init, { SurrealWasmEngine } from "./native.js";
import { ConnectionUnavailableError } from "./surrealdb.js";

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
//#region src-ts/worker/worker-agent.ts
let instance;
let cancelNotifications;
let abortController;
async function handleConnect(request) {
	abortController?.abort();
	await cancelNotifications?.();
	instance?.free();
	await initializeLibrary();
	instance = await SurrealWasmEngine.connect(request.url, request.options);
	abortController = new AbortController();
	cancelNotifications = readNotifications(instance, (data) => {
		self.postMessage({
			type: ResponseType.NOTIFICATION,
			data
		}, { transfer: [data.buffer] });
	}, abortController.signal);
}
async function handleExecute(request) {
	if (!instance) throw new ConnectionUnavailableError();
	return instance.execute(request.payload);
}
/**
* Open a streaming query and serve its frames over the request's channel.
*
* Returning is what tells the caller the query opened, so a failure from before
* execution began — a denied capability, a parse error, an unknown transaction —
* is reported as this request failing rather than as a frame.
*
* After that the channel answers one frame per request, so the reader's pace is
* the query's pace. The module buffers a single frame, so a reader that stops
* asking stops the scan, and one that cancels abandons the query.
*/
async function handleQueryStream(request) {
	if (!instance) throw new ConnectionUnavailableError();
	const reader = (await instance.query_stream(request.payload)).getReader();
	const port = request.port;
	let closed = false;
	const shutdown = async () => {
		if (closed) return;
		closed = true;
		await reader.cancel().catch(() => {});
		port.close();
	};
	port.onmessage = async (event) => {
		const message = event.data;
		if ("cancel" in message) {
			await shutdown();
			return;
		}
		try {
			const { done, value } = await reader.read();
			if (closed) return;
			if (done) {
				closed = true;
				port.postMessage({ done: true });
				port.close();
				return;
			}
			port.postMessage({ value }, [value.buffer]);
		} catch (error) {
			if (closed) return;
			closed = true;
			port.postMessage({ error: error instanceof Error ? error : new Error(String(error)) });
			port.close();
		}
	};
}
async function handleImportSql(request) {
	if (!instance) throw new ConnectionUnavailableError();
	return instance.import(request.data);
}
async function handleExportSql(request) {
	if (!instance) throw new ConnectionUnavailableError();
	return instance.export(request.options);
}
async function handleClose() {
	abortController?.abort();
	await cancelNotifications?.();
	cancelNotifications = void 0;
	abortController = void 0;
	instance?.free();
	instance = void 0;
}
self.addEventListener("message", async (event) => {
	const message = event.data;
	try {
		let result;
		switch (message.type) {
			case RequestType.CONNECT:
				result = await handleConnect(message.data);
				break;
			case RequestType.EXECUTE:
				result = await handleExecute(message.data);
				break;
			case RequestType.QUERY_STREAM:
				result = await handleQueryStream(message.data);
				break;
			case RequestType.IMPORT_SQL:
				result = await handleImportSql(message.data);
				break;
			case RequestType.EXPORT_SQL:
				result = await handleExportSql(message.data);
				break;
			case RequestType.CLOSE:
				await handleClose();
				result = void 0;
				break;
		}
		self.postMessage({
			id: message.id,
			type: ResponseType.RESPONSE,
			data: result
		}, result instanceof Uint8Array ? { transfer: [result.buffer] } : void 0);
	} catch (error) {
		self.postMessage({
			id: message.id,
			type: ResponseType.ERROR,
			error: error instanceof Error ? error : new Error(String(error))
		});
	}
});
self.postMessage({ type: ResponseType.READY });

//#endregion