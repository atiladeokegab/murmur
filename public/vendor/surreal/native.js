/* @ts-self-types="./index.d.ts" */

export class IntoUnderlyingByteSource {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingByteSourceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingbytesource_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get autoAllocateChunkSize() {
        const ret = wasm.intounderlyingbytesource_autoAllocateChunkSize(this.__wbg_ptr);
        return ret >>> 0;
    }
    cancel() {
        const ptr = this.__destroy_into_raw();
        wasm.intounderlyingbytesource_cancel(ptr);
    }
    /**
     * @param {ReadableByteStreamController} controller
     * @returns {Promise<any>}
     */
    pull(controller) {
        const ret = wasm.intounderlyingbytesource_pull(this.__wbg_ptr, addHeapObject(controller));
        return takeObject(ret);
    }
    /**
     * @param {ReadableByteStreamController} controller
     */
    start(controller) {
        wasm.intounderlyingbytesource_start(this.__wbg_ptr, addHeapObject(controller));
    }
    /**
     * @returns {ReadableStreamType}
     */
    get type() {
        const ret = wasm.intounderlyingbytesource_type(this.__wbg_ptr);
        return __wbindgen_enum_ReadableStreamType[ret];
    }
}
if (Symbol.dispose) IntoUnderlyingByteSource.prototype[Symbol.dispose] = IntoUnderlyingByteSource.prototype.free;

export class IntoUnderlyingSink {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingSinkFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsink_free(ptr, 0);
    }
    /**
     * @param {any} reason
     * @returns {Promise<any>}
     */
    abort(reason) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.intounderlyingsink_abort(ptr, addHeapObject(reason));
        return takeObject(ret);
    }
    /**
     * @returns {Promise<any>}
     */
    close() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.intounderlyingsink_close(ptr);
        return takeObject(ret);
    }
    /**
     * @param {any} chunk
     * @returns {Promise<any>}
     */
    write(chunk) {
        const ret = wasm.intounderlyingsink_write(this.__wbg_ptr, addHeapObject(chunk));
        return takeObject(ret);
    }
}
if (Symbol.dispose) IntoUnderlyingSink.prototype[Symbol.dispose] = IntoUnderlyingSink.prototype.free;

export class IntoUnderlyingSource {
    static __wrap(ptr) {
        const obj = Object.create(IntoUnderlyingSource.prototype);
        obj.__wbg_ptr = ptr;
        IntoUnderlyingSourceFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingSourceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsource_free(ptr, 0);
    }
    cancel() {
        const ptr = this.__destroy_into_raw();
        wasm.intounderlyingsource_cancel(ptr);
    }
    /**
     * @param {ReadableStreamDefaultController} controller
     * @returns {Promise<any>}
     */
    pull(controller) {
        const ret = wasm.intounderlyingsource_pull(this.__wbg_ptr, addHeapObject(controller));
        return takeObject(ret);
    }
}
if (Symbol.dispose) IntoUnderlyingSource.prototype[Symbol.dispose] = IntoUnderlyingSource.prototype.free;

/**
 * An embedded SurrealDB instance, addressed over the RPC protocol.
 *
 * wasm-bindgen generates a `free()` for this, which is what the JavaScript
 * side calls to dispose of the connection; dropping the engine closes the
 * datastore's notification channel, which ends any stream handed out by
 * [`Self::notifications`].
 *
 * Dropping an engine that [`Self::close`] has not closed also closes its
 * datastore, on a task of its own, since a drop cannot wait: the storage lock
 * is released once that task finishes rather than by the time `free()`
 * returns. A caller that needs the lock released at a known point awaits
 * `close()` first.
 */
export class SurrealWasmEngine {
    static __wrap(ptr) {
        const obj = Object.create(SurrealWasmEngine.prototype);
        obj.__wbg_ptr = ptr;
        SurrealWasmEngineFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SurrealWasmEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_surrealwasmengine_free(ptr, 0);
    }
    /**
     * Closes the datastore: the storage engine is closed and then the files
     * it holds are released, which frees the database's lock in the origin
     * private file system so that another tab or worker can open it.
     *
     * A worker cannot await an asynchronous close from a page-unload
     * handler, so the application calls this when it knows that it is ending,
     * for example on a message from the page, and as early as it can: the
     * more files the database has, the longer it takes. A database that is
     * not closed is recovered the next time it is opened. Nothing may use
     * the engine after this resolves, other than `free()`.
     * @returns {Promise<void>}
     */
    close() {
        const ret = wasm.surrealwasmengine_close(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {string} endpoint
     * @param {ConnectionOptions | null} [opts]
     * @returns {Promise<SurrealWasmEngine>}
     */
    static connect(endpoint, opts) {
        const ptr0 = passStringToWasm0(endpoint, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.surrealwasmengine_connect(ptr0, len0, isLikeNone(opts) ? 0 : addHeapObject(opts));
        return takeObject(ret);
    }
    /**
     * Every method takes `&self`. With `&mut self` the wasm-bindgen trampoline
     * demands exclusive access and panics with "Unreachable code" whenever the
     * engine is still considered borrowed — by the notification stream, or by
     * an earlier call that has not resolved — before the body even runs.
     * @param {Uint8Array} data
     * @returns {Promise<Uint8Array>}
     */
    execute(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.surrealwasmengine_execute(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @param {Uint8Array | null} [config]
     * @returns {Promise<string>}
     */
    export(config) {
        var ptr0 = isLikeNone(config) ? 0 : passArray8ToWasm0(config, wasm.__wbindgen_export);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.surrealwasmengine_export(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @param {string} input
     * @returns {Promise<void>}
     */
    import(input) {
        const ptr0 = passStringToWasm0(input, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.surrealwasmengine_import(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * The live-query notifications for this connection, encoded.
     *
     * A `ReadableStream` rather than a channel of this module's own, so the
     * notifications sit in exactly one buffer — the datastore's bounded
     * channel — and a reader that stops pulling stops draining it rather than
     * accumulating behind it.
     * @returns {ReadableStream}
     */
    notifications() {
        const ret = wasm.surrealwasmengine_notifications(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * Whether the browser keeps this origin's storage until the user clears
     * it, which is what stops it from evicting a `surrealkv://` database when
     * the disk fills.
     *
     * It is `false` until the page has asked with `navigator.storage.persist()`,
     * which a worker cannot call. Always `false` for a build without
     * `surrealkv://` storage, which keeps nothing.
     * @returns {Promise<boolean>}
     */
    static persisted() {
        const ret = wasm.surrealwasmengine_persisted();
        return takeObject(ret);
    }
    /**
     * Runs a query, answering with frames as the executor produces them rather
     * than with every statement's result at once.
     *
     * The request is the same envelope [`Self::execute`] takes. A failure
     * before execution begins — a denied capability, a parse error, an unknown
     * transaction — rejects here and produces no frames at all; everything
     * after that is carried on the frames themselves.
     *
     * A `ReadableStream` so the reader sets the pace: the query is driven by a
     * task of the engine's own, and the frames it produces are buffered one at a
     * time, so a reader that stops reading stops the scan. Cancelling the stream
     * is how a consumer walks away.
     * @param {Uint8Array} data
     * @returns {Promise<ReadableStream>}
     */
    query_stream(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.surrealwasmengine_query_stream(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @returns {string}
     */
    static version() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.surrealwasmengine_version(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export5(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) SurrealWasmEngine.prototype[Symbol.dispose] = SurrealWasmEngine.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_Number_14af1003b8dd5ead: function(arg0) {
            const ret = Number(getObject(arg0));
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(getObject(arg1));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_a2383202b9353e4c: function(arg0, arg1) {
            const v = getObject(arg1);
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_5b446f51afd21013: function(arg0) {
            const v = getObject(arg0);
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_4687d8d8c2017d52: function(arg0, arg1) {
            const ret = debugString(getObject(arg1));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_92f62ee1427d9e49: function(arg0, arg1) {
            const ret = getObject(arg0) in getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_is_bigint_b123553bed3bb382: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_e343b7d08827ba72: function(arg0) {
            const ret = getObject(arg0) === null;
            return ret;
        },
        __wbg___wbindgen_is_object_3c45d4f2dde4e749: function(arg0) {
            const val = getObject(arg0);
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_90b56bc79aad6f6c: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(arg0) {
            const ret = getObject(arg0) === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_02babf21faa37971: function(arg0, arg1) {
            const ret = getObject(arg0) === getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_677f21e468d6b461: function(arg0, arg1) {
            const ret = getObject(arg0) == getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_number_get_2e0e7dee9f701a71: function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_dcc1a90847f04c41: function(arg0) {
            getObject(arg0)._wbg_cb_unref();
        },
        __wbg_abort_334e7f918b7c5047: function(arg0, arg1) {
            getObject(arg0).abort(getObject(arg1));
        },
        __wbg_abort_5b288d575f2b02d1: function() { return handleError(function (arg0) {
            getObject(arg0).abort();
        }, arguments); },
        __wbg_abort_f78b99d80248bacb: function(arg0) {
            getObject(arg0).abort();
        },
        __wbg_addEventListener_4d0db17c671ea324: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            getObject(arg0).addEventListener(getStringFromWasm0(arg1, arg2), getObject(arg3));
        }, arguments); },
        __wbg_append_1938ed58fb5613b8: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).append(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_append_627a9b311ac9993b: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            getObject(arg0).append(getStringFromWasm0(arg1, arg2), getObject(arg3));
        }, arguments); },
        __wbg_append_9b7024062a618f5d: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).append(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_append_cfa1814e91387699: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            getObject(arg0).append(getStringFromWasm0(arg1, arg2), getObject(arg3), getStringFromWasm0(arg4, arg5));
        }, arguments); },
        __wbg_arrayBuffer_f07be74819944ea2: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).arrayBuffer();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_autoIncrement_c3daac19ebe221a2: function(arg0) {
            const ret = getObject(arg0).autoIncrement;
            return ret;
        },
        __wbg_buffer_56ec2905a66f58b9: function(arg0) {
            const ret = getObject(arg0).buffer;
            return addHeapObject(ret);
        },
        __wbg_byobRequest_54f7ce41d584549a: function(arg0) {
            const ret = getObject(arg0).byobRequest;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_byteLength_9f985b8373f1f3fe: function(arg0) {
            const ret = getObject(arg0).byteLength;
            return ret;
        },
        __wbg_byteOffset_0bd5a6a03553639c: function(arg0) {
            const ret = getObject(arg0).byteOffset;
            return ret;
        },
        __wbg_call_1875a20c43a36133: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_call_187d372bd5fdd4aa: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_call_6137034ef55c9d0f: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).call(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_clearTimeout_1daad5c6ee4fcd3b: function(arg0) {
            const ret = clearTimeout(takeObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_clearTimeout_b2566a6b80d766f9: function(arg0) {
            clearTimeout(getObject(arg0));
        },
        __wbg_close_185286988f30f252: function() { return handleError(function (arg0) {
            getObject(arg0).close();
        }, arguments); },
        __wbg_close_4db7a0c12586beb7: function(arg0) {
            getObject(arg0).close();
        },
        __wbg_close_748f26698dabe269: function() { return handleError(function (arg0) {
            getObject(arg0).close();
        }, arguments); },
        __wbg_close_934c4c1f8dc25c8a: function(arg0) {
            getObject(arg0).close();
        },
        __wbg_construct_2cc135b78387ed16: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.construct(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_continue_f83efa8d7e649e16: function() { return handleError(function (arg0) {
            getObject(arg0).continue();
        }, arguments); },
        __wbg_createSyncAccessHandle_ac771882e87a924d: function(arg0) {
            const ret = getObject(arg0).createSyncAccessHandle();
            return addHeapObject(ret);
        },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = getObject(arg0).crypto;
            return addHeapObject(ret);
        },
        __wbg_done_b41a1d26cdb37fb6: function(arg0) {
            const ret = getObject(arg0).done;
            return ret;
        },
        __wbg_enqueue_4a01c128f9a0de16: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).enqueue(getObject(arg1));
        }, arguments); },
        __wbg_entries_b55ec7e0dc443355: function(arg0) {
            const ret = getObject(arg0).entries();
            return addHeapObject(ret);
        },
        __wbg_entries_fb6397112b1de25f: function(arg0) {
            const ret = Object.entries(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_error_6a23b57453026a47: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).error;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        }, arguments); },
        __wbg_fetch_7a37768ab67c5bd8: function(arg0) {
            const ret = fetch(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_fetch_efc64baf325b084d: function(arg0, arg1) {
            const ret = getObject(arg0).fetch(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_flush_cc7a0c869c969595: function() { return handleError(function (arg0) {
            getObject(arg0).flush();
        }, arguments); },
        __wbg_getDirectoryHandle_32ff6719da8ccf70: function(arg0, arg1, arg2, arg3) {
            const ret = getObject(arg0).getDirectoryHandle(getStringFromWasm0(arg1, arg2), getObject(arg3));
            return addHeapObject(ret);
        },
        __wbg_getDirectory_8257f053b0d3e746: function(arg0) {
            const ret = getObject(arg0).getDirectory();
            return addHeapObject(ret);
        },
        __wbg_getFileHandle_0357a6e30a3f80ba: function(arg0, arg1, arg2, arg3) {
            const ret = getObject(arg0).getFileHandle(getStringFromWasm0(arg1, arg2), getObject(arg3));
            return addHeapObject(ret);
        },
        __wbg_getRandomValues_436a51d0629d84e1: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_973dabfb0ad1769f: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_a608c4436c19407a: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).getRandomValues(getObject(arg1));
        }, arguments); },
        __wbg_getSize_b3c9adeccff7e656: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).getSize();
            return ret;
        }, arguments); },
        __wbg_getTime_f5a55efff2585d5d: function(arg0) {
            const ret = getObject(arg0).getTime();
            return ret;
        },
        __wbg_getTimezoneOffset_2e851fdaecc2dc92: function(arg0) {
            const ret = getObject(arg0).getTimezoneOffset();
            return ret;
        },
        __wbg_get_31af05bd4842a84f: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_get_658f6698067d9515: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_get_6c896e0571ddae51: function(arg0, arg1) {
            const ret = getObject(arg0)[arg1 >>> 0];
            return addHeapObject(ret);
        },
        __wbg_get_unchecked_288889d017702237: function(arg0, arg1) {
            const ret = getObject(arg0)[arg1 >>> 0];
            return addHeapObject(ret);
        },
        __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
            const ret = getObject(arg0)[getObject(arg1)];
            return addHeapObject(ret);
        },
        __wbg_has_5d6706e5209576c1: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.has(getObject(arg0), getObject(arg1));
            return ret;
        }, arguments); },
        __wbg_headers_eba93595f8944c2f: function(arg0) {
            const ret = getObject(arg0).headers;
            return addHeapObject(ret);
        },
        __wbg_instanceof_ArrayBuffer_a99f175873e5d9b8: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_DomException_550db3f9465a933f: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof DOMException;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Error_80a725f81f2e102d: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Error;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_FileSystemSyncAccessHandle_b51afaa1de170464: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof FileSystemSyncAccessHandle;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_IdbCursorWithValue_824cba19af90f049: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof IDBCursorWithValue;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_IdbDatabase_ee9e122a32a24d91: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof IDBDatabase;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_IdbFactory_a24e38c7f2d423ba: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof IDBFactory;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_IdbRequest_d33cf2b2aa926afc: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof IDBRequest;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_IdbVersionChangeEvent_23efc5c65fd6295d: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof IDBVersionChangeEvent;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Map_b2611749102d7ba3: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Performance_cbec0dbedaa91be1: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Performance;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Promise_e1dc6893aa1ece28: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Promise;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Response_b8758567269c30b2: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Response;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_828cef2aaacafc31: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Window_82d71df4eddf88bc: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_WorkerGlobalScope_8966e756dd00e8b7: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof WorkerGlobalScope;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_e15a2ff68ffdbef2: function(arg0) {
            const ret = Array.isArray(getObject(arg0));
            return ret;
        },
        __wbg_isSafeInteger_717808ad6a54bd9e: function(arg0) {
            const ret = Number.isSafeInteger(getObject(arg0));
            return ret;
        },
        __wbg_item_1fc482e3550e320f: function(arg0, arg1, arg2) {
            const ret = getObject(arg1).item(arg2 >>> 0);
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_iterator_e3c31c892080e444: function() {
            const ret = Symbol.iterator;
            return addHeapObject(ret);
        },
        __wbg_keyPath_5b8d7632e0a53739: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).keyPath;
            return addHeapObject(ret);
        }, arguments); },
        __wbg_key_46ce184affdc8d18: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).key;
            return addHeapObject(ret);
        }, arguments); },
        __wbg_keys_b33fd056a9da29ee: function(arg0) {
            const ret = getObject(arg0).keys();
            return addHeapObject(ret);
        },
        __wbg_length_7f3c00c40364105e: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_length_842676da0b099c2f: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_length_d4bdea10311bd9cf: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_lowerBound_dda05d4f8e328485: function() { return handleError(function (arg0, arg1) {
            const ret = IDBKeyRange.lowerBound(getObject(arg0), arg1 !== 0);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_message_5f8387f0c32b90a7: function(arg0) {
            const ret = getObject(arg0).message;
            return addHeapObject(ret);
        },
        __wbg_message_d988ea596c5f5c9a: function(arg0, arg1) {
            const ret = getObject(arg1).message;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = getObject(arg0).msCrypto;
            return addHeapObject(ret);
        },
        __wbg_name_30c2cf5d3e6226e8: function(arg0, arg1) {
            const ret = getObject(arg1).name;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_name_e2eac7cdfa054f65: function(arg0) {
            const ret = getObject(arg0).name;
            return addHeapObject(ret);
        },
        __wbg_navigator_2156486643462a87: function(arg0) {
            const ret = getObject(arg0).navigator;
            return addHeapObject(ret);
        },
        __wbg_navigator_c9bce48d4b578c9c: function(arg0) {
            const ret = getObject(arg0).navigator;
            return addHeapObject(ret);
        },
        __wbg_new_0_72d020f0c63443d4: function() {
            const ret = new Date();
            return addHeapObject(ret);
        },
        __wbg_new_1dbf7428bba60a42: function(arg0) {
            const ret = new Uint8Array(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_new_2e41357094e99294: function() { return handleError(function () {
            const ret = new AbortController();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_new_343a093a3c2ffb4e: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_new_34e56228080aa9f8: function(arg0) {
            const ret = new Date(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_new_5502aad30c185fc8: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return __wasm_bindgen_func_elem_6031(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return addHeapObject(ret);
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_617a8cdb8bb1130e: function() {
            const ret = new Object();
            return addHeapObject(ret);
        },
        __wbg_new_83ca405eae412a62: function() { return handleError(function () {
            const ret = new Headers();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_new_d429ac7f5b1a2c5c: function() { return handleError(function () {
            const ret = new FormData();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_new_ee2291f50781bf1d: function() {
            const ret = new Array();
            return addHeapObject(ret);
        },
        __wbg_new_from_slice_9a868026ffa4208a: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_new_typed_b01cb72a8af741a3: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return __wasm_bindgen_func_elem_6031(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return addHeapObject(ret);
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_byte_offset_and_length_2f5d7fc2a828b74d: function(arg0, arg1, arg2) {
            const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_new_with_into_underlying_source_fd904252f385f59c: function(arg0, arg1) {
            const ret = new ReadableStream(IntoUnderlyingSource.__wrap(arg0), takeObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_new_with_length_3da0ad195f6f63ba: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_new_with_str_and_init_4618dee4e950224f: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new Request(getStringFromWasm0(arg0, arg1), getObject(arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_new_with_u8_array_sequence_and_options_fccc08fe93f4b8fd: function() { return handleError(function (arg0, arg1) {
            const ret = new Blob(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_next_33784799010f1bbe: function(arg0) {
            const ret = getObject(arg0).next;
            return addHeapObject(ret);
        },
        __wbg_next_762aca09b0915bfc: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).next();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_next_f4aac29c42af995c: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).next();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = getObject(arg0).node;
            return addHeapObject(ret);
        },
        __wbg_now_55c5352b4b61d145: function(arg0) {
            const ret = getObject(arg0).now();
            return ret;
        },
        __wbg_now_aa4ccb83129e9e55: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_now_d0b7f4bea9f38490: function(arg0) {
            const ret = getObject(arg0).now();
            return ret;
        },
        __wbg_now_e1044392fce0f3e7: function() { return handleError(function () {
            const ret = Date.now();
            return ret;
        }, arguments); },
        __wbg_now_e7c6795a7f81e10f: function(arg0) {
            const ret = getObject(arg0).now();
            return ret;
        },
        __wbg_now_ec06e45f7e6cbd27: function() {
            const ret = performance.now();
            return ret;
        },
        __wbg_objectStoreNames_19a06aba400d0baf: function(arg0) {
            const ret = getObject(arg0).objectStoreNames;
            return addHeapObject(ret);
        },
        __wbg_objectStore_43178e7a3459e234: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).objectStore(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_oldVersion_bee6d60861717ba6: function(arg0) {
            const ret = getObject(arg0).oldVersion;
            return ret;
        },
        __wbg_openCursor_50c5809d0805ebb3: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).openCursor(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_openCursor_6efcf867fdf4e754: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).openCursor();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_open_86a803dec082fde7: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).open(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_performance_3fcf6e32a7e1ed0a: function(arg0) {
            const ret = getObject(arg0).performance;
            return addHeapObject(ret);
        },
        __wbg_performance_aa4d78060a5b8a2f: function(arg0) {
            const ret = getObject(arg0).performance;
            return addHeapObject(ret);
        },
        __wbg_preventDefault_af59afb0f0a02e20: function(arg0) {
            getObject(arg0).preventDefault();
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = getObject(arg0).process;
            return addHeapObject(ret);
        },
        __wbg_prototypesetcall_bc27214492979395: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), getObject(arg2));
        },
        __wbg_push_2baf45db356cf468: function(arg0, arg1) {
            const ret = getObject(arg0).push(getObject(arg1));
            return ret;
        },
        __wbg_queueMicrotask_9833f9a49df95a49: function(arg0) {
            const ret = getObject(arg0).queueMicrotask;
            return addHeapObject(ret);
        },
        __wbg_queueMicrotask_a72f977e97f23c5f: function(arg0) {
            queueMicrotask(getObject(arg0));
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).randomFillSync(takeObject(arg1));
        }, arguments); },
        __wbg_read_fcd52999af006e79: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = getObject(arg0).read(getArrayU8FromWasm0(arg1, arg2), getObject(arg3));
            return ret;
        }, arguments); },
        __wbg_readyState_4566441ff2bd25dc: function(arg0) {
            const ret = getObject(arg0).readyState;
            return (__wbindgen_enum_IdbRequestReadyState.indexOf(ret) + 1 || 3) - 1;
        },
        __wbg_removeEventListener_6e68185345978771: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            getObject(arg0).removeEventListener(getStringFromWasm0(arg1, arg2), getObject(arg3));
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return addHeapObject(ret);
        }, arguments); },
        __wbg_resolve_0076e10020304ede: function(arg0) {
            const ret = Promise.resolve(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_respond_c102fabcc79e5ef0: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).respond(arg1 >>> 0);
        }, arguments); },
        __wbg_result_ea60156c5cd4726f: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).result;
            return addHeapObject(ret);
        }, arguments); },
        __wbg_setTimeout_05a790c35d76ff25: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).setTimeout(getObject(arg1), arg2);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_setTimeout_70f4cdc743611665: function(arg0, arg1) {
            const ret = setTimeout(getObject(arg0), arg1);
            return addHeapObject(ret);
        },
        __wbg_setTimeout_b4a9096784635514: function(arg0, arg1) {
            const ret = setTimeout(getObject(arg0), arg1);
            return addHeapObject(ret);
        },
        __wbg_set_145a351398b48c65: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
            return ret;
        }, arguments); },
        __wbg_set_575d3ddb70fe831d: function(arg0, arg1, arg2) {
            getObject(arg0).set(getArrayU8FromWasm0(arg1, arg2));
        },
        __wbg_set_at_a00f11a442de8f74: function(arg0, arg1) {
            getObject(arg0).at = arg1;
        },
        __wbg_set_body_1fb0f1008bfc7df6: function(arg0, arg1) {
            getObject(arg0).body = getObject(arg1);
        },
        __wbg_set_cache_7507c4cc5938ccc7: function(arg0, arg1) {
            getObject(arg0).cache = __wbindgen_enum_RequestCache[arg1];
        },
        __wbg_set_create_4f5fb19abc6eb52a: function(arg0, arg1) {
            getObject(arg0).create = arg1 !== 0;
        },
        __wbg_set_create_55977c3183b4be6e: function(arg0, arg1) {
            getObject(arg0).create = arg1 !== 0;
        },
        __wbg_set_credentials_e0dcce31ca532b7d: function(arg0, arg1) {
            getObject(arg0).credentials = __wbindgen_enum_RequestCredentials[arg1];
        },
        __wbg_set_headers_40ad33dcf016613f: function(arg0, arg1) {
            getObject(arg0).headers = getObject(arg1);
        },
        __wbg_set_high_water_mark_3a96edf83df7e06c: function(arg0, arg1) {
            getObject(arg0).highWaterMark = arg1;
        },
        __wbg_set_method_dcb32343247ec427: function(arg0, arg1, arg2) {
            getObject(arg0).method = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_mode_74e772635acb96ec: function(arg0, arg1) {
            getObject(arg0).mode = __wbindgen_enum_RequestMode[arg1];
        },
        __wbg_set_onerror_24dddc0e8dc54601: function(arg0, arg1) {
            getObject(arg0).onerror = getObject(arg1);
        },
        __wbg_set_onsuccess_e970bffc8d0e7520: function(arg0, arg1) {
            getObject(arg0).onsuccess = getObject(arg1);
        },
        __wbg_set_onupgradeneeded_f9d42df70899331b: function(arg0, arg1) {
            getObject(arg0).onupgradeneeded = getObject(arg1);
        },
        __wbg_set_onversionchange_47d651afefa5ce27: function(arg0, arg1) {
            getObject(arg0).onversionchange = getObject(arg1);
        },
        __wbg_set_referrer_efd0fb956d6b70b2: function(arg0, arg1, arg2) {
            getObject(arg0).referrer = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_referrer_policy_465382f52c1a03d3: function(arg0, arg1) {
            getObject(arg0).referrerPolicy = __wbindgen_enum_ReferrerPolicy[arg1];
        },
        __wbg_set_signal_2dbd377604627f26: function(arg0, arg1) {
            getObject(arg0).signal = getObject(arg1);
        },
        __wbg_set_type_dcf75b2afa60c694: function(arg0, arg1, arg2) {
            getObject(arg0).type = getStringFromWasm0(arg1, arg2);
        },
        __wbg_signal_e5a49a2d9c65b7f6: function(arg0) {
            const ret = getObject(arg0).signal;
            return addHeapObject(ret);
        },
        __wbg_static_accessor_GLOBAL_266715b9d96ba635: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_SELF_0b583911f537483a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_WINDOW_d7f903d1508cbdc4: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_status_ce0a98d3c57125f3: function(arg0) {
            const ret = getObject(arg0).status;
            return ret;
        },
        __wbg_storage_46a39f4b6d8508a3: function(arg0) {
            const ret = getObject(arg0).storage;
            return addHeapObject(ret);
        },
        __wbg_storage_f32f42a5cc35294c: function(arg0) {
            const ret = getObject(arg0).storage;
            return addHeapObject(ret);
        },
        __wbg_subarray_002b94d5e13d1411: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).subarray(arg1 >>> 0, arg2 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_surrealwasmengine_new: function(arg0) {
            const ret = SurrealWasmEngine.__wrap(arg0);
            return addHeapObject(ret);
        },
        __wbg_target_38ae9feb025b820c: function(arg0) {
            const ret = getObject(arg0).target;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_then_c949d5a25a4e78f8: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        },
        __wbg_then_e71170d78fcf8954: function(arg0, arg1) {
            const ret = getObject(arg0).then(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_transaction_3a02c7e8ef4fa771: function(arg0) {
            const ret = getObject(arg0).transaction;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_transaction_55a3a4e0134a0fd6: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = getObject(arg0).transaction(getStringFromWasm0(arg1, arg2), __wbindgen_enum_IdbTransactionMode[arg3]);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_truncate_a598d549f268301b: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).truncate(arg1);
        }, arguments); },
        __wbg_url_8e28edeab4cd6bed: function(arg0, arg1) {
            const ret = getObject(arg1).url;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_value_e6653e661698cb71: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).value;
            return addHeapObject(ret);
        }, arguments); },
        __wbg_value_f3c585ee8f5ba40c: function(arg0) {
            const ret = getObject(arg0).value;
            return addHeapObject(ret);
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = getObject(arg0).versions;
            return addHeapObject(ret);
        },
        __wbg_view_9c570f33e8d6ab96: function(arg0) {
            const ret = getObject(arg0).view;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_write_9e2910049de41b0a: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = getObject(arg0).write(getArrayU8FromWasm0(arg1, arg2), getObject(arg3));
            return ret;
        }, arguments); },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 2937, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_49387);
            return addHeapObject(ret);
        },
        __wbindgen_generic_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 347, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_5967);
            return addHeapObject(ret);
        },
        __wbindgen_generic_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("Event")], shim_idx: 2937, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_49387_22);
            return addHeapObject(ret);
        },
        __wbindgen_generic_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 582, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_9673);
            return addHeapObject(ret);
        },
        __wbindgen_generic_0000000000000005: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return addHeapObject(ret);
        },
        __wbindgen_generic_0000000000000006: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return addHeapObject(ret);
        },
        __wbindgen_generic_0000000000000007: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_generic_0000000000000008: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_generic_0000000000000009: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return addHeapObject(ret);
        },
        __wbindgen_generic_000000000000000a: function(arg0, arg1) {
            var v0 = getArrayU8FromWasm0(arg0, arg1).slice();
            wasm.__wbindgen_export5(arg0, arg1 * 1, 1);
            // Cast intrinsic for `Vector(U8) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_object_clone_ref: function(arg0) {
            const ret = getObject(arg0);
            return addHeapObject(ret);
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./index_bg.js": import0,
    };
}

function __wasm_bindgen_func_elem_9673(arg0, arg1) {
    wasm.__wasm_bindgen_func_elem_9673(arg0, arg1);
}

function __wasm_bindgen_func_elem_49387(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_49387(arg0, arg1, addHeapObject(arg2));
}

function __wasm_bindgen_func_elem_49387_22(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_49387_22(arg0, arg1, addHeapObject(arg2));
}

function __wasm_bindgen_func_elem_6031(arg0, arg1, arg2, arg3) {
    wasm.__wasm_bindgen_func_elem_6031(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}

function __wasm_bindgen_func_elem_5967(arg0, arg1, arg2) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.__wasm_bindgen_func_elem_5967(retptr, arg0, arg1, addHeapObject(arg2));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}


const __wbindgen_enum_IdbRequestReadyState = ["pending", "done"];


const __wbindgen_enum_IdbTransactionMode = ["readonly", "readwrite", "versionchange", "readwriteflush", "cleanup"];


const __wbindgen_enum_ReadableStreamType = ["bytes"];


const __wbindgen_enum_ReferrerPolicy = ["", "no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin", "unsafe-url", "same-origin", "strict-origin", "strict-origin-when-cross-origin"];


const __wbindgen_enum_RequestCache = ["default", "no-store", "reload", "no-cache", "force-cache", "only-if-cached"];


const __wbindgen_enum_RequestCredentials = ["omit", "same-origin", "include"];


const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];
const IntoUnderlyingByteSourceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingbytesource_free(ptr, 1));
const IntoUnderlyingSinkFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingsink_free(ptr, 1));
const IntoUnderlyingSourceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingsource_free(ptr, 1));
const SurrealWasmEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_surrealwasmengine_free(ptr, 1));

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_export4(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_export3(addHeapObject(e));
    }
}

let heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_export4(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('index_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
