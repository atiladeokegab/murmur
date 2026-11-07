//#region ../sqon/dist/sqon.mjs
/**
* The base error class for all SQON errors.
*/
var SqonError = class extends Error {};
/**
* Thrown when a parsed date or datetime is invalid
*/
var InvalidDateError = class extends SqonError {
	name = "InvalidDateError";
	constructor(dateOrMessage) {
		if (typeof dateOrMessage === "string") super(dateOrMessage);
		else super(`The provided date is invalid: ${dateOrMessage}`);
	}
};
/**
* Thrown when a RecordId or RecordIdRange is constructed with invalid parts
*/
var InvalidRecordIdError = class extends SqonError {
	name = "InvalidRecordIdError";
};
/**
* Thrown when a Duration string cannot be parsed or a duration operation is invalid
*/
var InvalidDurationError = class extends SqonError {
	name = "InvalidDurationError";
};
/**
* Thrown when a Decimal operation fails (division by zero, invalid input, etc.)
*/
var InvalidDecimalError = class extends SqonError {
	name = "InvalidDecimalError";
};
/**
* Thrown when a number does not fit the kind it is made or sent as: a sized number out of its
* range, an integer past the signed 64-bit range of a SurrealDB `int`, or CBOR which gives a
* number the wrong kind of content
*/
var InvalidNumberError = class extends SqonError {
	name = "InvalidNumberError";
};
/**
* Thrown when a Table or StringRecordId is constructed with an invalid value
*/
var InvalidTableError = class extends SqonError {
	name = "InvalidTableError";
};
/**
* Thrown when a SQON text value cannot be parsed
*/
var TextParseError = class extends SqonError {
	name = "TextParseError";
	/** The zero-based character offset at which parsing failed */
	offset;
	constructor(message, offset) {
		super(`${message} (at offset ${offset})`);
		this.offset = offset;
	}
};
/**
* Thrown when shaped frame bytes cannot be read: a block whose version this decoder does not
* know, a shape which breaks the wire rules or passes a limit, or a row which does not fit the
* shape it names. The decoder refuses such bytes rather than reading past them.
*/
var ShapedFrameError = class extends SqonError {
	name = "ShapedFrameError";
	constructor(message) {
		super(`Invalid shaped frame: ${message}`);
	}
};
/**
* Thrown when a regex value is constructed from something other than a pattern
*/
var InvalidRegexError = class extends SqonError {
	name = "InvalidRegexError";
};
/**
* Thrown when a codec is asked to write a value its format cannot carry, or reads a tag its
* format does not have
*/
var UnsupportedValueError = class extends SqonError {
	name = "UnsupportedValueError";
};
/**
* Symbol-based type checking utilities for handling multiple library instances.
* This allows instanceof-like checks to work across different instances/versions of the library.
*/
const VALUE_SYMBOL$1 = Symbol.for("surrealdb.Value");
const RECORD_ID_SYMBOL$1 = Symbol.for("surrealdb.RecordId");
const STRING_RECORD_ID_SYMBOL$1 = Symbol.for("surrealdb.StringRecordId");
const RECORD_ID_RANGE_SYMBOL$1 = Symbol.for("surrealdb.RecordIdRange");
const UUID_SYMBOL$1 = Symbol.for("surrealdb.Uuid");
const DATETIME_SYMBOL$1 = Symbol.for("surrealdb.DateTime");
const DURATION_SYMBOL$1 = Symbol.for("surrealdb.Duration");
const DECIMAL_SYMBOL$1 = Symbol.for("surrealdb.Decimal");
const TABLE_SYMBOL$1 = Symbol.for("surrealdb.Table");
const RANGE_SYMBOL$1 = Symbol.for("surrealdb.Range");
const FUTURE_SYMBOL$1 = Symbol.for("surrealdb.Future");
const FILE_REF_SYMBOL$1 = Symbol.for("surrealdb.FileRef");
const GEOMETRY_SYMBOL$1 = Symbol.for("surrealdb.Geometry");
const GEOMETRY_POINT_SYMBOL$1 = Symbol.for("surrealdb.GeometryPoint");
const BOUND_INCLUDED_SYMBOL$1 = Symbol.for("surrealdb.BoundIncluded");
const BOUND_EXCLUDED_SYMBOL$1 = Symbol.for("surrealdb.BoundExcluded");
const GEOMETRY_LINE_SYMBOL$1 = Symbol.for("surrealdb.GeometryLine");
const GEOMETRY_POLYGON_SYMBOL$1 = Symbol.for("surrealdb.GeometryPolygon");
const GEOMETRY_MULTI_POINT_SYMBOL$1 = Symbol.for("surrealdb.GeometryMultiPoint");
const GEOMETRY_MULTI_LINE_SYMBOL$1 = Symbol.for("surrealdb.GeometryMultiLine");
const GEOMETRY_MULTI_POLYGON_SYMBOL$1 = Symbol.for("surrealdb.GeometryMultiPolygon");
const GEOMETRY_COLLECTION_SYMBOL$1 = Symbol.for("surrealdb.GeometryCollection");
const SIZED_NUMBER_SYMBOL = Symbol.for("surrealdb.SizedNumber");
const PLAIN_DATE_SYMBOL = Symbol.for("surrealdb.PlainDate");
const PLAIN_TIME_SYMBOL = Symbol.for("surrealdb.PlainTime");
const TIMESTAMP_SYMBOL = Symbol.for("surrealdb.Timestamp");
const INTERVAL_SYMBOL = Symbol.for("surrealdb.Interval");
const BIG_DECIMAL_SYMBOL = Symbol.for("surrealdb.BigDecimal");
const REGEX_SYMBOL = Symbol.for("surrealdb.Regex");
/**
* Helper function to mark an object with a symbol
*/
function markSymbol$1(obj, symbol) {
	if (obj && typeof obj === "object") obj[symbol] = true;
}
/**
* Helper function to check if an object has a symbol
*/
function hasSymbol$1(obj, symbol) {
	return !!(obj && typeof obj === "object" && obj[symbol]);
}
/**
* A complex SurrealQL value type
*/
var Value = class Value$1 {
	static _useExperimentalToJson = false;
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, VALUE_SYMBOL$1);
	}
	constructor() {
		markSymbol$1(this, VALUE_SYMBOL$1);
	}
	/**
	* Enable the new experimental toJSON implementation.
	*
	* When enabled, the `toJSON` method will return values encoded by the `JsonCodec` resulting in a type-safe JSON representation.
	*/
	static useExperimentalToJson(enabled) {
		Value$1._useExperimentalToJson = enabled ?? true;
	}
};
/**
* Recursively compare supported SurrealQL values for equality.
*
* @param x The first value to compare
* @param y The second value to compare
* @returns Whether the two values are recursively equal
*/
function equals(x, y) {
	if (typeof x === "bigint" && typeof y === "number") return x <= Number.MAX_SAFE_INTEGER ? Number(x) === y : x === BigInt(y);
	if (typeof x === "number" && typeof y === "bigint") return y <= Number.MAX_SAFE_INTEGER ? x === Number(y) : BigInt(x) === y;
	if (Object.is(x, y)) return true;
	if (x instanceof Date && y instanceof Date) return x.getTime() === y.getTime();
	if (x instanceof RegExp && y instanceof RegExp) return x.toString() === y.toString();
	if (x instanceof Value && y instanceof Value) return x.equals(y);
	if (typeof x !== "object" || x === null || typeof y !== "object" || y === null) return false;
	const keysX = Reflect.ownKeys(x);
	const keysY = Reflect.ownKeys(y);
	if (keysX.length !== keysY.length) return false;
	for (let i = 0; i < keysX.length; i++) {
		if (!Reflect.has(y, keysX[i])) return false;
		if (!equals(x[keysX[i]], y[keysX[i]])) return false;
	}
	return true;
}
/**
* Represents a range bound which includes the value within the range
*/
var BoundIncluded = class {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, BOUND_INCLUDED_SYMBOL$1);
	}
	constructor(value) {
		this.value = value;
		markSymbol$1(this, BOUND_INCLUDED_SYMBOL$1);
	}
};
/**
* Represents a range bound which excludes the value from the range
*/
var BoundExcluded = class {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, BOUND_EXCLUDED_SYMBOL$1);
	}
	constructor(value) {
		this.value = value;
		markSymbol$1(this, BOUND_EXCLUDED_SYMBOL$1);
	}
};
function toBase64Url(bytes) {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(str) {
	const padded = str.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
const SIZED_KINDS = [
	"i8",
	"u8",
	"i16",
	"u16",
	"i32",
	"u32",
	"u64",
	"f16",
	"f32"
];
const createNone = () => ({ $none: true });
const createDatetime = (value) => ({ $datetime: value });
const createDecimal = (value) => ({ $decimal: value });
const createDuration = (value) => ({ $duration: value });
const createUuid = (value) => ({ $uuid: value });
const createRecordId = (tb, id$1) => ({ $recordId: {
	tb,
	id: id$1
} });
const createStringRecordId = (value) => ({ $recordIdString: value });
const createTable = (name) => ({ $table: name });
const createRange = (begin, end) => ({ $range: {
	begin,
	end
} });
const createBoundIncluded = (value) => ({ $boundIncluded: value });
const createBoundExcluded = (value) => ({ $boundExcluded: value });
const createFile = (bucket, key) => ({ $file: {
	bucket,
	key
} });
const createFuture = (body) => ({ $future: body });
const createBytes = (value) => ({ $bytes: value });
const createGeometry = (value) => ({ $geometry: value });
const createSet = (items) => ({ $set: items });
const createObject = (value) => ({ $object: value });
const createDate = (value) => ({ $date: value });
const createTime = (value) => ({ $time: value });
const createTimestamp = (value) => ({ $timestamp: value });
const createInterval = (months, days, micros) => ({ $interval: {
	months,
	days,
	micros
} });
const createBigDecimal = (value) => ({ $bigdecimal: value });
const createRegex = (pattern) => ({ $regex: pattern });
const createSized = (kind, value) => ({ [`$${kind}`]: value });
const isNone = (value) => {
	return "$none" in value && value.$none === true;
};
const isDatetime = (value) => {
	return "$datetime" in value && typeof value.$datetime === "string";
};
const isDecimal = (value) => {
	return "$decimal" in value && typeof value.$decimal === "string";
};
const isDuration = (value) => {
	return "$duration" in value && typeof value.$duration === "string";
};
const isUuid = (value) => {
	return "$uuid" in value && typeof value.$uuid === "string";
};
const isStringRecordId = (value) => {
	return "$recordIdString" in value && typeof value.$recordIdString === "string";
};
const isRecordId = (value) => {
	return "$recordId" in value && !!value.$recordId && typeof value.$recordId === "object" && "tb" in value.$recordId && typeof value.$recordId.tb === "string" && "id" in value.$recordId;
};
const isTable = (value) => {
	return "$table" in value && typeof value.$table === "string";
};
const isGeometry = (value) => {
	return "$geometry" in value && typeof value.$geometry === "object" && value.$geometry !== null;
};
const isSet = (value) => {
	return "$set" in value && Array.isArray(value.$set);
};
const isFile = (value) => {
	return "$file" in value && typeof value.$file === "object" && value.$file !== null;
};
const isRange = (value) => {
	return "$range" in value && typeof value.$range === "object" && value.$range !== null;
};
const isBytes = (value) => {
	return "$bytes" in value && typeof value.$bytes === "string";
};
const isFuture = (value) => {
	return "$future" in value && typeof value.$future === "string";
};
const isBoundIncluded = (value) => {
	return "$boundIncluded" in value;
};
const isBoundExcluded = (value) => {
	return "$boundExcluded" in value;
};
const isObject = (value) => {
	return "$object" in value && typeof value.$object === "object" && value.$object !== null;
};
const isDate = (value) => {
	return "$date" in value && typeof value.$date === "string";
};
const isTime = (value) => {
	return "$time" in value && typeof value.$time === "string";
};
const isTimestamp = (value) => {
	return "$timestamp" in value && typeof value.$timestamp === "string";
};
const isInterval = (value) => {
	if (!("$interval" in value) || typeof value.$interval !== "object" || !value.$interval) return false;
	const parts = value.$interval;
	return typeof parts.months === "number" && typeof parts.days === "number" && typeof parts.micros === "string";
};
const isBigDecimal = (value) => {
	return "$bigdecimal" in value && typeof value.$bigdecimal === "string";
};
const isRegex = (value) => {
	return "$regex" in value && typeof value.$regex === "string";
};
/**
* The kind of a sized number, `{ $u8: 5 }` and so on, or undefined for anything else
*/
const sizedKind = (value) => {
	const keys = Object.keys(value);
	if (keys.length !== 1) return void 0;
	const kind = SIZED_KINDS.find((kind$1) => keys[0] === `$${kind$1}`);
	const arg = value[keys[0]];
	return kind && (typeof arg === "number" || typeof arg === "string") ? kind : void 0;
};
const sizedClass = (kind) => ({
	i8: I8,
	u8: U8,
	i16: I16,
	u16: U16,
	i32: I32,
	u32: U32,
	u64: U64,
	f16: F16,
	f32: F32
})[kind];
/**
* A codec for encoding and decoding SurrealQL values using the SQON Json format.
*/
var JsonCodec = class JsonCodec$1 {
	/**
	* The default JsonCodec instance.
	*/
	static DEFAULT = new JsonCodec$1({});
	#options;
	constructor(options) {
		this.#options = options;
	}
	/**
	* Encode a value tree to a SQON-J structure (JSON-safe plain object tree).
	*/
	encode(data) {
		return this.#serialize(data);
	}
	/**
	* Decode a SQON-J structure back to value instances.
	*/
	decode(data) {
		return this.#deserialize(data);
	}
	#serialize(input) {
		const value = this.#encodeValue(input);
		const wasEncoded = value !== input;
		if (this.#isEncodePrimitive(value)) return value;
		if (value === void 0) return createNone();
		if (value instanceof Date) return createDatetime(value.toISOString());
		if (value instanceof DateTime) return createDatetime(value.toISOString());
		if (value instanceof Decimal) return createDecimal(value.toString());
		if (value instanceof Duration) return createDuration(value.toString());
		if (value instanceof Uuid) return createUuid(value.toString());
		if (value instanceof _RecordId) return createRecordId(value.table.name, this.#serialize(value.id));
		if (value instanceof StringRecordId) return createStringRecordId(value.toString());
		if (value instanceof _RecordIdRange) return createRecordId(value.table.name, createRange(this.#encodeBound(value.begin), this.#encodeBound(value.end)));
		if (value instanceof _Table) return createTable(value.name);
		if (value instanceof Range) return createRange(this.#encodeBound(value.begin), this.#encodeBound(value.end));
		if (value instanceof FileRef) return createFile(value.bucket, value.key);
		if (value instanceof Future) return createFuture(value.body);
		if (value instanceof Uint8Array) return createBytes(toBase64Url(value));
		if (value instanceof Geometry) return createGeometry(value.toJSON());
		if (value instanceof PlainDate) return createDate(value.toString());
		if (value instanceof PlainTime) return createTime(value.toString());
		if (value instanceof Timestamp) return createTimestamp(value.toString());
		if (value instanceof Interval) return createInterval(value.months, value.days, value.micros.toString());
		if (value instanceof BigDecimal) return createBigDecimal(value.toString());
		if (value instanceof Regex) return createRegex(value.pattern);
		if (value instanceof SizedNumber) return createSized(value.kind, this.#encodeSized(value.value));
		if (value instanceof Set) return createSet([...value].map((v) => this.#serialize(v)));
		switch (Object.getPrototypeOf(value)) {
			case Array.prototype: return value.map((v) => this.#serialize(v));
			case Map.prototype: return Object.fromEntries(Array.from(value.entries()).map(([k, v]) => [k, this.#serialize(v)]).filter(([, encoded]) => encoded !== void 0));
			case Object.prototype: {
				const obj = value;
				const result = {};
				let escaped = false;
				for (const key in obj) {
					const encoded = this.#serialize(obj[key]);
					if (encoded !== void 0) {
						result[key] = encoded;
						if (!wasEncoded && key[0] === "$") escaped = true;
					}
				}
				return escaped ? createObject(result) : result;
			}
		}
		return value;
	}
	/** A number within ±2^53 as itself, and anything JSON cannot hold as a string */
	#encodeSized(value) {
		if (typeof value === "bigint") return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
		if (Object.is(value, -0)) return "-0";
		return Number.isFinite(value) ? value : String(value);
	}
	#encodeBound(bound) {
		if (bound instanceof BoundIncluded) return createBoundIncluded(this.#serialize(bound.value));
		if (bound instanceof BoundExcluded) return createBoundExcluded(this.#serialize(bound.value));
		return null;
	}
	#isEncodePrimitive(value) {
		return value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number" || typeof value === "bigint";
	}
	#deserialize(input) {
		if (this.#isDecodePrimitive(input)) return this.#decodeValue(input);
		if (Array.isArray(input)) return this.#decodeValue(input.map((v) => this.#deserialize(v)));
		const obj = input;
		if (isObject(obj)) return Object.fromEntries(Object.entries(obj.$object).map(([k, v]) => [k, this.#deserialize(v)]).filter(([, decoded]) => decoded !== void 0));
		if (isNone(obj)) return this.#decodeValue(void 0);
		if (isDatetime(obj)) return this.#decodeValue(this.#resolveSpecDate(obj.$datetime));
		if (isDecimal(obj)) return this.#decodeValue(new Decimal(obj.$decimal));
		if (isDuration(obj)) return this.#decodeValue(new Duration(obj.$duration));
		if (isUuid(obj)) return this.#decodeValue(new Uuid(obj.$uuid));
		if (isRecordId(obj)) {
			const id$1 = this.#deserialize(obj.$recordId.id);
			if (id$1 instanceof Range) return this.#decodeValue(new _RecordIdRange(obj.$recordId.tb, id$1.begin, id$1.end));
			return this.#decodeValue(new _RecordId(obj.$recordId.tb, id$1));
		}
		if (isStringRecordId(obj)) return this.#decodeValue(new StringRecordId(obj.$recordIdString));
		if (isTable(obj)) return this.#decodeValue(new _Table(obj.$table));
		if (isGeometry(obj)) return this.#decodeValue(Geometry.fromJSON(obj.$geometry));
		if (isSet(obj)) return this.#decodeValue(new Set(obj.$set.map((v) => this.#deserialize(v))));
		if (isFile(obj)) return this.#decodeValue(new FileRef(obj.$file.bucket, obj.$file.key));
		if (isRange(obj)) return this.#decodeValue(new Range(this.#decodeBound(obj.$range.begin), this.#decodeBound(obj.$range.end)));
		if (isBytes(obj)) return this.#decodeValue(fromBase64Url(obj.$bytes));
		if (isFuture(obj)) return this.#decodeValue(new Future(obj.$future));
		if (isDate(obj)) return this.#decodeValue(new PlainDate(obj.$date));
		if (isTime(obj)) return this.#decodeValue(new PlainTime(obj.$time));
		if (isTimestamp(obj)) return this.#decodeValue(new Timestamp(obj.$timestamp));
		if (isInterval(obj)) {
			const { months, days, micros } = obj.$interval;
			return this.#decodeValue(new Interval([
				months,
				days,
				BigInt(micros)
			]));
		}
		if (isBigDecimal(obj)) return this.#decodeValue(new BigDecimal(obj.$bigdecimal));
		if (isRegex(obj)) return this.#decodeValue(new Regex(obj.$regex));
		const kind = sizedKind(obj);
		if (kind) {
			const arg = obj[`$${kind}`];
			const value = kind === "u64" ? BigInt(arg) : arg === "-0" ? -0 : Number(arg);
			return this.#decodeValue(new (sizedClass(kind))(value));
		}
		return this.#decodeValue(Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, this.#deserialize(v)]).filter(([, decoded]) => decoded !== void 0)));
	}
	#decodeBound(input) {
		if (this.#isDecodePrimitive(input)) return void 0;
		const obj = input;
		if (isBoundIncluded(obj)) return new BoundIncluded(this.#deserialize(obj.$boundIncluded));
		if (isBoundExcluded(obj)) return new BoundExcluded(this.#deserialize(obj.$boundExcluded));
		return void 0;
	}
	#isDecodePrimitive(value) {
		return value === null || value === void 0 || typeof value !== "object";
	}
	#resolveSpecDate(v) {
		return this.#options.useNativeDates ? new Date(v) : new DateTime(v);
	}
	#encodeValue(v) {
		return this.#options.valueEncodeVisitor ? this.#options.valueEncodeVisitor(v) : v;
	}
	#decodeValue(v) {
		return this.#options.valueDecodeVisitor ? this.#options.valueDecodeVisitor(v) : v;
	}
};
/**
* A SurrealQL decimal number value with support for parsing, formatting, arithmetic, and high precision.
*/
var Decimal = class Decimal$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, DECIMAL_SYMBOL$1);
	}
	_int;
	_frac;
	_scale;
	constructor(input) {
		super();
		if (input instanceof Decimal$1) {
			this._int = input._int;
			this._frac = input._frac;
			this._scale = input._scale;
		} else if (typeof input === "bigint") {
			this._int = input;
			this._frac = 0n;
			this._scale = 0;
		} else if (Array.isArray(input)) {
			let [int$1, frac, scale] = input;
			const maxFrac = 10n ** BigInt(scale);
			if (frac >= maxFrac) {
				int$1 += frac / maxFrac;
				frac %= maxFrac;
			}
			this._int = int$1;
			this._frac = frac;
			this._scale = scale;
		} else if (typeof input === "string" && /e/i.test(input)) {
			const dec = Decimal$1.fromScientificNotation(input);
			this._int = dec._int;
			this._frac = dec._frac;
			this._scale = dec._scale;
		} else {
			const str = input.toString().trim();
			const isNegative = str.startsWith("-");
			const clean = isNegative ? str.slice(1) : str;
			const [intStrRaw, fracStrRaw = ""] = clean.split(".");
			const safeInt = /^\d+$/.test(intStrRaw) ? intStrRaw : "0";
			const safeFrac = /^\d+$/.test(fracStrRaw) ? fracStrRaw : "0";
			const intStr = safeInt || "0";
			const fracStr = safeFrac.padEnd(safeFrac.length || 1, "0");
			const absInt = BigInt(intStr);
			const absFrac = BigInt(fracStr);
			this._int = isNegative ? -absInt : absInt;
			this._frac = isNegative ? -absFrac : absFrac;
			this._scale = safeFrac.length;
		}
		markSymbol$1(this, DECIMAL_SYMBOL$1);
	}
	equals(other) {
		if (!(other instanceof Decimal$1)) return false;
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		const scale = Math.max(a.scale, b.scale);
		const aVal = a.value * 10n ** BigInt(scale - a.scale);
		const bVal = b.value * 10n ** BigInt(scale - b.scale);
		return aVal === bVal;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* @returns The canonical string representation of the decimal with
	* trailing zeros in fractional part trimmed
	*/
	toString() {
		const sign = this._int < 0n || this._frac < 0n ? "-" : "";
		const absInt = this._int < 0n ? -this._int : this._int;
		const absFrac = this._frac < 0n ? -this._frac : this._frac;
		if (this._scale === 0) return `${sign}${absInt}`;
		let fracStr = absFrac.toString().padStart(this._scale, "0");
		let end = fracStr.length;
		while (end > 0 && fracStr.charCodeAt(end - 1) === 48) end--;
		fracStr = fracStr.slice(0, end);
		return fracStr === "" ? `${sign}${absInt}` : `${sign}${absInt}.${fracStr}`;
	}
	/** Returns the integer part of the number */
	get int() {
		return this._int;
	}
	/** Returns the fractional part of the number */
	get frac() {
		return this._frac;
	}
	/** Returns the scale (number of decimal places) */
	get scale() {
		return this._scale;
	}
	/**
	* Adds another Decimal to this one
	*
	* @param other The Decimal to add
	* @returns A new Decimal representing the sum
	*/
	add(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		const scale = Math.max(a.scale, b.scale);
		const scaleDiffA = BigInt(scale - a.scale);
		const scaleDiffB = BigInt(scale - b.scale);
		const valA = a.value * 10n ** scaleDiffA;
		const valB = b.value * 10n ** scaleDiffB;
		const sum = valA + valB;
		const intPart = sum / 10n ** BigInt(scale);
		const fracPart = sum % 10n ** BigInt(scale);
		return new Decimal$1([
			intPart,
			fracPart,
			scale
		]);
	}
	/**
	* Subtracts another Decimal from this one
	*
	* @param other The Decimal to subtract
	* @returns A new Decimal representing the difference
	*/
	sub(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		const scale = Math.max(a.scale, b.scale);
		const factorA = 10n ** BigInt(scale - a.scale);
		const factorB = 10n ** BigInt(scale - b.scale);
		const valA = a.value * factorA;
		const valB = b.value * factorB;
		const result = valA - valB;
		const intPart = result / 10n ** BigInt(scale);
		const fracPart = result % 10n ** BigInt(scale);
		return new Decimal$1([
			intPart,
			fracPart,
			scale
		]);
	}
	/**
	* Multiplies this Decimal by another
	*
	* @param other The Decimal to multiply by
	* @returns A new Decimal representing the product
	*/
	mul(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		const result = a.value * b.value;
		const scale = a.scale + b.scale;
		const intPart = result / 10n ** BigInt(scale);
		const fracPart = result % 10n ** BigInt(scale);
		return new Decimal$1([
			intPart,
			fracPart,
			scale
		]);
	}
	/**
	* Divides this Decimal by another, with fixed precision
	*
	* @param other The Decimal to divide by
	* @returns A new Decimal representing the quotient
	*/
	div(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		if (b.value === 0n) throw new InvalidDecimalError("Division by zero");
		const targetScale = 38;
		const scaleDiff = BigInt(targetScale + b.scale - a.scale);
		const scaledA = a.value * 10n ** scaleDiff;
		const result = scaledA / b.value;
		const intPart = result / 10n ** BigInt(targetScale);
		const fracPart = result % 10n ** BigInt(targetScale);
		return new Decimal$1([
			intPart,
			fracPart,
			targetScale
		]);
	}
	/**
	* Computes the remainder of this Decimal divided by another
	*
	* @param other The divisor Decimal
	* @returns A new Decimal representing the remainder
	*/
	mod(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		if (b.value === 0n) throw new InvalidDecimalError("Modulo by zero");
		const scale = Math.max(a.scale, b.scale);
		const scaleDiffA = BigInt(scale - a.scale);
		const scaleDiffB = BigInt(scale - b.scale);
		const valA = a.value * 10n ** scaleDiffA;
		const valB = b.value * 10n ** scaleDiffB;
		const result = valA % valB;
		const intPart = result / 10n ** BigInt(scale);
		const fracPart = result % 10n ** BigInt(scale);
		return new Decimal$1([
			intPart,
			fracPart,
			scale
		]);
	}
	/**
	* Returns the absolute value of this Decimal
	* @returns A new Decimal with non-negative components
	*/
	abs() {
		return this._int < 0n || this._frac < 0n ? new Decimal$1([
			this._int < 0n ? -this._int : this._int,
			this._frac < 0n ? -this._frac : this._frac,
			this._scale
		]) : this;
	}
	/**
	* Returns the negated value of this Decimal
	* @returns A new Decimal with inverted sign
	*/
	neg() {
		return new Decimal$1([
			-this._int,
			-this._frac,
			this._scale
		]);
	}
	/**
	* Checks if the value is exactly zero
	* @returns True if both int and frac parts are zero
	*/
	isZero() {
		return this._int === 0n && this._frac === 0n;
	}
	/**
	* Checks if the value is negative
	* @returns True if negative
	*/
	isNegative() {
		return this._int < 0n || this._int === 0n && this._frac < 0n;
	}
	/**
	* Compares this Decimal with another
	*
	* @param other The Decimal to compare with
	* @returns -1 if less, 0 if equal, 1 if greater
	*/
	compare(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		const scale = Math.max(a.scale, b.scale);
		const aVal = a.value * 10n ** BigInt(scale - a.scale);
		const bVal = b.value * 10n ** BigInt(scale - b.scale);
		if (aVal < bVal) return -1;
		if (aVal > bVal) return 1;
		return 0;
	}
	/**
	* Rounds the Decimal to a fixed number of decimal places
	*
	* @param precision Number of digits to keep after the decimal point
	* @returns The new decimal instance
	*/
	round(precision) {
		if (precision < 0) throw new InvalidDecimalError("Precision must be >= 0");
		const full = this.toBigIntWithScale();
		if (this._scale <= precision) {
			const factor$1 = 10n ** BigInt(precision - this._scale);
			const newValue = full.value * factor$1;
			const intPart$1 = newValue / 10n ** BigInt(precision);
			const fracPart$1 = newValue % 10n ** BigInt(precision);
			return new Decimal$1([
				intPart$1,
				fracPart$1,
				precision
			]);
		}
		const factor = 10n ** BigInt(this._scale - precision);
		const half = factor / 2n;
		const rounded = full.value >= 0n ? (full.value + half) / factor : (full.value - half) / factor;
		const intPart = rounded / 10n ** BigInt(precision);
		const fracPart = rounded % 10n ** BigInt(precision);
		return new Decimal$1([
			intPart,
			fracPart,
			precision
		]);
	}
	/**
	* Converts the number to fixed-point notation string
	*
	* @param precision Number of digits after the decimal point
	*/
	toFixed(precision) {
		const rounded = this.round(precision);
		const sign = rounded.int < 0n || rounded.frac < 0n ? "-" : "";
		const absInt = rounded.int < 0n ? -rounded.int : rounded.int;
		if (precision === 0) return `${sign}${absInt}`;
		const absFrac = rounded.frac < 0n ? -rounded.frac : rounded.frac;
		const fracStr = absFrac.toString().padStart(precision, "0");
		return `${sign}${absInt}.${fracStr}`;
	}
	/**
	* Converts the Decimal to a native JavaScript number
	* @returns A number approximation (may lose precision)
	*/
	toFloat() {
		return Number(this.toString());
	}
	/**
	* Converts to bigint by truncating the fractional part
	* @returns An bigint approximation (may lose precision)
	*/
	toBigInt() {
		if (this._int >= 0n) return this._int;
		if (this._frac !== 0n) return this._int - 1n;
		return this._int;
	}
	/**
	* Returns the raw parts of the Decimal
	* @returns An object with int, frac, and scale
	*/
	toParts() {
		return {
			int: this._int,
			frac: this._frac,
			scale: this._scale
		};
	}
	/**
	* Converts to scientific notation string (e.g., "1.23e4")
	*/
	toScientific() {
		if (this.isZero()) return "0e0";
		const negative = this.isNegative();
		const abs = negative ? this.neg() : this;
		const str = abs.toString();
		const [intPart, fracPart = ""] = str.split(".");
		const raw$1 = (intPart + fracPart).replace(/^0+/, "");
		const firstSig = raw$1.search(/[1-9]/);
		if (firstSig === -1) return "0e0";
		let exponent;
		if (intPart !== "0") exponent = intPart.length - 1;
		else {
			let leading = 0;
			while (leading < fracPart.length && fracPart.charCodeAt(leading) === 48) leading++;
			exponent = -leading - 1;
		}
		let end = raw$1.length;
		while (end > 0 && raw$1.charCodeAt(end - 1) === 48) end--;
		const digits = raw$1.slice(0, end);
		const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits[0];
		return `${negative ? "-" : ""}${mantissa}e${exponent}`;
	}
	/**
	* Parses a number in scientific notation into a Decimal
	*
	* @param input The scientific notation string
	*/
	static fromScientificNotation(input) {
		const trimmed = input.trim();
		if (!/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(trimmed)) throw new InvalidDecimalError(`Invalid scientific notation: ${input}`);
		const [baseStr, expStr] = trimmed.split(/[eE]/);
		const exp = Number.parseInt(expStr, 10);
		const negative = baseStr.startsWith("-");
		const [intPart, fracPart = ""] = baseStr.replace(/^[-+]/, "").split(".");
		const raw$1 = intPart + fracPart;
		let start = 0;
		while (start < raw$1.length && raw$1.charCodeAt(start) === 48) start++;
		const digits = raw$1.slice(start) || "0";
		const pointIndex = intPart.length;
		const newPointIndex = pointIndex + exp;
		let result;
		if (newPointIndex <= 0) result = `0.${"0".repeat(-newPointIndex)}${digits}`;
		else if (newPointIndex >= digits.length) result = digits + "0".repeat(newPointIndex - digits.length);
		else result = `${digits.slice(0, newPointIndex)}.${digits.slice(newPointIndex)}`;
		return new Decimal$1(negative ? `-${result}` : result);
	}
	toBigIntWithScale() {
		return {
			value: this._int * 10n ** BigInt(this._scale) + this._frac,
			scale: this._scale
		};
	}
};
const NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
/**
* A SurrealDB 4.0 `bigdecimal`: a decimal of arbitrary precision, past the 28 significant
* digits of a `decimal`. It keeps the text the server writes, in positional notation, and
* converts to a {@link Decimal} for arithmetic, which loses nothing.
*
* A `cbor.2` connection reads a `bigdecimal` the server cannot write as a `decimal` as a
* `BigDecimal`, and sends one as tag 192. Plain `cbor` has no bigdecimal: the server sends one
* as a decimal when it fits one and as text otherwise, and the SDK sends a `BigDecimal` the same
* way.
*/
var BigDecimal = class BigDecimal$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, BIG_DECIMAL_SYMBOL);
	}
	#text;
	/**
	* A bigdecimal from its text, in positional or scientific notation, or from a
	* {@link Decimal}, a `bigint` or an integer `number`
	*/
	constructor(input) {
		super();
		if (input instanceof BigDecimal$1) this.#text = input.#text;
		else if (input instanceof Decimal) this.#text = input.toString();
		else if (typeof input === "bigint") this.#text = input.toString();
		else if (typeof input === "number") {
			if (!Number.isSafeInteger(input)) throw new InvalidDecimalError(`A bigdecimal is made from an exact number: pass ${input} as text`);
			this.#text = input.toString();
		} else {
			const text$1 = input.trim();
			if (!NUMBER.test(text$1)) throw new InvalidDecimalError(`Invalid bigdecimal: ${JSON.stringify(input)}`);
			this.#text = /e/i.test(text$1) ? new Decimal(text$1).toString() : text$1;
		}
		markSymbol$1(this, BIG_DECIMAL_SYMBOL);
	}
	/**
	* Whether a SurrealDB `decimal` holds the value exactly: a coefficient below 2^96 with at
	* most 28 digits after the point, as the server's `rust_decimal` does. The server writes such
	* a bigdecimal as a decimal, and the SDK sends one the same way.
	*/
	fitsDecimal() {
		const { int: int$1, frac, scale } = this.toDecimal().toParts();
		let places = scale;
		let coefficient = (int$1 < 0n ? -int$1 : int$1) * 10n ** BigInt(scale) + (frac < 0n ? -frac : frac);
		while (places > 0 && coefficient % 10n === 0n) {
			coefficient /= 10n;
			places--;
		}
		return places <= 28 && coefficient < 2n ** 96n;
	}
	/**
	* The value as a {@link Decimal}, which holds it exactly
	*/
	toDecimal() {
		return new Decimal(this.#text);
	}
	/**
	* Equal to a bigdecimal or decimal of the same value, whatever its notation
	*/
	equals(other) {
		if (other instanceof BigDecimal$1) other = other.toDecimal();
		return other instanceof Decimal && this.toDecimal().compare(other) === 0;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* The text of the value, as it was made or as the server wrote it
	*/
	toString() {
		return this.#text;
	}
};
function escapeRegex(str) {
	return str.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}
const NANOSECOND$1 = 1n;
const MICROSECOND$1 = 1000n * NANOSECOND$1;
const MILLISECOND$1 = 1000n * MICROSECOND$1;
const SECOND$1 = 1000n * MILLISECOND$1;
const MINUTE = 60n * SECOND$1;
const HOUR = 60n * MINUTE;
const DAY = 24n * HOUR;
const WEEK = 7n * DAY;
const YEAR = 365n * DAY;
const UNITS = new Map([
	["ns", NANOSECOND$1],
	["µs", MICROSECOND$1],
	["μs", MICROSECOND$1],
	["us", MICROSECOND$1],
	["ms", MILLISECOND$1],
	["s", SECOND$1],
	["m", MINUTE],
	["h", HOUR],
	["d", DAY],
	["w", WEEK],
	["y", YEAR]
]);
const UNITS_REVERSED = Array.from(UNITS).reduce((map, [unit, size]) => {
	map.set(size, unit);
	return map;
}, /* @__PURE__ */ new Map());
const DURATION_PART_REGEX = /* @__PURE__ */ new RegExp(`^(\\d+)\\.?\\d*(${Array.from(UNITS.keys()).map(escapeRegex).join("|")})`);
const FLOAT_DURATION_REGEX = /* @__PURE__ */ new RegExp(`^(\\d+(?:\\.\\d+)?)(${Array.from(UNITS.keys()).map(escapeRegex).join("|")})$`);
/**
* A SurrealQL duration value with support for parsing, formatting, arithmetic, and nanosecond precision.
*/
var Duration = class Duration$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, DURATION_SYMBOL$1);
	}
	_seconds;
	_nanoseconds;
	constructor(input) {
		super();
		if (input instanceof Duration$1) {
			this._seconds = input._seconds;
			this._nanoseconds = input._nanoseconds;
		} else if (typeof input === "string") {
			const [s$1, ns] = Duration$1.parseString(input);
			this._seconds = s$1;
			this._nanoseconds = ns;
		} else {
			const s$1 = typeof input[0] === "bigint" ? input[0] : BigInt(Math.floor(input[0] ?? 0));
			const ns = typeof input[1] === "bigint" ? input[1] : BigInt(Math.floor(input[1] ?? 0));
			const total = s$1 * SECOND$1 + ns;
			this._seconds = total / SECOND$1;
			this._nanoseconds = total % SECOND$1;
		}
		markSymbol$1(this, DURATION_SYMBOL$1);
	}
	equals(other) {
		if (!(other instanceof Duration$1)) return false;
		return this._seconds === other._seconds && this._nanoseconds === other._nanoseconds;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* @returns Human readable duration string
	*/
	toString() {
		let remainingSeconds = this._seconds;
		let result = "";
		for (const [size, unit] of Array.from(UNITS_REVERSED).reverse()) if (size >= SECOND$1) {
			const amount = remainingSeconds / (size / SECOND$1);
			if (amount > 0n) {
				remainingSeconds %= size / SECOND$1;
				result += `${amount}${unit}`;
			}
		}
		let remainingNanoseconds = remainingSeconds * SECOND$1 + this._nanoseconds;
		for (const [size, unit] of Array.from(UNITS_REVERSED).reverse()) if (size < SECOND$1) {
			const amount = remainingNanoseconds / size;
			if (amount > 0n) {
				remainingNanoseconds %= size;
				result += `${amount}${unit}`;
			}
		}
		return result || "0ns";
	}
	/**
	* Converts the duration to a tuple
	*/
	toCompact() {
		return this._nanoseconds > 0n ? [this._seconds, this._nanoseconds] : this._seconds > 0n ? [this._seconds] : [];
	}
	/**
	* Parses a duration string like "1h30m"
	*
	* @param input Input string
	* @returns [seconds, nanoseconds]
	*/
	static parseString(input) {
		let seconds = 0n;
		let nanoseconds = 0n;
		let left = input;
		while (left !== "") {
			const match = left.match(DURATION_PART_REGEX);
			if (match) {
				const amount = BigInt(match[1]);
				const unit = match[2];
				const factor = UNITS.get(unit);
				if (!factor) throw new InvalidDurationError(`Invalid duration unit: ${unit}`);
				if (factor >= SECOND$1) seconds += amount * (factor / SECOND$1);
				else nanoseconds += amount * factor;
				left = left.slice(match[0].length);
			} else throw new InvalidDurationError("Could not match a next duration part");
		}
		seconds += nanoseconds / SECOND$1;
		nanoseconds %= SECOND$1;
		return [seconds, nanoseconds];
	}
	/**
	* Compare this duration with another
	*
	* @param other The duration to compare with
	* @returns -1 if this is shorter, 0 if equal, 1 if this is longer
	*/
	compare(other) {
		if (this._seconds < other._seconds) return -1;
		if (this._seconds > other._seconds) return 1;
		if (this._nanoseconds < other._nanoseconds) return -1;
		if (this._nanoseconds > other._nanoseconds) return 1;
		return 0;
	}
	/**
	* Adds two durations together
	*
	* @param other The duration to add
	* @returns The resulting duration
	*/
	add(other) {
		let sec = this._seconds + other._seconds;
		let ns = this._nanoseconds + other._nanoseconds;
		if (ns >= SECOND$1) {
			sec += 1n;
			ns -= SECOND$1;
		}
		return new Duration$1([sec, ns]);
	}
	/**
	* Subtracts another duration from this one
	*
	* @param other The duration to subtract
	* @returns The resulting duration
	*/
	sub(other) {
		let sec = this._seconds - other._seconds;
		let ns = this._nanoseconds - other._nanoseconds;
		if (ns < 0n) {
			sec -= 1n;
			ns += SECOND$1;
		}
		return new Duration$1([sec, ns]);
	}
	/**
	* Multiplies the duration by a scalar
	*
	* @param factor The factor to multiply by
	* @returns The resulting duration
	*/
	mul(factor) {
		const factorBig = typeof factor === "bigint" ? factor : BigInt(Math.floor(factor));
		const totalNs = this._seconds * SECOND$1 + this._nanoseconds;
		const resultNs = totalNs * factorBig;
		return new Duration$1([resultNs / SECOND$1, resultNs % SECOND$1]);
	}
	div(divisor) {
		if (typeof divisor === "object" && divisor instanceof Duration$1) {
			const a = this._seconds * SECOND$1 + this._nanoseconds;
			const b = divisor._seconds * SECOND$1 + divisor._nanoseconds;
			if (b === 0n) throw new InvalidDurationError("Division by zero duration");
			return a / b;
		}
		const divisorBig = typeof divisor === "bigint" ? divisor : BigInt(Math.floor(divisor));
		if (divisorBig === 0n) throw new InvalidDurationError("Division by zero");
		const totalNs = this._seconds * SECOND$1 + this._nanoseconds;
		const resultNs = totalNs / divisorBig;
		return new Duration$1([resultNs / SECOND$1, resultNs % SECOND$1]);
	}
	/**
	* Computes the remainder after division
	*
	* @param mod The divisor
	* @returns The remainder duration
	*/
	mod(mod) {
		const a = this._seconds * SECOND$1 + this._nanoseconds;
		const b = mod._seconds * SECOND$1 + mod._nanoseconds;
		if (b === 0n) throw new InvalidDurationError("Modulo by zero duration");
		const resultNs = a % b;
		return new Duration$1([resultNs / SECOND$1, resultNs % SECOND$1]);
	}
	/**
	* Total nanoseconds in this duration
	*/
	get nanoseconds() {
		return this._seconds * SECOND$1 + this._nanoseconds;
	}
	/**
	* Total microseconds
	*/
	get microseconds() {
		return this.nanoseconds / MICROSECOND$1;
	}
	/**
	* Total milliseconds
	*/
	get milliseconds() {
		return this.nanoseconds / MILLISECOND$1;
	}
	/**
	* Whole seconds in the duration
	*/
	get seconds() {
		return this._seconds;
	}
	/**
	* Total whole minutes in the duration
	*/
	get minutes() {
		return this._seconds / (MINUTE / SECOND$1);
	}
	/**
	* Total whole hours in the duration
	*/
	get hours() {
		return this._seconds / (HOUR / SECOND$1);
	}
	/**
	* Total whole days in the duration
	*/
	get days() {
		return this._seconds / (DAY / SECOND$1);
	}
	/**
	* Total whole weeks in the duration
	*/
	get weeks() {
		return this._seconds / (WEEK / SECOND$1);
	}
	/**
	* Total whole years in the duration
	*/
	get years() {
		return this._seconds / (YEAR / SECOND$1);
	}
	/**
	* Creates a Duration from nanoseconds
	*
	* @param ns Nanoseconds value
	* @returns The resulting duration
	*/
	static nanoseconds(ns) {
		const n = typeof ns === "bigint" ? ns : BigInt(Math.floor(ns));
		return new Duration$1([n / SECOND$1, n % SECOND$1]);
	}
	/**
	* Creates a Duration from microseconds
	*
	* @param µs Microseconds value
	* @returns The resulting duration
	*/
	static microseconds(µs) {
		const n = typeof µs === "bigint" ? µs : BigInt(Math.floor(µs));
		return Duration$1.nanoseconds(n * MICROSECOND$1);
	}
	/**
	* Creates a Duration from milliseconds
	*
	* @param ms Milliseconds value
	* @returns The resulting duration
	*/
	static milliseconds(ms) {
		const n = typeof ms === "bigint" ? ms : BigInt(Math.floor(ms));
		return Duration$1.nanoseconds(n * MILLISECOND$1);
	}
	/**
	* Creates a Duration from seconds
	*
	* @param s Seconds value
	* @returns The resulting duration
	*/
	static seconds(s$1) {
		const n = typeof s$1 === "bigint" ? s$1 : BigInt(Math.floor(s$1));
		return new Duration$1([n, 0n]);
	}
	/**
	* Creates a Duration from minutes
	*
	* @param m Minutes value
	* @returns The resulting duration
	*/
	static minutes(m) {
		const n = typeof m === "bigint" ? m : BigInt(Math.floor(m));
		return new Duration$1([n * (MINUTE / SECOND$1), 0n]);
	}
	/**
	* Creates a Duration from hours
	*
	* @param h Hours value
	* @returns The resulting duration
	*/
	static hours(h) {
		const n = typeof h === "bigint" ? h : BigInt(Math.floor(h));
		return new Duration$1([n * (HOUR / SECOND$1), 0n]);
	}
	/**
	* Creates a Duration from days
	*
	* @param d Days value
	* @returns The resulting duration
	*/
	static days(d$1) {
		const n = typeof d$1 === "bigint" ? d$1 : BigInt(Math.floor(d$1));
		return new Duration$1([n * (DAY / SECOND$1), 0n]);
	}
	/**
	* Creates a Duration from weeks
	*
	* @param w Weeks value
	* @returns The resulting duration
	*/
	static weeks(w) {
		const n = typeof w === "bigint" ? w : BigInt(Math.floor(w));
		return new Duration$1([n * (WEEK / SECOND$1), 0n]);
	}
	/**
	* Creates a Duration from years
	*
	* @param y Years value
	* @returns The resulting duration
	*/
	static years(y) {
		const n = typeof y === "bigint" ? y : BigInt(Math.floor(y));
		return new Duration$1([n * (YEAR / SECOND$1), 0n]);
	}
	/**
	* Parses a duration from a float string with a single time unit, e.g. "1.998487792s", "1.5m", "500.0ms"
	*
	* @param input Float duration string
	* @returns The resulting duration
	*/
	static parseFloat(input) {
		const match = input.match(FLOAT_DURATION_REGEX);
		if (!match) throw new InvalidDurationError(`Invalid float duration string: ${input}`);
		const numStr = match[1];
		const unit = match[2];
		const factor = UNITS.get(unit);
		if (!factor) throw new InvalidDurationError(`Invalid duration unit: ${unit}`);
		const [intPart, fracPart = ""] = numStr.split(".");
		const scale = 10n ** BigInt(fracPart.length);
		const scaledValue = BigInt(intPart) * scale + BigInt(fracPart || "0");
		const totalNs = scaledValue * factor / scale;
		return new Duration$1([totalNs / SECOND$1, totalNs % SECOND$1]);
	}
	/**
	* Measures the elapsed time since the function was called
	* If the Performance API is available, it uses it to measure the elapsed time in nanoseconds
	*
	* @returns A function that returns the elapsed time as a Duration
	*/
	static measure() {
		if (typeof performance !== "undefined" && performance.now) {
			const start$1 = performance.now();
			return () => {
				const end = performance.now();
				return Duration$1.nanoseconds((end - start$1) * 1e6);
			};
		}
		const start = Date.now();
		return () => {
			const end = Date.now();
			return Duration$1.milliseconds(end - start);
		};
	}
};
const NANOSECOND = 1n;
const MICROSECOND = 1000n * NANOSECOND;
const MILLISECOND = 1000n * MICROSECOND;
const SECOND = 1000n * MILLISECOND;
/**
* A SurrealQL datetime value with support for parsing, formatting, arithmetic, and nanosecond precision.
*/
var DateTime = class DateTime$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, DATETIME_SYMBOL$1);
	}
	_seconds;
	_nanoseconds;
	static loadHr = typeof process !== "undefined" && process.hrtime ? {
		ns: process.hrtime.bigint(),
		ms: BigInt(Date.now())
	} : void 0;
	constructor(input) {
		super();
		if (input === void 0) {
			const now = DateTime$1.now();
			this._seconds = now._seconds;
			this._nanoseconds = now._nanoseconds;
		} else if (input instanceof DateTime$1) {
			this._seconds = input._seconds;
			this._nanoseconds = input._nanoseconds;
		} else if (input instanceof Date) {
			const time = input.getTime();
			if (Number.isNaN(time)) throw new InvalidDateError(input);
			const s$1 = BigInt(Math.floor(time / 1e3));
			const ns = BigInt(time % 1e3 * 1e6);
			this._seconds = s$1;
			this._nanoseconds = ns;
		} else if (typeof input === "string") {
			const [s$1, ns] = DateTime$1.parseString(input);
			this._seconds = s$1;
			this._nanoseconds = ns;
		} else if (typeof input === "number") {
			this._seconds = BigInt(Math.floor(input));
			this._nanoseconds = 0n;
		} else if (typeof input === "bigint") {
			this._seconds = input;
			this._nanoseconds = 0n;
		} else {
			const s$1 = typeof input[0] === "bigint" ? input[0] : BigInt(Math.floor(input[0] ?? 0));
			const ns = typeof input[1] === "bigint" ? input[1] : BigInt(Math.floor(input[1] ?? 0));
			const totalSeconds = s$1 + ns / SECOND;
			this._seconds = totalSeconds;
			this._nanoseconds = ns % SECOND;
		}
		markSymbol$1(this, DATETIME_SYMBOL$1);
	}
	equals(other) {
		if (!(other instanceof DateTime$1)) return false;
		return this._seconds === other._seconds && this._nanoseconds === other._nanoseconds;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toISOString();
	}
	/**
	* @returns The ISO 8601 string representation of the datetime
	*/
	toString() {
		return this.toISOString();
	}
	/**
	* Converts the datetime to a tuple
	*/
	toCompact() {
		return [this._seconds, this._nanoseconds];
	}
	/**
	* Formats the datetime as an ISO 8601 string
	*/
	toISOString() {
		const totalMilliseconds = Number(this._seconds) * 1e3 + Number(this._nanoseconds) / 1e6;
		const date = new Date(totalMilliseconds);
		const isoString = date.toISOString();
		if (this._nanoseconds === 0n) return isoString;
		const nanoseconds = this._nanoseconds.toString().padStart(9, "0");
		const trimmed = nanoseconds.replace(/0+$/, "");
		return isoString.replace(/\.\d{3}Z$/, `.${trimmed}Z`);
	}
	/**
	* Converts to JavaScript Date object
	*/
	toDate() {
		const milliseconds = Number(this._seconds) * 1e3 + Math.floor(Number(this._nanoseconds) / 1e6);
		return new Date(milliseconds);
	}
	/**
	* Parses a datetime string
	*
	* @param input Input string (ISO 8601 format)
	* @returns [seconds, nanoseconds] tuple
	*/
	static parseString(input) {
		const isoRegex = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z?$/;
		const match = input.match(isoRegex);
		if (match) {
			const [, year, month, day, hour, minute, second, fraction] = match;
			const baseIsoString = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
			const baseDate = new Date(baseIsoString);
			const baseTimestamp = baseDate.getTime();
			if (Number.isNaN(baseTimestamp)) throw new InvalidDateError(baseDate);
			const seconds = BigInt(Math.floor(baseTimestamp / 1e3));
			let nanoseconds = 0n;
			if (fraction) {
				const fractionLength = fraction.length;
				if (fractionLength <= 3) nanoseconds = BigInt(fraction.padEnd(3, "0")) * 1000000n;
				else if (fractionLength <= 6) nanoseconds = BigInt(fraction.padEnd(6, "0")) * 1000n;
				else nanoseconds = BigInt(fraction.padEnd(9, "0"));
			}
			return [seconds, nanoseconds];
		}
		const timestamp = Date.parse(input);
		if (!Number.isNaN(timestamp)) {
			const seconds = BigInt(Math.floor(timestamp / 1e3));
			const nanoseconds = BigInt(timestamp % 1e3 * 1e6);
			return [seconds, nanoseconds];
		}
		throw new InvalidDateError(`Invalid datetime format: ${input}`);
	}
	/**
	* Adds a duration to this datetime
	*
	* @param duration The duration to add
	* @returns The new datetime instance
	*/
	add(duration$1) {
		const [durSeconds, durNanoseconds] = duration$1.toCompact();
		let newSeconds = this._seconds + (durSeconds || 0n);
		let newNanoseconds = this._nanoseconds + (durNanoseconds || 0n);
		if (newNanoseconds >= SECOND) {
			newSeconds += 1n;
			newNanoseconds -= SECOND;
		}
		return new DateTime$1([newSeconds, newNanoseconds]);
	}
	/**
	* Subtracts a duration from this datetime
	*
	* @param duration The duration to subtract
	* @returns The new datetime instance
	*/
	sub(duration$1) {
		const [durSeconds, durNanoseconds] = duration$1.toCompact();
		let newSeconds = this._seconds - (durSeconds || 0n);
		let newNanoseconds = this._nanoseconds - (durNanoseconds || 0n);
		if (newNanoseconds < 0n) {
			newSeconds -= 1n;
			newNanoseconds += SECOND;
		}
		return new DateTime$1([newSeconds, newNanoseconds]);
	}
	/**
	* Calculates the duration between two datetimes
	*
	* @param other The other datetime
	*/
	diff(other) {
		const totalThis = this._seconds * SECOND + this._nanoseconds;
		const totalOther = other._seconds * SECOND + other._nanoseconds;
		const diff = totalThis > totalOther ? totalThis - totalOther : totalOther - totalThis;
		return Duration.nanoseconds(diff);
	}
	/**
	* Compares this DateTime with another
	*
	* @param other The DateTime to compare with
	* @returns -1 if other is after, 0 if equal, 1 if other is before
	*/
	compare(other) {
		const a = this.nanoseconds;
		const b = other.nanoseconds;
		if (a < b) return -1;
		if (a > b) return 1;
		return 0;
	}
	/** Total nanoseconds since Unix epoch */
	get nanoseconds() {
		return this._seconds * SECOND + this._nanoseconds;
	}
	/** Total microseconds since Unix epoch */
	get microseconds() {
		return this.nanoseconds / MICROSECOND;
	}
	/** Total milliseconds since Unix epoch */
	get milliseconds() {
		return Number(this.nanoseconds / MILLISECOND);
	}
	/** Seconds since Unix epoch */
	get seconds() {
		return Number(this._seconds);
	}
	/**
	* Creates a DateTime from nanoseconds since Unix epoch
	*
	* @param ns Nanoseconds value
	*/
	static fromEpochNanoseconds(ns) {
		const n = typeof ns === "bigint" ? ns : BigInt(Math.floor(ns));
		return new DateTime$1([n / SECOND, n % SECOND]);
	}
	/**
	* Creates a DateTime from microseconds since Unix epoch
	*
	* @param µs Microseconds value
	*/
	static fromEpochMicroseconds(µs) {
		const n = typeof µs === "bigint" ? µs : BigInt(Math.floor(µs));
		return DateTime$1.fromEpochNanoseconds(n * MICROSECOND);
	}
	/**
	* Creates a DateTime from milliseconds since Unix epoch
	*
	* @param ms Milliseconds value
	*/
	static fromEpochMilliseconds(ms) {
		const n = typeof ms === "bigint" ? ms : BigInt(Math.floor(ms));
		return DateTime$1.fromEpochNanoseconds(n * MILLISECOND);
	}
	/**
	* Creates a DateTime from seconds since Unix epoch
	*
	* @param s Seconds value
	*/
	static fromEpochSeconds(s$1) {
		const n = typeof s$1 === "bigint" ? s$1 : BigInt(Math.floor(s$1));
		return new DateTime$1([n, 0n]);
	}
	/**
	* Returns a new DateTime representing the current time
	*/
	static now() {
		if (DateTime$1.loadHr) {
			const diffNs = process.hrtime.bigint() - DateTime$1.loadHr.ns;
			const totalNanoseconds = DateTime$1.loadHr.ms * 1000000n + diffNs;
			const seconds$1 = totalNanoseconds / 1000000000n;
			const nanoseconds$1 = totalNanoseconds % 1000000000n;
			return new DateTime$1([seconds$1, nanoseconds$1]);
		}
		if (typeof performance !== "undefined" && performance.now && performance.timeOrigin) {
			const totalMilliseconds = performance.timeOrigin + performance.now();
			const seconds$1 = BigInt(Math.floor(totalMilliseconds / 1e3));
			const nanoseconds$1 = BigInt(Math.floor(totalMilliseconds % 1e3 * 1e6));
			return new DateTime$1([seconds$1, nanoseconds$1]);
		}
		const now = Date.now();
		const seconds = BigInt(Math.floor(now / 1e3));
		const nanoseconds = BigInt(now % 1e3 * 1e6);
		return new DateTime$1([seconds, nanoseconds]);
	}
	/**
	* Returns a new DateTime representing the Unix epoch (1970-01-01T00:00:00Z)
	*/
	static epoch() {
		return new DateTime$1([0n, 0n]);
	}
};
/**
* A SurrealQL file reference value.
*/
var FileRef = class FileRef$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, FILE_REF_SYMBOL$1);
	}
	_bucket;
	_key;
	constructor(bucket, key) {
		super();
		this._bucket = bucket;
		this._key = key.startsWith("/") ? key : `/${key}`;
		markSymbol$1(this, FILE_REF_SYMBOL$1);
	}
	get bucket() {
		return this._bucket;
	}
	get key() {
		return this._key;
	}
	equals(other) {
		if (!(other instanceof FileRef$1)) return false;
		return this._bucket === other._bucket && this._key === other._key;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	toString() {
		return `${fmtInner(this._bucket, true)}:${fmtInner(this._key, false)}`;
	}
};
function fmtInner(str, escapeSlash) {
	let result = "";
	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		const code = str.charCodeAt(i);
		if (code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122 || code === 95 || code === 45 || code === 46 || !escapeSlash && code === 47) result += char;
		else result += `\\${char}`;
	}
	return result;
}
/**
* An uncomputed SurrealQL future value.
*
* @deprecated Futures were removed in SurrealDB 3.0
*/
var Future = class Future$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, FUTURE_SYMBOL$1);
	}
	_body;
	constructor(body) {
		super();
		this._body = body;
		markSymbol$1(this, FUTURE_SYMBOL$1);
	}
	equals(other) {
		if (!(other instanceof Future$1)) return false;
		return this._body === other._body;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* @returns The uncomputed future notation
	*/
	toString() {
		return `<future> ${this._body}`;
	}
	/**
	* The body of the future
	*/
	get body() {
		return this._body;
	}
};
/**
* A SurrealQL geometry value.
*/
var Geometry = class Geometry$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, GEOMETRY_SYMBOL$1);
	}
	constructor() {
		super();
		markSymbol$1(this, GEOMETRY_SYMBOL$1);
	}
	equals(other) {
		if (!(other instanceof Geometry$1)) return false;
		return this.is(other);
	}
	toString() {
		return JSON.stringify(this.toJSON());
	}
	/**
	* Create a Geometry instance from a GeoJSON object.
	*/
	static fromJSON(json) {
		switch (json.type) {
			case "Point": return new GeometryPoint(json);
			case "LineString": return new GeometryLine(json);
			case "Polygon": return new GeometryPolygon(json);
			case "MultiPoint": return new GeometryMultiPoint(json);
			case "MultiLineString": return new GeometryMultiLine(json);
			case "MultiPolygon": return new GeometryMultiPolygon(json);
			case "GeometryCollection": return new GeometryCollection(json);
		}
	}
};
/**
* A SurrealQL point geometry value.
*/
var GeometryPoint = class GeometryPoint$1 extends Geometry {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, GEOMETRY_POINT_SYMBOL$1);
	}
	point;
	constructor(input) {
		super();
		if (input instanceof GeometryPoint$1) this.point = [...input.point];
		else if (Array.isArray(input)) this.point = [f(input[0]), f(input[1])];
		else this.point = [...input.coordinates];
		markSymbol$1(this, GEOMETRY_POINT_SYMBOL$1);
	}
	toJSON() {
		return {
			type: "Point",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.point;
	}
	is(geometry) {
		if (!(geometry instanceof GeometryPoint$1)) return false;
		return this.point[0] === geometry.point[0] && this.point[1] === geometry.point[1];
	}
	clone() {
		return new GeometryPoint$1([...this.point]);
	}
};
/**
* A SurrealQL line geometry value.
*/
var GeometryLine = class GeometryLine$1 extends Geometry {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, GEOMETRY_LINE_SYMBOL$1);
	}
	line;
	constructor(input) {
		super();
		if (input instanceof GeometryLine$1) this.line = [...input.line];
		else if (Array.isArray(input)) this.line = input;
		else this.line = input.coordinates.map((c) => new GeometryPoint(c));
		markSymbol$1(this, GEOMETRY_LINE_SYMBOL$1);
	}
	toJSON() {
		return {
			type: "LineString",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.line.map((g) => g.coordinates);
	}
	close() {
		if (!this.line[0].is(this.line.at(-1))) this.line.push(this.line[0]);
	}
	is(geometry) {
		if (!(geometry instanceof GeometryLine$1)) return false;
		if (this.line.length !== geometry.line.length) return false;
		for (let i = 0; i < this.line.length; i++) if (!this.line[i].is(geometry.line[i])) return false;
		return true;
	}
	clone() {
		return new GeometryLine$1(this.line.map((p) => p.clone()));
	}
};
/**
* A SurrealQL polygon geometry value.
*/
var GeometryPolygon = class GeometryPolygon$1 extends Geometry {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, GEOMETRY_POLYGON_SYMBOL$1);
	}
	polygon;
	constructor(input) {
		super();
		if (input instanceof GeometryPolygon$1) this.polygon = [...input.polygon];
		else if (Array.isArray(input)) this.polygon = input.map((l) => {
			const line = l.clone();
			line.close();
			return line;
		});
		else this.polygon = input.coordinates.map((ring) => {
			const line = new GeometryLine(ring.map((c) => new GeometryPoint(c)));
			line.close();
			return line;
		});
		markSymbol$1(this, GEOMETRY_POLYGON_SYMBOL$1);
	}
	toJSON() {
		return {
			type: "Polygon",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.polygon.map((g) => g.coordinates);
	}
	is(geometry) {
		if (!(geometry instanceof GeometryPolygon$1)) return false;
		if (this.polygon.length !== geometry.polygon.length) return false;
		for (let i = 0; i < this.polygon.length; i++) if (!this.polygon[i].is(geometry.polygon[i])) return false;
		return true;
	}
	clone() {
		return new GeometryPolygon$1(this.polygon.map((p) => p.clone()));
	}
};
/**
* A SurrealQL multi-point geometry value.
*/
var GeometryMultiPoint = class GeometryMultiPoint$1 extends Geometry {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, GEOMETRY_MULTI_POINT_SYMBOL$1);
	}
	points;
	constructor(input) {
		super();
		if (input instanceof GeometryMultiPoint$1) this.points = [...input.points];
		else if (Array.isArray(input)) this.points = input;
		else this.points = input.coordinates.map((c) => new GeometryPoint(c));
		markSymbol$1(this, GEOMETRY_MULTI_POINT_SYMBOL$1);
	}
	toJSON() {
		return {
			type: "MultiPoint",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.points.map((g) => g.coordinates);
	}
	is(geometry) {
		if (!(geometry instanceof GeometryMultiPoint$1)) return false;
		if (this.points.length !== geometry.points.length) return false;
		for (let i = 0; i < this.points.length; i++) if (!this.points[i].is(geometry.points[i])) return false;
		return true;
	}
	clone() {
		return new GeometryMultiPoint$1(this.points.map((p) => p.clone()));
	}
};
/**
* A SurrealQL multi-line geometry value.
*/
var GeometryMultiLine = class GeometryMultiLine$1 extends Geometry {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, GEOMETRY_MULTI_LINE_SYMBOL$1);
	}
	lines;
	constructor(input) {
		super();
		if (input instanceof GeometryMultiLine$1) this.lines = [...input.lines];
		else if (Array.isArray(input)) this.lines = input;
		else this.lines = input.coordinates.map((coords) => new GeometryLine(coords.map((c) => new GeometryPoint(c))));
		markSymbol$1(this, GEOMETRY_MULTI_LINE_SYMBOL$1);
	}
	toJSON() {
		return {
			type: "MultiLineString",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.lines.map((g) => g.coordinates);
	}
	is(geometry) {
		if (!(geometry instanceof GeometryMultiLine$1)) return false;
		if (this.lines.length !== geometry.lines.length) return false;
		for (let i = 0; i < this.lines.length; i++) if (!this.lines[i].is(geometry.lines[i])) return false;
		return true;
	}
	clone() {
		return new GeometryMultiLine$1(this.lines.map((p) => p.clone()));
	}
};
/**
* A SurrealQL multi-polygon geometry value.
*/
var GeometryMultiPolygon = class GeometryMultiPolygon$1 extends Geometry {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, GEOMETRY_MULTI_POLYGON_SYMBOL$1);
	}
	polygons;
	constructor(input) {
		super();
		if (input instanceof GeometryMultiPolygon$1) this.polygons = [...input.polygons];
		else if (Array.isArray(input)) this.polygons = input;
		else this.polygons = input.coordinates.map((rings) => new GeometryPolygon(rings.map((ring) => new GeometryLine(ring.map((c) => new GeometryPoint(c))))));
		markSymbol$1(this, GEOMETRY_MULTI_POLYGON_SYMBOL$1);
	}
	toJSON() {
		return {
			type: "MultiPolygon",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.polygons.map((g) => g.coordinates);
	}
	is(geometry) {
		if (!(geometry instanceof GeometryMultiPolygon$1)) return false;
		if (this.polygons.length !== geometry.polygons.length) return false;
		for (let i = 0; i < this.polygons.length; i++) if (!this.polygons[i].is(geometry.polygons[i])) return false;
		return true;
	}
	clone() {
		return new GeometryMultiPolygon$1(this.polygons.map((p) => p.clone()));
	}
};
/**
* A SurrealQL geometry collection value.
*/
var GeometryCollection = class GeometryCollection$1 extends Geometry {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, GEOMETRY_COLLECTION_SYMBOL$1);
	}
	collection;
	constructor(input) {
		super();
		if (input instanceof GeometryCollection$1) this.collection = [...input.collection];
		else if (Array.isArray(input)) this.collection = input;
		else this.collection = input.geometries.map((g) => Geometry.fromJSON(g));
		markSymbol$1(this, GEOMETRY_COLLECTION_SYMBOL$1);
	}
	toJSON() {
		return {
			type: "GeometryCollection",
			geometries: this.geometries
		};
	}
	get geometries() {
		return this.collection.map((g) => g.toJSON());
	}
	is(geometry) {
		if (!(geometry instanceof GeometryCollection$1)) return false;
		if (this.collection.length !== geometry.collection.length) return false;
		for (let i = 0; i < this.collection.length; i++) if (!this.collection[i].is(geometry.collection[i])) return false;
		return true;
	}
	clone() {
		return new GeometryCollection$1(this.collection.map((p) => p.clone()));
	}
};
function f(num) {
	if (num instanceof Decimal) return num.toFloat();
	return num;
}
const I32_MIN = -(2 ** 31);
const I32_MAX = 2 ** 31 - 1;
const I64_MIN$3 = -(2n ** 63n);
const I64_MAX$3 = 2n ** 63n - 1n;
const MICROS_PER_DAY = 86400000000n;
const MICROS_PER_MONTH = 30n * MICROS_PER_DAY;
function checkI32(name, value) {
	if (!Number.isInteger(value) || value < I32_MIN || value > I32_MAX) throw new InvalidDurationError(`An interval's ${name} must be a 32-bit integer: ${value}`);
	return value;
}
/**
* A SurrealDB 4.0 `interval`: a calendar-aware span of months, days and microseconds, kept
* apart because a month and a day have no fixed length.
*
* As on the server, {@link Interval.equals} compares the total in which a month is 30 days and
* a day is 24 hours, so `1 month` equals `30 days`; {@link Interval.identical} compares the
* parts as written.
*
* A `cbor.2` connection reads an `interval` as an `Interval` and sends one as tag 191. Plain
* `cbor` has no interval: the server sends one as its ISO 8601 text, and the SDK sends an
* `Interval` the same way.
*/
var Interval = class Interval$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, INTERVAL_SYMBOL);
	}
	/** The months, a 32-bit integer */
	months;
	/** The days, a 32-bit integer */
	days;
	/** The microseconds, a 64-bit integer */
	micros;
	/**
	* An interval from its parts, or from a `[months, days, micros]` tuple
	*/
	constructor(input) {
		super();
		const [months, days, micros] = Array.isArray(input) ? input : [
			input.months ?? 0,
			input.days ?? 0,
			input.micros ?? 0
		];
		this.months = checkI32("months", Number(months));
		this.days = checkI32("days", Number(days));
		if (typeof micros === "number" && !Number.isSafeInteger(micros)) throw new InvalidDurationError(`An interval's micros must be an integer: ${micros}`);
		this.micros = BigInt(micros);
		if (this.micros < I64_MIN$3 || this.micros > I64_MAX$3) throw new InvalidDurationError(`An interval's micros must be a 64-bit integer: ${micros}`);
		markSymbol$1(this, INTERVAL_SYMBOL);
	}
	/**
	* The total in microseconds, in which a month is 30 days and a day is 24 hours
	*/
	get normalisedMicros() {
		return BigInt(this.months) * MICROS_PER_MONTH + BigInt(this.days) * MICROS_PER_DAY + this.micros;
	}
	/**
	* The `[months, days, micros]` of the interval, as `cbor.2` carries one
	*/
	toCompact() {
		return [
			this.months,
			this.days,
			this.micros
		];
	}
	/**
	* Equal to an interval of the same total, in which a month is 30 days and a day 24 hours
	*/
	equals(other) {
		return other instanceof Interval$1 && other.normalisedMicros === this.normalisedMicros;
	}
	/**
	* Whether both intervals have the same parts, which is stricter than {@link equals}
	*/
	identical(other) {
		return other.months === this.months && other.days === this.days && other.micros === this.micros;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* The interval as the server displays it, in ISO 8601: `P1Y2M3DT4H5M6.5S`, or `PT0S`
	*/
	toString() {
		let out = "P";
		const years = Math.trunc(this.months / 12);
		const mons = this.months % 12;
		if (years !== 0) out += `${years}Y`;
		if (mons !== 0) out += `${mons}M`;
		if (this.days !== 0) out += `${this.days}D`;
		if (this.micros !== 0n) {
			out += "T";
			const sign = this.micros < 0n ? "-" : "";
			const abs = this.micros < 0n ? -this.micros : this.micros;
			const hours = abs / 3600000000n;
			const mins = abs % 3600000000n / 60000000n;
			const secs = abs % 60000000n / 1000000n;
			const frac = abs % 1000000n;
			if (hours !== 0n) out += `${sign}${hours}H`;
			if (mins !== 0n) out += `${sign}${mins}M`;
			if (secs !== 0n || frac !== 0n) {
				out += `${sign}${secs}`;
				if (frac !== 0n) out += `.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
				out += "S";
			}
		}
		return out === "P" ? "PT0S" : out;
	}
};
/** Nanoseconds in a second. */
const NANOS_PER_SECOND = 1e9;
/** Seconds in a day. */
const SECONDS_PER_DAY = 86400;
/** Nanoseconds in a day, the latest time of day (`24:00:00`). */
const NANOS_PER_DAY = SECONDS_PER_DAY * NANOS_PER_SECOND;
/**
* Days since 1970-01-01 of a proleptic Gregorian date, after Howard Hinnant's
* `days_from_civil`.
*/
function daysFromCivil(year, month, day) {
	const y = month <= 2 ? year - 1 : year;
	const era = Math.floor(y / 400);
	const yoe = y - era * 400;
	const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
	const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
	return era * 146097 + doe - 719468;
}
/**
* The proleptic Gregorian `[year, month, day]` of a count of days since 1970-01-01.
*/
function civilFromDays(days) {
	const z = days + 719468;
	const era = Math.floor(z / 146097);
	const doe = z - era * 146097;
	const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
	const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
	const mp = Math.floor((5 * doy + 2) / 153);
	const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
	const month = mp < 10 ? mp + 3 : mp - 9;
	return [
		yoe + era * 400 + (month <= 2 ? 1 : 0),
		month,
		day
	];
}
/**
* The earliest and latest days the server holds a date in, those of its `chrono::NaiveDate`
* (-262143-01-01 to +262142-12-31). They stand for `-infinity` and `infinity`.
*/
const MIN_DAYS = daysFromCivil(-262143, 1, 1);
const MAX_DAYS = daysFromCivil(262142, 12, 31);
/**
* A date as the server displays one: `YYYY-MM-DD`, with a sign and at least five digits for a
* year outside 0 to 9999.
*/
function formatDate(days) {
	const [year, month, day] = civilFromDays(days);
	const yyyy = year >= 0 && year <= 9999 ? String(year).padStart(4, "0") : `${year < 0 ? "-" : "+"}${String(Math.abs(year)).padStart(4, "0")}`;
	return `${yyyy}-${pad2(month)}-${pad2(day)}`;
}
/**
* The days of a `YYYY-MM-DD` date, which may carry a sign and more year digits.
*/
function parseDate(text$1) {
	const match = /^([+-]?\d{4,})-(\d{2})-(\d{2})$/.exec(text$1.trim());
	if (!match) throw new InvalidDateError(`Invalid date: ${JSON.stringify(text$1)}`);
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const days = daysFromCivil(year, month, day);
	const [y, m, d$1] = civilFromDays(days);
	if (y !== year || m !== month || d$1 !== day) throw new InvalidDateError(`Invalid date: ${JSON.stringify(text$1)}`);
	if (days < MIN_DAYS || days > MAX_DAYS) throw new InvalidDateError(`Date out of range: ${JSON.stringify(text$1)}`);
	return days;
}
/**
* A time of day as the server displays one: `HH:MM:SS`, with a fraction of 3, 6 or 9 digits
* when it has one.
*/
function formatTime(nanos) {
	const secs = Math.floor(nanos / NANOS_PER_SECOND);
	const hh = pad2(Math.floor(secs / 3600));
	const mm = pad2(Math.floor(secs / 60) % 60);
	const ss = pad2(secs % 60);
	return `${hh}:${mm}:${ss}${formatFraction(nanos % NANOS_PER_SECOND)}`;
}
/**
* The nanoseconds since midnight of `H:MM[:SS[.fraction]]`, up to `24:00:00`, as the server
* reads a time.
*/
function parseTime(text$1) {
	const invalid = () => new InvalidDateError(`Invalid time: ${JSON.stringify(text$1)}`);
	const match = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,9}))?)?$/.exec(text$1.trim());
	if (!match) throw invalid();
	const hours = Number(match[1]);
	const mins = Number(match[2]);
	const secs = Number(match[3] ?? 0);
	const frac = match[4] ? Number(match[4].padEnd(9, "0")) : 0;
	if (hours > 24 || mins > 59 || secs > 59) throw invalid();
	const nanos = ((hours * 60 + mins) * 60 + secs) * NANOS_PER_SECOND + frac;
	if (nanos > NANOS_PER_DAY) throw invalid();
	return nanos;
}
/**
* The fraction of a second the server writes: none for a whole second, otherwise milli-,
* micro- or nanoseconds, whichever is the shortest exact one.
*/
function formatFraction(nanos) {
	if (nanos === 0) return "";
	if (nanos % 1e6 === 0) return `.${String(nanos / 1e6).padStart(3, "0")}`;
	if (nanos % 1e3 === 0) return `.${String(nanos / 1e3).padStart(6, "0")}`;
	return `.${String(nanos).padStart(9, "0")}`;
}
function pad2(value) {
	return String(value).padStart(2, "0");
}
/**
* A SurrealDB 4.0 `date`: a calendar date without a time or a time zone, held as a count of
* days since 1970-01-01 in the proleptic Gregorian calendar.
*
* The earliest and latest dates the server holds stand for `-infinity` and `infinity`, which
* {@link PlainDate.NEG_INFINITY} and {@link PlainDate.INFINITY} are.
*
* A `cbor.2` connection reads a `date` as a `PlainDate` and sends one as tag 100. Plain `cbor`
* has no date: the server sends one as a datetime at midnight UTC, and the SDK sends a
* `PlainDate` the same way.
*/
var PlainDate = class PlainDate$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, PLAIN_DATE_SYMBOL);
	}
	/** `infinity`, the latest date */
	static INFINITY = new PlainDate$1(MAX_DAYS);
	/** `-infinity`, the earliest date */
	static NEG_INFINITY = new PlainDate$1(MIN_DAYS);
	/**
	* The number of days since 1970-01-01
	*/
	days;
	/**
	* A date from its days since 1970-01-01, from `YYYY-MM-DD`, from `infinity`, `-infinity` or
	* `epoch`, or from the UTC date of a `Date`.
	*/
	constructor(input) {
		super();
		if (input instanceof PlainDate$1) this.days = input.days;
		else if (input instanceof Date) {
			if (Number.isNaN(input.getTime())) throw new InvalidDateError(input);
			this.days = daysFromCivil(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
		} else if (typeof input === "string") {
			const text$1 = input.trim().toLowerCase();
			if (text$1 === "infinity" || text$1 === "+infinity") this.days = MAX_DAYS;
			else if (text$1 === "-infinity") this.days = MIN_DAYS;
			else if (text$1 === "epoch") this.days = 0;
			else this.days = parseDate(input);
		} else if (Number.isSafeInteger(input) && input >= MIN_DAYS && input <= MAX_DAYS) this.days = input;
		else throw new InvalidDateError(`A date cannot be ${input} days from 1970-01-01`);
		markSymbol$1(this, PLAIN_DATE_SYMBOL);
	}
	/** The year, which is 0 for 1 BCE */
	get year() {
		return civilFromDays(this.days)[0];
	}
	/** The month, from 1 to 12 */
	get month() {
		return civilFromDays(this.days)[1];
	}
	/** The day of the month, from 1 to 31 */
	get day() {
		return civilFromDays(this.days)[2];
	}
	/** Whether this is `infinity` or `-infinity` */
	get isInfinite() {
		return this.days === MAX_DAYS || this.days === MIN_DAYS;
	}
	/**
	* Midnight UTC of this date as a `Date`, or an invalid `Date` past its range
	*/
	toDate() {
		return /* @__PURE__ */ new Date(this.days * 864e5);
	}
	equals(other) {
		return other instanceof PlainDate$1 && other.days === this.days;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* The date as the server displays it: `YYYY-MM-DD`, `infinity` or `-infinity`
	*/
	toString() {
		if (this.days === MAX_DAYS) return "infinity";
		if (this.days === MIN_DAYS) return "-infinity";
		return formatDate(this.days);
	}
};
/**
* A SurrealDB 4.0 `time`: a time of day without a date or a time zone, held as nanoseconds
* since midnight, from `00:00:00` to `24:00:00` inclusive.
*
* A `cbor.2` connection reads a `time` as a `PlainTime` and sends one as tag 189. Plain `cbor`
* has no time: the server sends one as a duration since midnight, and the SDK sends a
* `PlainTime` the same way.
*/
var PlainTime = class PlainTime$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, PLAIN_TIME_SYMBOL);
	}
	/**
	* The number of nanoseconds since midnight
	*/
	nanos;
	/**
	* A time from its nanoseconds since midnight, or from `H:MM[:SS[.fraction]]`.
	*/
	constructor(input) {
		super();
		if (input instanceof PlainTime$1) this.nanos = input.nanos;
		else if (typeof input === "string") this.nanos = parseTime(input);
		else {
			const nanos = Number(input);
			if (!Number.isSafeInteger(nanos) || nanos < 0 || nanos > NANOS_PER_DAY) throw new InvalidDateError(`A time cannot be ${input} nanoseconds past midnight`);
			this.nanos = nanos;
		}
		markSymbol$1(this, PLAIN_TIME_SYMBOL);
	}
	/** The hour, from 0 to 24 */
	get hours() {
		return Math.floor(this.nanos / (3600 * NANOS_PER_SECOND));
	}
	/** The minute, from 0 to 59 */
	get minutes() {
		return Math.floor(this.nanos / (60 * NANOS_PER_SECOND)) % 60;
	}
	/** The second, from 0 to 59 */
	get seconds() {
		return Math.floor(this.nanos / NANOS_PER_SECOND) % 60;
	}
	/** The nanoseconds within the second */
	get nanoseconds() {
		return this.nanos % NANOS_PER_SECOND;
	}
	equals(other) {
		return other instanceof PlainTime$1 && other.nanos === this.nanos;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* The time as the server displays it: `HH:MM:SS`, with a fraction when it has one
	*/
	toString() {
		return formatTime(this.nanos);
	}
};
function getRangeJoin(beg, end) {
	let output = "";
	if (beg instanceof BoundExcluded) output += ">";
	output += "..";
	if (end instanceof BoundIncluded) output += "=";
	return output;
}
/**
* A SurrealQL range value.
*/
var Range = class Range$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, RANGE_SYMBOL$1);
	}
	_beg;
	_end;
	constructor(beg, end) {
		super();
		this._beg = beg;
		this._end = end;
		markSymbol$1(this, RANGE_SYMBOL$1);
	}
	equals(other) {
		if (!(other instanceof Range$1)) return false;
		if (this._beg?.constructor !== other._beg?.constructor) return false;
		if (this._end?.constructor !== other._end?.constructor) return false;
		return equals(this._beg?.value, other._beg?.value) && equals(this._end?.value, other._end?.value);
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* @returns The escaped range string
	*/
	toString() {
		const beg = escapeRangeBound(this._beg);
		const end = escapeRangeBound(this._end);
		return `${beg}${getRangeJoin(this._beg, this._end)}${end}`;
	}
	/**
	* The range bound beginning
	*/
	get begin() {
		return this._beg;
	}
	/**
	* The range bound ending
	*/
	get end() {
		return this._end;
	}
};
/**
* A SurrealQL table value.
*
* @typeParam Tb The table name, as a string literal type
* @typeParam T The type of the records stored in the table. This is a compile-time
* annotation only: it is not validated against the data returned by the server.
*
* @internal
*/
var Table = class Table$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, TABLE_SYMBOL$1);
	}
	/**
	* Declares the record type of a table, while inferring its name.
	*
	* @example
	* ```ts
	* const users = Table.of<User>()("users"); // Table<"users", User>
	* ```
	*/
	static of() {
		return (tb) => new Table$1(tb);
	}
	_name;
	constructor(tb) {
		super();
		if (typeof tb !== "string") throw new InvalidTableError("Table must be a string");
		this._name = tb;
		markSymbol$1(this, TABLE_SYMBOL$1);
	}
	equals(other) {
		if (!(other instanceof Table$1)) return false;
		return this._name === other._name;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* @returns The escaped table name
	*/
	toString() {
		return escapeIdent(this._name);
	}
	/**
	* The unescaped table name
	*/
	get name() {
		return this._name;
	}
};
const _Table = Table;
/**
* A SurrealQL record ID value.
*
* @typeParam Tb The table name, as a string literal type
* @typeParam Id The type of the ID part
* @typeParam T The type of the records in the table. This is a compile-time annotation only, taken
* from the `Table` the record ID was created from. It is not validated against the data returned
* by the server.
*
* @internal
*/
var RecordId = class RecordId$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, RECORD_ID_SYMBOL$1);
	}
	_table;
	_id;
	constructor(table, id$1) {
		super();
		if (!isValidTable(table)) throw new InvalidRecordIdError("Table part is not valid");
		if (!isValidIdPart(id$1)) throw new InvalidRecordIdError("ID part is not valid");
		this._table = typeof table === "string" ? new _Table(table) : table;
		this._id = id$1;
		markSymbol$1(this, RECORD_ID_SYMBOL$1);
	}
	equals(other) {
		if (!(other instanceof RecordId$1)) return false;
		return this._table.equals(other._table) && equals(this._id, other._id);
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* @returns The escaped record ID string including the table name
	*/
	toString() {
		const tb = escapeIdent(this._table.name);
		const id$1 = escapeIdPart(this._id);
		return `${tb}:${id$1}`;
	}
	/**
	* The table part value
	*/
	get table() {
		return this._table;
	}
	/**
	* The ID part value
	*/
	get id() {
		return this._id;
	}
};
const _RecordId = RecordId;
/**
* A SurrealQL record ID range value.
*
* @typeParam Tb The table name, as a string literal type
* @typeParam Id The type of the range bounds
* @typeParam T The type of the records in the table. This is a compile-time annotation only, taken
* from the `Table` the range was created from. It is not validated against the data returned by
* the server.
*
* @internal
*/
var RecordIdRange = class RecordIdRange$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, RECORD_ID_RANGE_SYMBOL$1);
	}
	_table;
	_beg;
	_end;
	constructor(table, beg, end) {
		super();
		if (!isValidTable(table)) throw new InvalidRecordIdError("Table part is not valid");
		if (!isValidIdBound(beg)) throw new InvalidRecordIdError("Begin bound is not valid");
		if (!isValidIdBound(end)) throw new InvalidRecordIdError("End bound is not valid");
		this._table = typeof table === "string" ? new _Table(table) : table;
		this._beg = beg;
		this._end = end;
		markSymbol$1(this, RECORD_ID_RANGE_SYMBOL$1);
	}
	equals(other) {
		if (!(other instanceof RecordIdRange$1)) return false;
		if (this._beg?.constructor !== other._beg?.constructor) return false;
		if (this._end?.constructor !== other._end?.constructor) return false;
		return this._table.equals(other._table) && equals(this._beg?.value, other._beg?.value) && equals(this._end?.value, other._end?.value);
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* @returns The escaped record ID range string
	*/
	toString() {
		const tb = escapeIdent(this._table.name);
		const beg = escapeRangeBound(this._beg);
		const end = escapeRangeBound(this._end);
		return `${tb}:${beg}${getRangeJoin(this._beg, this._end)}${end}`;
	}
	/**
	* The table part value
	*/
	get table() {
		return this._table;
	}
	/**
	* The range bound beginning
	*/
	get begin() {
		return this._beg;
	}
	/**
	* The range bound ending
	*/
	get end() {
		return this._end;
	}
};
const _RecordIdRange = RecordIdRange;
/**
* A SurrealQL `regex`: the text of a pattern in the syntax SurrealQL regexes use, that of the
* Rust `regex` crate. It is not a JavaScript `RegExp`, whose syntax differs, so the SDK never
* converts between them; {@link Regex.toRegExp} compiles the pattern with JavaScript's engine
* when the pattern means the same in both.
*
* A `cbor.2` connection reads a `regex` as a `Regex` and sends one as tag 193. Plain `cbor`
* has no regex, and the server refuses to send one over it.
*/
var Regex = class Regex$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, REGEX_SYMBOL);
	}
	/** The pattern, without delimiters */
	pattern;
	constructor(pattern) {
		super();
		if (pattern instanceof Regex$1) this.pattern = pattern.pattern;
		else if (typeof pattern === "string") this.pattern = pattern;
		else throw new InvalidRegexError("A regex is made from the text of its pattern");
		markSymbol$1(this, REGEX_SYMBOL);
	}
	/**
	* The pattern compiled by JavaScript's engine. Its syntax is close to, but not the same as,
	* the Rust `regex` crate's which the server uses.
	*/
	toRegExp(flags) {
		return new RegExp(this.pattern, flags);
	}
	equals(other) {
		return other instanceof Regex$1 && other.pattern === this.pattern;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* The regex as SurrealQL writes it: `/pattern/`, with each `/` escaped
	*/
	toString() {
		return `/${this.pattern.replaceAll("/", "\\/")}/`;
	}
};
const INTEGER_RANGES = {
	i8: [-(2n ** 7n), 2n ** 7n - 1n],
	u8: [0n, 2n ** 8n - 1n],
	i16: [-(2n ** 15n), 2n ** 15n - 1n],
	u16: [0n, 2n ** 16n - 1n],
	i32: [-(2n ** 31n), 2n ** 31n - 1n],
	u32: [0n, 2n ** 32n - 1n],
	u64: [0n, 2n ** 64n - 1n]
};
function checkInteger(kind, value) {
	if (typeof value === "number" && !Number.isSafeInteger(value)) throw new InvalidNumberError(`${value} is not an integer which ${kind} can hold exactly`);
	const int$1 = BigInt(value);
	const [min, max] = INTEGER_RANGES[kind];
	if (int$1 < min || int$1 > max) throw new InvalidNumberError(`${int$1} is outside the range of ${kind} (${min} to ${max})`);
	return int$1;
}
/**
* The exponent of the highest power of two not above `a`, for a positive finite `a`.
*/
function floorLog2(a) {
	let e = Math.floor(Math.log2(a));
	if (2 ** e > a) e--;
	else if (2 ** (e + 1) <= a) e++;
	return e;
}
/**
* Round a number to the nearest IEEE 754 half-precision value, ties to even.
*/
function f16round(value) {
	if (!Number.isFinite(value) || value === 0) return value;
	const sign = Math.sign(value);
	const abs = Math.abs(value);
	if (abs >= 65520) return sign * Number.POSITIVE_INFINITY;
	const exponent = floorLog2(abs);
	const quantum = exponent < -14 ? 2 ** -24 : 2 ** (exponent - 10);
	const steps = abs / quantum;
	let rounded = Math.round(steps);
	if (rounded - steps === .5 && rounded % 2 !== 0) rounded--;
	return sign * rounded * quantum;
}
/**
* The bits of a half-precision float, for a value which a half holds exactly.
*/
function f16Bits$1(value) {
	if (Number.isNaN(value)) return 32256;
	const sign = value < 0 || Object.is(value, -0) ? 32768 : 0;
	const abs = Math.abs(value);
	if (abs === Number.POSITIVE_INFINITY) return sign | 31744;
	if (abs === 0) return sign;
	if (abs < 2 ** -14) return sign | abs / 2 ** -24;
	const exponent = floorLog2(abs);
	return sign | exponent + 15 << 10 | (abs / 2 ** exponent - 1) * 1024;
}
/**
* A number of one of SurrealDB 4.0's fixed-width kinds: `i8`, `u8`, `i16`, `u16`, `i32`,
* `u32` and `u64`, and the floats `f16` and `f32`.
*
* A connection which speaks `cbor.2` reads values of these kinds as instances of the
* subclasses, and sends instances of them tagged, so that the server stores them with their
* width. Over plain `cbor`, which servers before 4.0 speak, the server sends them widened, as
* plain numbers, and the SDK sends instances widened in the same way: integers as integers (a
* `u64` above the signed 64-bit range as a {@link Decimal}) and floats as floats.
*
* Each instance converts to its number with `valueOf()`, so arithmetic and comparisons with
* plain numbers work on it (a `U64` to a `bigint`).
*/
var SizedNumber = class SizedNumber$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, SIZED_NUMBER_SYMBOL);
	}
	/**
	* The value, which the kind holds exactly
	*/
	value;
	constructor(value) {
		super();
		this.value = value;
		markSymbol$1(this, SIZED_NUMBER_SYMBOL);
	}
	/**
	* Equal to a number of the same kind and value. NaN equals NaN, and -0 differs from 0.
	*/
	equals(other) {
		return other instanceof SizedNumber$1 && other.kind === this.kind && Object.is(other.value, this.value);
	}
	valueOf() {
		return this.value;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return typeof this.value === "bigint" ? this.value.toString() : this.value;
	}
	toString() {
		return Object.is(this.value, -0) ? "-0" : String(this.value);
	}
};
/**
* Whether a value is a sized number of the given kind.
*/
function isKind(instance, kind) {
	return hasSymbol$1(instance, SIZED_NUMBER_SYMBOL) && instance.kind === kind;
}
/** A SurrealDB `i8`: an integer from -128 to 127. */
var I8 = class extends SizedNumber {
	static [Symbol.hasInstance](instance) {
		return isKind(instance, "i8");
	}
	constructor(value) {
		super(Number(checkInteger("i8", value)));
	}
	get kind() {
		return "i8";
	}
};
/** A SurrealDB `u8`: an integer from 0 to 255. */
var U8 = class extends SizedNumber {
	static [Symbol.hasInstance](instance) {
		return isKind(instance, "u8");
	}
	constructor(value) {
		super(Number(checkInteger("u8", value)));
	}
	get kind() {
		return "u8";
	}
};
/** A SurrealDB `i16`: an integer from -32768 to 32767. */
var I16 = class extends SizedNumber {
	static [Symbol.hasInstance](instance) {
		return isKind(instance, "i16");
	}
	constructor(value) {
		super(Number(checkInteger("i16", value)));
	}
	get kind() {
		return "i16";
	}
};
/** A SurrealDB `u16`: an integer from 0 to 65535. */
var U16 = class extends SizedNumber {
	static [Symbol.hasInstance](instance) {
		return isKind(instance, "u16");
	}
	constructor(value) {
		super(Number(checkInteger("u16", value)));
	}
	get kind() {
		return "u16";
	}
};
/** A SurrealDB `i32`: an integer from -2147483648 to 2147483647. */
var I32 = class extends SizedNumber {
	static [Symbol.hasInstance](instance) {
		return isKind(instance, "i32");
	}
	constructor(value) {
		super(Number(checkInteger("i32", value)));
	}
	get kind() {
		return "i32";
	}
};
/** A SurrealDB `u32`: an integer from 0 to 4294967295. */
var U32 = class extends SizedNumber {
	static [Symbol.hasInstance](instance) {
		return isKind(instance, "u32");
	}
	constructor(value) {
		super(Number(checkInteger("u32", value)));
	}
	get kind() {
		return "u32";
	}
};
/**
* A SurrealDB `u64`: an integer from 0 to 18446744073709551615, held as a `bigint`. It is the
* only integer kind which goes past the signed 64-bit range of a plain SurrealDB `int`.
*/
var U64 = class extends SizedNumber {
	static [Symbol.hasInstance](instance) {
		return isKind(instance, "u64");
	}
	constructor(value) {
		super(checkInteger("u64", value));
	}
	get kind() {
		return "u64";
	}
};
/**
* A SurrealDB `f16`: an IEEE 754 half-precision float. The value is rounded to the nearest
* half when the instance is made, as a cast does, so `new F16(0.1).value` is `0.0999755859375`.
*/
var F16 = class extends SizedNumber {
	static [Symbol.hasInstance](instance) {
		return isKind(instance, "f16");
	}
	constructor(value) {
		if (typeof value !== "number") throw new InvalidNumberError("An f16 is made from a number");
		super(f16round(value));
	}
	get kind() {
		return "f16";
	}
};
/**
* A SurrealDB `f32`: an IEEE 754 single-precision float. The value is rounded to the nearest
* single when the instance is made, as a cast does, so `new F32(0.1).value` is
* `0.10000000149011612`.
*/
var F32 = class extends SizedNumber {
	static [Symbol.hasInstance](instance) {
		return isKind(instance, "f32");
	}
	constructor(value) {
		if (typeof value !== "number") throw new InvalidNumberError("An f32 is made from a number");
		super(Math.fround(value));
	}
	get kind() {
		return "f32";
	}
};
/**
* A SurrealQL string-represented record ID value.
*/
var StringRecordId = class StringRecordId$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, STRING_RECORD_ID_SYMBOL$1);
	}
	_rid;
	constructor(rid) {
		super();
		if (rid instanceof StringRecordId$1) this._rid = rid._rid;
		else if (rid instanceof _RecordId) this._rid = rid.toString();
		else if (typeof rid === "string") this._rid = rid;
		else throw new InvalidRecordIdError("String Record ID must be a string");
		markSymbol$1(this, STRING_RECORD_ID_SYMBOL$1);
	}
	equals(other) {
		if (!(other instanceof StringRecordId$1)) return false;
		return this._rid === other._rid;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this._rid;
	}
	/**
	* @returns The string representation of the record ID
	*/
	toString() {
		return this._rid;
	}
};
const MIN_SECONDS = MIN_DAYS * SECONDS_PER_DAY;
const MAX_SECONDS = MAX_DAYS * SECONDS_PER_DAY + SECONDS_PER_DAY - 1;
const MAX_NANOS = NANOS_PER_SECOND - 1;
/**
* A SurrealDB 4.0 `timestamp`: a date and time of day without a time zone, a wall-clock time
* with nanosecond resolution. Unlike a {@link DateTime}, it is not an instant: it names the
* same reading of a clock wherever it is read.
*
* The earliest and latest timestamps the server holds stand for `-infinity` and `infinity`,
* which {@link Timestamp.NEG_INFINITY} and {@link Timestamp.INFINITY} are.
*
* A `cbor.2` connection reads a `timestamp` as a `Timestamp` and sends one as tag 190. Plain
* `cbor` has no timestamp: the server sends one as the datetime of its reading in UTC, and the
* SDK sends a `Timestamp` the same way.
*/
var Timestamp = class Timestamp$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, TIMESTAMP_SYMBOL);
	}
	/** `infinity`, the latest timestamp */
	static INFINITY = new Timestamp$1([MAX_SECONDS, MAX_NANOS]);
	/** `-infinity`, the earliest timestamp */
	static NEG_INFINITY = new Timestamp$1([MIN_SECONDS, 0]);
	/** The whole seconds since 1970-01-01T00:00:00 */
	seconds;
	/** The nanoseconds within the second. A leap second holds one billion or more. */
	nanoseconds;
	/**
	* A timestamp from its `[seconds, nanoseconds]` since 1970-01-01T00:00:00, from
	* `YYYY-MM-DDTHH:MM[:SS[.fraction]]` (a space may stand for the `T`), from `infinity` or
	* `-infinity`, or from the UTC reading of a `Date`.
	*/
	constructor(input) {
		super();
		let seconds;
		let nanos;
		if (input instanceof Timestamp$1) {
			seconds = input.seconds;
			nanos = input.nanoseconds;
		} else if (input instanceof Date) {
			const ms = input.getTime();
			if (Number.isNaN(ms)) throw new InvalidDateError(input);
			seconds = Math.floor(ms / 1e3);
			nanos = (ms - seconds * 1e3) * 1e6;
		} else if (typeof input === "string") [seconds, nanos] = Timestamp$1.#parse(input);
		else {
			seconds = Number(input[0]);
			nanos = Number(input[1]);
		}
		if (!Number.isSafeInteger(seconds) || !Number.isSafeInteger(nanos) || seconds < MIN_SECONDS || seconds > MAX_SECONDS || nanos < 0 || nanos >= 2 * NANOS_PER_SECOND) throw new InvalidDateError(`A timestamp cannot be [${seconds}, ${nanos}]`);
		this.seconds = seconds;
		this.nanoseconds = nanos;
		markSymbol$1(this, TIMESTAMP_SYMBOL);
	}
	static #parse(input) {
		const text$1 = input.trim();
		const lower = text$1.toLowerCase();
		if (lower === "infinity" || lower === "+infinity") return [MAX_SECONDS, MAX_NANOS];
		if (lower === "-infinity") return [MIN_SECONDS, 0];
		if (lower === "epoch") return [0, 0];
		const at = text$1.search(/[T ]/);
		if (at < 0) throw new InvalidDateError(`Invalid timestamp: ${JSON.stringify(input)}`);
		const days = parseDate(text$1.slice(0, at));
		const nanos = parseTime(text$1.slice(at + 1));
		if (nanos >= NANOS_PER_DAY) throw new InvalidDateError(`Invalid timestamp: ${JSON.stringify(input)}`);
		const seconds = days * SECONDS_PER_DAY + Math.floor(nanos / NANOS_PER_SECOND);
		return [seconds, nanos % NANOS_PER_SECOND];
	}
	/** Whether this is `infinity` or `-infinity` */
	get isInfinite() {
		return this.equals(Timestamp$1.INFINITY) || this.equals(Timestamp$1.NEG_INFINITY);
	}
	/**
	* The `[seconds, nanoseconds]` since 1970-01-01T00:00:00, as `cbor.2` carries a timestamp
	*/
	toCompact() {
		return [this.seconds, this.nanoseconds];
	}
	/**
	* This reading taken as UTC, as a `Date`. The `Date` drops what is below a millisecond.
	*/
	toDate() {
		return new Date(this.seconds * 1e3 + Math.floor(this.nanoseconds / 1e6));
	}
	equals(other) {
		return other instanceof Timestamp$1 && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds;
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this.toString();
	}
	/**
	* The timestamp as the server displays it: `YYYY-MM-DDTHH:MM:SS`, with a fraction when it
	* has one, or `infinity` or `-infinity`
	*/
	toString() {
		if (this.seconds === MAX_SECONDS && this.nanoseconds === MAX_NANOS) return "infinity";
		if (this.seconds === MIN_SECONDS && this.nanoseconds === 0) return "-infinity";
		const days = Math.floor(this.seconds / SECONDS_PER_DAY);
		const secs = this.seconds - days * SECONDS_PER_DAY;
		const nanos = secs * NANOS_PER_SECOND + this.nanoseconds;
		const time = this.nanoseconds >= NANOS_PER_SECOND ? formatTime(nanos - NANOS_PER_SECOND).replace(/:59(\.|$)/, ":60$1") : formatTime(nanos);
		return `${formatDate(days)}T${time}`;
	}
};
/**
* uuidv7: A JavaScript implementation of UUID version 7
*
* @license Apache-2.0
* @copyright 2021-2024 LiosK
* @packageDocumentation
*/
const DIGITS = "0123456789abcdef";
/** Represents a UUID as a 16-byte byte array. */
var UUID = class UUID$1 {
	/** @param bytes - The 16-byte byte array representation. */
	constructor(bytes) {
		this.bytes = bytes;
	}
	/**
	* Creates an object from the internal representation, a 16-byte byte array
	* containing the binary UUID representation in the big-endian byte order.
	*
	* This method does NOT shallow-copy the argument, and thus the created object
	* holds the reference to the underlying buffer.
	*
	* @throws TypeError if the length of the argument is not 16.
	*/
	static ofInner(bytes) {
		if (bytes.length !== 16) throw new TypeError("not 128-bit length");
		else return new UUID$1(bytes);
	}
	/**
	* Builds a byte array from UUIDv7 field values.
	*
	* @param unixTsMs - A 48-bit `unix_ts_ms` field value.
	* @param randA - A 12-bit `rand_a` field value.
	* @param randBHi - The higher 30 bits of 62-bit `rand_b` field value.
	* @param randBLo - The lower 32 bits of 62-bit `rand_b` field value.
	* @throws RangeError if any field value is out of the specified range.
	*/
	static fromFieldsV7(unixTsMs, randA, randBHi, randBLo) {
		if (!Number.isInteger(unixTsMs) || !Number.isInteger(randA) || !Number.isInteger(randBHi) || !Number.isInteger(randBLo) || unixTsMs < 0 || randA < 0 || randBHi < 0 || randBLo < 0 || unixTsMs > 0xffffffffffff || randA > 4095 || randBHi > 1073741823 || randBLo > 4294967295) throw new RangeError("invalid field value");
		const bytes = new Uint8Array(16);
		bytes[0] = unixTsMs / 2 ** 40;
		bytes[1] = unixTsMs / 2 ** 32;
		bytes[2] = unixTsMs / 2 ** 24;
		bytes[3] = unixTsMs / 2 ** 16;
		bytes[4] = unixTsMs / 2 ** 8;
		bytes[5] = unixTsMs;
		bytes[6] = 112 | randA >>> 8;
		bytes[7] = randA;
		bytes[8] = 128 | randBHi >>> 24;
		bytes[9] = randBHi >>> 16;
		bytes[10] = randBHi >>> 8;
		bytes[11] = randBHi;
		bytes[12] = randBLo >>> 24;
		bytes[13] = randBLo >>> 16;
		bytes[14] = randBLo >>> 8;
		bytes[15] = randBLo;
		return new UUID$1(bytes);
	}
	/**
	* Builds a byte array from a string representation.
	*
	* This method accepts the following formats:
	*
	* - 32-digit hexadecimal format without hyphens: `0189dcd553117d408db09496a2eef37b`
	* - 8-4-4-4-12 hyphenated format: `0189dcd5-5311-7d40-8db0-9496a2eef37b`
	* - Hyphenated format with surrounding braces: `{0189dcd5-5311-7d40-8db0-9496a2eef37b}`
	* - RFC 9562 URN format: `urn:uuid:0189dcd5-5311-7d40-8db0-9496a2eef37b`
	*
	* Leading and trailing whitespaces represents an error.
	*
	* @throws SyntaxError if the argument could not parse as a valid UUID string.
	*/
	static parse(uuid) {
		var _a, _b, _c, _d;
		let hex = void 0;
		switch (uuid.length) {
			case 32:
				hex = (_a = /^[0-9a-f]{32}$/i.exec(uuid)) === null || _a === void 0 ? void 0 : _a[0];
				break;
			case 36:
				hex = (_b = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i.exec(uuid)) === null || _b === void 0 ? void 0 : _b.slice(1, 6).join("");
				break;
			case 38:
				hex = (_c = /^\{([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\}$/i.exec(uuid)) === null || _c === void 0 ? void 0 : _c.slice(1, 6).join("");
				break;
			case 45:
				hex = (_d = /^urn:uuid:([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i.exec(uuid)) === null || _d === void 0 ? void 0 : _d.slice(1, 6).join("");
				break;
			default: break;
		}
		if (hex) {
			const inner = new Uint8Array(16);
			for (let i = 0; i < 16; i += 4) {
				const n = parseInt(hex.substring(2 * i, 2 * i + 8), 16);
				inner[i + 0] = n >>> 24;
				inner[i + 1] = n >>> 16;
				inner[i + 2] = n >>> 8;
				inner[i + 3] = n;
			}
			return new UUID$1(inner);
		} else throw new SyntaxError("could not parse UUID string");
	}
	/**
	* @returns The 8-4-4-4-12 canonical hexadecimal string representation
	* (`0189dcd5-5311-7d40-8db0-9496a2eef37b`).
	*/
	toString() {
		let text$1 = "";
		for (let i = 0; i < this.bytes.length; i++) {
			text$1 += DIGITS.charAt(this.bytes[i] >>> 4);
			text$1 += DIGITS.charAt(this.bytes[i] & 15);
			if (i === 3 || i === 5 || i === 7 || i === 9) text$1 += "-";
		}
		return text$1;
	}
	/**
	* @returns The 32-digit hexadecimal representation without hyphens
	* (`0189dcd553117d408db09496a2eef37b`).
	*/
	toHex() {
		let text$1 = "";
		for (let i = 0; i < this.bytes.length; i++) {
			text$1 += DIGITS.charAt(this.bytes[i] >>> 4);
			text$1 += DIGITS.charAt(this.bytes[i] & 15);
		}
		return text$1;
	}
	/** @returns The 8-4-4-4-12 canonical hexadecimal string representation. */
	toJSON() {
		return this.toString();
	}
	/**
	* Reports the variant field value of the UUID or, if appropriate, "NIL" or
	* "MAX".
	*
	* For convenience, this method reports "NIL" or "MAX" if `this` represents
	* the Nil or Max UUID, although the Nil and Max UUIDs are technically
	* subsumed under the variants `0b0` and `0b111`, respectively.
	*/
	getVariant() {
		const n = this.bytes[8] >>> 4;
		if (n < 0) throw new Error("unreachable");
		else if (n <= 7) return this.bytes.every((e) => e === 0) ? "NIL" : "VAR_0";
		else if (n <= 11) return "VAR_10";
		else if (n <= 13) return "VAR_110";
		else if (n <= 15) return this.bytes.every((e) => e === 255) ? "MAX" : "VAR_RESERVED";
		else throw new Error("unreachable");
	}
	/**
	* Returns the version field value of the UUID or `undefined` if the UUID does
	* not have the variant field value of `0b10`.
	*/
	getVersion() {
		return this.getVariant() === "VAR_10" ? this.bytes[6] >>> 4 : void 0;
	}
	/** Creates an object from `this`. */
	clone() {
		return new UUID$1(this.bytes.slice(0));
	}
	/** Returns true if `this` is equivalent to `other`. */
	equals(other) {
		return this.compareTo(other) === 0;
	}
	/**
	* Returns a negative integer, zero, or positive integer if `this` is less
	* than, equal to, or greater than `other`, respectively.
	*/
	compareTo(other) {
		for (let i = 0; i < 16; i++) {
			const diff = this.bytes[i] - other.bytes[i];
			if (diff !== 0) return Math.sign(diff);
		}
		return 0;
	}
};
/**
* Encapsulates the monotonic counter state.
*
* This class provides APIs to utilize a separate counter state from that of the
* global generator used by {@link uuidv7} and {@link uuidv7obj}. In addition to
* the default {@link generate} method, this class has {@link generateOrAbort}
* that is useful to absolutely guarantee the monotonically increasing order of
* generated UUIDs. See their respective documentation for details.
*/
var V7Generator = class {
	/**
	* Creates a generator object with the default random number generator, or
	* with the specified one if passed as an argument. The specified random
	* number generator should be cryptographically strong and securely seeded.
	*/
	constructor(randomNumberGenerator) {
		this.timestamp = 0;
		this.counter = 0;
		this.random = randomNumberGenerator !== null && randomNumberGenerator !== void 0 ? randomNumberGenerator : getDefaultRandom();
	}
	/**
	* Generates a new UUIDv7 object from the current timestamp, or resets the
	* generator upon significant timestamp rollback.
	*
	* This method returns a monotonically increasing UUID by reusing the previous
	* timestamp even if the up-to-date timestamp is smaller than the immediately
	* preceding UUID's. However, when such a clock rollback is considered
	* significant (i.e., by more than ten seconds), this method resets the
	* generator and returns a new UUID based on the given timestamp, breaking the
	* increasing order of UUIDs.
	*
	* See {@link generateOrAbort} for the other mode of generation and
	* {@link generateOrResetCore} for the low-level primitive.
	*/
	generate() {
		return this.generateOrResetCore(Date.now(), 1e4);
	}
	/**
	* Generates a new UUIDv7 object from the current timestamp, or returns
	* `undefined` upon significant timestamp rollback.
	*
	* This method returns a monotonically increasing UUID by reusing the previous
	* timestamp even if the up-to-date timestamp is smaller than the immediately
	* preceding UUID's. However, when such a clock rollback is considered
	* significant (i.e., by more than ten seconds), this method aborts and
	* returns `undefined` immediately.
	*
	* See {@link generate} for the other mode of generation and
	* {@link generateOrAbortCore} for the low-level primitive.
	*/
	generateOrAbort() {
		return this.generateOrAbortCore(Date.now(), 1e4);
	}
	/**
	* Generates a new UUIDv7 object from the `unixTsMs` passed, or resets the
	* generator upon significant timestamp rollback.
	*
	* This method is equivalent to {@link generate} except that it takes a custom
	* timestamp and clock rollback allowance.
	*
	* @param rollbackAllowance - The amount of `unixTsMs` rollback that is
	* considered significant. A suggested value is `10_000` (milliseconds).
	* @throws RangeError if `unixTsMs` is not a 48-bit positive integer.
	*/
	generateOrResetCore(unixTsMs, rollbackAllowance) {
		let value = this.generateOrAbortCore(unixTsMs, rollbackAllowance);
		if (value === void 0) {
			this.timestamp = 0;
			value = this.generateOrAbortCore(unixTsMs, rollbackAllowance);
		}
		return value;
	}
	/**
	* Generates a new UUIDv7 object from the `unixTsMs` passed, or returns
	* `undefined` upon significant timestamp rollback.
	*
	* This method is equivalent to {@link generateOrAbort} except that it takes a
	* custom timestamp and clock rollback allowance.
	*
	* @param rollbackAllowance - The amount of `unixTsMs` rollback that is
	* considered significant. A suggested value is `10_000` (milliseconds).
	* @throws RangeError if `unixTsMs` is not a 48-bit positive integer.
	*/
	generateOrAbortCore(unixTsMs, rollbackAllowance) {
		const MAX_COUNTER = 4398046511103;
		if (!Number.isInteger(unixTsMs) || unixTsMs < 1 || unixTsMs > 0xffffffffffff) throw new RangeError("`unixTsMs` must be a 48-bit positive integer");
		else if (rollbackAllowance < 0 || rollbackAllowance > 0xffffffffffff) throw new RangeError("`rollbackAllowance` out of reasonable range");
		if (unixTsMs > this.timestamp) {
			this.timestamp = unixTsMs;
			this.resetCounter();
		} else if (unixTsMs + rollbackAllowance >= this.timestamp) {
			this.counter++;
			if (this.counter > MAX_COUNTER) {
				this.timestamp++;
				this.resetCounter();
			}
		} else return void 0;
		return UUID.fromFieldsV7(this.timestamp, Math.trunc(this.counter / 2 ** 30), this.counter & 2 ** 30 - 1, this.random.nextUint32());
	}
	/** Initializes the counter at a 42-bit random integer. */
	resetCounter() {
		this.counter = this.random.nextUint32() * 1024 + (this.random.nextUint32() & 1023);
	}
	/**
	* Generates a new UUIDv4 object utilizing the random number generator inside.
	*
	* @internal
	*/
	generateV4() {
		const bytes = new Uint8Array(Uint32Array.of(this.random.nextUint32(), this.random.nextUint32(), this.random.nextUint32(), this.random.nextUint32()).buffer);
		bytes[6] = 64 | bytes[6] >>> 4;
		bytes[8] = 128 | bytes[8] >>> 2;
		return UUID.ofInner(bytes);
	}
};
/** Returns the default random number generator available in the environment. */
const getDefaultRandom = () => {
	if (typeof crypto !== "undefined" && typeof crypto.getRandomValues !== "undefined") return new BufferedCryptoRandom();
	else {
		if (typeof UUIDV7_DENY_WEAK_RNG !== "undefined" && UUIDV7_DENY_WEAK_RNG) throw new Error("no cryptographically strong RNG available");
		return { nextUint32: () => Math.trunc(Math.random() * 65536) * 65536 + Math.trunc(Math.random() * 65536) };
	}
};
/**
* Wraps `crypto.getRandomValues()` to enable buffering; this uses a small
* buffer by default to avoid both unbearable throughput decline in some
* environments and the waste of time and space for unused values.
*/
var BufferedCryptoRandom = class {
	constructor() {
		this.buffer = new Uint32Array(8);
		this.cursor = 65535;
	}
	nextUint32() {
		if (this.cursor >= this.buffer.length) {
			crypto.getRandomValues(this.buffer);
			this.cursor = 0;
		}
		return this.buffer[this.cursor++];
	}
};
let defaultGenerator;
/** Generates a UUIDv7 object. */
const uuidv7obj = () => (defaultGenerator || (defaultGenerator = new V7Generator())).generate();
/** Generates a UUIDv4 object. */
const uuidv4obj = () => (defaultGenerator || (defaultGenerator = new V7Generator())).generateV4();
/**
* Checks whether a value is a `SharedArrayBuffer`.
*
* `SharedArrayBuffer` is not defined in every runtime SQON supports - it is absent on
* Hermes / React Native, and in browsers which are not cross-origin-isolated - so a bare
* `instanceof` throws a `ReferenceError` instead of evaluating to `false`.
*/
function isSharedArrayBuffer(value) {
	return typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer;
}
/**
* A SurrealQL UUID value.
*/
var Uuid = class Uuid$1 extends Value {
	static [Symbol.hasInstance](instance) {
		return hasSymbol$1(instance, UUID_SYMBOL$1);
	}
	_inner;
	constructor(uuid) {
		super();
		if (uuid instanceof ArrayBuffer || isSharedArrayBuffer(uuid)) this._inner = UUID.ofInner(new Uint8Array(uuid));
		else if (uuid instanceof Uint8Array) this._inner = UUID.ofInner(uuid);
		else if (uuid instanceof Uuid$1) this._inner = uuid._inner;
		else if (uuid instanceof UUID) this._inner = uuid;
		else this._inner = UUID.parse(uuid);
		markSymbol$1(this, UUID_SYMBOL$1);
	}
	equals(other) {
		if (!(other instanceof Uuid$1)) return false;
		return this._inner.equals(other._inner);
	}
	toJSON() {
		if (Value._useExperimentalToJson) return JsonCodec.DEFAULT.encode(this);
		return this._inner.toString();
	}
	/**
	* @returns The string representation of the UUID
	*/
	toString() {
		return this._inner.toString();
	}
	/**
	* Converts the UUID to a Uint8Array
	*/
	toUint8Array() {
		return this._inner.bytes;
	}
	/**
	* Converts the UUID to a ArrayBuffer
	*/
	toBuffer() {
		return this._inner.bytes.buffer;
	}
	/**
	* Generate a new UUID v4
	*/
	static v4() {
		return new Uuid$1(uuidv4obj());
	}
	/**
	* Generate a new UUID v7
	*/
	static v7() {
		return new Uuid$1(uuidv7obj());
	}
};
function isValidIdPart(v) {
	if (v instanceof Uuid) return true;
	switch (typeof v) {
		case "string":
		case "number":
		case "bigint": return true;
		case "object":
			if (v === null) return false;
			if (Array.isArray(v)) return true;
			return isPlainObject$1(v);
		default: return false;
	}
}
function isPlainObject$1(v) {
	if (v === null || typeof v !== "object") return false;
	const proto = Object.getPrototypeOf(v);
	return proto === null || proto === Object.prototype;
}
function isValidIdBound(bound) {
	return bound instanceof BoundIncluded || bound instanceof BoundExcluded ? isValidIdPart(bound.value) : true;
}
function isValidTable(tb) {
	return tb instanceof _Table || typeof tb === "string";
}
/**
* Recursively convert any supported SurrealQL value into a string representation.
*
* @param input The input value
* @returns Stringified SurrealQL representation
*/
function toSurqlString(input) {
	if (typeof input === "string") return `s${JSON.stringify(input)}`;
	if (input === null) return "NULL";
	if (input === void 0) return "NONE";
	if (typeof input === "object") {
		if (input instanceof Uuid) return `u${JSON.stringify(input.toString())}`;
		if (input instanceof Date || input instanceof DateTime) return `d${JSON.stringify(input.toISOString())}`;
		if (input instanceof _RecordId || input instanceof StringRecordId) return `r${JSON.stringify(input.toString())}`;
		if (input instanceof FileRef) return `f${JSON.stringify(input.toString())}`;
		if (input instanceof Geometry) return toSurqlString(input.toJSON());
		if (input instanceof Decimal) return `${input.toJSON()}dec`;
		if (input instanceof BigDecimal) return `${input.toString()}bigdec`;
		if (input instanceof PlainDate) return `pd${JSON.stringify(input.toString())}`;
		if (input instanceof PlainTime) return `pt${JSON.stringify(input.toString())}`;
		if (input instanceof Timestamp) return `ts${JSON.stringify(input.toString())}`;
		if (input instanceof Interval) return `ivl${JSON.stringify(input.toString())}`;
		if (input instanceof Regex) return input.toString();
		if (input instanceof SizedNumber) {
			const value = input.value;
			if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) return `<${input.kind}>${Object.is(value, -0) ? "-0.0" : value}`;
			return `${value}${input.kind}`;
		}
		if (input instanceof Duration || input instanceof Future || input instanceof Range || input instanceof _Table) return input.toString();
		switch (Object.getPrototypeOf(input)) {
			case Object.prototype: {
				let output = "{ ";
				const entries$1 = Object.entries(input);
				for (const [i, [k, v]] of entries$1.entries()) {
					output += `${JSON.stringify(k)}: ${toSurqlString(v)}`;
					if (i < entries$1.length - 1) output += ", ";
				}
				output += " }";
				return output;
			}
			case Map.prototype: {
				let output = "{ ";
				const entries$1 = Array.from(input.entries());
				for (const [i, [k, v]] of entries$1.entries()) {
					output += `${JSON.stringify(k)}: ${toSurqlString(v)}`;
					if (i < entries$1.length - 1) output += ", ";
				}
				output += " }";
				return output;
			}
			case Array.prototype: {
				const array$1 = input.map(toSurqlString);
				return `[ ${array$1.join(", ")} ]`;
			}
			case Set.prototype: {
				const set = [...input].map(toSurqlString);
				return `[ ${set.join(", ")} ]`;
			}
		}
	}
	return `${input}`;
}
const MAX_i64 = 9223372036854775807n;
/**
* Set of reserved keywords in SurrealQL that cannot be used as bare identifiers.
* Sourced from `surrealdb/core/src/syn/lexer/keywords.rs` (RESERVED_KEYWORD + EXPLAIN).
*/
const SURREAL_RESERVED_KEYWORDS = new Set([
	"alter",
	"begin",
	"break",
	"cancel",
	"commit",
	"continue",
	"create",
	"define",
	"delete",
	"for",
	"if",
	"info",
	"insert",
	"kill",
	"live",
	"option",
	"rebuild",
	"return",
	"relate",
	"remove",
	"select",
	"let",
	"show",
	"sleep",
	"throw",
	"update",
	"upsert",
	"use",
	"diff",
	"rand",
	"none",
	"null",
	"after",
	"before",
	"value",
	"by",
	"all",
	"true",
	"false",
	"where",
	"table",
	"tb",
	"sequence",
	"function",
	"explain"
]);
/**
* Escape a given string to be used as a valid SurrealQL ident
*
* @param str - The string to escape
* @returns Optionally escaped string
*/
function escapeIdent(str) {
	if (str === "") return "⟨⟩";
	const first = str.charCodeAt(0);
	if (first > 47 && first < 58) return delimitIdent(str);
	if (str === "NaN" || str === "Infinity") return `⟨${str}⟩`;
	if (SURREAL_RESERVED_KEYWORDS.has(str.toLowerCase())) return delimitIdent(str);
	let code;
	let i;
	let len;
	for (i = 0, len = str.length; i < len; i++) {
		code = str.charCodeAt(i);
		if (!(code > 47 && code < 58) && !(code > 64 && code < 91) && !(code > 96 && code < 123) && !(code === 95)) return delimitIdent(str);
	}
	return str;
}
/**
* Surround an ident with delimiters, escaping the backslashes and delimiters inside it.
*
* Every supported SurrealDB version reads `\\` and `` \` `` inside a backtick ident, but
* escapes inside `⟨⟩` differ: 2.1.0 to 2.1.3 read none, later 2.x versions read `\⟩`, and
* 3.x rejects `\⟩`. An ident containing `\` or `⟩` is therefore surrounded with backticks.
*
* @param str - The ident to surround
* @returns Surrounded ident
*/
function delimitIdent(str) {
	if (!str.includes("\\") && !str.includes("⟩")) return `⟨${str}⟩`;
	return `\`${str.replaceAll("\\", "\\\\").replaceAll("`", "\\`")}\``;
}
/**
* Escape a number to be used as a valid SurrealQL ident
*
* @param num - The number to escape
* @returns Optionally escaped number
*/
function escapeNumber(num) {
	return num <= MAX_i64 ? num.toString() : `⟨${num}⟩`;
}
/**
* Escape a record id value part
*
* @param id The record id value part
* @returns The escaped record id value part
*/
function escapeIdPart(id$1) {
	return id$1 instanceof Uuid ? `u"${id$1.toString()}"` : typeof id$1 === "string" ? escapeIdent(id$1) : typeof id$1 === "bigint" || typeof id$1 === "number" ? escapeNumber(id$1) : toSurqlString(id$1);
}
/**
* Escape a range bound value
*
* @param bound The range bound containing a value
* @returns The escaped range bound
*/
function escapeRangeBound(bound) {
	if (bound === void 0) return "";
	const value = bound.value;
	if (isValidIdPart(value)) return escapeIdPart(value);
	if (value instanceof Range) return `(${toSurqlString(value)})`;
	return toSurqlString(value);
}
/**
* Recursively convert any supported SurrealQL value into a serializable JSON representation.
*
* @param input The input value
* @returns JSON-safe representation
*/
function jsonify(input) {
	if (typeof input === "object") {
		if (input === null) return null;
		if (input instanceof Date || input instanceof Value) return input.toJSON();
		switch (Object.getPrototypeOf(input)) {
			case Object.prototype: {
				const entries$1 = Object.entries(input);
				const mapped = entries$1.map(([k, v]) => [k, jsonify(v)]).filter(([_, v]) => v !== void 0);
				return Object.fromEntries(mapped);
			}
			case Map.prototype: {
				const entries$1 = Array.from(input);
				const mapped = entries$1.map(([k, v]) => [k, jsonify(v)]).filter(([_, v]) => v !== void 0);
				return new Map(mapped);
			}
			case Array.prototype: return input.map(jsonify);
			case Set.prototype: return new Set([...input].map(jsonify));
		}
	}
	return input;
}
var POW_2_53$1 = 9007199254740992, POW_2_64 = BigInt(0x10000000000000000);
var Encoded = class {
	constructor(encoded) {
		this.encoded = encoded;
	}
};
var CborError = class {
	message;
	constructor(message) {
		this.message = message;
	}
}, CborNumberError = class extends CborError {
	name = "CborNumberError";
}, CborRangeError = class extends CborError {
	name = "CborRangeError";
}, CborInvalidMajorError = class extends CborError {
	name = "CborInvalidMajorError";
}, CborBreak = class extends CborError {
	name = "CborBreak";
	constructor() {
		super("Came across a break which was not intercepted by the decoder");
	}
}, CborPartialDisabled = class extends CborError {
	name = "CborPartialDisabled";
	constructor() {
		super("Tried to insert a Gap into a CBOR value, while partial mode is not enabled");
	}
}, CborFillMissing = class extends CborError {
	name = "CborFillMissing";
	constructor() {
		super("Fill for a gap is missing, and gap has no default");
	}
};
var Gap = class {
	args = [];
	constructor(...args) {
		this.args = args;
	}
	fill(value) {
		return [this, value];
	}
	hasDefault() {
		return this.args.length === 1;
	}
	get default() {
		return this.args[0];
	}
};
var Writer = class {
	constructor(byteLength = 256) {
		this.byteLength = byteLength;
		this._buf = new ArrayBuffer(this.byteLength), this._view = new DataView(this._buf), this._byte = new Uint8Array(this._buf);
	}
	_chunks = [];
	_pos = 0;
	_buf;
	_view;
	_byte;
	chunk(gap) {
		this._chunks.push([this._byte.subarray(0, this._pos), gap]), this._buf = new ArrayBuffer(this.byteLength), this._view = new DataView(this._buf), this._byte = new Uint8Array(this._buf), this._pos = 0;
	}
	get chunks() {
		return this._chunks;
	}
	get buffer() {
		return this._byte.subarray(0, this._pos);
	}
	claim(length) {
		let pos = this._pos;
		if (this._pos += length, this._pos <= this._buf.byteLength) return pos;
		let newLen = this._buf.byteLength << 1;
		for (; newLen < this._pos;) newLen <<= 1;
		let oldb = this._byte;
		return this._buf = new ArrayBuffer(newLen), this._view = new DataView(this._buf), this._byte = new Uint8Array(this._buf), this._byte.set(oldb), pos;
	}
	writeUint8(value) {
		let pos = this.claim(1);
		this._byte[pos] = value;
	}
	writeUint16(value) {
		let pos = this.claim(2);
		this._view.setUint16(pos, value, !1);
	}
	writeUint32(value) {
		let pos = this.claim(4);
		this._view.setUint32(pos, value, !1);
	}
	writeUint64(value) {
		let pos = this.claim(8);
		this._view.setBigUint64(pos, value, !1);
	}
	writeFloat32(value) {
		let pos = this.claim(4);
		this._view.setFloat32(pos, value, !1);
	}
	writeFloat64(value) {
		let pos = this.claim(8);
		this._view.setFloat64(pos, value, !1);
	}
	writeUint8Array(data) {
		if (data.byteLength === 0) return;
		let pos = this.claim(data.byteLength);
		this._byte.set(data, pos);
	}
	writePartiallyEncoded(data) {
		for (let [buf, gap] of data.chunks) this.writeUint8Array(buf), this.chunk(gap);
		this.writeUint8Array(data.end);
	}
	writeMajor(type, length) {
		let base = type << 5;
		typeof length == "number" ? length < 24 ? this.writeUint8(base + length) : length < 256 ? (this.writeUint8(base + 24), this.writeUint8(length)) : length < 65536 ? (this.writeUint8(base + 25), this.writeUint16(length)) : length < 4294967296 ? (this.writeUint8(base + 26), this.writeUint32(length)) : (this.writeUint8(base + 27), this.writeUint64(BigInt(length))) : length < 24n ? this.writeUint8(base + Number(length)) : length < 256n ? (this.writeUint8(base + 24), this.writeUint8(Number(length))) : length < 65536n ? (this.writeUint8(base + 25), this.writeUint16(Number(length))) : length < 4294967296n ? (this.writeUint8(base + 26), this.writeUint32(Number(length))) : (this.writeUint8(base + 27), this.writeUint64(length));
	}
	output(partial = !1, replacer) {
		return partial ? new PartiallyEncoded(this._chunks, this.buffer, replacer) : this.buffer;
	}
};
var PartiallyEncoded = class {
	constructor(chunks, end, replacer) {
		this.chunks = chunks;
		this.end = end;
		this.replacer = replacer;
	}
	build(fills, partial) {
		let writer = new Writer(), map = new Map(fills);
		for (let [buffer, gap] of this.chunks) {
			let hasValue = map.has(gap) || gap.hasDefault();
			if (!partial && !hasValue) throw new CborFillMissing();
			if (writer.writeUint8Array(buffer), hasValue) {
				let data = map.get(gap) ?? gap.default;
				encode(data, {
					writer,
					replacer: this.replacer
				});
			} else writer.chunk(gap);
		}
		return writer.writeUint8Array(this.end), partial ? writer.output(!0, this.replacer) : writer.output(!1, this.replacer);
	}
};
var Tagged = class {
	constructor(tag, value) {
		this.tag = tag;
		this.value = value;
	}
};
var textEncoder = new TextEncoder();
function encode(input, options = {}) {
	let w = options.writer ?? new Writer(), fillsMap = new Map(options.fills ?? []);
	function inner(input2) {
		if (input2 = options.replacer?.(input2) ?? input2, input2 === void 0) return w.writeUint8(247);
		if (input2 === null) return w.writeUint8(246);
		if (input2 === !0) return w.writeUint8(245);
		if (input2 === !1) return w.writeUint8(244);
		switch (typeof input2) {
			case "number":
				if (Number.isInteger(input2)) if (input2 >= 0 && input2 <= 9007199254740992) w.writeMajor(0, input2);
				else if (input2 < 0 && input2 >= -9007199254740992) w.writeMajor(1, -(input2 + 1));
				else throw new CborNumberError("Number too big to be encoded");
				else w.writeUint8(251), w.writeFloat64(input2);
				return;
			case "bigint":
				if (input2 >= 0 && input2 < POW_2_64) w.writeMajor(0, input2);
				else if (input2 <= 0 && input2 >= -POW_2_64) w.writeMajor(1, -(input2 + 1n));
				else throw new CborNumberError("BigInt too big to be encoded");
				return;
			case "string": {
				let encoded = textEncoder.encode(input2);
				w.writeMajor(3, encoded.byteLength), w.writeUint8Array(encoded);
				return;
			}
			default:
				if (Array.isArray(input2)) {
					w.writeMajor(4, input2.length);
					for (let v of input2) inner(v);
					return;
				}
				if (input2 instanceof Tagged) {
					w.writeMajor(6, input2.tag), inner(input2.value);
					return;
				}
				if (input2 instanceof Encoded) {
					w.writeUint8Array(input2.encoded);
					return;
				}
				if (input2 instanceof Gap) {
					if (fillsMap.has(input2)) inner(fillsMap.get(input2));
					else if (options.partial) w.chunk(input2);
					else throw new CborPartialDisabled();
					return;
				}
				if (input2 instanceof PartiallyEncoded) {
					let res = options.partial ? input2.build(options.fills ?? [], !0) : input2.build(options.fills ?? [], !1);
					res instanceof PartiallyEncoded ? w.writePartiallyEncoded(res) : w.writeUint8Array(res);
					return;
				}
				if (input2 instanceof Uint8Array || input2 instanceof Uint16Array || input2 instanceof Uint32Array || input2 instanceof Int8Array || input2 instanceof Int16Array || input2 instanceof Int32Array || input2 instanceof Float32Array || input2 instanceof Float64Array || input2 instanceof ArrayBuffer) {
					let v = input2 instanceof Uint8Array ? input2 : new Uint8Array(input2);
					w.writeMajor(2, v.byteLength), w.writeUint8Array(v);
					return;
				}
				if (input2 instanceof Map) {
					w.writeMajor(5, input2.size);
					for (let [k, v] of input2) inner(k), inner(v);
				} else {
					let entries$1 = Object.entries(input2);
					w.writeMajor(5, entries$1.length);
					for (let [k, v] of entries$1) inner(k), inner(v);
				}
		}
	}
	return inner(input), options.partial ? w.output(!0, options.replacer) : w.output(!1, options.replacer);
}
var F16_SIGN_MASK = 32768, F16_EXP_MASK = 31744, F16_FRAC_MASK = 1023, F16_EXP_SHIFT = 10, F16_EXP_BIAS = 15, F16_EXP_INF_NAN = 31, F16_FRAC_SCALE = 1024, F16_SUBNORMAL_SCALE = 2 ** -14, FLOAT16_EXP_LUT = Array.from({ length: 31 }, (_, e) => 2 ** (e - F16_EXP_BIAS)), Reader = class {
	_view;
	_byte;
	_pos = 0;
	constructor(buffer) {
		this._byte = buffer, this._view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	}
	skip(amount = 1) {
		let pos = this._pos;
		if (this._byte.length - pos < amount) throw new CborRangeError("Tried to read 1 byte beyond buffer bounds");
		this._pos = pos + amount;
	}
	peekUint8() {
		let pos = this._pos;
		if (this._byte.length - pos < 1) throw new CborRangeError("Tried to read 1 byte beyond buffer bounds");
		return this._view.getUint8(pos);
	}
	readUint8() {
		let pos = this._pos;
		if (this._byte.length - pos < 1) throw new CborRangeError("Tried to read 1 byte beyond buffer bounds");
		let val = this._view.getUint8(pos);
		return this._pos = pos + 1, val;
	}
	readUint16() {
		let pos = this._pos;
		if (this._byte.length - pos < 2) throw new CborRangeError("Tried to read 2 bytes beyond buffer bounds");
		let val = this._view.getUint16(pos);
		return this._pos = pos + 2, val;
	}
	readUint32() {
		let pos = this._pos;
		if (this._byte.length - pos < 4) throw new CborRangeError("Tried to read 4 bytes beyond buffer bounds");
		let val = this._view.getUint32(pos);
		return this._pos = pos + 4, val;
	}
	readUint64() {
		let pos = this._pos;
		if (this._byte.length - pos < 8) throw new CborRangeError("Tried to read 8 bytes beyond buffer bounds");
		let val = this._view.getBigUint64(pos);
		return this._pos = pos + 8, val;
	}
	readFloat16() {
		let val = this.readUint16(), sign = val & F16_SIGN_MASK ? -1 : 1, exp = (val & F16_EXP_MASK) >> F16_EXP_SHIFT, frac = val & F16_FRAC_MASK;
		return exp === 0 ? sign * (frac / F16_FRAC_SCALE) * F16_SUBNORMAL_SCALE : exp === F16_EXP_INF_NAN ? frac ? NaN : sign * Number.POSITIVE_INFINITY : sign * (1 + frac / F16_FRAC_SCALE) * FLOAT16_EXP_LUT[exp];
	}
	readFloat32() {
		let pos = this._pos;
		if (this._byte.length - pos < 4) throw new CborRangeError("Tried to read 4 bytes for float32 beyond buffer bounds");
		let val = this._view.getFloat32(pos);
		return this._pos = pos + 4, val;
	}
	readFloat64() {
		let pos = this._pos;
		if (this._byte.length - pos < 8) throw new CborRangeError("Tried to read 8 bytes for float64 beyond buffer bounds");
		let val = this._view.getFloat64(pos);
		return this._pos = pos + 8, val;
	}
	readBytes(amount) {
		let pos = this._pos;
		if (this._byte.length - pos < amount) throw new CborRangeError(`Tried to read ${amount} bytes beyond buffer`);
		return this._pos = pos + amount, this._byte.subarray(pos, this._pos);
	}
	readMajor() {
		let byte = this.readUint8(), major = byte >> 5;
		if (major < 0 || major > 7) throw new CborInvalidMajorError("Received invalid major type");
		return [major, byte & 31];
	}
	readMajorLength(length) {
		if (length <= 23) return length;
		if (length === 24) return this.readUint8();
		if (length === 25) return this.readUint16();
		if (length === 26) return this.readUint32();
		if (length === 27) {
			let read = this.readUint64();
			return read > 9007199254740992 ? read : Number(read);
		}
		throw new CborRangeError("Expected a final length");
	}
};
function infiniteBytes(r$1, forMajor) {
	let w = new Writer();
	for (;;) {
		let [major, len] = r$1.readMajor();
		if (major === 7 && len === 31) break;
		if (major !== forMajor) throw new CborInvalidMajorError(`Expected a resource of the same major (${forMajor}) while processing an infinite resource`);
		if (len === 31) throw new CborRangeError("Expected a finite resource while processing an infinite resource");
		w.writeUint8Array(r$1.readBytes(Number(r$1.readMajorLength(len))));
	}
	return w.buffer.buffer;
}
var textDecoder = new TextDecoder();
function decode(input, options = {}) {
	let r$1 = input instanceof Reader ? input : new Reader(input);
	return decodeValue(r$1, options);
}
function decodeValue(r$1, options) {
	let [major, len] = r$1.readMajor();
	switch (major) {
		case 0: return r$1.readMajorLength(len);
		case 1: {
			let l = r$1.readMajorLength(len);
			return typeof l == "bigint" ? -(l + 1n) : -(l + 1);
		}
		case 2: return len !== 31 ? new Uint8Array(r$1.readBytes(Number(r$1.readMajorLength(len)))).buffer : infiniteBytes(r$1, 2);
		case 3: {
			let encoded = len !== 31 ? r$1.readBytes(Number(r$1.readMajorLength(len))) : infiniteBytes(r$1, 3);
			return textDecoder.decode(encoded);
		}
		case 4: {
			if (len !== 31) {
				let l = r$1.readMajorLength(len), arr2 = Array(l);
				for (let i = 0; i < l; i++) arr2[i] = decodeValue(r$1, options);
				return arr2;
			}
			let arr = [];
			for (;;) {
				if (r$1.peekUint8() === 255) {
					r$1.skip();
					break;
				}
				arr.push(decodeValue(r$1, options));
			}
			return arr;
		}
		case 5: {
			if (options.map === "map") {
				let map = /* @__PURE__ */ new Map();
				if (len !== 31) {
					let l = r$1.readMajorLength(len);
					for (let i = 0; i < l; i++) map.set(decodeValue(r$1, options), decodeValue(r$1, options));
				} else for (;;) {
					if (r$1.peekUint8() === 255) {
						r$1.skip();
						break;
					}
					map.set(decodeValue(r$1, options), decodeValue(r$1, options));
				}
				return map;
			}
			let obj = {};
			if (len !== 31) {
				let l = r$1.readMajorLength(len);
				for (let i = 0; i < l; i++) obj[decodeValue(r$1, options)] = decodeValue(r$1, options);
			} else for (;;) {
				if (r$1.peekUint8() === 255) {
					r$1.skip();
					break;
				}
				obj[decodeValue(r$1, options)] = decodeValue(r$1, options);
			}
			return obj;
		}
		case 6: {
			let tag = Number(r$1.readMajorLength(len)), value = decodeValue(r$1, options), replacer = options.tagged?.[tag];
			return replacer ? replacer(value) : new Tagged(tag, value);
		}
		case 7: switch (len) {
			case 20: return !1;
			case 21: return !0;
			case 22: return null;
			case 23: return;
			case 25: return r$1.readFloat16();
			case 26: return r$1.readFloat32();
			case 27: return r$1.readFloat64();
			case 31: throw new CborBreak();
		}
	}
	throw new CborInvalidMajorError(`Unable to decode value with major tag ${major}`);
}
/**
* A reader which remembers the head of the item it read last, so that a tag can check what
* kind of item it holds: the decoder hands it a JavaScript value, in which the integer 1 and
* the float 1.0 are the same.
*/
var StrictReader = class extends Reader {
	/** The major type of the item read last */
	major = 0;
	/** The additional information of the item read last: 25, 26 or 27 for a float */
	info = 0;
	readMajor() {
		const head = super.readMajor();
		[this.major, this.info] = head;
		return head;
	}
	/** Whether the item read last is an integer */
	get isInteger() {
		return this.major === 0 || this.major === 1;
	}
	/** Whether the item read last is a float */
	get isFloat() {
		return this.major === 7 && this.info >= 25 && this.info <= 27;
	}
};
function rangeToCbor([beg, end]) {
	function encodeBound(bound) {
		if (!bound) return null;
		if (hasSymbol$1(bound, BOUND_INCLUDED_SYMBOL$1)) return new Tagged(TAG_BOUND_INCLUDED, bound.value);
		if (hasSymbol$1(bound, BOUND_EXCLUDED_SYMBOL$1)) return new Tagged(TAG_BOUND_EXCLUDED, bound.value);
		return null;
	}
	return [encodeBound(beg), encodeBound(end)];
}
function cborToRange(range) {
	function decodeBound(bound) {
		if (bound === null) return void 0;
		if (hasSymbol$1(bound, BOUND_INCLUDED_SYMBOL$1)) return bound;
		if (hasSymbol$1(bound, BOUND_EXCLUDED_SYMBOL$1)) return bound;
		throw new SqonError("Expected the bounds to be decoded already");
	}
	return [decodeBound(range[0]), decodeBound(range[1])];
}
const TAG_SPEC_DATETIME = 0;
const TAG_SPEC_UUID = 37;
const TAG_NONE = 6;
const TAG_TABLE = 7;
const TAG_RECORDID = 8;
const TAG_STRING_UUID = 9;
const TAG_STRING_DECIMAL = 10;
const TAG_CUSTOM_DATETIME = 12;
const TAG_STRING_DURATION = 13;
const TAG_CUSTOM_DURATION = 14;
const TAG_FUTURE = 15;
const TAG_RANGE = 49;
const TAG_BOUND_INCLUDED = 50;
const TAG_BOUND_EXCLUDED = 51;
const TAG_FILE_POINTER = 55;
const TAG_SET = 56;
const TAG_SHAPED_BLOCK = 57;
const TAG_GEOMETRY_POINT = 88;
const TAG_GEOMETRY_LINE = 89;
const TAG_GEOMETRY_POLYGON = 90;
const TAG_GEOMETRY_MULTIPOINT = 91;
const TAG_GEOMETRY_MULTILINE = 92;
const TAG_GEOMETRY_MULTIPOLYGON = 93;
const TAG_GEOMETRY_COLLECTION = 94;
const TAG_DATE = 100;
const TAG_TIME = 189;
const TAG_TIMESTAMP = 190;
const TAG_INTERVAL = 191;
const TAG_BIGDECIMAL = 192;
const TAG_REGEX = 193;
const TAG_SIZED = {
	i8: 180,
	u8: 181,
	i16: 182,
	u16: 183,
	i32: 184,
	u32: 185,
	u64: 186,
	f16: 187,
	f32: 188
};
const SIZED_CLASSES = {
	i8: I8,
	u8: U8,
	i16: I16,
	u16: U16,
	i32: I32,
	u32: U32,
	u64: U64,
	f16: F16,
	f32: F32
};
const I64_MIN$2 = -(2n ** 63n);
const I64_MAX$2 = 2n ** 63n - 1n;
/**
* An integer which may be past the signed 64-bit range, where the protocol allows a u64. It is
* written directly, as the codec refuses such an integer anywhere else.
*/
function uint64(value) {
	if (typeof value !== "bigint" || value <= I64_MAX$2) return value;
	const buf = new Uint8Array(9);
	buf[0] = 27;
	new DataView(buf.buffer).setBigUint64(1, value, false);
	return new Encoded(buf);
}
/**
* A float in the narrowest IEEE 754 width which holds it exactly, as the server writes them.
*/
function encodeFloat(value) {
	if (Number.isNaN(value) || Object.is(f16round(value), value)) {
		const bits = f16Bits$1(value);
		return new Encoded(new Uint8Array([
			249,
			bits >> 8,
			bits & 255
		]));
	}
	const width = Math.fround(value) === value ? 4 : 8;
	const buf = new Uint8Array(width + 1);
	const view = new DataView(buf.buffer);
	if (width === 4) {
		buf[0] = 250;
		view.setFloat32(1, value, false);
	} else {
		buf[0] = 251;
		view.setFloat64(1, value, false);
	}
	return new Encoded(buf);
}
/**
* A codec for encoding and decoding SurrealQL values using the SQON Binary (cbor) format.
*/
var CborCodec = class CborCodec$1 {
	/**
	* The default CborCodec instance.
	*/
	static DEFAULT = new CborCodec$1({});
	#options;
	#reader;
	constructor(options) {
		this.#options = options;
	}
	/**
	* The CBOR dialect this codec speaks: 1 for `cbor`, 2 for `cbor.2`
	*/
	get version() {
		return this.#options.version ?? 1;
	}
	encode(data) {
		return encode(data, {
			replacer: this.replacer,
			partial: false
		});
	}
	decode(data) {
		const reader = new StrictReader(data);
		const outer = this.#reader;
		this.#reader = reader;
		try {
			return decode(reader, { tagged: this.tagged });
		} finally {
			this.#reader = outer;
		}
	}
	replacer = (input) => {
		const value = this.#encodeValue(input);
		if (typeof value === "bigint" && (value < I64_MIN$2 || value > I64_MAX$2)) throw new InvalidNumberError(`The integer ${value} is outside the signed 64-bit range of a SurrealDB int: send it as a Decimal, or as a U64 when it fits one`);
		if (value && hasSymbol$1(value, SIZED_NUMBER_SYMBOL)) return this.#encodeSized(value);
		if (Object.is(value, -0)) return encodeFloat(-0);
		if (typeof value === "number" && Number.isInteger(value) && (value > POW_2_53$1 || value < -POW_2_53$1)) {
			const buf = new Uint8Array(9);
			buf[0] = 251;
			new DataView(buf.buffer, buf.byteOffset, 9).setFloat64(1, value, false);
			return new Encoded(buf);
		}
		if (value && hasSymbol$1(value, PLAIN_DATE_SYMBOL)) return this.#encodeDate(value);
		if (value && hasSymbol$1(value, PLAIN_TIME_SYMBOL)) return this.#encodeTime(value);
		if (value && hasSymbol$1(value, TIMESTAMP_SYMBOL)) return this.#encodeTimestamp(value);
		if (value && hasSymbol$1(value, INTERVAL_SYMBOL)) return this.#encodeInterval(value);
		if (value && hasSymbol$1(value, BIG_DECIMAL_SYMBOL)) return this.#encodeBigDecimal(value);
		if (value && hasSymbol$1(value, REGEX_SYMBOL)) return this.#encodeRegex(value);
		if (value instanceof Date) return new Tagged(TAG_CUSTOM_DATETIME, new DateTime(value).toCompact());
		if (value && hasSymbol$1(value, DATETIME_SYMBOL$1)) return new Tagged(TAG_CUSTOM_DATETIME, value.toCompact());
		if (value === void 0) return new Tagged(TAG_NONE, null);
		if (value && hasSymbol$1(value, UUID_SYMBOL$1)) return new Tagged(TAG_SPEC_UUID, value.toBuffer());
		if (value && hasSymbol$1(value, DECIMAL_SYMBOL$1)) return new Tagged(TAG_STRING_DECIMAL, value.toString());
		if (value && hasSymbol$1(value, DURATION_SYMBOL$1)) return new Tagged(TAG_CUSTOM_DURATION, value.toCompact().map(uint64));
		if (value && hasSymbol$1(value, RECORD_ID_SYMBOL$1)) return new Tagged(TAG_RECORDID, [value.table.name, value.id]);
		if (value && hasSymbol$1(value, STRING_RECORD_ID_SYMBOL$1)) return new Tagged(TAG_RECORDID, value.toString());
		if (value && hasSymbol$1(value, RECORD_ID_RANGE_SYMBOL$1)) return new Tagged(TAG_RECORDID, [value.table.name, new Tagged(TAG_RANGE, rangeToCbor([value.begin, value.end]))]);
		if (value && hasSymbol$1(value, TABLE_SYMBOL$1)) return new Tagged(TAG_TABLE, value.name);
		if (value && hasSymbol$1(value, FUTURE_SYMBOL$1)) {
			if (this.version === 2) throw new UnsupportedValueError("SurrealDB 4.0 has no futures to send one to");
			return new Tagged(TAG_FUTURE, value.body);
		}
		if (value && hasSymbol$1(value, RANGE_SYMBOL$1)) return new Tagged(TAG_RANGE, rangeToCbor([value.begin, value.end]));
		if (value && hasSymbol$1(value, FILE_REF_SYMBOL$1)) return new Tagged(TAG_FILE_POINTER, [value.bucket, value.key]);
		if (value instanceof Set) return new Tagged(TAG_SET, [...value]);
		if (value && hasSymbol$1(value, GEOMETRY_POINT_SYMBOL$1)) return new Tagged(TAG_GEOMETRY_POINT, value.point);
		if (value && hasSymbol$1(value, GEOMETRY_LINE_SYMBOL$1)) return new Tagged(TAG_GEOMETRY_LINE, value.line);
		if (value && hasSymbol$1(value, GEOMETRY_POLYGON_SYMBOL$1)) return new Tagged(TAG_GEOMETRY_POLYGON, value.polygon);
		if (value && hasSymbol$1(value, GEOMETRY_MULTI_POINT_SYMBOL$1)) return new Tagged(TAG_GEOMETRY_MULTIPOINT, value.points);
		if (value && hasSymbol$1(value, GEOMETRY_MULTI_LINE_SYMBOL$1)) return new Tagged(TAG_GEOMETRY_MULTILINE, value.lines);
		if (value && hasSymbol$1(value, GEOMETRY_MULTI_POLYGON_SYMBOL$1)) return new Tagged(TAG_GEOMETRY_MULTIPOLYGON, value.polygons);
		if (value && hasSymbol$1(value, GEOMETRY_COLLECTION_SYMBOL$1)) return new Tagged(TAG_GEOMETRY_COLLECTION, value.collection);
		return value;
	};
	tagged = {
		[TAG_SPEC_DATETIME]: (v) => this.#decodeValue(this.#resolveSpecDate(v)),
		[TAG_CUSTOM_DATETIME]: (v) => this.#decodeValue(this.#resolveCustomDate(v)),
		[TAG_SPEC_UUID]: (v) => this.#decodeValue(new Uuid(v)),
		[TAG_STRING_UUID]: (v) => this.#decodeValue(new Uuid(v)),
		[TAG_NONE]: (_v) => this.#decodeValue(void 0),
		[TAG_STRING_DECIMAL]: (v) => this.#decodeValue(new Decimal(v)),
		[TAG_STRING_DURATION]: (v) => this.#decodeValue(new Duration(v)),
		[TAG_CUSTOM_DURATION]: (v) => this.#decodeValue(new Duration(v)),
		[TAG_TABLE]: (v) => this.#decodeValue(new _Table(v)),
		[TAG_FUTURE]: (v) => this.#decodeValue(new Future(v)),
		[TAG_RANGE]: (v) => this.#decodeValue(new Range(...cborToRange(v))),
		[TAG_BOUND_INCLUDED]: (v) => this.#decodeValue(new BoundIncluded(v)),
		[TAG_BOUND_EXCLUDED]: (v) => this.#decodeValue(new BoundExcluded(v)),
		[TAG_RECORDID]: (v) => {
			if (typeof v === "string") return this.#decodeValue(new StringRecordId(v));
			if (hasSymbol$1(v[1], RANGE_SYMBOL$1)) return this.#decodeValue(new _RecordIdRange(v[0], v[1].begin, v[1].end));
			return this.#decodeValue(new _RecordId(v[0], this.#recordIdKey(v[1])));
		},
		[TAG_FILE_POINTER]: (v) => this.#decodeValue(new FileRef(v[0], v[1])),
		[TAG_SET]: (v) => this.#decodeValue(new Set(v)),
		[TAG_SHAPED_BLOCK]: () => {
			throw new ShapedFrameError("a shaped block outside the shaped format");
		},
		[TAG_GEOMETRY_POINT]: (v) => this.#decodeValue(new GeometryPoint(v)),
		[TAG_GEOMETRY_LINE]: (v) => this.#decodeValue(new GeometryLine(v)),
		[TAG_GEOMETRY_POLYGON]: (v) => this.#decodeValue(new GeometryPolygon(v)),
		[TAG_GEOMETRY_MULTIPOINT]: (v) => this.#decodeValue(new GeometryMultiPoint(v)),
		[TAG_GEOMETRY_MULTILINE]: (v) => this.#decodeValue(new GeometryMultiLine(v)),
		[TAG_GEOMETRY_MULTIPOLYGON]: (v) => this.#decodeValue(new GeometryMultiPolygon(v)),
		[TAG_GEOMETRY_COLLECTION]: (v) => this.#decodeValue(new GeometryCollection(v)),
		[TAG_DATE]: (v) => this.#decodeValue(new PlainDate(Number(this.#v2Integer(TAG_DATE, v)))),
		[TAG_TIME]: (v) => this.#decodeValue(new PlainTime(this.#v2Integer(TAG_TIME, v))),
		[TAG_TIMESTAMP]: (v) => {
			const [seconds, nanos] = this.#v2Tuple(TAG_TIMESTAMP, v, 2);
			return this.#decodeValue(new Timestamp([seconds, nanos]));
		},
		[TAG_INTERVAL]: (v) => {
			const [months, days, micros] = this.#v2Tuple(TAG_INTERVAL, v, 3);
			return this.#decodeValue(new Interval([
				Number(months),
				Number(days),
				micros
			]));
		},
		[TAG_BIGDECIMAL]: (v) => this.#decodeValue(new BigDecimal(this.#v2Text(TAG_BIGDECIMAL, v))),
		[TAG_REGEX]: (v) => this.#decodeValue(new Regex(this.#v2Text(TAG_REGEX, v))),
		...Object.fromEntries(Object.entries(TAG_SIZED).map(([kind, tag]) => [tag, (v) => this.#decodeValue(this.#decodeSized(kind, v))]))
	};
	#encodeSized(value) {
		const float = value.kind === "f16" || value.kind === "f32";
		if (this.version === 2) {
			const tag = TAG_SIZED[value.kind];
			if (float) return new Tagged(tag, encodeFloat(value.value));
			return new Tagged(tag, uint64(value.value));
		}
		if (float) return encodeFloat(value.value);
		if (typeof value.value === "bigint") {
			if (value.value > I64_MAX$2) return new Tagged(TAG_STRING_DECIMAL, value.value.toString());
			return value.value <= POW_2_53$1 ? Number(value.value) : value.value;
		}
		return value.value;
	}
	#encodeDate(value) {
		if (this.version === 2) return new Tagged(TAG_DATE, value.days);
		return new Tagged(TAG_CUSTOM_DATETIME, [value.days * SECONDS_PER_DAY, 0]);
	}
	#encodeTime(value) {
		if (this.version === 2) return new Tagged(TAG_TIME, value.nanos);
		const secs = Math.floor(value.nanos / NANOS_PER_SECOND);
		const nanos = value.nanos % NANOS_PER_SECOND;
		return new Tagged(TAG_CUSTOM_DURATION, nanos ? [secs, nanos] : secs ? [secs] : []);
	}
	#encodeTimestamp(value) {
		return new Tagged(this.version === 2 ? TAG_TIMESTAMP : TAG_CUSTOM_DATETIME, value.toCompact());
	}
	#encodeInterval(value) {
		if (this.version === 2) return new Tagged(TAG_INTERVAL, value.toCompact());
		return value.toString();
	}
	#encodeBigDecimal(value) {
		if (this.version === 2) return new Tagged(TAG_BIGDECIMAL, value.toString());
		if (value.fitsDecimal()) return new Tagged(TAG_STRING_DECIMAL, value.toString());
		return value.toString();
	}
	#encodeRegex(value) {
		if (this.version === 2) return new Tagged(TAG_REGEX, value.pattern);
		throw new UnsupportedValueError("A regex can only be sent over cbor.2");
	}
	/** The content of a cbor.2-only tag, which must be an integer */
	#v2Integer(tag, value) {
		this.#requireV2(tag);
		if (!this.#reader?.isInteger || typeof value !== "number" && typeof value !== "bigint") throw new InvalidNumberError(`CBOR tag ${tag} must hold an integer`);
		return value;
	}
	/** The content of a cbor.2-only tag, which must be an array of `length` integers */
	#v2Tuple(tag, value, length) {
		this.#requireV2(tag);
		if (!Array.isArray(value) || value.length !== length || !value.every((v) => typeof v === "number" || typeof v === "bigint")) throw new InvalidNumberError(`CBOR tag ${tag} must hold an array of ${length} integers`);
		return value;
	}
	/** The content of a cbor.2-only tag, which must be text */
	#v2Text(tag, value) {
		this.#requireV2(tag);
		if (typeof value !== "string") throw new UnsupportedValueError(`CBOR tag ${tag} must hold text`);
		return value;
	}
	#requireV2(tag) {
		if (this.version !== 2) throw new UnsupportedValueError(`CBOR tag ${tag} is only valid in cbor.2`);
	}
	#decodeSized(kind, value) {
		if (this.version !== 2) throw new InvalidNumberError(`CBOR tag ${TAG_SIZED[kind]} (${kind}) is only valid in cbor.2`);
		const float = kind === "f16" || kind === "f32";
		const reader = this.#reader;
		const shaped = float ? reader?.isFloat : reader?.isInteger;
		if (!shaped || typeof value !== "number" && typeof value !== "bigint") throw new InvalidNumberError(`CBOR tag ${TAG_SIZED[kind]} (${kind}) must hold ${float ? "a float" : "an integer"}`);
		const sized$1 = new SIZED_CLASSES[kind](value);
		if (float && !Object.is(sized$1.value, value) && !Number.isNaN(value)) throw new InvalidNumberError(`The float ${value} cannot be held exactly by ${kind}`);
		return sized$1;
	}
	/**
	* A record id key holds an i64, so a sized integer key is read as a plain integer.
	*/
	#recordIdKey(key) {
		if (!(key instanceof SizedNumber)) return key;
		if (key.kind === "f16" || key.kind === "f32") throw new InvalidNumberError(`A record id key cannot be a ${key.kind}`);
		if (typeof key.value === "bigint") {
			if (key.value > I64_MAX$2) throw new InvalidNumberError(`The record id key ${key.value} is outside the signed 64-bit range`);
			return key.value <= POW_2_53$1 ? Number(key.value) : key.value;
		}
		return key.value;
	}
	#resolveSpecDate(v) {
		return this.#options.useNativeDates ? new Date(v) : new DateTime(v);
	}
	#resolveCustomDate(v) {
		return this.#options.useNativeDates ? /* @__PURE__ */ new Date(Number(v[0]) * 1e3 + Number(v[1]) / 1e6) : new DateTime(v);
	}
	#encodeValue(v) {
		return this.#options.valueEncodeVisitor ? this.#options.valueEncodeVisitor(v) : v;
	}
	#decodeValue(v) {
		return this.#options.valueDecodeVisitor ? this.#options.valueDecodeVisitor(v) : v;
	}
};
/**
* A codec for encoding and decoding SurrealQL values using the SQON Binary (flatbuffer) format.
*
* *Note*: This codec is not implemented in this version.
*/
var FlatBufferCodec = class FlatBufferCodec$1 {
	/**
	* The default FlatBufferCodec instance.
	*/
	static DEFAULT = new FlatBufferCodec$1({});
	#options;
	constructor(options) {
		this.#options = options;
	}
	encode(_data) {
		throw new SqonError("FlatBuffer encoding is not supported in this version");
	}
	decode(_data) {
		throw new SqonError("FlatBuffer decoding is not supported in this version");
	}
};
/**
* The constants of the shaped block format, version 1.
*
* A block is a CBOR tag 57 around a byte string. Its contents are a version byte and then a
* run of messages, each of which announces a shape or carries a batch of rows written in a
* shape announced earlier. The format is specified in the server's
* `doc/design/shaped-frames.md`; these names follow the ones it uses.
*/
/** The CBOR tag which wraps a block's byte string */
const SHAPED_TAG = 57;
/** The only block version this decoder reads */
const VERSION = 1;
/** A message which announces a shape under an id */
const MESSAGE_SHAPE = 1;
/** A message which carries rows of a shape announced earlier */
const MESSAGE_BATCH = 2;
/** The presence index, slot or remainder of a column which has none */
const NO_SLOT = 4294967295;
/** A column flag: the column may be absent, or hold `NONE` */
const MAY_BE_ABSENT = 1;
/** A column flag: the column may be `NULL` */
const MAY_BE_NULL = 2;
/** Presence state: the row does not hold the key */
const STATE_ABSENT = 0;
/** Presence state: the column holds a value */
const STATE_VALUE = 1;
/** Presence state: the column is `NULL` */
const STATE_NULL = 2;
/** Presence state: the row holds the key and its value is `NONE` */
const STATE_NONE = 3;
/** The most columns a shape holds, at every depth */
const MAX_COLUMNS = 4096;
/** The deepest object nesting a shape holds */
const MAX_DEPTH = 32;
/** The most shapes one scope announces */
const MAX_SHAPES = 65536;
/** The most rows one batch holds of a shape whose rows take no bytes */
const MAX_EMPTY_ROWS = 65536;
/** The largest fixed region of a row */
const MAX_FIXED = 1 << 20;
/** The root of a shape whose every row is an object built from the columns */
const ROOT_OBJECT = 0;
/** The root of a shape whose every row is one value, held in a dynamic slot */
const ROOT_VALUE = 1;
/** The presence bits a column of these flags takes: none, one, or two for a column which may be both */
function presenceWidth(flags) {
	const set = flags & (MAY_BE_ABSENT | MAY_BE_NULL);
	if (set === 0) return 0;
	return set === (MAY_BE_ABSENT | MAY_BE_NULL) ? 2 : 1;
}
/** The bytes a presence region of `bits` bits takes */
function presenceBytes(bits) {
	return Math.ceil(bits / 8);
}
const TEXT = new TextDecoder("utf-8", { fatal: true });
/** Refuses the bytes, naming what was wrong with them */
function refuse(what) {
	throw new ShapedFrameError(what);
}
/**
* A cursor over a block's bytes.
*
* Every number in the format is little-endian and unaligned, and every one is read through
* here, so the rest of the decoder names the kind it wants rather than its width and byte
* order. A read past the end refuses the bytes instead of returning a short result.
*/
var ByteReader = class {
	#bytes;
	#view;
	#at = 0;
	constructor(bytes) {
		this.#bytes = bytes;
		this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}
	/** Whether every byte has been read */
	get done() {
		return this.#at >= this.#bytes.length;
	}
	/** The bytes which remain unread */
	get rest() {
		return this.#bytes.subarray(this.#at);
	}
	/** Moves the cursor to `at`, counted from the start */
	seek(at) {
		if (at < 0 || at > this.#bytes.length) refuse("a slot out of range");
		this.#at = at;
		return this;
	}
	/** Takes `n` bytes, as a view over the same buffer */
	bytes(n) {
		const at = this.#take(n);
		return this.#bytes.subarray(at, at + n);
	}
	/** Takes `n` bytes as UTF-8, or refuses them naming `what` they were */
	text(n, what) {
		return text(this.bytes(n), what);
	}
	u8() {
		return this.#view.getUint8(this.#take(1));
	}
	i8() {
		return this.#view.getInt8(this.#take(1));
	}
	u16() {
		return this.#view.getUint16(this.#take(2), true);
	}
	i16() {
		return this.#view.getInt16(this.#take(2), true);
	}
	u32() {
		return this.#view.getUint32(this.#take(4), true);
	}
	i32() {
		return this.#view.getInt32(this.#take(4), true);
	}
	u64() {
		return this.#view.getBigUint64(this.#take(8), true);
	}
	i64() {
		return this.#view.getBigInt64(this.#take(8), true);
	}
	/** The `int` in the next eight bytes, as {@link readInt} reads one */
	int() {
		const at = this.#take(8);
		return readInt(this.#view, at);
	}
	f32() {
		return this.#view.getFloat32(this.#take(4), true);
	}
	f64() {
		return this.#view.getFloat64(this.#take(8), true);
	}
	/** An IEEE 754 binary16, which `DataView` does not read everywhere this SDK runs */
	f16() {
		return f16Value(this.u16());
	}
	/** Bit `at` of the bytes, counted least significant first within each byte */
	bit(at) {
		const byte = this.#bytes[at >>> 3];
		if (byte === void 0) refuse("a bit out of range");
		return (byte & 1 << at % 8) !== 0;
	}
	#take(n) {
		const at = this.#at;
		if (n < 0 || at + n > this.#bytes.length) refuse("bytes which run past the end");
		this.#at = at + n;
		return at;
	}
};
/**
* A run of slices addressed by a table of where each one ends.
*
* `ends[i]` is where slice `i` stops, counted from the start of the slices, so slice `i` runs
* from `ends[i - 1]` to `ends[i]` with nothing before the first. A row's var region is built
* this way, and so are the elements of an array of a variable kind.
*/
var Slices = class {
	#ends;
	#bytes;
	/** Reads a table of `count` ends where the reader stands, then takes the slices after it */
	constructor(r$1, count) {
		if (count * 4 > r$1.rest.length) refuse("more slices than the bytes could hold");
		this.#ends = new Uint32Array(count);
		let last = 0;
		for (let i = 0; i < count; i++) {
			const end = r$1.u32();
			if (end < last) refuse("slice ends out of order");
			last = end;
			this.#ends[i] = end;
		}
		this.#bytes = r$1.bytes(last);
	}
	/** How many bytes the slices take in all */
	get length() {
		return this.#bytes.length;
	}
	/** How many slices there are */
	get count() {
		return this.#ends.length;
	}
	/** Slice `index` */
	at(index) {
		if (index >= this.#ends.length) refuse("a slot out of range");
		const end = this.#ends[index];
		const start = index === 0 ? 0 : this.#ends[index - 1];
		return this.#bytes.subarray(start, end);
	}
};
/**
* The UTF-8 text of `bytes`, or a refusal naming `what` they were.
*
* Building a short ASCII string character by character rather than through the `TextDecoder`
* was measured and was slower, so every string goes through the decoder.
*/
function text(bytes, what) {
	try {
		return TEXT.decode(bytes);
	} catch {
		return refuse(`${what} that is not UTF-8`);
	}
}
/**
* A growable buffer with one method per kind of number, the writing counterpart of
* {@link ByteReader}. Everything this SDK writes goes through here, so the code above it names
* what it is writing rather than its width and byte order.
*/
var ByteWriter = class {
	#bytes;
	#view;
	#at = 0;
	/**
	* `capacity` is how many bytes to start with. A caller which knows the size it is about to
	* write passes it, which matters for a large one: growing from the default doubles its way
	* there, copying everything written so far each time.
	*/
	constructor(capacity = 256) {
		this.#bytes = new Uint8Array(capacity);
		this.#view = new DataView(this.#bytes.buffer);
	}
	/** The bytes written so far */
	get bytes() {
		return this.#bytes.subarray(0, this.#at);
	}
	/** How many bytes have been written */
	get length() {
		return this.#at;
	}
	#room(n) {
		const at = this.#at;
		if (at + n > this.#bytes.length) {
			let size = this.#bytes.length * 2;
			while (size < at + n) size *= 2;
			const grown = new Uint8Array(size);
			grown.set(this.#bytes);
			this.#bytes = grown;
			this.#view = new DataView(grown.buffer);
		}
		this.#at = at + n;
		return at;
	}
	u8(v) {
		const at = this.#room(1);
		this.#view.setUint8(at, v);
		return this;
	}
	i8(v) {
		const at = this.#room(1);
		this.#view.setInt8(at, v);
		return this;
	}
	u16(v) {
		const at = this.#room(2);
		this.#view.setUint16(at, v, true);
		return this;
	}
	i16(v) {
		const at = this.#room(2);
		this.#view.setInt16(at, v, true);
		return this;
	}
	u32(v) {
		const at = this.#room(4);
		this.#view.setUint32(at, v, true);
		return this;
	}
	i32(v) {
		const at = this.#room(4);
		this.#view.setInt32(at, v, true);
		return this;
	}
	u64(v) {
		const at = this.#room(8);
		this.#view.setBigUint64(at, v, true);
		return this;
	}
	i64(v) {
		const at = this.#room(8);
		this.#view.setBigInt64(at, v, true);
		return this;
	}
	f32(v) {
		const at = this.#room(4);
		this.#view.setFloat32(at, v, true);
		return this;
	}
	f64(v) {
		const at = this.#room(8);
		this.#view.setFloat64(at, v, true);
		return this;
	}
	/** An IEEE 754 binary16, which `DataView` does not write everywhere this SDK runs */
	f16(v) {
		return this.u16(f16Bits(v));
	}
	raw(bytes) {
		const at = this.#room(bytes.length);
		this.#bytes.set(bytes, at);
		return this;
	}
	/** UTF-8 text behind its length as a `u16`, as a shape writes a name or a table */
	u16Text(value) {
		const bytes = UTF8$2.encode(value);
		return this.u16(bytes.length).raw(bytes);
	}
	/** Overwrites the `u32` at `at`, for a length which is only known once its body is written */
	patchU32(at, v) {
		this.#view.setUint32(at, v, true);
		return this;
	}
};
const UTF8$2 = new TextEncoder();
/**
* Orders two names by the bytes of their UTF-8, which is the order a shape lists siblings in.
*
* JavaScript's `<` compares UTF-16 code units, which is a different order: a character outside
* the basic plane is a surrogate pair beginning `0xD800`, so `<` puts it before `U+E000`, while
* its UTF-8 begins `0xF0` and belongs after. Comparing the encoded bytes is what the format
* means, and keeps a shape this SDK writes readable by the one it reads.
*/
function byUtf8(a, b) {
	const x = UTF8$2.encode(a);
	const y = UTF8$2.encode(b);
	const shared = Math.min(x.length, y.length);
	for (let i = 0; i < shared; i++) {
		const diff = x[i] - y[i];
		if (diff !== 0) return diff;
	}
	return x.length - y.length;
}
/** Integers at or below this are read as numbers; larger ones stay `bigint`, as CBOR reads them */
const POW_2_53 = 2n ** 53n;
/** An `int` as the CBOR path reads the same value: a number while it is exact, else a `bigint` */
function int(value) {
	return value <= POW_2_53 && value >= -POW_2_53 ? Number(value) : value;
}
/**
* The `int` in the eight bytes at `at`.
*
* Reading it as a `bigint` and converting allocates one for every value, and almost every value
* a row holds is an ordinary integer. So the two halves are read as plain numbers whenever the
* high word shows the value cannot need more than 53 bits — it is the sign extension of one
* which does — and only the rest go the long way, where {@link int} settles the boundary
* exactly as it does on the CBOR path.
*/
function readInt(view, at) {
	const high = view.getInt32(at + 4, true);
	if (high >= -2097152 && high <= 2097151) return high * 4294967296 + view.getUint32(at, true);
	return int(view.getBigInt64(at, true));
}
/** The number an IEEE 754 binary16 bit pattern holds */
function f16Value(bits) {
	const sign = bits & 32768 ? -1 : 1;
	const exponent = bits >> 10 & 31;
	const fraction = bits & 1023;
	if (exponent === 0) return sign * 2 ** -24 * fraction;
	if (exponent === 31) return fraction ? NaN : sign * Number.POSITIVE_INFINITY;
	return sign * 2 ** (exponent - 25) * (1024 + fraction);
}
/** The bit pattern of `value` as an IEEE 754 binary16, rounding to nearest, ties to even */
function f16Bits(value) {
	if (Number.isNaN(value)) return 32256;
	const sign = value < 0 || Object.is(value, -0) ? 32768 : 0;
	const v = Math.abs(value);
	if (v === Number.POSITIVE_INFINITY) return sign | 31744;
	if (v === 0) return sign;
	const exponent = Math.floor(Math.log2(v));
	if (exponent < -14) return sign | Math.round(v / 2 ** -24);
	if (exponent > 15) return sign | 31744;
	const fraction = Math.round(v / 2 ** exponent / 2 ** -10) - 1024;
	if (fraction >= 1024) return sign | exponent + 16 << 10;
	return sign | exponent + 15 << 10 | fraction;
}
/**
* How a column holds its values. A fixed kind takes a slot of a known width in the row's fixed
* region, a variable kind a slot in the row's var region, and `object` takes neither: its value
* is built from the columns which follow it.
*/
let Kind = /* @__PURE__ */ function(Kind$1) {
	Kind$1[Kind$1["Bool"] = 1] = "Bool";
	Kind$1[Kind$1["Int"] = 2] = "Int";
	Kind$1[Kind$1["Float"] = 3] = "Float";
	Kind$1[Kind$1["Datetime"] = 4] = "Datetime";
	Kind$1[Kind$1["Duration"] = 5] = "Duration";
	Kind$1[Kind$1["Uuid"] = 6] = "Uuid";
	Kind$1[Kind$1["Bit"] = 7] = "Bit";
	Kind$1[Kind$1["I8"] = 8] = "I8";
	Kind$1[Kind$1["I16"] = 9] = "I16";
	Kind$1[Kind$1["I32"] = 10] = "I32";
	Kind$1[Kind$1["U8"] = 11] = "U8";
	Kind$1[Kind$1["U16"] = 12] = "U16";
	Kind$1[Kind$1["U32"] = 13] = "U32";
	Kind$1[Kind$1["U64"] = 14] = "U64";
	Kind$1[Kind$1["F32"] = 15] = "F32";
	Kind$1[Kind$1["String"] = 16] = "String";
	Kind$1[Kind$1["Bytes"] = 17] = "Bytes";
	Kind$1[Kind$1["Decimal"] = 18] = "Decimal";
	Kind$1[Kind$1["Record"] = 19] = "Record";
	Kind$1[Kind$1["Dynamic"] = 20] = "Dynamic";
	Kind$1[Kind$1["Array"] = 22] = "Array";
	Kind$1[Kind$1["F16"] = 23] = "F16";
	Kind$1[Kind$1["DatetimeNs"] = 24] = "DatetimeNs";
	Kind$1[Kind$1["DurationNs"] = 25] = "DurationNs";
	Kind$1[Kind$1["Object"] = 32] = "Object";
	return Kind$1;
}({});
const KINDS = new Set(Object.values(Kind).filter((k) => typeof k === "number"));
/** The kind a wire code names */
function kindOf$1(code) {
	if (!KINDS.has(code)) refuse("an unknown column kind");
	return code;
}
/**
* The width of a fixed kind's slot in bytes, or `undefined` for a variable kind, for `object`,
* and for `bit`, which takes one bit rather than a whole byte.
*/
function fixedWidth(kind) {
	switch (kind) {
		case Kind.Bool:
		case Kind.I8:
		case Kind.U8: return 1;
		case Kind.I16:
		case Kind.U16:
		case Kind.F16: return 2;
		case Kind.I32:
		case Kind.U32:
		case Kind.F32: return 4;
		case Kind.Int:
		case Kind.Float:
		case Kind.U64:
		case Kind.DatetimeNs:
		case Kind.DurationNs: return 8;
		case Kind.Datetime:
		case Kind.Duration: return 12;
		case Kind.Uuid: return 16;
		default: return void 0;
	}
}
/** Whether the kind is held in a var slot */
function isVar(kind) {
	return kind === Kind.String || kind === Kind.Bytes || kind === Kind.Decimal || kind === Kind.Record || kind === Kind.Dynamic || kind === Kind.Array;
}
/** Whether the kind may be the element kind of an array */
function isElement(kind) {
	switch (kind) {
		case Kind.String:
		case Kind.Bytes:
		case Kind.Decimal:
		case Kind.Int:
		case Kind.Float:
		case Kind.I8:
		case Kind.I16:
		case Kind.I32:
		case Kind.U8:
		case Kind.U16:
		case Kind.U32:
		case Kind.U64:
		case Kind.F16:
		case Kind.F32:
		case Kind.Bool:
		case Kind.Uuid:
		case Kind.Datetime:
		case Kind.Duration: return true;
		default: return false;
	}
}
/** Whether the kind keeps an overflow slot for the values its fixed slot cannot hold */
function hasOverflow(kind) {
	return kind === Kind.DatetimeNs || kind === Kind.DurationNs;
}
/**
* One value of a fixed kind, read where `r` stands.
*
* Both a column's slot in the fixed region and an element of an array of a fixed kind are a
* value of that kind at an offset, so both read through here.
*/
function fixedValue(kind, view, at, ctx) {
	switch (kind) {
		case Kind.Bool: return bool(view.getUint8(at));
		case Kind.Int: return readInt(view, at);
		case Kind.Float: return view.getFloat64(at, true);
		case Kind.I8: return ctx.visit(new I8(view.getInt8(at)));
		case Kind.I16: return ctx.visit(new I16(view.getInt16(at, true)));
		case Kind.I32: return ctx.visit(new I32(view.getInt32(at, true)));
		case Kind.U8: return ctx.visit(new U8(view.getUint8(at)));
		case Kind.U16: return ctx.visit(new U16(view.getUint16(at, true)));
		case Kind.U32: return ctx.visit(new U32(view.getUint32(at, true)));
		case Kind.U64: return ctx.visit(new U64(view.getBigUint64(at, true)));
		case Kind.F16: return ctx.visit(new F16(f16Value(view.getUint16(at, true))));
		case Kind.F32: return ctx.visit(new F32(view.getFloat32(at, true)));
		case Kind.Uuid: return ctx.visit(new Uuid(new Uint8Array(view.buffer, view.byteOffset + at, 16).slice()));
		case Kind.Datetime: return datetime(view.getBigInt64(at, true), view.getUint32(at + 8, true), ctx);
		case Kind.Duration: return duration(view.getBigUint64(at, true), view.getUint32(at + 8, true), ctx);
		default: return refuse("a value of a kind which has no fixed slot");
	}
}
/**
* One value of a variable kind, held in `slice`. `table` is the one its column names for every
* record it holds, and `element` the kind of every element when it is an array.
*/
function varValue(kind, slice, ctx, table = "", element) {
	switch (kind) {
		case Kind.String: return text(slice, "a string");
		case Kind.Bytes: return copy(slice);
		case Kind.Decimal: return ctx.visit(new Decimal(text(slice, "a decimal")));
		case Kind.Dynamic: return dynamic(slice, ctx);
		case Kind.Record: return record(slice, table, ctx);
		case Kind.Array: return array(slice, element, ctx);
		default: return refuse("a value of a kind which has no var slot");
	}
}
/** The one CBOR item a dynamic slice holds */
function dynamic(slice, ctx) {
	if (slice.length === 0) refuse("an empty dynamic slice");
	return ctx.dynamic(slice);
}
/**
* The 8-byte nanosecond form of a datetime, which escapes to a 12-byte overflow slice at the
* ends of its range.
*/
function datetimeNs(view, at, overflow, ctx) {
	const ns = view.getBigInt64(at, true);
	if (ns === MIN_I64 || ns === MAX_I64) {
		const [secs$1, nanos$1] = wide(overflow(), "a datetime");
		return datetime(secs$1, nanos$1, ctx);
	}
	const billion = 1000000000n;
	let secs = ns / billion;
	let nanos = ns % billion;
	if (nanos < 0n) {
		secs -= 1n;
		nanos += billion;
	}
	return datetime(secs, Number(nanos), ctx);
}
/** The 8-byte nanosecond form of a duration, which escapes the same way */
function durationNs(view, at, overflow, ctx) {
	const ns = view.getBigUint64(at, true);
	if (ns === MAX_U64) {
		const [secs, nanos] = wide(overflow(), "a duration");
		return duration(BigInt.asUintN(64, secs), nanos, ctx);
	}
	return duration(ns / 1000000000n, Number(ns % 1000000000n), ctx);
}
const MIN_I64 = -(2n ** 63n);
const MAX_I64 = 2n ** 63n - 1n;
const MAX_U64 = 2n ** 64n - 1n;
/** The seconds and nanoseconds of a 12-byte overflow slice */
function wide(slice, what) {
	if (slice.length !== 12) refuse(`${what} overflow that is not 12 bytes`);
	const view = new DataView(slice.buffer, slice.byteOffset, 12);
	return [view.getBigInt64(0, true), view.getUint32(8, true)];
}
function bool(byte) {
	if (byte > 1) refuse("a bool that is neither 0 nor 1");
	return byte === 1;
}
/** A byte string decodes to an ArrayBuffer, as it does on the CBOR path */
function copy(slice) {
	return slice.slice().buffer;
}
/** A datetime of whole seconds and nanoseconds, which a leap second may carry past a billion */
function datetime(secs, nanos, ctx) {
	if (nanos >= 2e9) refuse("a datetime's nanoseconds out of range");
	if (ctx.nativeDates) return ctx.visit(/* @__PURE__ */ new Date(Number(secs) * 1e3 + nanos / 1e6));
	return ctx.visit(new DateTime([secs, BigInt(nanos)]));
}
/** A duration of whole seconds and nanoseconds */
function duration(secs, nanos, ctx) {
	if (nanos >= 1e9) refuse("a duration's nanoseconds out of range");
	return ctx.visit(new Duration([secs, BigInt(nanos)]));
}
/**
* A record slice: a key kind byte, the table when the column does not name one for every value,
* and then the id in the form that key kind gives it.
*/
function record(slice, columnTable, ctx) {
	const r$1 = new ByteReader(slice);
	const code = r$1.u8();
	if (code === 3) {
		const value = dynamic(r$1.rest, ctx);
		if (!(value instanceof _RecordId)) refuse("a record held as CBOR that is not a record id");
		if (columnTable !== "" && value.table.name !== columnTable) refuse("a record held as CBOR that names another table than its column");
		return value;
	}
	const table = ctx.table(columnTable === "" ? r$1.text(r$1.u16(), "a table") : columnTable);
	switch (code) {
		case 0: {
			const id$1 = r$1.int();
			if (!r$1.done) refuse("bytes past a record's number id");
			return ctx.visit(new _RecordId(table, id$1));
		}
		case 1: return ctx.visit(new _RecordId(table, text(r$1.rest, "a record id")));
		case 2: {
			const id$1 = r$1.bytes(16).slice();
			if (!r$1.done) refuse("bytes past a record's uuid id");
			return ctx.visit(new _RecordId(table, new Uuid(id$1)));
		}
		default: return refuse("an unknown record key kind");
	}
}
/** An array slice: its count, then its elements, all of one kind */
function array(slice, element, ctx) {
	const r$1 = new ByteReader(slice);
	const count = r$1.u32();
	if (isVar(element)) {
		const slices = new Slices(r$1, count);
		if (!r$1.done) refuse("bytes past an array's elements");
		const out$1 = [];
		for (let i = 0; i < count; i++) out$1.push(varValue(element, slices.at(i), ctx));
		return out$1;
	}
	const width = fixedWidth(element);
	if (width === void 0) refuse("an invalid array element kind");
	const elements = r$1.rest;
	if (elements.length !== count * width) refuse("an array of the wrong length");
	const view = new DataView(elements.buffer, elements.byteOffset, elements.byteLength);
	const out = new Array(count);
	for (let i = 0; i < count; i++) out[i] = fixedValue(element, view, i * width, ctx);
	return out;
}
/**
* A cursor over the rows of one batch:
*
* ```
* row = presence[ceil(presence_bits / 8)]  fixed[fixed_size]  ends[var_count]:u32  var[L]
* ```
*
* The presence region says, for each column which may be missing, whether it holds a value, is
* absent, is `NULL`, or is present and `NONE`. The fixed region holds the slots of the fixed
* kinds at the offsets the shape gave them, and the var region holds the slices of the variable
* ones, addressed through the ends table.
*
* One cursor reads every row of a batch. A row is read where it lies rather than being cut out
* of the batch first, so reading a row allocates what the row's values need and nothing else:
* the regions are offsets into the batch's own bytes, and the ends table is read into a buffer
* the cursor keeps.
*/
var Row = class {
	#shape;
	#ctx;
	#bytes;
	#view;
	/** The ends of this row's var slices, reused from row to row */
	#ends;
	/** Where this row's regions begin, counted from the start of the batch */
	#presenceAt = 0;
	#fixedAt = 0;
	#varAt = 0;
	constructor(shape, bytes, ctx) {
		this.#shape = shape;
		this.#ctx = ctx;
		this.#bytes = bytes;
		this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		this.#ends = new Uint32Array(shape.varCount);
	}
	/**
	* Points the cursor at the row which begins at `at`, and returns how many bytes it takes.
	*
	* Everything a value reads afterwards lies inside those bytes: the shape has already been
	* checked, so every slot it names is inside the region it belongs to, and this bounds the
	* regions themselves against the batch.
	*/
	seek(at) {
		const shape = this.#shape;
		const header = shape.headerLength;
		if (at + header > this.#bytes.length) refuse("a truncated row");
		this.#presenceAt = at;
		this.#fixedAt = at + shape.presenceLength;
		const endsAt = this.#fixedAt + shape.fixedSize;
		this.#varAt = at + header;
		const mask = shape.paddingMask;
		if (mask !== 0) {
			const last$1 = this.#view.getUint8(this.#fixedAt - 1);
			if ((last$1 & mask) !== 0) refuse("presence padding bits set");
		}
		let last = 0;
		for (let i = 0; i < shape.varCount; i++) {
			const end = this.#view.getUint32(endsAt + 4 * i, true);
			if (end < last) refuse("var ends out of order");
			last = end;
			this.#ends[i] = end;
		}
		const total = header + last;
		if (at + total > this.#bytes.length) refuse("a truncated row");
		return total;
	}
	/** The row the cursor points at */
	read() {
		return this.#shape.root === ROOT_VALUE ? dynamic(this.slice(this.#shape.rootRest), this.#ctx) : this.node(void 0);
	}
	/** The object a node builds: the entries of its remainder, then its columns */
	node(node) {
		const open = this.#shape.rest(node) !== NO_SLOT;
		const object = open ? this.#remainder(node) : {};
		const columns = this.#shape.columns;
		const children = this.#shape.children(node);
		for (let i = 0; i < children.length; i++) {
			const at = children[i];
			const column = columns[at];
			const state = this.#state(column);
			if (state === STATE_ABSENT && (column.flags & MAY_BE_ABSENT) !== 0) continue;
			if (open && Object.hasOwn(object, column.name)) refuse("a remainder key that has a column");
			object[column.name] = this.#stated(at, column, state);
		}
		return object;
	}
	/** What a column holds, given the state its presence bits put it in */
	#stated(at, column, state) {
		switch (state) {
			case STATE_VALUE: return this.#value(at, column);
			case STATE_NULL:
				if ((column.flags & MAY_BE_NULL) !== 0) return null;
				break;
			case STATE_NONE:
				if ((column.flags & MAY_BE_ABSENT) !== 0) return void 0;
				break;
		}
		return refuse("a presence state the column does not allow");
	}
	/** The value of a column whose presence says it holds one */
	#value(at, column) {
		const slot = column.slot;
		switch (column.kind) {
			case Kind.Object: return this.node(at);
			case Kind.Bit: return this.#bit(this.#fixedAt, slot);
			case Kind.DatetimeNs: return datetimeNs(this.#view, this.#fixedAt + slot, () => this.slice(column.rest), this.#ctx);
			case Kind.DurationNs: return durationNs(this.#view, this.#fixedAt + slot, () => this.slice(column.rest), this.#ctx);
			default: return isVar(column.kind) ? varValue(column.kind, this.slice(slot), this.#ctx, column.table, column.element) : fixedValue(column.kind, this.#view, this.#fixedAt + slot, this.#ctx);
		}
	}
	/** The bytes of var slot `slot` of this row */
	slice(slot) {
		if (slot >= this.#ends.length) refuse("a var slot out of range");
		const end = this.#ends[slot];
		const start = slot === 0 ? 0 : this.#ends[slot - 1];
		return this.#bytes.subarray(this.#varAt + start, this.#varAt + end);
	}
	/** The entries of `node`'s remainder: the keys it holds which have no column */
	#remainder(node) {
		const rest = this.#shape.rest(node);
		if (rest === NO_SLOT) return {};
		const slice = this.slice(rest);
		if (slice.length === 0) return {};
		const entries$1 = dynamic(slice, this.#ctx);
		const proto = typeof entries$1 === "object" && entries$1 !== null ? Object.getPrototypeOf(entries$1) : false;
		if (proto !== Object.prototype && proto !== null) refuse("a remainder that is not an object");
		return entries$1;
	}
	/** `column`'s presence state, read from the bits its flags give it */
	#state(column) {
		const at = column.presence;
		switch (presenceWidth(column.flags)) {
			case 0: return STATE_VALUE;
			case 1:
				if (this.#bit(this.#presenceAt, at)) return STATE_VALUE;
				return (column.flags & MAY_BE_ABSENT) !== 0 ? STATE_ABSENT : STATE_NULL;
			default: return (this.#bit(this.#presenceAt, at) ? 1 : 0) | (this.#bit(this.#presenceAt, at + 1) ? 1 : 0) << 1;
		}
	}
	/** Bit `at` of the region which begins at `base`, least significant first within a byte */
	#bit(base, at) {
		return (this.#view.getUint8(base + (at >>> 3)) & 1 << at % 8) !== 0;
	}
};
/** One row of `shape` at the start of `bytes`: its value, and the bytes it took */
function readRow(shape, bytes, ctx) {
	const row = new Row(shape, bytes, ctx);
	const used = row.seek(0);
	return [row.read(), used];
}
/** The children of a node which has none */
const EMPTY$1 = [];
/**
* A validated shape: the row layout its columns imply, and the columns themselves depth-first.
*
* A shape is checked once, when the SHAPE message which announces it is read, so that the rows
* which follow can be read without re-checking their layout. Every slot a column names is known
* to lie inside the region it belongs to, so reading a row only has to bound its own bytes.
*/
var Shape = class Shape$1 {
	/** What each row is: `ROOT_OBJECT` or `ROOT_VALUE` */
	root;
	/** The bits of a row's presence region */
	presenceBits;
	/** The bytes of a row's fixed region */
	fixedSize;
	/** The number of var slots in a row */
	varCount;
	/** The root's remainder slot, `NO_SLOT` when closed; or a value root's value slot */
	rootRest;
	/** The columns, depth-first */
	columns;
	/** For column `i`, the index past its subtree */
	#ends;
	/** The bytes of a row before its var region */
	#header;
	/** The deepest nesting of object columns */
	#depth;
	/** The bits of a row's last presence byte which must be zero */
	#paddingMask;
	/** The root's direct children, and each object column's, worked out once */
	#rootChildren;
	#childrenOf;
	constructor(root, presenceBits, fixedSize, varCount, rootRest, columns) {
		if (columns.length > MAX_COLUMNS) refuse("too many columns");
		if (fixedSize > MAX_FIXED) refuse("a fixed region too large");
		if (presenceBits > 2 * MAX_COLUMNS) refuse("too many presence states");
		if (varCount > 2 * MAX_COLUMNS + 1) refuse("too many var slots");
		if (root === ROOT_VALUE) {
			if (columns.length > 0 || rootRest >= varCount) refuse("a value root with columns or no value slot");
		} else if (rootRest !== NO_SLOT && rootRest >= varCount) refuse("a remainder slot out of range");
		this.root = root;
		this.presenceBits = presenceBits;
		this.fixedSize = fixedSize;
		this.varCount = varCount;
		this.rootRest = rootRest;
		this.columns = columns;
		this.#ends = new Uint32Array(columns.length);
		this.#depth = this.#checkNode(0, columns.length, 0);
		this.#header = presenceBytes(presenceBits) + fixedSize + 4 * varCount;
		const spare = presenceBits % 8;
		this.#paddingMask = spare === 0 ? 0 : 255 << spare & 255;
		this.#rootChildren = this.#childrenBetween(0, columns.length);
		this.#childrenOf = new Array(columns.length);
		for (let at = 0; at < columns.length; at++) if (columns[at].kind === Kind.Object) this.#childrenOf[at] = this.#childrenBetween(at + 1, this.#ends[at]);
	}
	/** The columns which are direct children of the node spanning `start` to `end` */
	#childrenBetween(start, end) {
		const out = [];
		for (let i = start; i < end; i = this.#ends[i]) out.push(i);
		return out;
	}
	/**
	* Checks the columns of one node, which run from `start` to `end`, filling in where each
	* column's subtree stops. Returns how deeply objects nest below it.
	*/
	#checkNode(start, end, depth) {
		if (depth >= MAX_DEPTH) refuse("objects nested too deep");
		let deepest = 0;
		let at = start;
		let previous;
		while (at < end) {
			const column = this.columns[at];
			this.#checkName(column, previous);
			this.#checkFlags(column);
			this.#checkKind(column);
			this.#checkSlot(column);
			previous = column.name;
			const stop = at + 1 + column.children;
			if (stop > end) refuse("children past their parent");
			if (column.kind === Kind.Object) {
				if (column.rest !== NO_SLOT && column.rest >= this.varCount) refuse("a remainder slot out of range");
				deepest = Math.max(deepest, 1 + this.#checkNode(at + 1, stop, depth + 1));
			}
			this.#ends[at] = stop;
			at = stop;
		}
		return deepest;
	}
	/** A name is non-empty, and siblings are in the byte order of their UTF-8, so all distinct */
	#checkName(column, previous) {
		if (column.name === "") refuse("an empty column name");
		if (previous !== void 0 && byUtf8(previous, column.name) >= 0) refuse("column names out of order");
	}
	/** The flags are the two the format has, and the presence bits they imply are in range */
	#checkFlags(column) {
		if ((column.flags & ~(MAY_BE_ABSENT | MAY_BE_NULL)) !== 0) refuse("unknown column flags");
		const width = presenceWidth(column.flags);
		const inRange = width === 0 ? column.presence === NO_SLOT : column.presence + width <= this.presenceBits;
		if (!inRange) refuse("a presence index out of range");
	}
	/** What a column carries beyond its kind belongs to that kind: a table, an element, children */
	#checkKind(column) {
		if (column.kind !== Kind.Record && column.table !== "") refuse("a table on a column that is not a record");
		if (column.kind === Kind.Array) {
			if (column.element === void 0 || !isElement(column.element)) refuse("an array of no element kind");
		} else if (column.element !== void 0) refuse("an element kind on a column that is not an array");
		if (column.kind !== Kind.Object && column.children !== 0) refuse("children on a column that is not an object");
		if (hasOverflow(column.kind)) {
			if (column.rest >= this.varCount) refuse("an overflow slot out of range");
		} else if (column.kind !== Kind.Object && column.rest !== NO_SLOT) refuse("a remainder on a column that is not an object");
	}
	/**
	* The column's slot lies inside the region its kind is held in, so reading a row only has
	* to bound its own bytes rather than re-check the layout for every row.
	*/
	#checkSlot(column) {
		const fixed = fixedWidth(column.kind);
		if (column.kind === Kind.Bit) {
			if (column.slot >= this.fixedSize * 8) refuse("a bit slot out of range");
		} else if (fixed !== void 0) {
			if (column.slot + fixed > this.fixedSize) refuse("a fixed slot out of range");
		} else if (isVar(column.kind)) {
			if (column.slot >= this.varCount) refuse("a var slot out of range");
		} else if (column.slot !== NO_SLOT) refuse("a slot on an object column");
	}
	/** The bytes of a row before its var region */
	get headerLength() {
		return this.#header;
	}
	/** The bytes of a row's presence region */
	get presenceLength() {
		return presenceBytes(this.presenceBits);
	}
	/** Where a row's ends table starts */
	get endsAt() {
		return this.presenceLength + this.fixedSize;
	}
	/** The deepest nesting of object columns */
	get depth() {
		return this.#depth;
	}
	/** The bits of a row's last presence byte which must be zero, or `0` when it is full */
	get paddingMask() {
		return this.#paddingMask;
	}
	/**
	* The indices of the child columns of `node`, or of the root when it is `undefined`.
	*
	* Worked out once per shape rather than once per node per row: a shape is announced before
	* the rows which name it, so everything about its layout is settled before any row is read.
	*/
	children(node) {
		return (node === void 0 ? this.#rootChildren : this.#childrenOf[node]) ?? EMPTY$1;
	}
	/** The remainder slot of `node`, or of the root when it is `undefined` */
	rest(node) {
		return node === void 0 ? this.rootRest : this.columns[node].rest;
	}
	/**
	* A shape built from its parts, checked by the same rules a shape read off the wire is.
	* A shape derived from values to send goes through here, so a shape this SDK writes can
	* never be one it would refuse to read.
	*/
	static of(def) {
		return new Shape$1(def.root ?? ROOT_OBJECT, def.presenceBits ?? 0, def.fixedSize ?? 0, def.varCount ?? 0, def.rootRest ?? NO_SLOT, def.columns ?? []);
	}
	/** The SHAPE payload of this shape, past its shape id */
	encode() {
		const out = new ByteWriter().u8(this.root).u32(this.presenceBits).u32(this.fixedSize).u32(this.varCount).u32(this.rootRest).u32(this.columns.length);
		for (const column of this.columns) out.u16Text(column.name).u8(column.kind).u8(column.element ?? 0).u8(column.flags).u32(column.presence).u32(column.slot).u16Text(column.table).u32(column.children).u32(column.rest);
		return out.bytes;
	}
	/** Reads a shape from a SHAPE payload past its shape id, which it must fill exactly */
	static decode(bytes) {
		const r$1 = new ByteReader(bytes);
		const root = r$1.u8();
		if (root !== ROOT_OBJECT && root !== ROOT_VALUE) refuse("an unknown shape root");
		const presenceBits = r$1.u32();
		const fixedSize = r$1.u32();
		const varCount = r$1.u32();
		const rootRest = r$1.u32();
		const count = r$1.u32();
		if (count > MAX_COLUMNS) refuse("too many columns");
		const columns = [];
		for (let i = 0; i < count; i++) {
			const name = r$1.text(r$1.u16(), "a column name");
			const kind = kindOf$1(r$1.u8());
			const elementCode = r$1.u8();
			const element = elementCode === 0 ? void 0 : kindOf$1(elementCode);
			const flags = r$1.u8();
			const presence = r$1.u32();
			const slot = r$1.u32();
			const table = r$1.text(r$1.u16(), "a table name");
			const children = r$1.u32();
			const rest = r$1.u32();
			columns.push({
				name,
				kind,
				element,
				flags,
				presence,
				slot,
				table,
				children,
				rest
			});
		}
		if (!r$1.done) refuse("bytes past a shape's columns");
		return new Shape$1(root, presenceBits, fixedSize, varCount, rootRest, columns);
	}
};
/** The visitor a codec without one uses: every value is already what it should be */
const identity = (value) => value;
/**
* A block of rows, still in its bytes.
*
* Tag 57 decodes to this rather than to the rows themselves, because the shape ids a block
* names live in a scope which is wider than the one CBOR item: the frames of one `query_stream`
* share a scope, and so do the notifications of one live query. The envelope is decoded first,
* which says which scope a block belongs to, and the block is read against it afterwards.
*/
var ShapedBlock = class {
	/** The block's contents: its version byte and messages, past the CBOR byte string head */
	contents;
	constructor(contents) {
		this.contents = contents;
	}
};
/**
* The shapes announced in one scope, and the reader which turns that scope's blocks into rows.
*
* ```
* block    = version:u8  message*
* message  = type:u8  length:u32  payload[length]
* SHAPE    = shape_id:u32  shape
* BATCH    = shape_id:u32  row_count:u32  row[row_count]
* ```
*
* A SHAPE announces a shape under an id; the batches after it name the shape by that id, in the
* same block or in a later one of the same scope. Announcing an id again replaces it for the
* batches which follow.
*/
var BlockReader = class {
	#shapes = /* @__PURE__ */ new Map();
	/** Forgets every shape, ending the scope */
	reset() {
		this.#shapes.clear();
	}
	/** The rows of `block`, read against the shapes this scope has announced so far */
	read(block, dynamic$1, options = {}) {
		const r$1 = new ByteReader(block.contents);
		if (r$1.u8() !== VERSION) refuse("an unknown block version");
		const rows = [];
		const tables = /* @__PURE__ */ new Map();
		const ctx = {
			dynamic: dynamic$1,
			nativeDates: options.nativeDates === true,
			visit: options.visit ?? identity,
			table(name) {
				let table = tables.get(name);
				if (!table) {
					table = new _Table(name);
					tables.set(name, table);
				}
				return table;
			}
		};
		while (!r$1.done) {
			const type = r$1.u8();
			const payload = new ByteReader(r$1.bytes(r$1.u32()));
			switch (type) {
				case MESSAGE_SHAPE:
					this.#announce(payload);
					break;
				case MESSAGE_BATCH:
					this.#batch(payload, rows, ctx);
					break;
				default: break;
			}
		}
		return rows;
	}
	/** SHAPE: the shape is checked once here, so the rows which name it need not be */
	#announce(payload) {
		const id$1 = payload.u32();
		const shape = Shape.decode(payload.rest);
		if (!this.#shapes.has(id$1) && this.#shapes.size >= MAX_SHAPES) refuse("too many shapes in one scope");
		this.#shapes.set(id$1, shape);
	}
	/** BATCH: rows of one announced shape, back to back, each one as long as its own bytes say */
	#batch(payload, rows, ctx) {
		const id$1 = payload.u32();
		const count = payload.u32();
		const shape = this.#shapes.get(id$1);
		if (!shape) refuse("a batch of an unannounced shape");
		if (shape.headerLength === 0 && count > MAX_EMPTY_ROWS) refuse("a batch of too many empty rows");
		const bytes = payload.rest;
		const row = new Row(shape, bytes, ctx);
		let at = 0;
		for (let i = 0; i < count; i++) {
			const used = row.seek(at);
			rows.push(row.read());
			at += used;
		}
		if (at !== bytes.length) refuse("bytes past a batch's rows");
	}
};
/** One row of `shape` at the start of `bytes`: its value, and the bytes it took */
function decodeRow(shape, bytes, dynamic$1, options = {}) {
	return readRow(shape, bytes, {
		dynamic: dynamic$1,
		nativeDates: options.nativeDates === true,
		visit: options.visit ?? identity,
		table: (name) => new _Table(name)
	});
}
/**
* Working out which kind holds a JavaScript value.
*
* This is the one place a value is classified, so that the shape a batch is measured against
* and the bytes it is written as can never disagree about what something is.
*/
/** Stands for "the rows did not agree", which is not a kind a column can be given */
const MIXED = -1;
/** The bounds of a SurrealDB `int`, which is an i64 */
const I64_MIN$1 = -(2n ** 63n);
const I64_MAX$1 = 2n ** 63n - 1n;
const SIZED = new Map([
	[I8, Kind.I8],
	[I16, Kind.I16],
	[I32, Kind.I32],
	[U8, Kind.U8],
	[U16, Kind.U16],
	[U32, Kind.U32],
	[U64, Kind.U64],
	[F16, Kind.F16],
	[F32, Kind.F32]
]);
/** The kind which holds `value`, which is never `null` or `undefined` — those are states */
function kindOf(value) {
	switch (typeof value) {
		case "boolean": return Kind.Bool;
		case "string": return Kind.String;
		case "bigint": return value >= I64_MIN$1 && value <= I64_MAX$1 ? Kind.Int : Kind.Dynamic;
		case "number":
			if (!Number.isInteger(value) || Object.is(value, -0)) return Kind.Float;
			return value >= -(2 ** 63) && value < 2 ** 63 ? Kind.Int : Kind.Float;
	}
	if (value instanceof SizedNumber) return SIZED.get(value.constructor) ?? Kind.Dynamic;
	if (value instanceof DateTime) return Kind.Datetime;
	if (value instanceof Duration) return Kind.Duration;
	if (value instanceof Uuid) return Kind.Uuid;
	if (value instanceof Decimal) return Kind.Decimal;
	if (value instanceof _RecordId) return Kind.Record;
	if (value instanceof Uint8Array || value instanceof ArrayBuffer) return Kind.Bytes;
	if (Array.isArray(value)) return Kind.Array;
	if (isPlainObject(value)) return Kind.Object;
	return Kind.Dynamic;
}
/**
* The element kind of an array: one kind, `"empty"` when the array says nothing about what it
* holds, or `"mixed"` when its elements cannot share a column.
*/
function elementOf(value) {
	if (value.length === 0) return "empty";
	let element;
	for (const item of value) {
		if (item === null || item === void 0) return "mixed";
		const kind = kindOf(item);
		if (!isElement(kind)) return "mixed";
		if (element === void 0) element = kind;
		else if (element !== kind) return "mixed";
	}
	return element;
}
/** Whether every row is a plain object, which is the only thing an OBJECT root can hold */
function isPlainObject(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
/**
* Writing rows into a block.
*
* Only a request ever carries a block this SDK wrote: the server reads one wherever a CBOR
* request holds a value, and answers are read, never written. A row is written in the shape
* {@link deriveShape} found for the whole array, so every row fits by construction and a write
* which does not fit is a bug rather than something to recover from.
*/
/** One block: a SHAPE message announcing `shape` under id 1, then a BATCH of every row */
function writeBlock(shape, rows, dynamic$1) {
	const out = new ByteWriter().u8(VERSION);
	const payload = shape.encode();
	out.u8(MESSAGE_SHAPE).u32(payload.length + 4).u32(1).raw(payload);
	out.u8(MESSAGE_BATCH);
	const lengthAt = out.length;
	out.u32(0).u32(1).u32(rows.length);
	const body = out.length;
	for (const row of rows) writeRow(out, shape, row, dynamic$1);
	out.patchU32(lengthAt, out.length - body + 8);
	return out.bytes;
}
/**
* One row:
*
* ```
* row = presence[ceil(presence_bits / 8)]  fixed[fixed_size]  ends[var_count]:u32  var[L]
* ```
*
* The presence and fixed regions are a fixed size, so they are built in place and copied in;
* the var slices are gathered as they are produced, which is what gives the ends table.
*/
function writeRow(out, shape, row, dynamic$1) {
	const object = row;
	const presence = new Uint8Array(presenceBytes(shape.presenceBits));
	const fixed = new Uint8Array(shape.fixedSize);
	const fixedView = new DataView(fixed.buffer);
	const slices = new Array(shape.varCount).fill(EMPTY);
	writeNode(shape, void 0, object, presence, fixed, fixedView, slices, dynamic$1);
	out.raw(presence).raw(fixed);
	let end = 0;
	for (const slice of slices) {
		end += slice.length;
		out.u32(end);
	}
	for (const slice of slices) out.raw(slice);
}
const EMPTY = new Uint8Array(0);
/**
* Writes the columns of one node — the root, or an `object` column's subtree — from the object
* which holds them.
*
* An object column has no slot of its own: its value is its children, which are the columns
* which follow it. A node which is not present leaves every slot beneath it zero and every var
* slice beneath it empty, which is the same bytes a row without those keys writes, so nothing
* has to be written for it at all.
*/
function writeNode(shape, node, object, presence, fixed, fixedView, slices, dynamic$1) {
	for (const at of shape.children(node)) {
		const column = shape.columns[at];
		const held = Object.hasOwn(object, column.name);
		const value = object[column.name];
		const state = !held || value === void 0 ? held ? STATE_NONE : STATE_ABSENT : value === null ? STATE_NULL : STATE_VALUE;
		setState(presence, column, state);
		if (state !== STATE_VALUE) continue;
		if (column.kind === Kind.Object) writeNode(shape, at, value, presence, fixed, fixedView, slices, dynamic$1);
		else if (isVar(column.kind)) slices[column.slot] = varBytes(column, value, dynamic$1);
		else writeFixed(fixedView, fixed, column.slot, column.kind, value);
	}
}
/** Puts `column` into `state`, in the bits its flags give it */
function setState(presence, column, state) {
	const width = presenceWidth(column.flags);
	if (width === 0) {
		if (state !== STATE_VALUE) refuse("a required column which holds no value");
		return;
	}
	if (width === 1) {
		const clear = (column.flags & MAY_BE_ABSENT) !== 0 ? STATE_ABSENT : STATE_NULL;
		if (state !== STATE_VALUE && state !== clear) refuse("a column in a state its flags do not allow");
		if (state === STATE_VALUE) setBit(presence, column.presence);
		return;
	}
	if (state & 1) setBit(presence, column.presence);
	if (state & 2) setBit(presence, column.presence + 1);
}
function setBit(bytes, at) {
	bytes[at >>> 3] = bytes[at >>> 3] | 1 << at % 8;
}
/** Writes a value of a fixed kind into its slot */
function writeFixed(view, bytes, at, kind, value) {
	switch (kind) {
		case Kind.Bool:
			view.setUint8(at, value === true ? 1 : 0);
			return;
		case Kind.Int:
			view.setBigInt64(at, BigInt(value), true);
			return;
		case Kind.Float:
			view.setFloat64(at, value, true);
			return;
		case Kind.I8:
			view.setInt8(at, sized(value));
			return;
		case Kind.I16:
			view.setInt16(at, sized(value), true);
			return;
		case Kind.I32:
			view.setInt32(at, sized(value), true);
			return;
		case Kind.U8:
			view.setUint8(at, sized(value));
			return;
		case Kind.U16:
			view.setUint16(at, sized(value), true);
			return;
		case Kind.U32:
			view.setUint32(at, sized(value), true);
			return;
		case Kind.U64:
			view.setBigUint64(at, BigInt(value.value), true);
			return;
		case Kind.F16:
			view.setUint16(at, f16Bits(sized(value)), true);
			return;
		case Kind.F32:
			view.setFloat32(at, sized(value), true);
			return;
		case Kind.Uuid:
			bytes.set(new Uuid(value).toUint8Array(), at);
			return;
		case Kind.Datetime: {
			const [secs, nanos] = value.toCompact();
			view.setBigInt64(at, secs, true);
			view.setUint32(at + 8, Number(nanos), true);
			return;
		}
		case Kind.Duration: {
			const [secs = 0n, nanos = 0n] = value.toCompact();
			view.setBigUint64(at, BigInt(secs), true);
			view.setUint32(at + 8, Number(nanos), true);
			return;
		}
		default: refuse("a value of a kind which has no fixed slot");
	}
}
function sized(value) {
	return Number(value.value);
}
/** The bytes of a value of a variable kind */
function varBytes(column, value, dynamic$1) {
	switch (column.kind) {
		case Kind.String: return UTF8$1.encode(value);
		case Kind.Bytes: return value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
		case Kind.Decimal: return UTF8$1.encode(value.toString());
		case Kind.Dynamic: return dynamic$1(value);
		case Kind.Record: return recordBytes(value, column.table, dynamic$1);
		case Kind.Array: return arrayBytes(value, column.element, dynamic$1);
		default: return refuse("a value of a kind which has no var slot");
	}
}
/** A record slice: its key kind, the table when the column does not name one, then the id */
function recordBytes(id$1, columnTable, dynamic$1) {
	const key = id$1.id;
	const out = new ByteWriter();
	if (typeof key === "object" && !(key instanceof Uuid) || beyondSlot(key)) return out.u8(3).raw(dynamic$1(id$1)).bytes;
	const kind = typeof key === "string" ? 1 : key instanceof Uuid ? 2 : 0;
	out.u8(kind);
	if (columnTable === "") out.u16Text(id$1.table.name);
	switch (kind) {
		case 0: return out.i64(BigInt(key)).bytes;
		case 1: return out.raw(UTF8$1.encode(key)).bytes;
		default: return out.raw(key.toUint8Array()).bytes;
	}
}
/** An array slice: its count, then its elements, all of one kind */
function arrayBytes(value, element, dynamic$1) {
	const out = new ByteWriter().u32(value.length);
	if (isVar(element)) {
		const slices = value.map((item) => varBytes({
			kind: element,
			table: "",
			element: void 0
		}, item, dynamic$1));
		let end = 0;
		for (const slice of slices) {
			end += slice.length;
			out.u32(end);
		}
		for (const slice of slices) out.raw(slice);
		return out.bytes;
	}
	const width = fixedWidth(element);
	if (width === void 0) refuse("an invalid array element kind");
	const bytes = new Uint8Array(width * value.length);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < value.length; i++) writeFixed(view, bytes, i * width, element, value[i]);
	return out.raw(bytes).bytes;
}
const UTF8$1 = new TextEncoder();
const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;
/**
* Whether a record id's numeric key has to go as one CBOR item rather than in the slot.
*
* A `bigint` past the i64 range would be wrapped into it. A `number` past 2^53 is written by
* the CBOR codec as a float, because that is what it is — so writing it into the integer slot
* would change both the kind the server stores and the type it reads back as.
*/
function beyondSlot(key) {
	if (typeof key === "bigint") return key < I64_MIN || key > I64_MAX;
	if (typeof key === "number") return !Number.isInteger(key) || Math.abs(key) > 2 ** 53;
	return false;
}
/**
* A batch of rows read into per-column form, and the shape they share.
*
* {@link collect} reads every row once. The shape is settled from what that saw, so it can be
* measured before anything is written, and {@link write} then builds the block from the values
* already in hand.
*/
var Columns = class Columns$1 {
	shape;
	#columns;
	#rows;
	constructor(shape, columns, rows) {
		this.shape = shape;
		this.#columns = columns;
		this.#rows = rows;
	}
	/**
	* Reads `rows` into columns and settles their shape, or gives up when they are not rows a
	* block can carry: an empty array, entries which are not plain objects, or no keys at all.
	*/
	static collect(rows) {
		if (rows.length === 0) return void 0;
		const n = rows.length;
		const root = {
			children: [],
			byName: Object.create(null)
		};
		const budget = { left: MAX_COLUMNS };
		for (let at = 0; at < n; at++) {
			const row = rows[at];
			if (!isPlainObject(row)) return void 0;
			if (!observeNode(root, row, at, n, 0, budget)) return void 0;
		}
		if (root.children.length === 0) return void 0;
		const order = [];
		const columns = [];
		const layout = {
			fixedSize: 0,
			varCount: 0,
			presenceBits: 0
		};
		if (!flatten(root, order, columns, layout)) return void 0;
		try {
			const shape = Shape.of({
				presenceBits: layout.presenceBits,
				fixedSize: layout.fixedSize,
				varCount: layout.varCount,
				columns
			});
			return new Columns$1(shape, order, n);
		} catch {
			return void 0;
		}
	}
	/** The block these rows make: a SHAPE message announcing their shape, then one BATCH */
	write(dynamic$1) {
		const shape = this.shape;
		const n = this.#rows;
		const presenceLen = presenceBytes(shape.presenceBits);
		const endsAt = presenceLen + shape.fixedSize;
		const stride = shape.headerLength;
		const headers = new Uint8Array(n * stride);
		const view = new DataView(headers.buffer);
		const slices = new Array(shape.varCount);
		const columns = shape.columns;
		for (let c = 0; c < columns.length; c++) {
			const column = columns[c];
			const accumulated = this.#columns[c];
			writePresence(headers, stride, column, accumulated.states, n);
			if (column.kind === Kind.Object) continue;
			if (fixedWidth(column.kind) === void 0) slices[column.slot] = writeVar(column, accumulated, n, dynamic$1);
			else writeColumn(view, headers, stride, presenceLen, column, accumulated, n);
		}
		let total = 0;
		for (let i = 0; i < n; i++) {
			let end = 0;
			for (let v = 0; v < shape.varCount; v++) {
				const slice = slices[v][i];
				if (slice !== void 0) end += slice.length;
				view.setUint32(i * stride + endsAt + 4 * v, end, true);
			}
			total += stride + end;
		}
		return frame(shape, headers, slices, stride, n, total);
	}
};
/**
* Folds one object's keys into `node`, which is the root or an object column's subtree.
*
* Returns false when the rows cannot be shaped: too many columns over every depth, or objects
* nested deeper than a shape may hold.
*/
function observeNode(node, object, at, rows, depth, budget) {
	if (depth >= MAX_DEPTH) return false;
	for (const name of Object.keys(object)) {
		let column = node.byName[name];
		if (column === void 0) {
			if (budget.left === 0) return false;
			budget.left -= 1;
			column = {
				name,
				kind: MIXED,
				seenAny: false,
				element: void 0,
				table: void 0,
				absent: at > 0,
				null: false,
				none: false,
				states: new Uint8Array(rows),
				values: new Array(rows),
				children: [],
				byName: Object.create(null)
			};
			node.byName[name] = column;
			node.children.push(column);
		}
		const value = object[name];
		observe(column, at, value);
		if (column.states[at] === STATE_VALUE && column.kind === Kind.Object) {
			if (!observeNode(column, value, at, rows, depth + 1, budget)) return false;
		}
	}
	for (let i = 0; i < node.children.length; i++) {
		const column = node.children[i];
		if (column.states[at] === STATE_ABSENT && !Object.hasOwn(object, column.name)) column.absent = true;
	}
	return true;
}
/** Folds one value into what its column has seen, and keeps it for the write */
function observe(column, at, value) {
	if (value === null) {
		column.states[at] = STATE_NULL;
		column.null = true;
		return;
	}
	if (value === void 0) {
		column.states[at] = STATE_NONE;
		column.none = true;
		return;
	}
	column.states[at] = STATE_VALUE;
	column.values[at] = value;
	const kind = kindOf(value);
	if (!column.seenAny) {
		column.kind = kind;
		column.seenAny = true;
	} else if (column.kind !== kind) column.kind = MIXED;
	if (kind === Kind.Array) {
		const element = elementOf(value);
		if (element === "mixed") column.element = MIXED;
		else if (element !== "empty" && column.element !== MIXED) column.element = column.element === void 0 || column.element === element ? element : MIXED;
	}
	if (kind === Kind.Record) {
		const table = value.table.name;
		column.table = column.table === void 0 ? table : column.table === table ? table : null;
	}
}
/**
* Lays one node's columns out, depth first: a column, then the subtree of an object column.
*
* The accumulators come out in the same order as the columns, so the writer can pair them by
* index. Returns false when a column's kind could not be settled into a shape.
*/
function flatten(node, order, columns, layout) {
	node.children.sort(byName_);
	for (const accumulated of node.children) {
		const kind = kindFor(accumulated);
		const flags = (accumulated.absent || accumulated.none ? MAY_BE_ABSENT : 0) | (accumulated.null || accumulated.none ? MAY_BE_NULL : 0);
		const width = presenceWidth(flags);
		const presence = width === 0 ? NO_SLOT : layout.presenceBits;
		layout.presenceBits += width;
		let slot;
		const fixed = fixedWidth(kind);
		if (kind === Kind.Object) slot = NO_SLOT;
		else if (fixed !== void 0) {
			slot = layout.fixedSize;
			layout.fixedSize += fixed;
		} else {
			slot = layout.varCount;
			layout.varCount += 1;
		}
		const column = {
			name: accumulated.name,
			kind,
			element: kind === Kind.Array ? accumulated.element === MIXED ? void 0 : accumulated.element : void 0,
			flags,
			presence,
			slot,
			table: kind === Kind.Record && typeof accumulated.table === "string" ? accumulated.table : "",
			children: 0,
			rest: NO_SLOT
		};
		const at = columns.length;
		columns.push(column);
		order.push(accumulated);
		if (kind === Kind.Object) {
			if (!flatten(accumulated, order, columns, layout)) return false;
			column.children = columns.length - at - 1;
		}
	}
	return true;
}
/** Orders two columns by the bytes of their names, which is the order a shape lists them in */
function byName_(a, b) {
	return byUtf8(a.name, b.name);
}
/** The one kind a column holds, or `dynamic` when its rows did not settle on one */
function kindFor(accumulated) {
	if (accumulated.kind === MIXED) return Kind.Dynamic;
	const kind = accumulated.kind;
	if (kind === Kind.Array && (accumulated.element === MIXED || accumulated.element === void 0)) return Kind.Dynamic;
	return kind;
}
/** Sets each row's presence bits for one column, which are the same two bits every time */
function writePresence(headers, stride, column, states, n) {
	const width = presenceWidth(column.flags);
	if (width === 0) return;
	const low = column.presence;
	const lowByte = low >>> 3;
	const lowMask = 1 << low % 8;
	if (width === 1) {
		for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) {
			const at = i * stride + lowByte;
			headers[at] = headers[at] | lowMask;
		}
		return;
	}
	const high = low + 1;
	const highByte = high >>> 3;
	const highMask = 1 << high % 8;
	for (let i = 0; i < n; i++) {
		const state = states[i];
		if (state & 1) {
			const at = i * stride + lowByte;
			headers[at] = headers[at] | lowMask;
		}
		if (state & 2) {
			const at = i * stride + highByte;
			headers[at] = headers[at] | highMask;
		}
	}
}
/**
* Writes one fixed column into every row's header.
*
* The kind is read once, before the loop, so each case below runs over values which are all of
* that kind. A row writer asks the same question again for every field of every row.
*/
function writeColumn(view, headers, stride, presenceLen, column, accumulated, n) {
	const states = accumulated.states;
	const values = accumulated.values;
	const base = presenceLen + column.slot;
	switch (column.kind) {
		case Kind.Bool:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) headers[i * stride + base] = values[i] ? 1 : 0;
			return;
		case Kind.Int:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) view.setBigInt64(i * stride + base, BigInt(values[i]), true);
			return;
		case Kind.Float:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) view.setFloat64(i * stride + base, values[i], true);
			return;
		case Kind.Datetime:
			for (let i = 0; i < n; i++) {
				if (states[i] !== STATE_VALUE) continue;
				const [secs, nanos] = values[i].toCompact();
				view.setBigInt64(i * stride + base, secs, true);
				view.setUint32(i * stride + base + 8, Number(nanos), true);
			}
			return;
		case Kind.Duration:
			for (let i = 0; i < n; i++) {
				if (states[i] !== STATE_VALUE) continue;
				const [secs = 0n, nanos = 0n] = values[i].toCompact();
				view.setBigUint64(i * stride + base, BigInt(secs), true);
				view.setUint32(i * stride + base + 8, Number(nanos), true);
			}
			return;
		case Kind.Uuid:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) headers.set(new Uuid(values[i]).toUint8Array(), i * stride + base);
			return;
		case Kind.U8:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) headers[i * stride + base] = Number(values[i].value);
			return;
		case Kind.I8:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) view.setInt8(i * stride + base, Number(values[i].value));
			return;
		case Kind.U16:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) view.setUint16(i * stride + base, Number(values[i].value), true);
			return;
		case Kind.I16:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) view.setInt16(i * stride + base, Number(values[i].value), true);
			return;
		case Kind.U32:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) view.setUint32(i * stride + base, Number(values[i].value), true);
			return;
		case Kind.I32:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) view.setInt32(i * stride + base, Number(values[i].value), true);
			return;
		case Kind.U64:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) view.setBigUint64(i * stride + base, BigInt(values[i].value), true);
			return;
		case Kind.F32:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) view.setFloat32(i * stride + base, Number(values[i].value), true);
			return;
		default:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) writeFixed(view, headers, i * stride + base, column.kind, values[i]);
			return;
	}
}
/** Converts one variable column's values into the slices the rows will carry */
function writeVar(column, accumulated, n, dynamic$1) {
	const states = accumulated.states;
	const values = accumulated.values;
	const out = new Array(n);
	switch (column.kind) {
		case Kind.String:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) out[i] = UTF8.encode(values[i]);
			return out;
		case Kind.Dynamic:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) out[i] = dynamic$1(values[i]);
			return out;
		case Kind.Record:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) out[i] = recordBytes(values[i], column.table, dynamic$1);
			return out;
		default:
			for (let i = 0; i < n; i++) if (states[i] === STATE_VALUE) out[i] = varBytes(column, values[i], dynamic$1);
			return out;
	}
}
/** Threads the headers back together with their variable regions, and frames the block */
function frame(shape, headers, slices, stride, n, total) {
	const payload = new Uint8Array(total);
	const varCount = shape.varCount;
	let at = 0;
	for (let i = 0; i < n; i++) {
		payload.set(headers.subarray(i * stride, i * stride + stride), at);
		at += stride;
		for (let v = 0; v < varCount; v++) {
			const slice = slices[v][i];
			if (slice !== void 0 && slice.length !== 0) {
				payload.set(slice, at);
				at += slice.length;
			}
		}
	}
	if (at !== total) refuse("a batch which did not fill its own bytes");
	const announced = shape.encode();
	const out = new ByteWriter(10 + announced.length + 13 + payload.length).u8(VERSION);
	out.u8(MESSAGE_SHAPE).u32(announced.length + 4).u32(1).raw(announced);
	out.u8(MESSAGE_BATCH).u32(payload.length + 8).u32(1).u32(n).raw(payload);
	return out.bytes;
}
const UTF8 = new TextEncoder();
/**
* How many rows an array needs before it is worth sending as a block. Below this the shape
* costs more than the keys it saves, since a shape names every column once however few rows
* follow it.
*/
const BLOCK_THRESHOLD = 32;
/**
* How many rows are measured to decide whether a block is worth writing. Rows which share a
* shape are alike, so a sample spread across the array settles it without encoding all of it.
*/
const SAMPLE = 64;
/**
* The bytes `tagged` puts in front of a block: the tag 57 head and the byte string's
* four-byte length. The block goes on the wire inside them, so a comparison which leaves them
* out can keep a block which is larger than the array it replaced.
*/
const TAG_HEAD = 7;
/**
* The codec of the `shaped` format: `cbor.2`, plus the tag 57 blocks which carry a list of rows.
*
* Everything which is not a row list — the response envelope, `begin`, `value`, `finished` and
* `end` stream frames, a notification's `id`, `action` and `record`, errors — is `cbor.2` as
* the CBOR codec writes it, so this codec is that codec with one tag added.
*
* **Reading.** Tag 57 decodes to a {@link ShapedBlock}, which still holds its bytes. The shape
* ids in a block are resolved against a scope wider than the block itself, so the caller reads
* a block through the {@link BlockReader} of its scope once the envelope says which scope that
* is.
*
* **Writing.** The server reads a block wherever a CBOR request holds a value — an RPC
* parameter, a query variable — so an array of rows long enough to be worth it is sent as one.
* A shape is derived from the rows themselves, since a client is not told the schema of what it
* sends; what no column can describe goes in a `dynamic` column. Only a connection which
* negotiated `shaped` uses this codec, which is also how the SDK knows the server is one that
* reads blocks at all: a server before 4.0 refuses tag 57 as an unknown tag.
*/
var ShapedCodec = class extends CborCodec {
	#threshold;
	#nativeDates;
	#visitor;
	#visits;
	constructor(options = {}) {
		super({
			...options,
			version: 2
		});
		this.#threshold = options.blockThreshold ?? BLOCK_THRESHOLD;
		this.#nativeDates = options.useNativeDates === true;
		this.#visitor = options.valueDecodeVisitor;
		this.#visits = options.valueEncodeVisitor !== void 0;
		this.tagged = {
			...this.tagged,
			[SHAPED_TAG]: (v) => {
				if (v instanceof ArrayBuffer) return new ShapedBlock(new Uint8Array(v));
				if (v instanceof Uint8Array) return new ShapedBlock(v);
				throw new ShapedFrameError("a block that is not a byte string");
			}
		};
	}
	/** A decoder for the one CBOR item a dynamic slice holds */
	get dynamic() {
		return (bytes) => this.decode(bytes);
	}
	/** The rows of `block`, read in `scope` */
	rows(block, scope) {
		return scope.read(block, this.dynamic, {
			nativeDates: this.#nativeDates,
			visit: this.#visitor
		});
	}
	encode(data) {
		return super.encode(this.#shapeRows(data));
	}
	/**
	* `value` with every array of rows long enough to be worth it replaced by the block which
	* carries it. A block cannot nest — a dynamic slice is read as strict CBOR, which refuses
	* tag 57 — so an array which becomes a block is not descended into.
	*/
	#shapeRows(value) {
		if (Array.isArray(value)) {
			const block = this.block(value);
			if (block) return new Encoded(block);
			return value.map((item) => this.#shapeRows(item));
		}
		if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
			const out = {};
			for (const [key, item] of Object.entries(value)) out[key] = this.#shapeRows(item);
			return out;
		}
		return value;
	}
	/**
	* `rows` as the bytes of a tag 57 block, or `undefined` when they are not worth sending as
	* one: too few, not an array of objects, or a block which would be no smaller than the
	* CBOR array it replaces.
	*
	* That last case is real rather than theoretical. A shape gives every column a fixed width,
	* so a column of small integers takes eight bytes a row where CBOR takes one or two, and a
	* block of them is larger than the array. The server does not meet this because its shapes
	* come from a table's field definitions over rows already stored in that layout; a client
	* deriving a shape from the values in hand does. So the block is written and measured, and
	* kept only if it actually won.
	*/
	block(rows) {
		if (rows.length < this.#threshold || this.#visits) return void 0;
		const columns = Columns.collect(rows);
		if (!columns) return void 0;
		const shape = columns.shape;
		if (shape.columns.every((column) => column.kind === Kind.Dynamic)) return void 0;
		if (!this.#worthIt(shape, rows)) return void 0;
		return tagged(columns.write((item) => super.encode(item)));
	}
	/**
	* Whether writing `rows` in `shape` comes out smaller than the CBOR array would.
	*
	* Deciding it by encoding the whole array both ways is exact but costs a full CBOR encode
	* on top of the write, which made sending a block slower than not sending one. Rows which
	* share a shape are alike by construction, so the question is settled on a sample spread
	* across the array instead, and only short arrays are measured whole.
	*/
	#worthIt(shape, rows) {
		if (rows.length <= SAMPLE) {
			const asBlock$1 = writeBlock(shape, rows, (item) => super.encode(item)).length;
			return asBlock$1 + TAG_HEAD < super.encode(rows).length;
		}
		const sample = [];
		const n = rows.length;
		for (let i = 0; i < SAMPLE; i++) sample.push(rows[(i * 2654435761 >>> 0) % n]);
		const asBlock = writeBlock(shape, sample, (item) => super.encode(item)).length;
		const asArray = super.encode(sample).length;
		const shapeBytes = shape.encode().length;
		const perBlockRow = (asBlock - shapeBytes) / sample.length;
		const perArrayRow = asArray / sample.length;
		return shapeBytes + TAG_HEAD + perBlockRow * rows.length < perArrayRow * rows.length;
	}
};
/** `contents` as CBOR tag 57 around a definite-length byte string, as the server writes one */
function tagged(contents) {
	return new ByteWriter(7 + contents.length).u8(216).u8(57).u8(90).u8(contents.length >>> 24).u8(contents.length >>> 16 & 255).u8(contents.length >>> 8 & 255).u8(contents.length & 255).raw(contents).bytes;
}
/**
* The shape which holds every row of `rows`, or `undefined` when they are not rows a block can
* carry: an empty array, or one whose entries are not all plain objects.
*
* The server shapes rows it has not seen yet, so it fits each row to the shape in hand and
* widens or re-announces when one does not fit. A client already holds the whole array, so it
* reads every row once to learn the union of what they hold — which keys appear, which are ever
* missing, `NULL` or `NONE`, and whether their kinds agree — and writes them all in one shape.
* One SHAPE, one BATCH, no joining and no re-announcement.
*
* What no column can describe — a nested object, a ragged array, keys whose kinds disagree —
* becomes a `dynamic` column holding one CBOR item. So a shape is always possible for an array
* of objects; it just stops being worth sending when most of it is dynamic.
*
* That read is also what writing the rows needs, so the two share one pass: this hands back the
* shape alone, for callers which only want to know what the rows look like.
*/
function deriveShape(rows) {
	return Columns.collect(rows)?.shape;
}
const DURATION_UNIT_STARTS = new Set([
	"n",
	"u",
	"m",
	"s",
	"h",
	"d",
	"w",
	"y",
	"µ",
	"μ"
]);
const VALUE_TERMINATORS = new Set([
	"]",
	"}",
	")",
	","
]);
const ANGLE_OPEN = "⟨";
const ANGLE_CLOSE = "⟩";
/**
* A recursive-descent parser for the textual SQON (SurrealQL value) format.
*
* It parses a single SurrealQL value from a string and produces native
* JavaScript values where possible, falling back to the SQON `Value`
* derivatives for SurrealDB-specific types. The output shape matches what the
* CBOR and JSON codecs produce when decoding.
*/
var TextParser = class TextParser$1 {
	#src;
	#opts;
	#pos = 0;
	constructor(src, opts = {}) {
		this.#src = src;
		this.#opts = opts;
	}
	/**
	* Parse a single SQON value and ensure the entire input was consumed.
	*/
	parse() {
		this.#skipWs();
		const value = this.#parseValue();
		this.#skipWs();
		if (!this.#eof()) this.#error(`Unexpected trailing input '${this.#peek()}'`);
		return value;
	}
	#eof() {
		return this.#pos >= this.#src.length;
	}
	#peek(offset = 0) {
		return this.#src[this.#pos + offset];
	}
	#next() {
		const char = this.#src[this.#pos];
		if (char === void 0) this.#error("Unexpected end of input");
		this.#pos += 1;
		return char;
	}
	#skipWs() {
		while (this.#pos < this.#src.length) {
			const code = this.#src.charCodeAt(this.#pos);
			if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11) this.#pos += 1;
			else break;
		}
	}
	#error(message) {
		throw new TextParseError(message, this.#pos);
	}
	#parseValue() {
		this.#skipWs();
		if (this.#peek() === "." && this.#peek(1) === ".") {
			this.#pos += 2;
			const end = this.#parseRangeEnd(this.#parsePrimeBound.bind(this));
			return new Range(void 0, end);
		}
		const left = this.#parsePrime();
		if (left instanceof _RecordId || left instanceof _RecordIdRange) return left;
		const mark = this.#pos;
		this.#skipWs();
		let exclusive = false;
		if (this.#peek() === ">" && this.#peek(1) === "." && this.#peek(2) === ".") {
			this.#pos += 1;
			exclusive = true;
		}
		if (this.#peek() === "." && this.#peek(1) === ".") {
			this.#pos += 2;
			const begin = exclusive ? new BoundExcluded(left) : new BoundIncluded(left);
			const end = this.#parseRangeEnd(this.#parsePrimeBound.bind(this));
			return new Range(begin, end);
		}
		this.#pos = mark;
		return left;
	}
	#parsePrimeBound() {
		return this.#parsePrime();
	}
	#parseRangeEnd(parseInner) {
		let inclusive = false;
		if (this.#peek() === "=") {
			this.#pos += 1;
			inclusive = true;
		}
		this.#skipWs();
		if (this.#canStartValue()) {
			const value = parseInner();
			return inclusive ? new BoundIncluded(value) : new BoundExcluded(value);
		}
		if (inclusive) this.#error("Expected a value after inclusive range operator '..='");
		return void 0;
	}
	#canStartValue() {
		const char = this.#peek();
		if (char === void 0) return false;
		if (VALUE_TERMINATORS.has(char)) return false;
		if (char === "." && this.#peek(1) === ".") return false;
		return true;
	}
	#parsePrime() {
		this.#skipWs();
		const char = this.#peek();
		if (char === void 0) this.#error("Unexpected end of input, expected a value");
		switch (char) {
			case "\"":
			case "'": return this.#readQuoted(char);
			case "[": return this.#parseArray();
			case "{": return this.#parseObjectOrSet();
			case "(": return this.#parseGeometryOrGroup();
			case "`":
			case ANGLE_OPEN: return this.#parseIdentValue();
		}
		const code = char.charCodeAt(0);
		if (code >= 48 && code <= 57 || char === "+" || char === "-") return this.#parseNumberLike();
		if (this.#isIdentStart(code)) {
			const next = this.#peek(1);
			if ((next === "\"" || next === "'") && "sdubfr".includes(char)) return this.#parsePrefixedLiteral(char, next);
			return this.#parseIdentValue();
		}
		this.#error(`Unexpected character '${char}', expected a value`);
	}
	#isIdentStart(code) {
		return code >= 65 && code <= 90 || code >= 97 && code <= 122 || code === 95;
	}
	#isIdentContinue(code) {
		return code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122 || code === 95;
	}
	#parseIdentValue() {
		const { name, quoted } = this.#parseIdentRaw();
		if (!quoted) {
			switch (name.toLowerCase()) {
				case "none": return void 0;
				case "null": return null;
				case "true": return true;
				case "false": return false;
			}
			if (name === "Infinity") return Number.POSITIVE_INFINITY;
			if (name === "NaN") return NaN;
		}
		if (this.#peek() === ":") return this.#parseRecordIdOrRange(name);
		return new _Table(name);
	}
	#parseIdentRaw() {
		const char = this.#peek();
		if (char === "`") {
			this.#pos += 1;
			return {
				name: this.#readDelimitedIdent("`"),
				quoted: true
			};
		}
		if (char === ANGLE_OPEN) {
			this.#pos += 1;
			return {
				name: this.#readDelimitedIdent(ANGLE_CLOSE),
				quoted: true
			};
		}
		const start = this.#pos;
		const startCode = char === void 0 ? -1 : char.charCodeAt(0);
		if (!this.#isIdentStart(startCode)) this.#error("Expected an identifier");
		this.#pos += 1;
		while (!this.#eof() && this.#isIdentContinue(this.#src.charCodeAt(this.#pos))) this.#pos += 1;
		return {
			name: this.#src.slice(start, this.#pos),
			quoted: false
		};
	}
	#readDelimitedIdent(close) {
		let result = "";
		while (true) {
			const char = this.#peek();
			if (char === void 0) this.#error(`Unterminated identifier, expected '${close}'`);
			this.#pos += 1;
			if (char === close) break;
			if (char === "\\") result += this.#readEscape();
			else result += char;
		}
		return result;
	}
	#parseRecordIdOrRange(table) {
		this.#pos += 1;
		if (this.#peek() === "." && this.#peek(1) === ".") {
			this.#pos += 2;
			const end = this.#parseRangeEnd(this.#parseRecordIdKey.bind(this));
			return new _RecordIdRange(table, void 0, end);
		}
		const begin = this.#parseRecordIdKey();
		let exclusive = false;
		if (this.#peek() === ">" && this.#peek(1) === "." && this.#peek(2) === ".") {
			this.#pos += 1;
			exclusive = true;
		}
		if (this.#peek() === "." && this.#peek(1) === ".") {
			this.#pos += 2;
			const beginBound = exclusive ? new BoundExcluded(begin) : new BoundIncluded(begin);
			const end = this.#parseRangeEnd(this.#parseRecordIdKey.bind(this));
			return new _RecordIdRange(table, beginBound, end);
		}
		if (exclusive) this.#error("Expected the range operator '..' after '>'");
		return new _RecordId(table, begin);
	}
	#parseRecordIdKey() {
		this.#skipWs();
		const char = this.#peek();
		if (char === void 0) this.#error("Expected a record id key");
		if (char === "\"" || char === "'") return this.#readQuoted(char);
		if (char === "u" && (this.#peek(1) === "\"" || this.#peek(1) === "'")) return this.#parsePrefixedLiteral("u", this.#peek(1));
		if (char === "{") return this.#parseObjectOrSet();
		if (char === "[") return this.#parseArray();
		const code = char.charCodeAt(0);
		if (char === "+" || char === "-" || code >= 48 && code <= 57) return this.#parseIntegerKey();
		return this.#parseIdentRaw().name;
	}
	#parseIntegerKey() {
		const start = this.#pos;
		if (this.#peek() === "+" || this.#peek() === "-") this.#pos += 1;
		const digitsStart = this.#pos;
		while (!this.#eof() && this.#isDigit(this.#src.charCodeAt(this.#pos))) this.#pos += 1;
		if (this.#pos === digitsStart) this.#error("Expected an integer record id key");
		return this.#finishInteger(this.#src.slice(start, this.#pos));
	}
	#isDigit(code) {
		return code >= 48 && code <= 57;
	}
	#parseNumberLike() {
		const start = this.#pos;
		if (this.#peek() === "+" || this.#peek() === "-") this.#pos += 1;
		this.#eatDigits();
		if (this.#pos === start || this.#pos === start + 1 && !this.#isDigit(this.#src.charCodeAt(start))) {
			this.#pos = start;
			this.#error("Expected a number");
		}
		const letters = this.#peekLetterRun();
		if (letters !== "dec" && letters !== "f" && DURATION_UNIT_STARTS.has(this.#peek() ?? "")) return this.#finishDuration(start);
		let isFloat = false;
		if (this.#peek() === "." && this.#isDigit(this.#src.charCodeAt(this.#pos + 1))) {
			this.#pos += 1;
			this.#eatDigits();
			isFloat = true;
		}
		if (this.#peek() === "e" || this.#peek() === "E") {
			const afterE = this.#peek(1);
			const afterSign = afterE === "+" || afterE === "-" ? this.#peek(2) : afterE;
			if (afterSign !== void 0 && this.#isDigit(afterSign.charCodeAt(0))) {
				this.#pos += 1;
				if (this.#peek() === "+" || this.#peek() === "-") this.#pos += 1;
				this.#eatDigits();
				isFloat = true;
			}
		}
		const numeric = this.#src.slice(start, this.#pos).replace(/_/g, "");
		const suffix = this.#peekLetterRun();
		if (suffix === "dec") {
			this.#pos += 3;
			return new Decimal(numeric);
		}
		if (suffix === "f") {
			this.#pos += 1;
			return Number.parseFloat(numeric);
		}
		if (isFloat) return Number.parseFloat(numeric);
		return this.#finishInteger(numeric);
	}
	#finishInteger(numeric) {
		let value;
		try {
			value = BigInt(numeric);
		} catch {
			this.#error(`Invalid integer '${numeric}'`);
		}
		if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
		return value;
	}
	#finishDuration(start) {
		while (!this.#eof()) {
			const char = this.#src[this.#pos];
			const code = char.charCodeAt(0);
			if (this.#isDigit(code) || DURATION_UNIT_STARTS.has(char)) this.#pos += 1;
			else break;
		}
		return new Duration(this.#src.slice(start, this.#pos));
	}
	#eatDigits() {
		while (!this.#eof()) {
			const code = this.#src.charCodeAt(this.#pos);
			if (this.#isDigit(code) || code === 95) this.#pos += 1;
			else break;
		}
	}
	#peekLetterRun() {
		let index = this.#pos;
		while (index < this.#src.length) {
			const char = this.#src[index];
			const code = char.charCodeAt(0);
			if (code >= 65 && code <= 90 || code >= 97 && code <= 122 || char === "µ" || char === "μ") index += 1;
			else break;
		}
		return this.#src.slice(this.#pos, index);
	}
	#readQuoted(quote) {
		this.#pos += 1;
		let result = "";
		while (true) {
			const char = this.#peek();
			if (char === void 0) this.#error("Unterminated string literal");
			this.#pos += 1;
			if (char === quote) break;
			if (char === "\\") result += this.#readEscape();
			else result += char;
		}
		return result;
	}
	#readEscape() {
		const char = this.#next();
		switch (char) {
			case "n": return "\n";
			case "t": return "	";
			case "r": return "\r";
			case "b": return "\b";
			case "f": return "\f";
			case "0": return "\0";
			case "\\": return "\\";
			case "/": return "/";
			case "\"": return "\"";
			case "'": return "'";
			case "`": return "`";
			case "u": return this.#readUnicodeEscape();
			default: return char;
		}
	}
	#readUnicodeEscape() {
		if (this.#peek() === "{") {
			this.#pos += 1;
			const start = this.#pos;
			while (!this.#eof() && this.#peek() !== "}") this.#pos += 1;
			const hex$1 = this.#src.slice(start, this.#pos);
			if (this.#peek() !== "}") this.#error("Unterminated unicode escape");
			this.#pos += 1;
			const code = Number.parseInt(hex$1, 16);
			if (Number.isNaN(code)) this.#error(`Invalid unicode escape '\\u{${hex$1}}'`);
			return String.fromCodePoint(code);
		}
		const hex = this.#src.slice(this.#pos, this.#pos + 4);
		if (hex.length !== 4 || Number.isNaN(Number.parseInt(hex, 16))) this.#error(`Invalid unicode escape '\\u${hex}'`);
		this.#pos += 4;
		return String.fromCharCode(Number.parseInt(hex, 16));
	}
	#parsePrefixedLiteral(prefix, quote) {
		this.#pos += 1;
		const inner = this.#readQuoted(quote);
		switch (prefix) {
			case "s": return inner;
			case "d": return this.#opts.useNativeDates ? new Date(inner) : new DateTime(inner);
			case "u": return new Uuid(inner);
			case "b": return this.#decodeBytes(inner);
			case "f": return this.#parseFileRef(inner);
			case "r": return this.#parseInnerRecordId(inner);
			default: this.#error(`Unknown literal prefix '${prefix}'`);
		}
	}
	#decodeBytes(inner) {
		const clean = inner.replace(/\s+/g, "");
		if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) try {
			return fromBase64Url(inner);
		} catch {
			this.#error("Invalid bytes literal, expected a hex string");
		}
		const bytes = new Uint8Array(clean.length / 2);
		for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
		return bytes;
	}
	#parseFileRef(inner) {
		const separator = inner.indexOf(":");
		if (separator === -1) this.#error("Invalid file reference, expected 'bucket:/key'");
		return new FileRef(inner.slice(0, separator), inner.slice(separator + 1));
	}
	#parseInnerRecordId(inner) {
		const parser = new TextParser$1(inner, this.#opts);
		parser.#skipWs();
		const { name } = parser.#parseIdentRaw();
		if (parser.#peek() !== ":") parser.#error("Expected a record id");
		const record$1 = parser.#parseRecordIdOrRange(name);
		parser.#skipWs();
		if (!parser.#eof()) parser.#error("Unexpected trailing input in record id literal");
		return record$1;
	}
	#parseArray() {
		this.#pos += 1;
		const result = [];
		this.#skipWs();
		if (this.#peek() === "]") {
			this.#pos += 1;
			return result;
		}
		while (true) {
			result.push(this.#parseValue());
			this.#skipWs();
			const char = this.#peek();
			if (char === ",") {
				this.#pos += 1;
				this.#skipWs();
				if (this.#peek() === "]") {
					this.#pos += 1;
					break;
				}
				continue;
			}
			if (char === "]") {
				this.#pos += 1;
				break;
			}
			this.#error("Expected ',' or ']' in array");
		}
		return result;
	}
	#parseObjectOrSet() {
		this.#pos += 1;
		this.#skipWs();
		if (this.#peek() === "}") {
			this.#pos += 1;
			return {};
		}
		const mark = this.#pos;
		const key = this.#tryParseObjectKey();
		if (key !== null) {
			this.#skipWs();
			if (this.#peek() === ":") {
				this.#pos += 1;
				return this.#parseObjectRest(key);
			}
		}
		this.#pos = mark;
		return this.#parseSet();
	}
	#tryParseObjectKey() {
		const char = this.#peek();
		if (char === void 0) return null;
		if (char === "\"" || char === "'") return this.#readQuoted(char);
		const code = char.charCodeAt(0);
		if (this.#isIdentStart(code)) return this.#parseIdentRaw().name;
		if (char === "`" || char === ANGLE_OPEN) return this.#parseIdentRaw().name;
		if (this.#isDigit(code)) {
			const start = this.#pos;
			while (!this.#eof() && this.#isDigit(this.#src.charCodeAt(this.#pos))) this.#pos += 1;
			return this.#src.slice(start, this.#pos);
		}
		return null;
	}
	#parseObjectRest(firstKey) {
		const result = {};
		result[firstKey] = this.#parseValue();
		while (true) {
			this.#skipWs();
			const char = this.#peek();
			if (char === "}") {
				this.#pos += 1;
				break;
			}
			if (char !== ",") this.#error("Expected ',' or '}' in object");
			this.#pos += 1;
			this.#skipWs();
			if (this.#peek() === "}") {
				this.#pos += 1;
				break;
			}
			const key = this.#tryParseObjectKey();
			if (key === null) this.#error("Expected an object key");
			this.#skipWs();
			if (this.#peek() !== ":") this.#error("Expected ':' after object key");
			this.#pos += 1;
			result[key] = this.#parseValue();
		}
		return result;
	}
	#parseSet() {
		const result = /* @__PURE__ */ new Set();
		while (true) {
			result.add(this.#parseValue());
			this.#skipWs();
			const char = this.#peek();
			if (char === ",") {
				this.#pos += 1;
				this.#skipWs();
				if (this.#peek() === "}") {
					this.#pos += 1;
					break;
				}
				continue;
			}
			if (char === "}") {
				this.#pos += 1;
				break;
			}
			this.#error("Expected ',' or '}' in set");
		}
		return result;
	}
	#parseGeometryOrGroup() {
		this.#pos += 1;
		this.#skipWs();
		const mark = this.#pos;
		const point = this.#tryParsePoint();
		if (point !== null) return point;
		this.#pos = mark;
		const value = this.#parseValue();
		this.#skipWs();
		if (this.#peek() !== ")") this.#error("Expected ')'");
		this.#pos += 1;
		return value;
	}
	#tryParsePoint() {
		const char = this.#peek();
		if (char === void 0) return null;
		const code = char.charCodeAt(0);
		if (!(this.#isDigit(code) || char === "+" || char === "-")) return null;
		try {
			const x = this.#parseNumberLike();
			if (!this.#isNumeric(x)) return null;
			this.#skipWs();
			if (this.#peek() !== ",") return null;
			this.#pos += 1;
			this.#skipWs();
			const y = this.#parseNumberLike();
			if (!this.#isNumeric(y)) return null;
			this.#skipWs();
			if (this.#peek() !== ")") return null;
			this.#pos += 1;
			return new GeometryPoint([this.#toCoordinate(x), this.#toCoordinate(y)]);
		} catch {
			return null;
		}
	}
	#isNumeric(value) {
		return typeof value === "number" || typeof value === "bigint" || value instanceof Decimal;
	}
	#toCoordinate(value) {
		if (typeof value === "bigint") return Number(value);
		return value;
	}
};
/**
* A codec for encoding and decoding SurrealQL values using the SQON text format.
*
* Encoding produces a SurrealQL value string; decoding parses a single
* SurrealQL value back into native JavaScript values and SQON `Value`
* derivatives, matching the output of the CBOR and JSON codecs.
*/
var TextCodec = class TextCodec$1 {
	/**
	* The default TextCodec instance.
	*/
	static DEFAULT = new TextCodec$1({});
	#options;
	constructor(options = {}) {
		this.#options = options;
	}
	/**
	* Encode a value into its SurrealQL text representation.
	*/
	encode(data) {
		return toSurqlString(data);
	}
	/**
	* Decode a SurrealQL value string into value instances.
	*/
	decode(data) {
		return new TextParser(data, this.#options).parse();
	}
	static #expect(input, options, expected, check) {
		const value = new TextParser(input, options).parse();
		if (!check(value)) throw new TextParseError(`Expected a ${expected} value`, 0);
		return value;
	}
	/** Parse any single SQON value. */
	static parseValue(input, options) {
		return new TextParser(input, options).parse();
	}
	/** Parse a string value. */
	static parseString(input, options) {
		return TextCodec$1.#expect(input, options, "string", (v) => typeof v === "string");
	}
	/** Parse a numeric value (`int` as `number`/`bigint`, `float` as `number`). */
	static parseNumber(input, options) {
		return TextCodec$1.#expect(input, options, "number", (v) => typeof v === "number" || typeof v === "bigint");
	}
	/** Parse a boolean value. */
	static parseBool(input, options) {
		return TextCodec$1.#expect(input, options, "boolean", (v) => typeof v === "boolean");
	}
	/** Parse a decimal value. */
	static parseDecimal(input, options) {
		return TextCodec$1.#expect(input, options, "decimal", (v) => v instanceof Decimal);
	}
	/** Parse a duration value. */
	static parseDuration(input, options) {
		return TextCodec$1.#expect(input, options, "duration", (v) => v instanceof Duration);
	}
	/** Parse a datetime value (a `Date` when `useNativeDates` is set). */
	static parseDatetime(input, options) {
		return TextCodec$1.#expect(input, options, "datetime", (v) => v instanceof DateTime || v instanceof Date);
	}
	/** Parse a UUID value. */
	static parseUuid(input, options) {
		return TextCodec$1.#expect(input, options, "uuid", (v) => v instanceof Uuid);
	}
	/** Parse a bytes value. */
	static parseBytes(input, options) {
		return TextCodec$1.#expect(input, options, "bytes", (v) => v instanceof Uint8Array);
	}
	/** Parse a file reference value. */
	static parseFile(input, options) {
		return TextCodec$1.#expect(input, options, "file", (v) => v instanceof FileRef);
	}
	/** Parse a table value. */
	static parseTable(input, options) {
		return TextCodec$1.#expect(input, options, "table", (v) => v instanceof _Table);
	}
	/** Parse a record id value. */
	static parseRecordId(input, options) {
		return TextCodec$1.#expect(input, options, "record id", (v) => v instanceof _RecordId);
	}
	/** Parse a record id range value. */
	static parseRecordIdRange(input, options) {
		return TextCodec$1.#expect(input, options, "record id range", (v) => v instanceof _RecordIdRange);
	}
	/** Parse a range value. */
	static parseRange(input, options) {
		return TextCodec$1.#expect(input, options, "range", (v) => v instanceof Range);
	}
	/** Parse a geometry point value. */
	static parseGeometryPoint(input, options) {
		return TextCodec$1.#expect(input, options, "geometry point", (v) => v instanceof GeometryPoint);
	}
	/** Parse an array value. */
	static parseArray(input, options) {
		return TextCodec$1.#expect(input, options, "array", (v) => Array.isArray(v));
	}
	/** Parse a set value. */
	static parseSet(input, options) {
		return TextCodec$1.#expect(input, options, "set", (v) => v instanceof Set);
	}
	/** Parse a plain object value. */
	static parseObject(input, options) {
		return TextCodec$1.#expect(input, options, "object", (v) => typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype);
	}
};

//#endregion
//#region src/internal/normalize-path.ts
function normalizePath(prefix, path) {
	return `/${[...prefix.split("/"), ...path.split("/")].filter(Boolean).join("/")}`;
}

//#endregion
//#region src/utils/symbols.ts
/**
* Symbol-based type checking utilities for handling multiple library instances.
* This allows instanceof-like checks to work across different instances/versions of the library.
*/
const VALUE_SYMBOL = Symbol.for("surrealdb.Value");
const RECORD_ID_SYMBOL = Symbol.for("surrealdb.RecordId");
const STRING_RECORD_ID_SYMBOL = Symbol.for("surrealdb.StringRecordId");
const RECORD_ID_RANGE_SYMBOL = Symbol.for("surrealdb.RecordIdRange");
const UUID_SYMBOL = Symbol.for("surrealdb.Uuid");
const DATETIME_SYMBOL = Symbol.for("surrealdb.DateTime");
const DURATION_SYMBOL = Symbol.for("surrealdb.Duration");
const DECIMAL_SYMBOL = Symbol.for("surrealdb.Decimal");
const TABLE_SYMBOL = Symbol.for("surrealdb.Table");
const RANGE_SYMBOL = Symbol.for("surrealdb.Range");
const FUTURE_SYMBOL = Symbol.for("surrealdb.Future");
const FILE_REF_SYMBOL = Symbol.for("surrealdb.FileRef");
const GEOMETRY_SYMBOL = Symbol.for("surrealdb.Geometry");
const GEOMETRY_POINT_SYMBOL = Symbol.for("surrealdb.GeometryPoint");
const BOUND_INCLUDED_SYMBOL = Symbol.for("surrealdb.BoundIncluded");
const BOUND_EXCLUDED_SYMBOL = Symbol.for("surrealdb.BoundExcluded");
const BOUND_QUERY_SYMBOL = Symbol.for("surrealdb.BoundQuery");
const GEOMETRY_LINE_SYMBOL = Symbol.for("surrealdb.GeometryLine");
const GEOMETRY_POLYGON_SYMBOL = Symbol.for("surrealdb.GeometryPolygon");
const GEOMETRY_MULTI_POINT_SYMBOL = Symbol.for("surrealdb.GeometryMultiPoint");
const GEOMETRY_MULTI_LINE_SYMBOL = Symbol.for("surrealdb.GeometryMultiLine");
const GEOMETRY_MULTI_POLYGON_SYMBOL = Symbol.for("surrealdb.GeometryMultiPolygon");
const GEOMETRY_COLLECTION_SYMBOL = Symbol.for("surrealdb.GeometryCollection");
const FRAME_SYMBOL = Symbol.for("surrealdb.Frame");
const VALUE_FRAME_SYMBOL = Symbol.for("surrealdb.ValueFrame");
const ERROR_FRAME_SYMBOL = Symbol.for("surrealdb.ErrorFrame");
const DONE_FRAME_SYMBOL = Symbol.for("surrealdb.DoneFrame");
const SURREAL_ERROR_SYMBOL = Symbol.for("surrealdb.SurrealError");
const SERVER_ERROR_SYMBOL = Symbol.for("surrealdb.ServerError");
/**
* Helper function to mark an object with a symbol
*/
function markSymbol(obj, symbol) {
	if (obj && typeof obj === "object") obj[symbol] = true;
}
/**
* Helper function to check if an object has a symbol
*/
function hasSymbol(obj, symbol) {
	return !!(obj && typeof obj === "object" && obj[symbol]);
}

//#endregion
//#region src/errors.ts
/**
* The base error class for all SurrealDB SDK errors.
*/
var SurrealError = class extends Error {
	constructor(message, options) {
		super(message, options);
		markSymbol(this, SURREAL_ERROR_SYMBOL);
	}
};
/**
* Thrown when a SQON value or codec operation fails within the SDK.
*/
var SurrealSqonError = class extends SurrealError {
	name = "SurrealSqonError";
	inner;
	constructor(inner) {
		super(inner.message, { cause: inner });
		this.inner = inner;
	}
};
/**
* Thrown when a call has been terminated because the connection was closed
*/
var CallTerminatedError = class extends SurrealError {
	name = "CallTerminatedError";
	message = "The call has been terminated because the connection was closed";
};
/**
* Thrown when reconnect attempts have been exhausted
*/
var ReconnectExhaustionError = class extends SurrealError {
	name = "ReconnectExhaustionError";
	message = "The reconnect attempts have been exhausted";
};
/**
* Thrown when a reconnect iterator fails to iterate
*/
var ReconnectIterationError = class extends SurrealError {
	name = "ReconnectIterationError";
	message = "The reconnect iterator failed to iterate";
};
/**
* Thrown when an unexpected server response is received
*/
var UnexpectedServerResponseError = class extends SurrealError {
	name = "UnexpectedServerResponseError";
	response;
	constructor(response) {
		super(`The server returned an unexpected response: ${JSON.stringify(response)}`);
		this.response = response;
	}
};
/**
* Thrown when a streamed query answer cannot be trusted, either because the server speaks a
* revision of the streaming protocol this SDK does not implement, or because the answer
* contradicts itself - for instance a stream which ends having reported a different number of
* statements than it delivered.
*
* A stream that fails this way has not been completed, whatever it had yielded by then.
*/
var StreamProtocolError = class extends SurrealError {
	name = "StreamProtocolError";
};
/**
* Thrown when an unexpected connection error occurs
*/
var UnexpectedConnectionError = class extends SurrealError {
	name = "UnexpectedConnectionError";
	message = "An unexpected connection error occurred";
	constructor(cause) {
		super();
		this.cause = cause;
	}
};
/**
* Thrown when an engine is not supported
*/
var UnsupportedEngineError = class extends SurrealError {
	name = "UnsupportedEngineError";
	engine;
	constructor(engine) {
		super(`The engine "${engine}" is not supported or configured`);
		this.engine = engine;
	}
};
/**
* Thrown when there is no connection available
*/
var ConnectionUnavailableError = class extends SurrealError {
	name = "ConnectionUnavailableError";
	message = "You must be connected to a SurrealDB instance before performing this operation";
};
/**
* Thrown when there is no namespace and/or database selected
*/
var MissingNamespaceDatabaseError = class extends SurrealError {
	name = "MissingNamespaceDatabaseError";
	message = "There is no namespace and/or database selected";
};
/**
* Thrown when a connection to the server fails
*/
var HttpConnectionError = class extends SurrealError {
	name = "HttpConnectionError";
	status;
	statusText;
	buffer;
	constructor(message, status, statusText, buffer) {
		super(`HTTP connection failed: ${message}`);
		this.status = status;
		this.statusText = statusText;
		this.buffer = buffer;
	}
};
/**
* Known error kinds returned by the SurrealDB server.
* Use these constants for matching against `ServerError.kind`.
*/
const ErrorKind = {
	Validation: "Validation",
	Configuration: "Configuration",
	Thrown: "Thrown",
	Query: "Query",
	Serialization: "Serialization",
	NotAllowed: "NotAllowed",
	NotFound: "NotFound",
	AlreadyExists: "AlreadyExists",
	Connection: "Connection",
	Internal: "Internal"
};
/**
* Base class for all errors originating from the SurrealDB server.
* Replaces the former `ResponseError` class.
*
* Server errors carry structured information:
* - `kind` — the error category (e.g. `"NotAllowed"`, `"NotFound"`)
* - `code` — legacy JSON-RPC numeric error code (0 when unavailable)
* - `details` — kind-specific structured details from the server (`{ kind, details? }` format)
* - `cause` — optional inner `ServerError` forming a recursive error chain
*
* The `cause` field mirrors Rust's `Option<Box<Error>>` — each error can
* optionally wrap an inner error, creating a stack of structured errors.
* It is set as the native `Error.cause` so that standard JS tooling
* (Node.js, Chrome DevTools, debuggers) displays the full chain
* automatically using the `[cause]:` format.
*
* Use `instanceof` on subclasses (e.g. `NotFoundError`, `NotAllowedError`)
* for type-safe matching, or check the `kind` property directly.
*/
var ServerError = class extends SurrealError {
	get name() {
		return `ServerError [${this.kind}]`;
	}
	/** The structured error kind (e.g. "NotAllowed", "NotFound", "Internal") */
	kind;
	/** Legacy JSON-RPC error code. 0 when not available (e.g. query result errors). */
	code;
	/**
	* Kind-specific structured details using the `{ kind, details? }` wire format.
	* `undefined` when not provided by the server. Subclasses narrow this type
	* to their specific detail union (e.g. `NotAllowedErrorDetail`).
	*/
	details;
	constructor(options) {
		const innerCause = options.cause ?? void 0;
		super(options.message, innerCause ? { cause: innerCause } : void 0);
		this.kind = options.kind;
		this.code = options.code ?? 0;
		this.details = options.details ?? void 0;
		markSymbol(this, SERVER_ERROR_SYMBOL);
	}
};
/**
* Server error: validation failure (parse error, invalid request/params, bad input).
*/
var ValidationError = class extends ServerError {
	kind = "Validation";
	get name() {
		return "ValidationError";
	}
	/** True if this is a SurrealQL parse error. */
	get isParseError() {
		return this.details?.kind === "Parse";
	}
	/** The name of the invalid parameter, if applicable. */
	get parameterName() {
		if (this.details?.kind !== "InvalidParameter") return void 0;
		return this.details.details?.name;
	}
};
/**
* Server error: feature or configuration not supported (live queries, GraphQL).
*/
var ConfigurationError = class extends ServerError {
	kind = "Configuration";
	get name() {
		return "ConfigurationError";
	}
	/** True if live queries are not supported by the server configuration. */
	get isLiveQueryNotSupported() {
		return this.details?.kind === "LiveQueryNotSupported";
	}
};
/**
* Server error: user-thrown error via THROW in SurrealQL.
*/
var ThrownError = class extends ServerError {
	kind = "Thrown";
	get name() {
		return "ThrownError";
	}
};
/**
* Server error: query execution failure (timeout, cancelled, not executed).
*/
var QueryError = class extends ServerError {
	kind = "Query";
	get name() {
		return "QueryError";
	}
	/** True if the query was not executed (e.g. due to a prior error in the batch). */
	get isNotExecuted() {
		return this.details?.kind === "NotExecuted";
	}
	/** True if the query timed out. */
	get isTimedOut() {
		return this.details?.kind === "TimedOut";
	}
	/** True if the query was cancelled. */
	get isCancelled() {
		return this.details?.kind === "Cancelled";
	}
	/**
	* True if the query failed due to a transaction conflict (a concurrent
	* transaction wrote to the same data). Such errors are safe to retry.
	*/
	get isTransactionConflict() {
		return this.details?.kind === "TransactionConflict";
	}
	/**
	* The timeout which was exceeded, if this is a timeout error, or `undefined` otherwise.
	*
	* This is always a `Duration`, whichever engine or protocol received the error, so it can
	* be used as is, e.g. passed to `.timeout()` of a query builder.
	*/
	get timeout() {
		if (this.details?.kind !== "TimedOut") return void 0;
		const duration$1 = this.details.details?.duration;
		if (!duration$1) return void 0;
		if (duration$1 instanceof Duration) return duration$1;
		return new Duration([duration$1.secs, duration$1.nanos]);
	}
};
/**
* Server error: serialization or deserialization failure.
*/
var SerializationError = class extends ServerError {
	kind = "Serialization";
	get name() {
		return "SerializationError";
	}
	/** True if this is a deserialization error (as opposed to serialization). */
	get isDeserialization() {
		return this.details?.kind === "Deserialization";
	}
};
/**
* Server error: permission denied, method not allowed, function/scripting blocked.
*/
var NotAllowedError = class extends ServerError {
	kind = "NotAllowed";
	get name() {
		return "NotAllowedError";
	}
	/** True if the auth token has expired. */
	get isTokenExpired() {
		return this.details?.kind === "Auth" && this.details.details?.kind === "TokenExpired";
	}
	/** True if authentication credentials are invalid. */
	get isInvalidAuth() {
		return this.details?.kind === "Auth" && this.details.details?.kind === "InvalidAuth";
	}
	/** True if scripting is blocked. */
	get isScriptingBlocked() {
		return this.details?.kind === "Scripting";
	}
	/** The method name that is not allowed, if applicable. */
	get methodName() {
		if (this.details?.kind !== "Method") return void 0;
		return this.details.details?.name;
	}
	/** The function name that is not allowed, if applicable. */
	get functionName() {
		if (this.details?.kind !== "Function") return void 0;
		return this.details.details?.name;
	}
};
/**
* Server error: resource not found (table, record, namespace, method, etc.).
*/
var NotFoundError = class extends ServerError {
	kind = "NotFound";
	get name() {
		return "NotFoundError";
	}
	/** The table name that was not found, if applicable. */
	get tableName() {
		if (this.details?.kind !== "Table") return void 0;
		return this.details.details?.name;
	}
	/** The record ID that was not found, if applicable. */
	get recordId() {
		if (this.details?.kind !== "Record") return void 0;
		return this.details.details?.id;
	}
	/** The RPC method name that was not found, if applicable. */
	get methodName() {
		if (this.details?.kind !== "Method") return void 0;
		return this.details.details?.name;
	}
	/** The namespace name that was not found, if applicable. */
	get namespaceName() {
		if (this.details?.kind !== "Namespace") return void 0;
		return this.details.details?.name;
	}
	/** The database name that was not found, if applicable. */
	get databaseName() {
		if (this.details?.kind !== "Database") return void 0;
		return this.details.details?.name;
	}
};
/**
* Server error: duplicate resource (record, table, namespace, etc.).
*/
var AlreadyExistsError = class extends ServerError {
	kind = "AlreadyExists";
	get name() {
		return "AlreadyExistsError";
	}
	/** The record ID that already exists, if applicable. */
	get recordId() {
		if (this.details?.kind !== "Record") return void 0;
		return this.details.details?.id;
	}
	/** The table name that already exists, if applicable. */
	get tableName() {
		if (this.details?.kind !== "Table") return void 0;
		return this.details.details?.name;
	}
};
/**
* Server error: unexpected or unknown internal error.
* Also used as the fallback for unrecognized `kind` strings from newer servers.
*/
var InternalError = class extends ServerError {
	kind = "Internal";
	get name() {
		return "InternalError";
	}
};
/**
* @deprecated Use `ServerError` instead. This alias exists for backward compatibility.
*/
const ResponseError = ServerError;
/**
* Thrown when authentication fails
*/
var AuthenticationError = class extends SurrealError {
	name = "AuthenticationError";
	message = "Authentication did not succeed";
	constructor(cause) {
		super();
		this.cause = cause;
	}
};
/**
* Thrown when the `authentication` resolver provided to `connect()` throws, or returns
* something which is not a token, authentication details, or `null`. The underlying
* problem is available as the `cause`.
*
* The message deliberately does not repeat the cause, nor anything which was returned,
* as either may contain credentials.
*
* When the resolver is evaluated for a request, the request is not sent and the state of
* the session is left as it was.
*/
var AuthResolverError = class extends AuthenticationError {
	name = "AuthResolverError";
	message = "The authentication resolver did not provide usable credentials";
};
/**
* Thrown when a live subscription fails to listen
*/
var LiveSubscriptionError = class extends SurrealError {
	name = "LiveSubscriptionError";
	constructor(messageOrCause) {
		if (typeof messageOrCause === "string") super(messageOrCause);
		else {
			super("Live subscription failed to listen");
			this.cause = messageOrCause;
		}
	}
};
/**
* Thrown when the version of the remote datastore is not supported
*/
var UnsupportedVersionError = class extends SurrealError {
	name = "UnsupportedVersionError";
	version;
	minimum;
	maximum;
	constructor(version, minimum, maximum) {
		super(`The version "${version}" reported by the engine is not supported by this library, expected a version that satisfies >= ${minimum} < ${maximum}`);
		this.version = version;
		this.minimum = minimum;
		this.maximum = maximum;
	}
};
/**
* Thrown when a SurrealQL expression fails to compute
*/
var ExpressionError = class extends SurrealError {
	name = "ExpressionError";
	constructor(messageOrCause) {
		if (typeof messageOrCause === "string") super(messageOrCause);
		else {
			super("Failed to parse invalid expression");
			this.cause = messageOrCause;
		}
	}
};
/**
* Thrown when one or more subscribers throw an error
*/
var PublishError = class PublishError extends SurrealError {
	name = "PublishError";
	message = "One or more subscribers threw an error:";
	/**
	* The errors thrown by the subscribers, as published. A subscriber that
	* publishes to its own subscribers can contribute a nested `PublishError`.
	*/
	causes;
	/**
	* The errors thrown by the subscribers, with nested `PublishError`s
	* replaced by their own leaf causes.
	*/
	leafCauses;
	constructor(causes) {
		super();
		this.causes = causes;
		this.leafCauses = causes.flatMap((cause) => cause instanceof PublishError ? cause.leafCauses : [cause]);
		for (const cause of this.leafCauses) this.message += `\n  - ${cause instanceof Error ? cause.message : cause}`;
	}
};
/**
* Thrown when a feature is not supported by the current engine
*/
var UnsupportedFeatureError = class extends SurrealError {
	name = "UnsupportedFeatureError";
	feature;
	constructor(feature) {
		super(`The configured engine does not support the feature: ${feature.name}`);
		this.feature = feature;
	}
};
/**
* Thrown when a feature is not available in the used version of SurrealDB
*/
var UnavailableFeatureError = class extends SurrealError {
	name = "UnavailableFeatureError";
	feature;
	version;
	constructor(feature, version) {
		super(`The version of SurrealDB (${version}) does not support the feature: ${feature.name} (>= ${feature.sinceVersion} < ${feature.untilVersion})`);
		this.feature = feature;
		this.version = version;
	}
};
/**
* Thrown when a session is invalid
*/
var InvalidSessionError = class extends SurrealError {
	name = "InvalidSessionError";
	message = "The provided session is invalid";
	session;
	constructor(session) {
		super(`Invalid session: ${session}`);
		this.session = session;
	}
};
/**
* Thrown when a value did not match the schema it was checked against, which is a client side
* check and happens before a request is sent (for arguments and request bodies), or after a
* response was received (for results and response bodies). Use `instanceof` to tell it from the
* `ValidationError` of the server.
*/
var SchemaValidationError = class extends SurrealError {
	name = "SchemaValidationError";
	/** What was being validated, such as `arguments for fn::add`. */
	subject;
	/** Every issue the schema reported, with the path of the failing value. */
	issues;
	constructor(subject, issues) {
		const lines = issues.map((issue) => {
			const path = issue.path?.map((segment) => String(typeof segment === "object" ? segment.key : segment)).join(".");
			return `  - ${path ? `${path}: ` : ""}${issue.message}`;
		});
		super(`Invalid ${subject}: ${issues.length} validation error${issues.length === 1 ? "" : "s"}\n${lines.join("\n")}`);
		this.subject = subject;
		this.issues = issues;
	}
};
/**
* Thrown when an API request was unsuccessful
*/
var UnsuccessfulApiError = class extends SurrealError {
	name = "UnsuccessfulApiError";
	path;
	method;
	response;
	constructor(path, method, response) {
		super(`The ${method.toUpperCase()} ${path} request failed with status ${response.status}`);
		this.path = path;
		this.method = method;
		this.response = response;
	}
};
/**
* Thrown when an import was executed, but some of its statements did not apply.
*
* An import is not transactional: each statement is applied on its own, and the import carries on
* past one which fails, so every statement which is not reported here was applied. Reported by
* SurrealDB 3.1 and later over HTTP and WebSocket connections, which answer an import with the
* statements which failed.
*/
var ImportError = class extends SurrealError {
	name = "ImportError";
	/** The statements which failed, as server errors, up to the first hundred */
	failures;
	/** How many statements failed */
	failed;
	constructor(failures, failed) {
		const count = `${failed} ${failed === 1 ? "statement" : "statements"}`;
		const first = failures[0]?.message;
		super(first === void 0 ? `${count} of the import failed` : `${count} of the import failed. The first failed with: ${first}`, failures[0] ? { cause: failures[0] } : void 0);
		this.failures = failures;
		this.failed = failed;
	}
};

//#endregion
//#region src/internal/abort.ts
/**
* Helpers for cancelling work with an `AbortSignal`.
*
* Everything here is written for the lowest common denominator of the runtimes
* the SDK supports. `AbortSignal.any` and `AbortSignal.timeout` are used when
* they exist, and replaced by a small equivalent when they do not (React Native,
* older browsers). `signal.reason` is likewise not assumed: runtimes which do
* not record one are given an `AbortError` instead of `undefined`.
*
* A signal which aborts is reported with its own `reason`, untouched. That is
* what lets an `AbortError` from `controller.abort()` and the `TimeoutError`
* from `AbortSignal.timeout()` pass through the SDK unchanged, so a caller can
* tell a user abort from a timeout the way they would with `fetch`.
*/
const noop = () => {};
/** The largest delay `setTimeout` accepts. Anything above fires immediately. */
const MAX_TIMER_DELAY = 2 ** 31 - 1;
/**
* Create an `Error` with a given `name`, as a `DOMException` where the runtime has one.
*/
function createNamedError(message, name) {
	if (typeof DOMException === "function") return new DOMException(message, name);
	const error = new Error(message);
	error.name = name;
	return error;
}
/**
* The reason a signal was aborted with.
*
* Runtimes which predate `AbortSignal.reason` leave it `undefined`, in which
* case an `AbortError` stands in for it.
*/
function abortReason(signal) {
	return signal.reason !== void 0 ? signal.reason : createNamedError("This operation was aborted", "AbortError");
}
/**
* Throw the reason of a signal if it has already aborted.
*/
function throwIfAborted(signal) {
	if (signal?.aborted) throw abortReason(signal);
}
/**
* Add a signal to those already carried by a query. A missing signal changes nothing.
*/
function addSignal(signals, signal) {
	return signal ? [...signals ?? [], signal] : signals;
}
/**
* Reject a timeout which could not be honoured. `0` is allowed, and means none.
*/
function assertTimeout(value, name) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new SurrealError(`${name} must be a finite number of milliseconds, 0 or greater`);
}
/**
* Fold signals, and optionally a timeout, into a single signal.
*
* The result aborts with the reason of whichever source aborts first, so a
* timeout surfaces as the `TimeoutError` of `AbortSignal.timeout()`.
*
* Where the runtime provides `AbortSignal.any`, the work is left to it and
* `dispose` has nothing to do. Elsewhere the sources are watched by listeners,
* which `dispose` removes, so that a signal outliving the work (an application
* wide one, say) is not left holding on to every request it was ever combined
* into.
*
* @param sources The signals to combine, ignoring missing ones
* @param timeout A delay in milliseconds after which to abort, where above zero
*/
function abortScope(sources, timeout) {
	const signals = sources.filter((source) => source !== void 0);
	const cleanups = [];
	const dispose = () => {
		for (const cleanup of cleanups.splice(0)) cleanup();
	};
	if (timeout !== void 0 && timeout > 0) if (typeof AbortSignal.timeout === "function") signals.push(AbortSignal.timeout(timeout));
	else {
		const controller = new AbortController();
		const timer = setTimeout(() => {
			controller.abort(createNamedError("The operation timed out.", "TimeoutError"));
		}, Math.min(timeout, MAX_TIMER_DELAY));
		timer.unref?.();
		cleanups.push(() => clearTimeout(timer));
		signals.push(controller.signal);
	}
	if (signals.length === 0) return {
		signal: void 0,
		dispose
	};
	if (signals.length === 1) return {
		signal: signals[0],
		dispose
	};
	if (typeof AbortSignal.any === "function") return {
		signal: AbortSignal.any(signals),
		dispose
	};
	const combined = new AbortController();
	const aborted = signals.find((signal) => signal.aborted);
	if (aborted) {
		combined.abort(abortReason(aborted));
		return {
			signal: combined.signal,
			dispose
		};
	}
	for (const signal of signals) {
		const onAbort = () => {
			combined.abort(abortReason(signal));
			dispose();
		};
		signal.addEventListener("abort", onAbort, { once: true });
		cleanups.push(() => signal.removeEventListener("abort", onAbort));
	}
	return {
		signal: combined.signal,
		dispose
	};
}
/**
* Wait for a promise, but no longer than the signal allows.
*
* When the signal aborts first, the returned promise rejects with its reason at
* once, and whatever the original promise later does is ignored. A value it
* resolves with after that is handed to `discard`, so that a resource which
* nobody will use can still be released.
*
* @param promise The work to wait for
* @param signal The signal which ends the wait
* @param discard Releases a value which arrives after the wait has ended
*/
function raceAbort(promise, signal, discard) {
	if (!signal) return promise;
	if (signal.aborted) {
		promise.then(discard, noop);
		return Promise.reject(abortReason(signal));
	}
	return new Promise((resolve, reject) => {
		let settled = false;
		const onAbort = () => {
			settled = true;
			reject(abortReason(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then((value) => {
			signal.removeEventListener("abort", onAbort);
			if (settled) discard?.(value);
			else {
				settled = true;
				resolve(value);
			}
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			if (!settled) {
				settled = true;
				reject(error);
			}
		});
	});
}
/**
* Sleep for a number of milliseconds, ending early with the reason of the
* signal should it abort in the meantime.
*/
function abortableSleep(milliseconds, signal) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(abortReason(signal));
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			reject(abortReason(signal));
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, milliseconds);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
/**
* Let go of an iterator which will not be read again, without waiting for it.
*
* An async generator parked on an `await` only acts on `return()` once that
* await settles, so the request is made and its outcome deliberately ignored.
*/
function release(iterator) {
	try {
		Promise.resolve(iterator.return?.()).catch(noop);
	} catch {}
}
/**
* Read an async iterable only for as long as a signal permits.
*
* When the signal aborts, a read in flight rejects with the signal's reason at
* once instead of waiting for the source, and the source is released straight
* away, so that whatever it holds (a request, a stream on the server) is let go
* of even when nobody is currently reading. If nobody was, the reason is raised
* on the next read. Either way the iteration is then over.
*
* Leaving the iteration early, with `break` or an exception, releases the
* source as well and stops watching the signal.
*
* This is deliberately a hand written iterator rather than a generator: a
* generator cannot be returned while it is parked on an await, which is exactly
* the state a stalled request leaves it in.
*
* @param source The iterable to read
* @param signal The signal which ends the iteration
* @param onEnd Called once when the iteration ends, however it does
*/
function abortableIterable(source, signal, onEnd) {
	if (!signal) return source;
	return { [Symbol.asyncIterator]() {
		const iterator = source[Symbol.asyncIterator]();
		let state = "open";
		let failPending;
		const end = () => {
			signal.removeEventListener("abort", onAbort);
			onEnd?.();
		};
		const onAbort = () => {
			if (state !== "open") return;
			end();
			release(iterator);
			if (failPending) {
				state = "closed";
				failPending(abortReason(signal));
			} else state = "aborted";
		};
		if (signal.aborted) {
			state = "aborted";
			end();
			release(iterator);
		} else signal.addEventListener("abort", onAbort, { once: true });
		return {
			next() {
				if (state === "aborted") {
					state = "closed";
					return Promise.reject(abortReason(signal));
				}
				if (state === "closed") return Promise.resolve({
					done: true,
					value: void 0
				});
				return new Promise((resolve, reject) => {
					failPending = reject;
					iterator.next().then((result) => {
						failPending = void 0;
						if (state === "open" && result.done) {
							state = "closed";
							end();
						}
						resolve(result);
					}, (error) => {
						failPending = void 0;
						if (state === "open") {
							state = "closed";
							end();
						}
						reject(error);
					});
				});
			},
			return(value) {
				if (state === "open") end();
				state = "closed";
				return iterator.return ? iterator.return(value) : Promise.resolve({
					done: true,
					value
				});
			},
			throw(error) {
				if (state === "open") end();
				state = "closed";
				return iterator.throw ? iterator.throw(error) : Promise.reject(error);
			}
		};
	} };
}

//#endregion
//#region src/internal/get-incremental-id.ts
let id = 0;
function getIncrementalID() {
	id = (id + 1) % Number.MAX_SAFE_INTEGER;
	return id.toString();
}

//#endregion
//#region src/internal/validation.ts
function isExpression(value) {
	return !!value && typeof value === "object" && "toSQL" in value;
}

//#endregion
//#region src/utils/bound-query.ts
/**
* Merge source bindings into target, throwing on duplicate keys.
*
* @param target The target bindings object to merge into
* @param source The source bindings object to merge from
*/
function mergeBindings(target, source) {
	for (const key of Object.keys(source)) if (key in target) throw new ExpressionError(`Parameter conflict: '${key}' already exists in this BoundQuery`);
	Object.assign(target, source);
}
/**
* A bound query represents a query string combined with bindings.
*/
var BoundQuery = class BoundQuery {
	static [Symbol.hasInstance](instance) {
		return hasSymbol(instance, BOUND_QUERY_SYMBOL);
	}
	#query;
	#bindings;
	constructor(query, bindings) {
		if (query instanceof BoundQuery) {
			const bq = query;
			this.#query = bq.query;
			this.#bindings = { ...bq.bindings };
		} else if (query) {
			this.#query = query;
			this.#bindings = { ...bindings };
		} else {
			this.#query = "";
			this.#bindings = {};
		}
		markSymbol(this, BOUND_QUERY_SYMBOL);
	}
	/**
	* Retrieves the query string.
	*/
	get query() {
		return this.#query;
	}
	/**
	* Retrieves a copy of the configured bindings.
	*/
	get bindings() {
		return { ...this.#bindings };
	}
	append(other, ...values) {
		const _other = this.#extractQuery(other, values);
		if (_other.#bindings) mergeBindings(this.#bindings, _other.#bindings);
		this.#query += _other.query;
		return this;
	}
	#extractQuery(other, values) {
		if (other instanceof BoundQuery) return other;
		if (typeof other === "string") return new BoundQuery(other, values[0]);
		if (Array.isArray(other)) return surql(other, ...values);
		throw new ExpressionError("Invalid query component");
	}
};

//#endregion
//#region src/utils/expr.ts
const _join = (xs, op) => ({ toSQL: (ctx) => {
	const parts = xs.filter(Boolean).map((e) => e.toSQL(ctx)).filter(Boolean);
	if (!parts.length) return "";
	if (parts.length === 1) return parts[0];
	return `(${parts.join(` ${op} `)})`;
} });
/**
* Parse a SurrealQL expression to a BoundQuery
*
* @param expr The SurrealQL expression
* @returns A BoundQuery instance
*/
function expr(expr$1) {
	const params = {};
	const ctx = { def(value) {
		const bindingName = `bind__${getIncrementalID()}`;
		params[bindingName] = value;
		return `$${bindingName}`;
	} };
	try {
		return new BoundQuery(expr$1 ? expr$1.toSQL(ctx) : "", params);
	} catch (error) {
		throw new ExpressionError(error);
	}
}
/**
* Represents a raw SurrealQL expression
*
* **IMPORTANT**: This function should only be used when no other operator is applicable.
* Incorrect use of this function will risk exposing queries to SQL injection.
*
* @param s The raw value
*/
const raw = (s$1) => ({ toSQL: () => s$1 });
/**
* Represents a equality comparison operation (=)
*
* @param field The field name
* @param v The value to compare against
*/
const eq = (field, v) => ({ toSQL: (ctx) => `${field} = ${ctx.def(v)}` });
/**
* Represents an exact equality comparison operation (==)
*
* @param field The field name
* @param v The value to compare against
*/
const eeq = (field, v) => ({ toSQL: (ctx) => `${field} == ${ctx.def(v)}` });
/**
* Represents a not equal comparison operation (!=)
*
* @param field The field name
* @param v The value to compare against
*/
const ne = (field, v) => ({ toSQL: (ctx) => `${field} != ${ctx.def(v)}` });
/**
* Represents a greater than comparison operation (>)
*
* @param field The field name
* @param v The value to compare against
*/
const gt = (field, v) => ({ toSQL: (ctx) => `${field} > ${ctx.def(v)}` });
/**
* Represents a greater than or equal to comparison operation (>=)
*
* @param field The field name
* @param v The value to compare against
*/
const gte = (field, v) => ({ toSQL: (ctx) => `${field} >= ${ctx.def(v)}` });
/**
* Represents a less than comparison operation (<)
*
* @param field The field name
* @param v The value to compare against
*/
const lt = (field, v) => ({ toSQL: (ctx) => `${field} < ${ctx.def(v)}` });
/**
* Represents a less than or equal to comparison operation (<=)
*
* @param field The field name
* @param v The value to compare against
*/
const lte = (field, v) => ({ toSQL: (ctx) => `${field} <= ${ctx.def(v)}` });
/**
* Represents a contains operation (CONTAINS)
*
* @param field The field name
* @param v The value to compare against
*/
const contains = (field, v) => ({ toSQL: (ctx) => `${field} CONTAINS ${ctx.def(v)}` });
/**
* Represents a contains any operation (CONTAINSANY)
*
* @param field The field name
* @param v The value to compare against
*/
const containsAny = (field, v) => ({ toSQL: (ctx) => `${field} CONTAINSANY ${ctx.def(v)}` });
/**
* Represents a contains all operation (CONTAINSALL)
*
* @param field The field name
* @param v The value to compare against
*/
const containsAll = (field, v) => ({ toSQL: (ctx) => `${field} CONTAINSALL ${ctx.def(v)}` });
/**
* Represents a contains none operation (CONTAINSNONE)
*
* @param field The field name
* @param v The value to compare against
*/
const containsNone = (field, v) => ({ toSQL: (ctx) => `${field} CONTAINSNONE ${ctx.def(v)}` });
/**
* Represents an inside operation (INSIDE)
*
* @param field The field name
* @param v The value to compare against
*/
const inside = (field, v) => ({ toSQL: (ctx) => `${field} INSIDE ${ctx.def(v)}` });
/**
* Represents a geometry outside operation (OUTSIDE)
*
* @param field The field name
* @param g The value to compare against
*/
const outside = (field, g) => ({ toSQL: (ctx) => `${field} OUTSIDE ${ctx.def(g)}` });
/**
* Represents a geometry intersects operation (INTERSECTS)
*
* @param field The field name
* @param g The value to compare against
*/
const intersects = (field, g) => ({ toSQL: (ctx) => `${field} INTERSECTS ${ctx.def(g)}` });
/**
* Represents a full-text search match operation (@@)
*
* @param field The field name
* @param q The value to compare against
* @param ref The optional reference number
*/
const matches = (field, q, ref) => ({ toSQL: (ctx) => `${field} ${Number.isInteger(ref) ? `@${ref}@` : "@@"} ${ctx.def(q)}` });
/**
* Represents a KNN nearest neighbor operation
*
* Supported operations include:
* - Brute Force: <|n,metric|>, where n is the number of neighbors and metric is the metric to use
* - MTree: <|n|>, where n is the number of neighbors
* - HNSW: <|n,ef|>, where n is the number of neighbors and ef is the ef
*
* @param field The field name
* @param v The value to compare against
* @param neighbors The number of neighbors
* @param metricOrEf The optional metric or ef
*/
const knn = (field, v, neighbors, metricOrEf) => ({ toSQL: (ctx) => {
	if (!Number.isInteger(neighbors)) throw new ExpressionError("neighbors must be an integer");
	if (metricOrEf !== void 0 && !Number.isInteger(metricOrEf) && !/\w+/.test(metricOrEf)) throw new ExpressionError("metric is invalid");
	return `${field} <|${neighbors}${metricOrEf ? `,${metricOrEf}` : ""}|> ${ctx.def(v)}`;
} });
/**
* Represents a between operation. This is a shortcut for `and(gte(field, a), lte(field, b))`
*
* @param field The field name
* @param a The lower bound
* @param b The upper bound
*/
const between = (field, a, b) => ({ toSQL: (ctx) => and(gte(field, a), lte(field, b)).toSQL(ctx) });
/**
* Represents a logical AND operation
*
* @param exprs The expressions to join
* @returns A new expression
*/
const and = (...exprs) => _join(exprs, "AND");
/**
* Represents a logical OR operation
*
* @param exprs The expressions to join
* @returns A new expression
*/
const or = (...exprs) => _join(exprs, "OR");
/**
* Represents a logical NOT operation
*
* @param expr The expression to negate
* @returns A new expression
*/
const not = (expr$1) => ({ toSQL: (ctx) => {
	const s$1 = expr$1 && expr$1.toSQL(ctx);
	return s$1 ? `NOT(${s$1})` : "";
} });

//#endregion
//#region src/utils/tagged-template.ts
/**
* A template literal tag function for creating BoundQuery instances from query strings.
* Interpolated values are automatically stored as bindings with unique names.
*
* The result type can be specified to type the rows the query returns,
* e.g. `surql<[User[]]>` for a query whose first statement yields `User[]`.
*
* @param strings The template string segments
* @param values The interpolated values
* @example const query = surql`SELECT * FROM users WHERE name = ${name}`;
* @example const query = surql<[User[]]>`SELECT * FROM user`;
* @returns A BoundQuery instance
*/
function surql(strings, ...values) {
	const bindings = {};
	let result = "";
	for (let i = 0; i < strings.length; i++) {
		result += strings[i];
		if (i < values.length) {
			const value = values[i];
			if (value instanceof BoundQuery) {
				result += value.query;
				mergeBindings(bindings, value.bindings);
			} else if (isExpression(value)) {
				const built = expr(value);
				result += built.query;
				mergeBindings(bindings, built.bindings);
			} else {
				const bindingName = `bind__${getIncrementalID()}`;
				result += `$${bindingName}`;
				bindings[bindingName] = value;
			}
		}
	}
	return new BoundQuery(result, bindings);
}

//#endregion
//#region src/internal/api-invocation.ts
/**
* The `api::invoke` query which invokes a custom API inside the datastore, for engines which
* have no other way to, and for an API call compiled or streamed as a query.
*/
function apiInvocation(path, { body, method, headers, query }) {
	return surql`api::invoke(${path}, ${{
		body,
		method,
		headers,
		query
	}})`;
}

//#endregion
//#region src/internal/tokens.ts
function fastParseJwt(token) {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;
		return JSON.parse(atob(parts[1]));
	} catch {
		return null;
	}
}
/**
* Read the expiry of a JWT, in seconds since the epoch. Returns undefined for a token which
* is not a JWT, such as an opaque token, or which carries no usable `exp` claim.
*/
function tokenExpiry(token) {
	const exp = fastParseJwt(token)?.exp;
	return typeof exp === "number" && Number.isFinite(exp) ? exp : void 0;
}
/**
* How long, in seconds, to wait before renewing a credential which has `remaining` seconds
* left. The renewal happens `margin` seconds before expiry, unless the credential does not
* live much longer than the margin, in which case the margin is skipped and the expiry is used.
*/
function renewalDelay(remaining, margin) {
	return Math.min(remaining, Math.max(remaining - margin, margin));
}

//#endregion
//#region src/internal/request-credentials.ts
/**
* Validate a cache policy, throwing when it cannot be honoured.
*/
function assertAuthCache(cache) {
	if (cache === "until-expiry" || cache === "none") return;
	if (typeof cache === "object" && cache !== null && typeof cache.ttl === "number" && Number.isFinite(cache.ttl) && cache.ttl > 0) return;
	throw new SurrealError("The authentication cache must be \"until-expiry\", \"none\", or { ttl } with a positive number of seconds");
}
/**
* Holds the credentials resolved for requests, for each session, and decides when a
* credential has to be resolved again.
*
* - A credential is reused until shortly before its expiry, governed by the margin, and
*   no longer than the `ttl` of the policy. A credential without a known expiry is only
*   reused when the policy has a `ttl`.
* - Concurrent requests which need a credential share a single resolution.
* - A failed resolution is not remembered. The next request resolves again.
*
* With the `"none"` policy nothing is stored and nothing is shared, so that the resolver
* is evaluated once per request. This matters when its answer depends on who is asking. Only
* when resolving applies the credential to a session held on the other side (`serialize`)
* are the resolutions for one session made one after the other, as the session ends up with
* what the last of them applied.
*/
var RequestCredentials = class {
	#cache;
	#margin;
	#now;
	#entries = /* @__PURE__ */ new Map();
	#inflight = /* @__PURE__ */ new Map();
	#queues = /* @__PURE__ */ new Map();
	#serialize;
	#epoch = 0;
	constructor(options) {
		assertAuthCache(options.cache);
		this.#cache = options.cache;
		this.#serialize = options.serialize ?? false;
		this.#margin = options.margin;
		this.#now = options.now ?? (() => Date.now());
	}
	/**
	* Retrieve the credential for a session, invoking `load` when there is no reusable one.
	*
	* @param session The session the credential is for
	* @param load Resolves a new credential
	* @param rejected A token the server refused. It is not returned from the cache, but a
	* different token resolved in the meantime is.
	* @param signal The signal of the request which is waiting. The wait ends with its reason when
	* it aborts, and the resolution goes on without it, for the requests which share it and for
	* those which follow. A resolution which is queued and has not begun by then does not begin.
	*/
	async get(session, load, rejected, signal) {
		const key = keyOf(session);
		throwIfAborted(signal);
		if (this.#cache === "none") return this.#serialize ? raceAbort(this.#enqueue(key, load, signal), signal) : raceAbort(load(), signal);
		const entry = this.#entries.get(key);
		if (entry && entry.until > this.#now() && (rejected === void 0 || entry.token !== rejected)) return entry.token;
		const pending = this.#inflight.get(key);
		if (pending) return raceAbort(pending, signal);
		const epoch = this.#epoch;
		const resolution = this.#resolve(key, load, epoch).finally(() => {
			if (this.#inflight.get(key) === resolution) this.#inflight.delete(key);
		});
		this.#inflight.set(key, resolution);
		return raceAbort(resolution, signal);
	}
	/**
	* Run `load` after the resolutions which were asked for before it, for the same session
	*/
	#enqueue(key, load, signal) {
		const previous = this.#queues.get(key);
		const turn = () => {
			throwIfAborted(signal);
			return load();
		};
		const run = previous ? previous.then(turn) : turn();
		const tail = run.then(() => void 0, () => void 0).finally(() => {
			if (this.#queues.get(key) === tail) this.#queues.delete(key);
		});
		this.#queues.set(key, tail);
		return run;
	}
	async #resolve(key, load, epoch) {
		const token = await load();
		const until = this.#reuseUntil(token);
		if (epoch === this.#epoch && until > this.#now()) this.#entries.set(key, {
			token,
			until
		});
		else this.#entries.delete(key);
		return token;
	}
	/**
	* Discard what is remembered for a session. A resolution which is still in flight for
	* it is not remembered once it completes.
	*/
	forget(session) {
		const key = keyOf(session);
		this.#epoch++;
		this.#entries.delete(key);
		this.#inflight.delete(key);
	}
	/**
	* Discard what is remembered for every session.
	*/
	clear() {
		this.#epoch++;
		this.#entries.clear();
		this.#inflight.clear();
	}
	#reuseUntil(token) {
		const now = this.#now();
		const expiry = token === void 0 ? void 0 : tokenExpiry(token);
		let until = 0;
		if (expiry !== void 0) {
			const remaining = expiry - now / 1e3;
			if (remaining > 0) until = now + renewalDelay(remaining, this.#margin()) * 1e3;
		}
		if (typeof this.#cache === "object") {
			const bound = now + this.#cache.ttl * 1e3;
			until = expiry !== void 0 ? Math.min(until, bound) : bound;
		}
		return until;
	}
};
function keyOf(session) {
	return session ? session.toString() : "";
}

//#endregion
//#region src/internal/auth-provider.ts
/**
* Tell apart the ways in which authentication may be provided to a connection.
*/
function parseAuthentication(authentication) {
	if (typeof authentication === "object" && authentication !== null && "resolve" in authentication) {
		if (typeof authentication.resolve !== "function") throw new SurrealError("The authentication resolver must be a function");
		if (authentication.when === "request") {
			const cache = authentication.cache ?? "none";
			assertAuthCache(cache);
			return {
				provider: void 0,
				request: {
					resolve: authentication.resolve,
					cache
				}
			};
		}
		if (authentication.when !== void 0 && authentication.when !== "connect") throw new SurrealError("The authentication resolver must be evaluated on \"connect\" or on \"request\"");
		return {
			provider: authentication.resolve,
			request: void 0
		};
	}
	return {
		provider: authentication,
		request: void 0
	};
}
/**
* Evaluate the authentication provider for a session. A provider which throws, or which
* returns something which cannot be used, is reported as an `AuthResolverError`. What was
* returned is never included, as it may be a credential.
*/
async function invokeProvider(provider, session) {
	let provided;
	try {
		provided = typeof provider === "function" ? await provider(session) : provider;
	} catch (error) {
		throw new AuthResolverError(error);
	}
	if (provided === null || typeof provided === "string" && provided.length > 0 || typeof provided === "object" && !Array.isArray(provided)) return provided;
	throw new AuthResolverError(/* @__PURE__ */ new TypeError(`Expected a token, authentication details or null, but received ${describeValue(provided)}`));
}
/**
* Check the credential of a call which is to run as someone else. An unusable credential is
* refused outright, as ignoring it would run the call as the session instead.
*/
function assertCredential(credential) {
	if (typeof credential === "string" && credential.length > 0 || typeof credential === "object" && credential !== null && !Array.isArray(credential)) return;
	throw new AuthenticationError(/* @__PURE__ */ new TypeError(`Expected a token or authentication details, but received ${describeValue(credential)}`));
}
/**
* Describe the kind of a value which was not acceptable, without repeating the value, as it
* may be a credential.
*/
function describeValue(value) {
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	if (typeof value === "string") return "an empty string";
	return `a value of type ${typeof value}`;
}

//#endregion
//#region src/internal/dispatched-promise.ts
/** Satisfies the `Promise` constructor without settling the inherited state. */
const NOOP = () => {};
var DispatchedPromise = class extends Promise {
	/**
	* The promise which actually carries this one's state.
	*
	* `then` / `catch` / `finally` all delegate here rather than to `super`, and the
	* inherited promise state (settled by the `NOOP` executor above, i.e. never) is
	* deliberately unused. That indirection is what makes this class portable:
	*
	* React Native replaces the global `Promise` with a JavaScript polyfill (the `promise`
	* package) whose `then` sends any subclass down a `safeThen` path that does
	* `new self.constructor(executor)`. This constructor takes no arguments and cannot
	* honour that executor - and neither can subclasses such as `Query`, whose
	* constructors have their own signatures - so the promise returned to the caller would
	* never settle, hanging every lazily dispatched API on React Native. `Symbol.species`
	* does not help, because the polyfill reads `self.constructor` rather than species.
	*
	* Delegating to a plain `Promise` sidesteps the whole problem: its `constructor` *is*
	* `Promise`, so the fast path is always taken, on every runtime.
	*/
	#inner;
	#resolve;
	#reject;
	#dispatched = false;
	constructor() {
		super(NOOP);
		this.#inner = new Promise((resolve, reject) => {
			this.#resolve = resolve;
			this.#reject = reject;
		});
	}
	#ensureDispatched() {
		if (!this.#dispatched) {
			this.#dispatched = true;
			this.dispatch().then(this.#resolve, this.#reject);
		}
		return this.#inner;
	}
	then(onfulfilled, onrejected) {
		return this.#ensureDispatched().then(onfulfilled, onrejected);
	}
	catch(onrejected) {
		return this.#ensureDispatched().catch(onrejected);
	}
	finally(onfinally) {
		return this.#ensureDispatched().finally(onfinally);
	}
	static get [Symbol.species]() {
		return Promise;
	}
	get [Symbol.toStringTag]() {
		return "DispatchedPromise";
	}
};

//#endregion
//#region src/internal/maybe-jsonify.ts
function maybeJsonify(value, apply) {
	return apply ? jsonify(value) : value;
}

//#endregion
//#region src/internal/standard-schema.ts
/**
* Check `value` against a Standard Schema, returning what the schema produced (which may differ
* from the input when the schema transforms or coerces) or throwing a `SchemaValidationError`
* listing every issue.
*/
async function validateWith(schema, value, subject) {
	const result = await schema["~standard"].validate(value);
	if (result.issues) throw new SchemaValidationError(subject, result.issues);
	return result.value;
}

//#endregion
//#region src/internal/credentialed.ts
/**
* Queries which are to be run as another identity than the session, which `.as()` makes.
*
* The mark is on the {@link BoundQuery} such a query sends, which is also what a query builder
* compiles to and what a `Query` exposes as `inner`, so that whatever is combined with others can be
* recognized by it, however it was configured after `.as()`.
*/
const credentialed = /* @__PURE__ */ new WeakSet();
/**
* Mark a query as one which runs as another identity than the session.
*/
function markCredentialed(query) {
	credentialed.add(query);
	return query;
}
/**
* Whether a query runs as another identity than the session.
*/
function isCredentialed(query) {
	return credentialed.has(query);
}

//#endregion
//#region src/internal/rand.ts
function rand(min, max) {
	return Math.random() * (max - min) + min;
}

//#endregion
//#region src/internal/retry.ts
const DEFAULT_RETRY_OPTIONS = {
	enabled: false,
	attempts: 5,
	retryDelay: 100,
	retryDelayMax: 2e3,
	retryDelayMultiplier: 2,
	retryDelayJitter: .1
};
/**
* Determine whether an error represents a retryable SurrealDB transaction conflict.
*
* Under concurrent load a transaction can fail because another transaction wrote to the
* same data. The server reports this with the structured {@link QueryError} detail
* `TransactionConflict` (wire code `-32009`). This predicate matches that detail and
* nothing else — detection is based purely on the structured error, never on the
* human-readable message.
*
* @remarks
* The structured `TransactionConflict` detail is emitted by **SurrealDB 3.1.0 and later**.
* Against older servers this predicate never matches, so the built-in auto-retry will not
* trigger. To retry conflicts reported by an older server, supply your own predicate via
* the {@link RetryOptions.retryable} option (see its documentation for a message-matching
* example).
*
* This is the default predicate used by retry logic. Provide your own through the
* `retryable` option to override or extend it.
*/
function isRetryableConflict(error) {
	return error instanceof QueryError && error.isTransactionConflict;
}
/**
* Stateful tracker for a single retry loop, computing backoff with jitter between attempts.
*
* A fresh instance must be created per retry loop, as it tracks the number of attempts made.
*
* When given a signal, the loop ends as soon as it aborts: a backoff in progress is cut short,
* and no further attempt is started. Either way the reason of the signal is thrown.
*/
var RetryContext = class {
	#attempts = 0;
	#signal;
	options;
	constructor(options, signal) {
		this.options = options;
		this.#signal = signal;
	}
	get attempts() {
		return this.#attempts;
	}
	get enabled() {
		return this.options.enabled;
	}
	/** The predicate used to determine whether an error is a retryable conflict */
	get retryable() {
		return this.options.retryable ?? isRetryableConflict;
	}
	/** Whether another retry attempt is allowed */
	get allowed() {
		if (!this.options.enabled) return false;
		if (this.options.attempts !== -1 && this.#attempts >= this.options.attempts) return false;
		return true;
	}
	/**
	* Wait for the computed backoff delay before the next attempt.
	*
	* Rejects with the reason of the signal, if it aborts before or during the wait.
	*/
	async iterate() {
		this.#attempts++;
		const multiplier = this.options.retryDelayMultiplier ** this.#attempts;
		const adjustedDelay = this.options.retryDelay * multiplier;
		const jitterModifier = rand(-this.options.retryDelayJitter, this.options.retryDelayJitter);
		const nextDelay = Math.min(adjustedDelay * (1 + jitterModifier), this.options.retryDelayMax);
		await abortableSleep(nextDelay, this.#signal);
	}
	/**
	* Execute `fn`, retrying it on retryable conflict errors.
	*
	* When retry is disabled the function is executed exactly once. On a retryable error, the
	* context backs off and retries until its attempts are exhausted, at which point the last
	* error is rethrown. Non-retryable errors are rethrown immediately.
	*
	* If the signal aborts while waiting to retry, the wait ends and its reason is thrown in place
	* of the error being retried. An error which is not retried is thrown as it is.
	*
	* @param fn The work to execute. Receives the zero-based attempt number.
	*/
	async run(fn) {
		const retryable = this.retryable;
		for (;;) try {
			return await fn(this.#attempts);
		} catch (error) {
			if (!this.enabled || !retryable(error) || !this.allowed) throw error;
			await this.iterate();
		}
	}
	static mergeOptions(input, base = DEFAULT_RETRY_OPTIONS) {
		if (input === void 0) return base;
		if (typeof input === "boolean") return {
			...base,
			enabled: input
		};
		return {
			...base,
			...input,
			enabled: input.enabled ?? true
		};
	}
};

//#endregion
//#region src/internal/root-cause.ts
/**
* Pattern for the errors which servers without structured errors report for the statements
* of a transaction that did not run because of another statement's failure.
*/
const LEGACY_SECONDARY = /^The query was not executed due to a (failed|cancelled) transaction/;
/**
* Whether an error only says that a statement did not run because something else in its
* transaction failed, as opposed to being the failure itself.
*
* When a statement fails in a transaction, the server rolls it back and reports every other
* statement as an error too: those before it as "not executed due to a failed transaction",
* those after it as "not executed due to a cancelled transaction", and the `COMMIT` as
* "aborted due to a prior error". Those errors are consequences, never causes.
*/
function isSecondaryError(error) {
	if (error instanceof QueryError && (error.isNotExecuted || error.isCancelled)) return true;
	return !error.details && LEGACY_SECONDARY.test(error.message);
}
/**
* Find the error which made a query fail, among the errors of its statements.
*
* It is **not** the first error in order, when the query holds a transaction: the statements
* which precede the failing one are rewritten to errors too, so the real one can arrive late.
* A transaction which fails to commit because of a conflict, for instance, reports the
* conflict on the `COMMIT`, after an error for every statement before it.
*
* For a query which holds no transaction there is nothing to skip, so this is the first error.
*
* @param errors The error of each statement which failed, in the order they were reported
* @returns The first error which is not a consequence of another, or the first error if all are
*/
function findRootCause(errors) {
	let first;
	for (const error of errors) {
		if (!isSecondaryError(error)) return error;
		first ??= error;
	}
	return first;
}

//#endregion
//#region src/types/trace.ts
/**
* Every kind of trace a query can report, which is what `.trace()` asks for when given none.
*/
const TRACE_KINDS = [
	"relations",
	"references",
	"links",
	"variables",
	"subscriptions"
];

//#endregion
//#region src/internal/trace.ts
/**
* The kinds a call asks for, checked, in a fixed order and without repeats. Asking for none asks
* for every kind, which is what `.trace()` with no arguments means.
*/
function normalizeTraceKinds(kinds) {
	for (const kind of kinds) if (!TRACE_KINDS.includes(kind)) throw new TypeError(`Unknown trace kind "${kind}", expected one of: ${TRACE_KINDS.join(", ")}`);
	const asked = kinds.length > 0 ? kinds : TRACE_KINDS;
	return TRACE_KINDS.filter((kind) => asked.includes(kind));
}
/**
* The trace a frame or a result carries, read off the wire, where entries are tuples. Anything
* which is not a trace, or holds nothing, is no trace at all.
*/
function parseTrace(raw$1) {
	if (typeof raw$1 !== "object" || raw$1 === null || Array.isArray(raw$1)) return void 0;
	const wire = raw$1;
	const trace = {};
	const relations = entries(wire.relations).flatMap((entry) => {
		const [from, edge, out] = entry;
		return edge === void 0 || edge === null ? [] : [{
			in: optional(from),
			edge,
			out: optional(out)
		}];
	});
	if (relations.length > 0) trace.relations = relations;
	const references = entries(wire.references).flatMap((entry) => {
		const [referrer, referenced] = entry;
		return referrer === void 0 || referenced === void 0 ? [] : [{
			referrer,
			referenced
		}];
	});
	if (references.length > 0) trace.references = references;
	const links = entries(wire.links).flatMap((entry) => {
		const [record$1, field, target] = entry;
		return record$1 === void 0 || typeof field !== "string" || target === void 0 ? [] : [{
			record: record$1,
			field,
			target
		}];
	});
	if (links.length > 0) trace.links = links;
	if (typeof wire.variables === "object" && wire.variables !== null && Object.keys(wire.variables).length > 0) trace.variables = { ...wire.variables };
	if (Array.isArray(wire.subscriptions) && wire.subscriptions.length > 0) trace.subscriptions = [...wire.subscriptions];
	if (wire.partial === true) trace.partial = true;
	if (Array.isArray(wire.truncated)) {
		const truncated = wire.truncated.filter((kind) => TRACE_KINDS.includes(kind));
		if (truncated.length > 0) trace.truncated = truncated;
	}
	return Object.keys(trace).length > 0 ? trace : void 0;
}
/**
* The `trace` of a chunk, left off it when there is none, so that a chunk which was not asked for
* one is the same as it was before traces existed.
*/
function traced(trace) {
	return trace ? { trace } : {};
}
/**
* The entries of one part of a wire trace, each a tuple of record ids and names.
*/
function entries(part) {
	return Array.isArray(part) ? part.filter(Array.isArray) : [];
}
/**
* An end of a relation, where `NONE` is a field the session cannot read.
*/
function optional(id$1) {
	return id$1 === void 0 || id$1 === null ? void 0 : id$1;
}
/**
* Adds the entries of `more` after those of `trace`, as the server's own buffered answer does:
* nothing is deduplicated, as what a call which collects for the caller owes is what was sent.
* Either may be absent. Neither is changed.
*/
function mergeTraces(trace, more) {
	if (!more) return trace;
	if (!trace) return more;
	const merged = {};
	const relations = [...trace.relations ?? [], ...more.relations ?? []];
	if (relations.length > 0) merged.relations = relations;
	const references = [...trace.references ?? [], ...more.references ?? []];
	if (references.length > 0) merged.references = references;
	const links = [...trace.links ?? [], ...more.links ?? []];
	if (links.length > 0) merged.links = links;
	const variables = {
		...trace.variables,
		...more.variables
	};
	if (Object.keys(variables).length > 0) merged.variables = variables;
	const subscriptions = [...trace.subscriptions ?? [], ...more.subscriptions ?? []];
	if (subscriptions.length > 0) merged.subscriptions = subscriptions;
	if (trace.partial || more.partial) merged.partial = true;
	const truncated = TRACE_KINDS.filter((kind) => trace.truncated?.includes(kind) || more.truncated?.includes(kind));
	if (truncated.length > 0) merged.truncated = truncated;
	return merged;
}
/**
* The params of a `query` call: the text and its variables, and the options of the call when it has
* any. A call with none sends nothing for them, as it always has, so that it is the same as it was
* for servers which know nothing of options.
*/
function queryParams(query, method, options) {
	const trace = method === "query" ? options?.trace : void 0;
	return trace && trace.length > 0 ? [
		query.query,
		query.bindings,
		{ trace: [...trace] }
	] : [query.query, query.bindings];
}

//#endregion
//#region src/utils/channel-iterator.ts
/**
* The channel iterator is a utility class that allows you to submit values to an async iterator.
*/
var ChannelIterator = class {
	#cancelled = false;
	#queue = [];
	#waiters = [];
	#cleanup;
	constructor(cleanup) {
		this.#cleanup = cleanup;
	}
	next() {
		if (this.#cancelled) return Promise.resolve({
			value: void 0,
			done: true
		});
		if (this.#queue.length > 0) return Promise.resolve({
			value: this.#queue.shift(),
			done: false
		});
		return new Promise((resolve) => {
			this.#waiters.push(resolve);
		});
	}
	return() {
		this.#end();
		return Promise.resolve({
			value: void 0,
			done: true
		});
	}
	throw(error) {
		this.#end();
		return Promise.reject(error);
	}
	[Symbol.asyncIterator]() {
		return this;
	}
	submit(value) {
		if (this.#cancelled) return;
		const waiter = this.#waiters.shift();
		if (waiter) {
			waiter({
				value,
				done: false
			});
			return;
		}
		this.#queue.push(value);
	}
	cancel() {
		this.#end();
	}
	/**
	* Ends the channel, settling every reader still waiting on it.
	*/
	#end() {
		const waiters = this.#waiters;
		this.#cancelled = true;
		this.#waiters = [];
		this.#cleanup?.();
		for (const waiter of waiters) waiter({
			value: void 0,
			done: true
		});
	}
};

//#endregion
//#region src/utils/dedupe-trace.ts
/**
* Removes the entries of a trace which repeat an earlier one, keeping the first of each.
*
* A streamed statement can report the same edge, reference or link on more than one frame, and a
* trace which was collected from the frames of a statement holds each of them as often as it was
* sent. Entries are told apart by their record ids, and a link also by its field. A variable is
* told apart by its name, and a subscription by its id.
*
* @param trace The trace to deduplicate, which is not changed
* @returns A trace holding each entry once
*/
function dedupeTrace(trace) {
	const unique = (items, key) => {
		if (!items) return void 0;
		const seen = /* @__PURE__ */ new Set();
		return items.filter((item) => {
			const id$1 = key(item);
			if (seen.has(id$1)) return false;
			seen.add(id$1);
			return true;
		});
	};
	const deduped = { ...trace };
	const relations = unique(trace.relations, (r$1) => `${r$1.in ?? ""}\u0000${r$1.edge}\u0000${r$1.out ?? ""}`);
	const references = unique(trace.references, (r$1) => `${r$1.referrer}\u0000${r$1.referenced}`);
	const links = unique(trace.links, (l) => `${l.record}\u0000${l.field}\u0000${l.target}`);
	const subscriptions = unique(trace.subscriptions, (id$1) => String(id$1));
	if (relations) deduped.relations = relations;
	if (references) deduped.references = references;
	if (links) deduped.links = links;
	if (subscriptions) deduped.subscriptions = subscriptions;
	return deduped;
}

//#endregion
//#region src/utils/is-version-supported.ts
const MINIMUM_VERSION = "2.1.0";
const MAXIMUM_VERSION = "5.0.0";
/**
* Returns whether a SurrealDB version is supported by the SDK.
*
* @param version The SurrealDB version to check
* @param min The minimum version to check against
* @param until The maximum version to check against
* @returns Whether the version is supported
*/
function isVersionSupported(version, min = MINIMUM_VERSION, until = MAXIMUM_VERSION) {
	const trimmed = version.replace(/^surrealdb-/, "").trim();
	return min.localeCompare(trimmed, void 0, { numeric: true }) <= 0 && until.localeCompare(trimmed, void 0, { numeric: true }) === 1;
}

//#endregion
//#region src/internal/feature.ts
var Feature = class {
	#name;
	#since;
	#until;
	constructor(name, since, until) {
		this.#name = name;
		this.#since = since;
		this.#until = until;
	}
	get name() {
		return this.#name;
	}
	get sinceVersion() {
		return this.#since;
	}
	get untilVersion() {
		return this.#until;
	}
	supports(version) {
		return isVersionSupported(version, this.#since ?? MINIMUM_VERSION, this.#until ?? MAXIMUM_VERSION);
	}
};

//#endregion
//#region src/utils/features.ts
/**
* Available features which may be supported by specific
* engines or versions of SurrealDB.
*/
const Features = Object.freeze({
	LiveQueries: new Feature("live-queries"),
	Sessions: new Feature("sessions", "3.0.0"),
	Api: new Feature("api", "3.0.0"),
	RefreshTokens: new Feature("refresh-tokens", "3.0.0"),
	Transactions: new Feature("transactions", "3.0.0"),
	ExportImportRaw: new Feature("export-import-raw"),
	SurrealML: new Feature("surreal-ml", void 0, "4.0.0"),
	PerRequestAuth: new Feature("per-request-auth"),
	QueryStreaming: new Feature("query-streaming", "3.3.0"),
	SqlDialects: new Feature("sql-dialects", "4.0.0"),
	QueryTrace: new Feature("query-trace", "4.0.0")
});

//#endregion
//#region src/utils/frame.ts
/**
* Represents a single query result frame frame
*/
var Frame = class {
	static [Symbol.hasInstance](instance) {
		return hasSymbol(instance, FRAME_SYMBOL);
	}
	query;
	constructor(query) {
		this.query = query;
		markSymbol(this, FRAME_SYMBOL);
	}
	/**
	* Returns true if the frame is associated with the given query index
	*/
	isOf(query) {
		return this.query === query;
	}
	/**
	* Returns true if the frame is a value frame
	*/
	isValue() {
		return this instanceof ValueFrame;
	}
	/**
	* Returns true if the frame is an error frame
	*/
	isError() {
		return this instanceof ErrorFrame;
	}
	/**
	* Returns true if the frame is a done frame
	*/
	isDone() {
		return this instanceof DoneFrame;
	}
	/**
	* Returns true if the frame is a value frame and associated with the given query index
	*/
	isValueOf(query) {
		return this.isOf(query) && this.isValue();
	}
	/**
	* Returns true if the frame is an error frame and associated with the given query index
	*/
	isErrorOf(query) {
		return this.isOf(query) && this.isError();
	}
	/**
	* Returns true if the frame is a done frame and associated with the given query index
	*/
	isDoneOf(query) {
		return this.isOf(query) && this.isDone();
	}
};
/**
* Represents a value frame in a query result. If `isSingle` is true, the frame represents a single value
* and no further values will be returned for that specific statement.
*/
var ValueFrame = class extends Frame {
	static [Symbol.hasInstance](instance) {
		return hasSymbol(instance, VALUE_FRAME_SYMBOL);
	}
	value;
	isSingle;
	/**
	* What the server sent about the graph the statement walked on the frame this value arrived
	* in, for a query which asked for a trace. A frame holding several rows yields the trace with
	* the first of them. It belongs to the statement and not to this row, and is retracted with
	* the rows if the statement fails.
	*/
	trace;
	constructor(query, value, isSingle, trace) {
		super(query);
		this.value = value;
		this.isSingle = isSingle;
		this.trace = trace;
		markSymbol(this, VALUE_FRAME_SYMBOL);
	}
	isOf(query) {
		return super.isOf(query);
	}
};
/**
* Represents an error frame in a query result
*/
var ErrorFrame = class extends Frame {
	static [Symbol.hasInstance](instance) {
		return hasSymbol(instance, ERROR_FRAME_SYMBOL);
	}
	stats;
	error;
	constructor(query, stats, error) {
		super(query);
		this.stats = stats;
		this.error = error;
		markSymbol(this, ERROR_FRAME_SYMBOL);
	}
	isOf(query) {
		return super.isOf(query);
	}
	/**
	* Throw the server error corresponding to this error frame
	*/
	throw() {
		throw this.error;
	}
};
/**
* Represents a done frame in a query result
*/
var DoneFrame = class extends Frame {
	static [Symbol.hasInstance](instance) {
		return hasSymbol(instance, DONE_FRAME_SYMBOL);
	}
	stats;
	type;
	/**
	* What the server sent about the graph the statement walked on its closing frame, for a query
	* which asked for a trace: the part which belongs to the statement as a whole, such as the
	* variables it bound, and any entries no earlier frame took.
	*/
	trace;
	constructor(query, stats, type, trace) {
		super(query);
		this.stats = stats;
		this.type = type;
		this.trace = trace;
		markSymbol(this, DONE_FRAME_SYMBOL);
	}
	isOf(query) {
		return super.isOf(query);
	}
};

//#endregion
//#region src/query/auth.ts
/**
* A configurable `Promise` for retrieving auth information from a SurrealDB instance.
*/
var AuthPromise = class AuthPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new AuthPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Run this call as a different identity than the one of the session, for this call only.
	* The session is neither used nor changed. Supported by engines which present credentials
	* with every request, such as HTTP, and rejected with an `UnsupportedFeatureError` by
	* the others.
	*
	* @see {@link Query.as} for details.
	*
	* @param credential An access token or authentication details to run this call as
	* @returns A new `AuthPromise` which runs as the provided identity.
	*/
	as(credential) {
		assertCredential(credential);
		return new AuthPromise(this.#connection, {
			...this.#options,
			credential
		});
	}
	/**
	* Configure the query to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, the query is not sent and fails straight away. If it aborts
	* later, the query stops waiting for the server and fails with the `reason` of the signal, as it
	* is: an `AbortError`, or the `TimeoutError` of `AbortSignal.timeout()`. This holds for awaiting
	* the query as well as for `.stream()`, which ends its iteration with the reason.
	*
	* Aborting means "stop waiting", and nothing more. The server may keep executing the query, and
	* **a write which was sent before the signal aborted may or may not have been applied**.
	*
	* Can be called more than once, and in addition to a signal inherited from `withSignal()`: the
	* query is abandoned when any of them aborts. See {@link Query.signal}.
	*
	* @example
	* ```ts
	* const result = await db.auth().signal(request.signal);
	* ```
	*
	* @param signal The signal which abandons the query. Without one, nothing changes.
	*/
	signal(signal) {
		return new AuthPromise(this.#connection, {
			...this.#options,
			signals: addSignal(this.#options.signals, signal)
		});
	}
	/**
	* Configure how long to wait for the server to answer the query, in milliseconds, before giving
	* up on it with a `TimeoutError`. Overrides the `requestTimeout` of the connection for this
	* query, so it can also allow a query longer than that default, or `0` to wait without limit.
	*
	* This is a limit on the client, and not the `TIMEOUT` clause which the server enforces and
	* which is set with `.timeout()`. The server is not told the client has given up, so **a write
	* which timed out may or may not have been applied**. See {@link Query.requestTimeout}.
	*
	* @param milliseconds The time to wait for an answer, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new AuthPromise(this.#connection, {
			...this.#options,
			requestTimeout: milliseconds
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		const query = this.#build().stream();
		for await (const frame$1 of query) yield frame$1;
	}
	async dispatch() {
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { transaction, session, json } = this.#options;
		return new Query(this.#connection, {
			credential: this.#options.credential,
			query: new BoundQuery("SELECT * FROM ONLY $auth"),
			transaction,
			session,
			json,
			signals: this.#options.signals,
			requestTimeout: this.#options.requestTimeout
		});
	}
};

//#endregion
//#region src/internal/internal-expressions.ts
const OUTPUTS = new Map([
	["null", "null"],
	["none", "NONE"],
	["diff", "DIFF"],
	["before", "BEFORE"],
	["after", "AFTER"]
]);
const _only = (value) => ({ toSQL: (ctx) => value instanceof _RecordId || value instanceof StringRecordId ? `ONLY ${ctx.def(value)}` : ctx.def(value) });
const _output = (value) => ({ toSQL: () => {
	const output = OUTPUTS.get(value);
	if (!output) throw new ExpressionError(`Invalid output value: ${value}`);
	return output;
} });
const _timeout = (timeout) => ({ toSQL: () => {
	if (!(timeout instanceof Duration)) throw new ExpressionError(`Invalid timeout value: ${timeout}`);
	return timeout.toString();
} });

//#endregion
//#region src/query/create.ts
/**
* A configurable `Promise` for a create query sent to a SurrealDB instance.
*/
var CreatePromise = class CreatePromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new CreatePromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Run this call as a different identity than the one of the session, for this call only.
	* The session is neither used nor changed. Supported by engines which present credentials
	* with every request, such as HTTP, and rejected with an `UnsupportedFeatureError` by
	* the others.
	*
	* @see {@link Query.as} for details.
	*
	* @param credential An access token or authentication details to run this call as
	* @returns A new `CreatePromise` which runs as the provided identity.
	*/
	as(credential) {
		assertCredential(credential);
		return new CreatePromise(this.#connection, {
			...this.#options,
			credential
		});
	}
	/**
	* Configure the query to automatically retry when it fails due to a transaction conflict.
	*
	* Under concurrent load a query may fail because another transaction wrote to the same data.
	* When retry is enabled, the entire query is re-sent with exponential backoff until it
	* succeeds or the configured attempts are exhausted.
	*
	* **NOTE:** Retrying re-sends the full query. Only use this for queries that are safe to replay.
	* Re-sending a non-atomic, multi-statement query may apply some statements more than once.
	*
	* @example
	* ```ts
	* const user = await db.create(new RecordId('users', 'john'))
	*     .content({ name: 'John Doe' })
	*     .retry();
	* ```
	*
	* @param options Retry behavior. Defaults to enabling retry using the connection defaults.
	* @returns A new `CreatePromise` configured to retry on conflict.
	*/
	retry(options = true) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			retry: options
		});
	}
	/**
	* Configure the query to set the record data
	*/
	content(data) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			mutation: "content",
			data
		});
	}
	/**
	* Configure the query to patch the record data
	*/
	patch(data) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			mutation: "patch",
			data
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure a custom version of the data being created. This is used
	* alongside version enabled storage engines such as SurrealKV.
	*/
	version(version) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			version
		});
	}
	/**
	* Configure the query to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, the query is not sent and fails straight away. If it aborts
	* later, the query stops waiting for the server and fails with the `reason` of the signal, as it
	* is: an `AbortError`, or the `TimeoutError` of `AbortSignal.timeout()`. This holds for awaiting
	* the query as well as for `.stream()`, which ends its iteration with the reason.
	*
	* Aborting means "stop waiting", and nothing more. The server may keep executing the query, and
	* **a write which was sent before the signal aborted may or may not have been applied**.
	*
	* Can be called more than once, and in addition to a signal inherited from `withSignal()`: the
	* query is abandoned when any of them aborts. See {@link Query.signal}.
	*
	* @example
	* ```ts
	* const result = await db.create(table).content(data).signal(request.signal);
	* ```
	*
	* @param signal The signal which abandons the query. Without one, nothing changes.
	*/
	signal(signal) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			signals: addSignal(this.#options.signals, signal)
		});
	}
	/**
	* Configure how long to wait for the server to answer the query, in milliseconds, before giving
	* up on it with a `TimeoutError`. Overrides the `requestTimeout` of the connection for this
	* query, so it can also allow a query longer than that default, or `0` to wait without limit.
	*
	* This is a limit on the client, and not the `TIMEOUT` clause which the server enforces and
	* which is set with `.timeout()`. The server is not told the client has given up, so **a write
	* which timed out may or may not have been applied**. See {@link Query.requestTimeout}.
	*
	* @param milliseconds The time to wait for an answer, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new CreatePromise(this.#connection, {
			...this.#options,
			requestTimeout: milliseconds
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the records of the query as they arrive.
	*
	* The first are available while the rest are still being produced, and nothing is held but
	* what has arrived and not yet been read. Each is yielded as it is, or as `parse` returns it
	* when one is given. See `Query.rows()` for the details, which apply here: a record is
	* provisional until iteration completes without throwing, and leaving the loop stops the query.
	*
	* @param parse Applied to each record as it arrives. Without one, records are yielded as they are.
	* @returns A single-use async iterable of records, which can also be disposed.
	*/
	rows(parse) {
		return this.#build().rows(parse);
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		const query = this.#build().stream();
		for await (const frame$1 of query) yield frame$1;
	}
	async dispatch() {
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { what, data, transaction, session, json, output, timeout, version, mutation, retry } = this.#options;
		const query = surql`CREATE ${_only(what)}`;
		if (mutation && data) query.append(surql` ${raw(mutation.toUpperCase())} ${data}`);
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (version) query.append(surql` VERSION ${version}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		return new Query(this.#connection, {
			credential: this.#options.credential,
			retry,
			query,
			transaction,
			json,
			session,
			signals: this.#options.signals,
			requestTimeout: this.#options.requestTimeout
		});
	}
};

//#endregion
//#region src/query/delete.ts
/**
* A configurable `Promise` for a delete query sent to a SurrealDB instance.
*/
var DeletePromise = class DeletePromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new DeletePromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Run this call as a different identity than the one of the session, for this call only.
	* The session is neither used nor changed. Supported by engines which present credentials
	* with every request, such as HTTP, and rejected with an `UnsupportedFeatureError` by
	* the others.
	*
	* @see {@link Query.as} for details.
	*
	* @param credential An access token or authentication details to run this call as
	* @returns A new `DeletePromise` which runs as the provided identity.
	*/
	as(credential) {
		assertCredential(credential);
		return new DeletePromise(this.#connection, {
			...this.#options,
			credential
		});
	}
	/**
	* Configure the query to automatically retry when it fails due to a transaction conflict.
	*
	* Under concurrent load a query may fail because another transaction wrote to the same data.
	* When retry is enabled, the entire query is re-sent with exponential backoff until it
	* succeeds or the configured attempts are exhausted.
	*
	* **NOTE:** Retrying re-sends the full query. Only use this for queries that are safe to replay.
	* Re-sending a non-atomic, multi-statement query may apply some statements more than once.
	*
	* @example
	* ```ts
	* await db.delete(new RecordId('users', 'john')).retry();
	* ```
	*
	* @param options Retry behavior. Defaults to enabling retry using the connection defaults.
	* @returns A new `DeletePromise` configured to retry on conflict.
	*/
	retry(options = true) {
		return new DeletePromise(this.#connection, {
			...this.#options,
			retry: options
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new DeletePromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new DeletePromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure a custom version of the data being deleted.
	*
	* @deprecated SurrealDB has no `VERSION` clause for `DELETE` statements, so
	* a query using this method fails with an `ExpressionError` when it is
	* compiled or executed, before anything is sent to the server.
	*/
	version(version) {
		return new DeletePromise(this.#connection, {
			...this.#options,
			version
		});
	}
	/**
	* Configure the query to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, the query is not sent and fails straight away. If it aborts
	* later, the query stops waiting for the server and fails with the `reason` of the signal, as it
	* is: an `AbortError`, or the `TimeoutError` of `AbortSignal.timeout()`. This holds for awaiting
	* the query as well as for `.stream()`, which ends its iteration with the reason.
	*
	* Aborting means "stop waiting", and nothing more. The server may keep executing the query, and
	* **a write which was sent before the signal aborted may or may not have been applied**.
	*
	* Can be called more than once, and in addition to a signal inherited from `withSignal()`: the
	* query is abandoned when any of them aborts. See {@link Query.signal}.
	*
	* @example
	* ```ts
	* const result = await db.delete(id).signal(request.signal);
	* ```
	*
	* @param signal The signal which abandons the query. Without one, nothing changes.
	*/
	signal(signal) {
		return new DeletePromise(this.#connection, {
			...this.#options,
			signals: addSignal(this.#options.signals, signal)
		});
	}
	/**
	* Configure how long to wait for the server to answer the query, in milliseconds, before giving
	* up on it with a `TimeoutError`. Overrides the `requestTimeout` of the connection for this
	* query, so it can also allow a query longer than that default, or `0` to wait without limit.
	*
	* This is a limit on the client, and not the `TIMEOUT` clause which the server enforces and
	* which is set with `.timeout()`. The server is not told the client has given up, so **a write
	* which timed out may or may not have been applied**. See {@link Query.requestTimeout}.
	*
	* @param milliseconds The time to wait for an answer, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new DeletePromise(this.#connection, {
			...this.#options,
			requestTimeout: milliseconds
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the records of the query as they arrive.
	*
	* The first are available while the rest are still being produced, and nothing is held but
	* what has arrived and not yet been read. Each is yielded as it is, or as `parse` returns it
	* when one is given. See `Query.rows()` for the details, which apply here: a record is
	* provisional until iteration completes without throwing, and leaving the loop stops the query.
	*
	* @param parse Applied to each record as it arrives. Without one, records are yielded as they are.
	* @returns A single-use async iterable of records, which can also be disposed.
	*/
	rows(parse) {
		return this.#build().rows(parse);
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		const query = this.#build().stream();
		for await (const frame$1 of query) yield frame$1;
	}
	async dispatch() {
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { what, transaction, session, json, output, timeout, version, retry } = this.#options;
		if (version) throw new ExpressionError("The VERSION clause is not supported by DELETE statements");
		const query = surql`DELETE ${_only(what)}`;
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		return new Query(this.#connection, {
			credential: this.#options.credential,
			retry,
			query,
			transaction,
			json,
			session,
			signals: this.#options.signals,
			requestTimeout: this.#options.requestTimeout
		});
	}
};

//#endregion
//#region src/query/insert.ts
/**
* A configurable `Promise` for an insert query sent to a SurrealDB instance.
*/
var InsertPromise = class InsertPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new InsertPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Run this call as a different identity than the one of the session, for this call only.
	* The session is neither used nor changed. Supported by engines which present credentials
	* with every request, such as HTTP, and rejected with an `UnsupportedFeatureError` by
	* the others.
	*
	* @see {@link Query.as} for details.
	*
	* @param credential An access token or authentication details to run this call as
	* @returns A new `InsertPromise` which runs as the provided identity.
	*/
	as(credential) {
		assertCredential(credential);
		return new InsertPromise(this.#connection, {
			...this.#options,
			credential
		});
	}
	/**
	* Configure the query to automatically retry when it fails due to a transaction conflict.
	*
	* Under concurrent load a query may fail because another transaction wrote to the same data.
	* When retry is enabled, the entire query is re-sent with exponential backoff until it
	* succeeds or the configured attempts are exhausted.
	*
	* **NOTE:** Retrying re-sends the full query. Only use this for queries that are safe to replay.
	* Re-sending a non-atomic, multi-statement query may apply some statements more than once.
	*
	* @example
	* ```ts
	* await db.insert({ name: 'John Doe' }).retry();
	* ```
	*
	* @param options Retry behavior. Defaults to enabling retry using the connection defaults.
	* @returns A new `InsertPromise` configured to retry on conflict.
	*/
	retry(options = true) {
		return new InsertPromise(this.#connection, {
			...this.#options,
			retry: options
		});
	}
	/**
	* Configure the query to insert a relation instead of a regular record
	*/
	relation() {
		return new InsertPromise(this.#connection, {
			...this.#options,
			relation: true
		});
	}
	/**
	* Configure the query to ignore records if they already exist
	*/
	ignore() {
		return new InsertPromise(this.#connection, {
			...this.#options,
			ignore: true
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new InsertPromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new InsertPromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure a custom version of the data being created. This is used
	* alongside version enabled storage engines such as SurrealKV.
	*/
	version(version) {
		return new InsertPromise(this.#connection, {
			...this.#options,
			version
		});
	}
	/**
	* Configure the query to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, the query is not sent and fails straight away. If it aborts
	* later, the query stops waiting for the server and fails with the `reason` of the signal, as it
	* is: an `AbortError`, or the `TimeoutError` of `AbortSignal.timeout()`. This holds for awaiting
	* the query as well as for `.stream()`, which ends its iteration with the reason.
	*
	* Aborting means "stop waiting", and nothing more. The server may keep executing the query, and
	* **a write which was sent before the signal aborted may or may not have been applied**.
	*
	* Can be called more than once, and in addition to a signal inherited from `withSignal()`: the
	* query is abandoned when any of them aborts. See {@link Query.signal}.
	*
	* @example
	* ```ts
	* const result = await db.insert(table, data).signal(request.signal);
	* ```
	*
	* @param signal The signal which abandons the query. Without one, nothing changes.
	*/
	signal(signal) {
		return new InsertPromise(this.#connection, {
			...this.#options,
			signals: addSignal(this.#options.signals, signal)
		});
	}
	/**
	* Configure how long to wait for the server to answer the query, in milliseconds, before giving
	* up on it with a `TimeoutError`. Overrides the `requestTimeout` of the connection for this
	* query, so it can also allow a query longer than that default, or `0` to wait without limit.
	*
	* This is a limit on the client, and not the `TIMEOUT` clause which the server enforces and
	* which is set with `.timeout()`. The server is not told the client has given up, so **a write
	* which timed out may or may not have been applied**. See {@link Query.requestTimeout}.
	*
	* @param milliseconds The time to wait for an answer, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new InsertPromise(this.#connection, {
			...this.#options,
			requestTimeout: milliseconds
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the records of the query as they arrive.
	*
	* The first are available while the rest are still being produced, and nothing is held but
	* what has arrived and not yet been read. Each is yielded as it is, or as `parse` returns it
	* when one is given. See `Query.rows()` for the details, which apply here: a record is
	* provisional until iteration completes without throwing, and leaving the loop stops the query.
	*
	* @param parse Applied to each record as it arrives. Without one, records are yielded as they are.
	* @returns A single-use async iterable of records, which can also be disposed.
	*/
	rows(parse) {
		return this.#build().rows(parse);
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		const query = this.#build().stream();
		for await (const frame$1 of query) yield frame$1;
	}
	async dispatch() {
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { table, what, transaction, session, json, output, timeout, version, relation, ignore, retry } = this.#options;
		const query = surql`INSERT`;
		if (relation) query.append(surql` RELATION`);
		if (ignore) query.append(surql` IGNORE`);
		if (table) query.append(surql` INTO ${table}`);
		query.append(surql` ${what}`);
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (version) query.append(surql` VERSION ${version}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		return new Query(this.#connection, {
			credential: this.#options.credential,
			retry,
			query,
			transaction,
			json,
			session,
			signals: this.#options.signals,
			requestTimeout: this.#options.requestTimeout
		});
	}
};

//#endregion
//#region src/query/live.ts
/**
* A promise representing a managed `live` RPC call to the server.
*/
var ManagedLivePromise = class ManagedLivePromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the live subscription to return only patches (diffs)
	* instead of the full resource on each update.
	*/
	diff() {
		return new ManagedLivePromise(this.#connection, {
			...this.#options,
			fields: [],
			selection: "diff"
		});
	}
	/**
	* Configure the query to only select the specified field(s)
	*/
	fields(...fields) {
		return new ManagedLivePromise(this.#connection, {
			...this.#options,
			fields,
			selection: "fields"
		});
	}
	/**
	* Configure the query to retrieve the value of the specified field
	*/
	value(field) {
		return new ManagedLivePromise(this.#connection, {
			...this.#options,
			fields: [field],
			selection: "value"
		});
	}
	/**
	* Configure the query to fetch the record only if the condition is met.
	*
	* Expressions can be imported from the `surrealdb` package and combined
	* to compose the desired condition.
	*
	* @see {@link https://github.com/surrealdb/surrealdb.js/blob/main/packages/sdk/src/utils/expr.ts}
	*/
	where(expr$1) {
		return new ManagedLivePromise(this.#connection, {
			...this.#options,
			cond: expr$1 ? expr$1 : void 0
		});
	}
	/**
	* Configure the query to fetch record link contents for the specified field(s)
	*/
	fetch(...fields) {
		return new ManagedLivePromise(this.#connection, {
			...this.#options,
			fetch: fields
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	async dispatch() {
		const abort = abortScope(this.#options.signals ?? []);
		let subscription;
		try {
			throwIfAborted(abort.signal);
			await raceAbort(this.#connection.ready(), abort.signal);
			this.#connection.assertFeature(Features.LiveQueries);
			throwIfAborted(abort.signal);
			subscription = new ManagedLiveSubscription(this.#connection, this.#options.what, this.#options.session, this.#build(abort.signal), abort.signal ? abort : void 0);
			await raceAbort(subscription.ready(), abort.signal);
			return subscription;
		} catch (error) {
			if (subscription && abort.signal) await subscription.kill().catch(() => {});
			else abort.dispose();
			throw error;
		}
	}
	/**
	* @param beforeSend A signal which abandons the registration while it waits to be sent, which
	*                   is while the credential for it is settled, but not once it is on its way: what
	*                   the server registers is then to be killed, and only the answer says what it is.
	*/
	#build(beforeSend) {
		const { what, selection, fields, cond, fetch, session } = this.#options;
		const query = surql`LIVE SELECT`;
		if (selection === "fields") query.append(surql` type::fields(${fields})`);
		else if (selection === "value") query.append(surql` VALUE type::field(${fields?.[0]})`);
		else if (selection === "diff") query.append(surql` DIFF`);
		else query.append(surql` *`);
		query.append(surql` FROM ${what}`);
		if (cond) query.append(surql` WHERE ${cond}`);
		if (fetch) query.append(surql` FETCH type::fields(${fetch})`);
		return new Query(this.#connection, {
			query,
			transaction: void 0,
			json: false,
			session,
			beforeSend,
			retry: true
		});
	}
};
/**
* A promise representing an unmanaged `live` RPC call to the server.
*/
var UnmanagedLivePromise = class extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	async dispatch() {
		const abort = abortScope(this.#options.signals ?? []);
		try {
			throwIfAborted(abort.signal);
			await raceAbort(this.#connection.ready(), abort.signal);
			this.#connection.assertFeature(Features.LiveQueries);
			throwIfAborted(abort.signal);
			return new UnmanagedLiveSubscription(this.#connection, this.#options.session, this.#options.id, abort.signal ? abort : void 0);
		} catch (error) {
			abort.dispose();
			throw error;
		}
	}
};

//#endregion
//#region src/query/relate.ts
/**
* A configurable `Promise` for a relate query sent to a SurrealDB instance.
*/
var RelatePromise = class RelatePromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new RelatePromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Run this call as a different identity than the one of the session, for this call only.
	* The session is neither used nor changed. Supported by engines which present credentials
	* with every request, such as HTTP, and rejected with an `UnsupportedFeatureError` by
	* the others.
	*
	* @see {@link Query.as} for details.
	*
	* @param credential An access token or authentication details to run this call as
	* @returns A new `RelatePromise` which runs as the provided identity.
	*/
	as(credential) {
		assertCredential(credential);
		return new RelatePromise(this.#connection, {
			...this.#options,
			credential
		});
	}
	/**
	* Configure the query to automatically retry when it fails due to a transaction conflict.
	*
	* Under concurrent load a query may fail because another transaction wrote to the same data.
	* When retry is enabled, the entire query is re-sent with exponential backoff until it
	* succeeds or the configured attempts are exhausted.
	*
	* **NOTE:** Retrying re-sends the full query. Only use this for queries that are safe to replay.
	* Re-sending a non-atomic, multi-statement query may apply some statements more than once.
	*
	* @example
	* ```ts
	* await db.relate(from, 'likes', to).retry();
	* ```
	*
	* @param options Retry behavior. Defaults to enabling retry using the connection defaults.
	* @returns A new `RelatePromise` configured to retry on conflict.
	*/
	retry(options = true) {
		return new RelatePromise(this.#connection, {
			...this.#options,
			retry: options
		});
	}
	/**
	* Configure the query to enforce a unique relationship
	*/
	unique() {
		return new RelatePromise(this.#connection, {
			...this.#options,
			unique: true
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new RelatePromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new RelatePromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure a custom version of the data being created.
	*
	* @deprecated SurrealDB has no `VERSION` clause for `RELATE` statements, so
	* a query using this method fails with an `ExpressionError` when it is
	* compiled or executed, before anything is sent to the server.
	*/
	version(version) {
		return new RelatePromise(this.#connection, {
			...this.#options,
			version
		});
	}
	/**
	* Configure the query to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, the query is not sent and fails straight away. If it aborts
	* later, the query stops waiting for the server and fails with the `reason` of the signal, as it
	* is: an `AbortError`, or the `TimeoutError` of `AbortSignal.timeout()`. This holds for awaiting
	* the query as well as for `.stream()`, which ends its iteration with the reason.
	*
	* Aborting means "stop waiting", and nothing more. The server may keep executing the query, and
	* **a write which was sent before the signal aborted may or may not have been applied**.
	*
	* Can be called more than once, and in addition to a signal inherited from `withSignal()`: the
	* query is abandoned when any of them aborts. See {@link Query.signal}.
	*
	* @example
	* ```ts
	* const result = await db.relate(from, edge, to).signal(request.signal);
	* ```
	*
	* @param signal The signal which abandons the query. Without one, nothing changes.
	*/
	signal(signal) {
		return new RelatePromise(this.#connection, {
			...this.#options,
			signals: addSignal(this.#options.signals, signal)
		});
	}
	/**
	* Configure how long to wait for the server to answer the query, in milliseconds, before giving
	* up on it with a `TimeoutError`. Overrides the `requestTimeout` of the connection for this
	* query, so it can also allow a query longer than that default, or `0` to wait without limit.
	*
	* This is a limit on the client, and not the `TIMEOUT` clause which the server enforces and
	* which is set with `.timeout()`. The server is not told the client has given up, so **a write
	* which timed out may or may not have been applied**. See {@link Query.requestTimeout}.
	*
	* @param milliseconds The time to wait for an answer, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new RelatePromise(this.#connection, {
			...this.#options,
			requestTimeout: milliseconds
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the records of the query as they arrive.
	*
	* The first are available while the rest are still being produced, and nothing is held but
	* what has arrived and not yet been read. Each is yielded as it is, or as `parse` returns it
	* when one is given. See `Query.rows()` for the details, which apply here: a record is
	* provisional until iteration completes without throwing, and leaving the loop stops the query.
	*
	* @param parse Applied to each record as it arrives. Without one, records are yielded as they are.
	* @returns A single-use async iterable of records, which can also be disposed.
	*/
	rows(parse) {
		return this.#build().rows(parse);
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		const query = this.#build().stream();
		for await (const frame$1 of query) yield frame$1;
	}
	async dispatch() {
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { from, what, to, data, transaction, session, json, output, timeout, version, retry } = this.#options;
		if (version) throw new ExpressionError("The VERSION clause is not supported by RELATE statements");
		const isMultiple = Array.isArray(from) || Array.isArray(to);
		if (isMultiple && what instanceof _RecordId) throw new SurrealError("Edge must be a table when creating multiple edges");
		const query = surql`RELATE `;
		if (!isMultiple) query.append(surql` ONLY`);
		query.append(surql` ${from}->${what}->${to}`);
		if (data) query.append(surql` CONTENT ${data}`);
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		return new Query(this.#connection, {
			credential: this.#options.credential,
			retry,
			query,
			transaction,
			json,
			session,
			signals: this.#options.signals,
			requestTimeout: this.#options.requestTimeout
		});
	}
};

//#endregion
//#region src/query/run.ts
const NAME_REGEX = /^[a-zA-Z0-9_:]+$/;
const VERSION_REGEX = /^[0-9.]+$/;
/**
* A configurable `Promise` for a run query sent to a SurrealDB instance.
*/
var RunPromise = class RunPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new RunPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Run this call as a different identity than the one of the session, for this call only.
	* The session is neither used nor changed. Supported by engines which present credentials
	* with every request, such as HTTP, and rejected with an `UnsupportedFeatureError` by
	* the others.
	*
	* @see {@link Query.as} for details.
	*
	* @param credential An access token or authentication details to run this call as
	* @returns A new `RunPromise` which runs as the provided identity.
	*/
	as(credential) {
		assertCredential(credential);
		return new RunPromise(this.#connection, {
			...this.#options,
			credential
		});
	}
	/**
	* Configure the query to automatically retry when it fails due to a transaction conflict.
	*
	* Under concurrent load a query may fail because another transaction wrote to the same data.
	* When retry is enabled, the entire query is re-sent with exponential backoff until it
	* succeeds or the configured attempts are exhausted.
	*
	* **NOTE:** Retrying re-sends the full query. Only use this for queries that are safe to replay.
	* Re-sending a non-atomic, multi-statement query may apply some statements more than once.
	*
	* @example
	* ```ts
	* const result = await db.run('my::function', [arg]).retry();
	* ```
	*
	* @param options Retry behavior. Defaults to enabling retry using the connection defaults.
	* @returns A new `RunPromise` configured to retry on conflict.
	*/
	retry(options = true) {
		return new RunPromise(this.#connection, {
			...this.#options,
			retry: options
		});
	}
	/**
	* Configure the query to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, the query is not sent and fails straight away. If it aborts
	* later, the query stops waiting for the server and fails with the `reason` of the signal, as it
	* is: an `AbortError`, or the `TimeoutError` of `AbortSignal.timeout()`. This holds for awaiting
	* the query as well as for `.stream()`, which ends its iteration with the reason.
	*
	* Aborting means "stop waiting", and nothing more. The server may keep executing the query, and
	* **a write which was sent before the signal aborted may or may not have been applied**.
	*
	* Can be called more than once, and in addition to a signal inherited from `withSignal()`: the
	* query is abandoned when any of them aborts. See {@link Query.signal}.
	*
	* @example
	* ```ts
	* const result = await db.run("fn::report").signal(request.signal);
	* ```
	*
	* @param signal The signal which abandons the query. Without one, nothing changes.
	*/
	signal(signal) {
		return new RunPromise(this.#connection, {
			...this.#options,
			signals: addSignal(this.#options.signals, signal)
		});
	}
	/**
	* Configure how long to wait for the server to answer the query, in milliseconds, before giving
	* up on it with a `TimeoutError`. Overrides the `requestTimeout` of the connection for this
	* query, so it can also allow a query longer than that default, or `0` to wait without limit.
	*
	* This is a limit on the client, and not the `TIMEOUT` clause which the server enforces and
	* which is set with `.timeout()`. The server is not told the client has given up, so **a write
	* which timed out may or may not have been applied**. See {@link Query.requestTimeout}.
	*
	* @param milliseconds The time to wait for an answer, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new RunPromise(this.#connection, {
			...this.#options,
			requestTimeout: milliseconds
		});
	}
	/**
	* Check the arguments against a [Standard Schema](https://standardschema.dev) (Zod, Valibot,
	* ArkType and others) before the call is sent. The schema validates the array of arguments, so
	* use a tuple schema. When it fails, the call is not sent and rejects with a
	* `SchemaValidationError` listing every issue. What the schema produces is what is sent, so
	* a schema which transforms or coerces changes the arguments.
	*
	* Applies when the promise is awaited, and not to `.compile()` or `.stream()`.
	*
	* @example
	* ```ts
	* const sum = await db.run<number>("fn::add", [1, 2]).args(z.tuple([z.number(), z.number()]));
	* ```
	*
	* @param schema The schema the array of arguments must satisfy.
	*/
	args(schema) {
		return new RunPromise(this.#connection, {
			...this.#options,
			argsSchema: schema
		});
	}
	/**
	* Check the result against a [Standard Schema](https://standardschema.dev) and type the
	* promise as what the schema produces. When the result does not match, the promise rejects
	* with a `SchemaValidationError`. With `.json()` the schema sees the JSON-compatible result.
	*
	* @example
	* ```ts
	* const sum = await db.run("fn::add", [1, 2]).returns(z.number()); // number
	* ```
	*
	* @param schema The schema the result must satisfy.
	*/
	returns(schema) {
		return new RunPromise(this.#connection, {
			...this.#options,
			resultSchema: schema
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		const query = this.#build().stream();
		for await (const frame$1 of query) yield frame$1;
	}
	async dispatch() {
		const { name, argsSchema, resultSchema } = this.#options;
		let options = this.#options;
		if (argsSchema) {
			const args = await validateWith(argsSchema, options.args, `arguments for ${name}`);
			options = {
				...options,
				args
			};
		}
		const [result] = await this.#build(options).collect();
		return resultSchema ? await validateWith(resultSchema, result, `result of ${name}`) : result;
	}
	#build(options = this.#options) {
		const { name, version, args, transaction, session, json, retry } = options;
		if (!NAME_REGEX.test(name)) throw new ExpressionError("Invalid function name");
		const query = new BoundQuery(name);
		if (version) {
			if (!VERSION_REGEX.test(version)) throw new ExpressionError("Invalid function version");
			query.append(`<${version}>`);
		}
		query.append("(");
		for (const arg of args) query.append(surql`${arg}, `);
		query.append(")");
		return new Query(this.#connection, {
			credential: this.#options.credential,
			retry,
			query,
			transaction,
			json,
			session,
			signals: this.#options.signals,
			requestTimeout: this.#options.requestTimeout
		});
	}
};

//#endregion
//#region src/query/select.ts
/**
* A configurable `Promise` for a select query sent to a SurrealDB instance.
*/
var SelectPromise = class SelectPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new SelectPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Run this call as a different identity than the one of the session, for this call only.
	* The session is neither used nor changed. Supported by engines which present credentials
	* with every request, such as HTTP, and rejected with an `UnsupportedFeatureError` by
	* the others.
	*
	* @see {@link Query.as} for details.
	*
	* @param credential An access token or authentication details to run this call as
	* @returns A new `SelectPromise` which runs as the provided identity.
	*/
	as(credential) {
		assertCredential(credential);
		return new SelectPromise(this.#connection, {
			...this.#options,
			credential
		});
	}
	/**
	* Configure the query to only select the specified field(s)
	*/
	fields(...fields) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			fields,
			selection: "fields"
		});
	}
	/**
	* Configure the query to retrieve the value of the specified field
	*/
	value(field) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			fields: [field],
			selection: "value"
		});
	}
	/**
	* Configure the query to start at the specified index
	*/
	start(start) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			start
		});
	}
	/**
	* Configure the query to limit the number of results
	*/
	limit(limit) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			limit
		});
	}
	/**
	* Configure the query to fetch only records that match the condition.
	*
	* Expressions can be imported from the `surrealdb` package and combined
	* to compose the desired condition.
	*
	* @see {@link https://github.com/surrealdb/surrealdb.js/blob/main/packages/sdk/src/utils/expr.ts}
	*/
	where(expr$1) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			cond: expr$1 ? expr$1 : void 0
		});
	}
	/**
	* Configure the query to fetch record link contents for the specified field(s)
	*/
	fetch(...fields) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			fetch: fields
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure a custom version of the data being created. This is used
	* alongside version enabled storage engines such as SurrealKV.
	*/
	version(version) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			version
		});
	}
	/**
	* Configure the query to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, the query is not sent and fails straight away. If it aborts
	* later, the query stops waiting for the server and fails with the `reason` of the signal, as it
	* is: an `AbortError`, or the `TimeoutError` of `AbortSignal.timeout()`. This holds for awaiting
	* the query as well as for `.stream()`, which ends its iteration with the reason.
	*
	* Aborting means "stop waiting", and nothing more. The server may keep executing the query, and
	* **a write which was sent before the signal aborted may or may not have been applied**.
	*
	* Can be called more than once, and in addition to a signal inherited from `withSignal()`: the
	* query is abandoned when any of them aborts. See {@link Query.signal}.
	*
	* @example
	* ```ts
	* const result = await db.select(table).signal(request.signal);
	* ```
	*
	* @param signal The signal which abandons the query. Without one, nothing changes.
	*/
	signal(signal) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			signals: addSignal(this.#options.signals, signal)
		});
	}
	/**
	* Configure how long to wait for the server to answer the query, in milliseconds, before giving
	* up on it with a `TimeoutError`. Overrides the `requestTimeout` of the connection for this
	* query, so it can also allow a query longer than that default, or `0` to wait without limit.
	*
	* This is a limit on the client, and not the `TIMEOUT` clause which the server enforces and
	* which is set with `.timeout()`. The server is not told the client has given up, so **a write
	* which timed out may or may not have been applied**. See {@link Query.requestTimeout}.
	*
	* @param milliseconds The time to wait for an answer, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new SelectPromise(this.#connection, {
			...this.#options,
			requestTimeout: milliseconds
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the records of the query as they arrive.
	*
	* The first are available while the rest are still being produced, and nothing is held but
	* what has arrived and not yet been read. Each is yielded as it is, or as `parse` returns it
	* when one is given. See `Query.rows()` for the details, which apply here: a record is
	* provisional until iteration completes without throwing, and leaving the loop stops the query.
	*
	* @param parse Applied to each record as it arrives. Without one, records are yielded as they are.
	* @returns A single-use async iterable of records, which can also be disposed.
	*/
	rows(parse) {
		return this.#build().rows(parse);
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		const query = this.#build().stream();
		for await (const frame$1 of query) yield frame$1;
	}
	async dispatch() {
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { what, transaction, session, json, selection, fields, start, limit, cond, timeout, version, fetch } = this.#options;
		const query = surql`SELECT`;
		if (selection === "fields") query.append(surql` type::fields(${fields})`);
		else if (selection === "value") query.append(surql` VALUE type::field(${fields?.[0]})`);
		else query.append(surql` *`);
		query.append(surql` FROM ${_only(what)}`);
		if (cond) query.append(surql` WHERE ${cond}`);
		if (start) query.append(surql` START ${start}`);
		if (limit) query.append(surql` LIMIT ${limit}`);
		if (fetch) query.append(surql` FETCH type::fields(${fetch})`);
		if (version) query.append(surql` VERSION ${version}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		return new Query(this.#connection, {
			credential: this.#options.credential,
			query,
			transaction,
			json,
			session,
			signals: this.#options.signals,
			requestTimeout: this.#options.requestTimeout
		});
	}
};

//#endregion
//#region src/query/update.ts
/**
* A configurable `Promise` for an update query sent to a SurrealDB instance.
*/
var UpdatePromise = class UpdatePromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Run this call as a different identity than the one of the session, for this call only.
	* The session is neither used nor changed. Supported by engines which present credentials
	* with every request, such as HTTP, and rejected with an `UnsupportedFeatureError` by
	* the others.
	*
	* @see {@link Query.as} for details.
	*
	* @param credential An access token or authentication details to run this call as
	* @returns A new `UpdatePromise` which runs as the provided identity.
	*/
	as(credential) {
		assertCredential(credential);
		return new UpdatePromise(this.#connection, {
			...this.#options,
			credential
		});
	}
	/**
	* Configure the query to automatically retry when it fails due to a transaction conflict.
	*
	* Under concurrent load a query may fail because another transaction wrote to the same data.
	* When retry is enabled, the entire query is re-sent with exponential backoff until it
	* succeeds or the configured attempts are exhausted.
	*
	* **NOTE:** Retrying re-sends the full query. Only use this for queries that are safe to replay.
	* Re-sending a non-atomic, multi-statement query may apply some statements more than once.
	*
	* @example
	* ```ts
	* const user = await db.update(new RecordId('users', 'john'))
	*     .content({ name: 'John Doe' })
	*     .retry();
	* ```
	*
	* @param options Retry behavior. Defaults to enabling retry using the connection defaults.
	* @returns A new `UpdatePromise` configured to retry on conflict.
	*/
	retry(options = true) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			retry: options
		});
	}
	/**
	* Configure the query to set the record data
	*/
	content(data) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			mutation: "content",
			data
		});
	}
	/**
	* Configure the query to merge the record data
	*/
	merge(data) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			mutation: "merge",
			data
		});
	}
	/**
	* Configure the query to replace the record data
	*/
	replace(data) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			mutation: "replace",
			data
		});
	}
	/**
	* Configure the query to patch the record data
	*/
	patch(data) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			mutation: "patch",
			data
		});
	}
	/**
	* Configure the query to update the record only if the condition is met.
	*
	* Expressions can be imported from the `surrealdb` package and combined
	* to compose the desired condition.
	*
	* @see {@link https://github.com/surrealdb/surrealdb.js/blob/main/packages/sdk/src/utils/expr.ts}
	*/
	where(expr$1) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			cond: expr$1 ? expr$1 : void 0
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure the query to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, the query is not sent and fails straight away. If it aborts
	* later, the query stops waiting for the server and fails with the `reason` of the signal, as it
	* is: an `AbortError`, or the `TimeoutError` of `AbortSignal.timeout()`. This holds for awaiting
	* the query as well as for `.stream()`, which ends its iteration with the reason.
	*
	* Aborting means "stop waiting", and nothing more. The server may keep executing the query, and
	* **a write which was sent before the signal aborted may or may not have been applied**.
	*
	* Can be called more than once, and in addition to a signal inherited from `withSignal()`: the
	* query is abandoned when any of them aborts. See {@link Query.signal}.
	*
	* @example
	* ```ts
	* const result = await db.update(id).merge(data).signal(request.signal);
	* ```
	*
	* @param signal The signal which abandons the query. Without one, nothing changes.
	*/
	signal(signal) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			signals: addSignal(this.#options.signals, signal)
		});
	}
	/**
	* Configure how long to wait for the server to answer the query, in milliseconds, before giving
	* up on it with a `TimeoutError`. Overrides the `requestTimeout` of the connection for this
	* query, so it can also allow a query longer than that default, or `0` to wait without limit.
	*
	* This is a limit on the client, and not the `TIMEOUT` clause which the server enforces and
	* which is set with `.timeout()`. The server is not told the client has given up, so **a write
	* which timed out may or may not have been applied**. See {@link Query.requestTimeout}.
	*
	* @param milliseconds The time to wait for an answer, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new UpdatePromise(this.#connection, {
			...this.#options,
			requestTimeout: milliseconds
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the records of the query as they arrive.
	*
	* The first are available while the rest are still being produced, and nothing is held but
	* what has arrived and not yet been read. Each is yielded as it is, or as `parse` returns it
	* when one is given. See `Query.rows()` for the details, which apply here: a record is
	* provisional until iteration completes without throwing, and leaving the loop stops the query.
	*
	* @param parse Applied to each record as it arrives. Without one, records are yielded as they are.
	* @returns A single-use async iterable of records, which can also be disposed.
	*/
	rows(parse) {
		return this.#build().rows(parse);
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		const query = this.#build().stream();
		for await (const frame$1 of query) yield frame$1;
	}
	async dispatch() {
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { what, data, transaction, session, json, cond, output, timeout, mutation, retry } = this.#options;
		const query = surql`UPDATE ${_only(what)}`;
		if (mutation && data) query.append(surql` ${raw(mutation.toUpperCase())} ${data}`);
		if (cond) query.append(surql` WHERE ${cond}`);
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		return new Query(this.#connection, {
			credential: this.#options.credential,
			retry,
			query,
			transaction,
			json,
			session,
			signals: this.#options.signals,
			requestTimeout: this.#options.requestTimeout
		});
	}
};

//#endregion
//#region src/query/upsert.ts
/**
* A configurable `Promise` for an upsert query sent to a SurrealDB instance.
*/
var UpsertPromise = class UpsertPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Run this call as a different identity than the one of the session, for this call only.
	* The session is neither used nor changed. Supported by engines which present credentials
	* with every request, such as HTTP, and rejected with an `UnsupportedFeatureError` by
	* the others.
	*
	* @see {@link Query.as} for details.
	*
	* @param credential An access token or authentication details to run this call as
	* @returns A new `UpsertPromise` which runs as the provided identity.
	*/
	as(credential) {
		assertCredential(credential);
		return new UpsertPromise(this.#connection, {
			...this.#options,
			credential
		});
	}
	/**
	* Configure the query to automatically retry when it fails due to a transaction conflict.
	*
	* Under concurrent load a query may fail because another transaction wrote to the same data.
	* When retry is enabled, the entire query is re-sent with exponential backoff until it
	* succeeds or the configured attempts are exhausted.
	*
	* **NOTE:** Retrying re-sends the full query. Only use this for queries that are safe to replay.
	* Re-sending a non-atomic, multi-statement query may apply some statements more than once.
	*
	* @example
	* ```ts
	* const user = await db.upsert(new RecordId('users', 'john'))
	*     .content({ name: 'John Doe' })
	*     .retry();
	* ```
	*
	* @param options Retry behavior. Defaults to enabling retry using the connection defaults.
	* @returns A new `UpsertPromise` configured to retry on conflict.
	*/
	retry(options = true) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			retry: options
		});
	}
	/**
	* Configure the query to set the record data
	*/
	content(data) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			mutation: "content",
			data
		});
	}
	/**
	* Configure the query to merge the record data
	*/
	merge(data) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			mutation: "merge",
			data
		});
	}
	/**
	* Configure the query to replace the record data
	*/
	replace(data) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			mutation: "replace",
			data
		});
	}
	/**
	* Configure the query to patch the record data
	*/
	patch(data) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			mutation: "patch",
			data
		});
	}
	/**
	* Configure the query to upsert the record only if the condition is met.
	*
	* Expressions can be imported from the `surrealdb` package and combined
	* to compose the desired condition.
	*
	* @see {@link https://github.com/surrealdb/surrealdb.js/blob/main/packages/sdk/src/utils/expr.ts}
	*/
	where(expr$1) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			cond: expr$1 ? expr$1 : void 0
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure the query to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, the query is not sent and fails straight away. If it aborts
	* later, the query stops waiting for the server and fails with the `reason` of the signal, as it
	* is: an `AbortError`, or the `TimeoutError` of `AbortSignal.timeout()`. This holds for awaiting
	* the query as well as for `.stream()`, which ends its iteration with the reason.
	*
	* Aborting means "stop waiting", and nothing more. The server may keep executing the query, and
	* **a write which was sent before the signal aborted may or may not have been applied**.
	*
	* Can be called more than once, and in addition to a signal inherited from `withSignal()`: the
	* query is abandoned when any of them aborts. See {@link Query.signal}.
	*
	* @example
	* ```ts
	* const result = await db.upsert(id).content(data).signal(request.signal);
	* ```
	*
	* @param signal The signal which abandons the query. Without one, nothing changes.
	*/
	signal(signal) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			signals: addSignal(this.#options.signals, signal)
		});
	}
	/**
	* Configure how long to wait for the server to answer the query, in milliseconds, before giving
	* up on it with a `TimeoutError`. Overrides the `requestTimeout` of the connection for this
	* query, so it can also allow a query longer than that default, or `0` to wait without limit.
	*
	* This is a limit on the client, and not the `TIMEOUT` clause which the server enforces and
	* which is set with `.timeout()`. The server is not told the client has given up, so **a write
	* which timed out may or may not have been applied**. See {@link Query.requestTimeout}.
	*
	* @param milliseconds The time to wait for an answer, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new UpsertPromise(this.#connection, {
			...this.#options,
			requestTimeout: milliseconds
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the records of the query as they arrive.
	*
	* The first are available while the rest are still being produced, and nothing is held but
	* what has arrived and not yet been read. Each is yielded as it is, or as `parse` returns it
	* when one is given. See `Query.rows()` for the details, which apply here: a record is
	* provisional until iteration completes without throwing, and leaving the loop stops the query.
	*
	* @param parse Applied to each record as it arrives. Without one, records are yielded as they are.
	* @returns A single-use async iterable of records, which can also be disposed.
	*/
	rows(parse) {
		return this.#build().rows(parse);
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		const query = this.#build().stream();
		for await (const frame$1 of query) yield frame$1;
	}
	async dispatch() {
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { what, data, transaction, session, json, cond, output, timeout, mutation, retry } = this.#options;
		const query = surql`UPSERT ${_only(what)}`;
		if (mutation && data) query.append(surql` ${raw(mutation.toUpperCase())} ${data}`);
		if (cond) query.append(surql` WHERE ${cond}`);
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		return new Query(this.#connection, {
			credential: this.#options.credential,
			retry,
			query,
			transaction,
			json,
			session,
			signals: this.#options.signals,
			requestTimeout: this.#options.requestTimeout
		});
	}
};

//#endregion
//#region src/utils/live.ts
function newKill(id$1) {
	return new BoundQuery(`KILL u"${id$1.toString()}"`);
}
/**
* Kill a live query on the server. Kills and registrations on the same table conflict with one
* another, so a kill which is reported as a conflict, and so did nothing, is retried, rather than
* leaving behind a live query which nobody is listening to.
*/
function killLive(controller, session, id$1) {
	return new Query(controller, {
		query: newKill(id$1),
		transaction: void 0,
		session,
		json: false,
		retry: true
	});
}
/**
* Whether an error means the connection is gone, and with it every live query it held, so that a
* subscription being torn down has nothing left to kill.
*/
function isConnectionGone(error) {
	return error instanceof ConnectionUnavailableError || error instanceof CallTerminatedError;
}
/**
* Tie a subscription to the signals it was made with, so that it is killed when they abort.
*
* The signals belong to the subscription from here on, rather than to the call which made it, as it
* outlives that call. `unwatch` lets go of them, and the subscription calls it however it ends.
*/
function watchAbort(abort, onAbort) {
	const signal = abort?.signal;
	if (!abort || !signal) return void 0;
	signal.addEventListener("abort", onAbort, { once: true });
	return { unwatch: () => {
		signal.removeEventListener("abort", onAbort);
		abort.dispose();
	} };
}
/**
* Represents a subscription to a LIVE SELECT query
*/
var LiveSubscription = class {
	/**
	* Subscribe to the live subscription and return an unsubscribe function
	*/
	subscribe(handler) {
		let killed = false;
		(async () => {
			for await (const message of this) {
				if (killed) return;
				handler(message);
			}
		})();
		return () => {
			killed = true;
		};
	}
};
/**
* A managed live subscription that is automatically restarted when the connection
* is re-established.
*/
var ManagedLiveSubscription = class extends LiveSubscription {
	#currentId;
	#controller;
	#resource;
	#session;
	#query;
	#killed = false;
	#serverKilled = false;
	#channels = /* @__PURE__ */ new Set();
	#unsubscribe;
	#unwatch = () => {};
	#killing;
	#stream;
	#ready = Promise.resolve();
	/**
	* @param abort When given, the subscription is killed once its signal aborts, and the scope is
	*              let go of when the subscription ends.
	*/
	constructor(controller, resource, session, query, abort) {
		super();
		this.#controller = controller;
		this.#resource = resource;
		this.#session = session;
		this.#query = query;
		this.#unwatch = watchAbort(abort, () => void this.#abandon())?.unwatch ?? this.#unwatch;
		this.#unsubscribe = this.#controller.subscribe("connected", () => {
			this.#listen().catch(() => {});
		});
		if (this.#controller.status === "connected") {
			this.#ready = this.#listen();
			this.#ready.catch(() => {});
		}
	}
	/**
	* Resolves once the live query has been registered on the server and this
	* client is subscribed to its notification stream. Callers can await this
	* before issuing writes to guarantee no notification is missed.
	*/
	ready() {
		return this.#ready;
	}
	get id() {
		return this.#currentId;
	}
	get isManaged() {
		return true;
	}
	get resource() {
		return this.#resource;
	}
	get isAlive() {
		return !this.#killed && !this.#serverKilled && this.#controller.hasSession(this.#session);
	}
	/**
	* Kill the live subscription. Killing it again, or after its signal aborted, is a no-op which
	* waits for the first kill, so that a `finally` block can kill it whatever came first.
	*/
	kill() {
		this.#killing ??= this.#kill();
		return this.#killing;
	}
	async #kill() {
		this.#killed = true;
		this.#unwatch();
		for (const channel of this.#channels) channel.cancel();
		this.#unsubscribe();
		this.#release(this.#stream);
		if (this.id) await killLive(this.#controller, this.#session, this.id);
	}
	[Symbol.asyncIterator]() {
		if (this.#killed) throw new LiveSubscriptionError("Subscription has been killed");
		const channel = new ChannelIterator(() => {
			this.#channels.delete(channel);
		});
		this.#channels.add(channel);
		return channel;
	}
	/**
	* The signal of the subscription aborted: end it like a kill does, and tell the server.
	*
	* Aborting is the normal end of a live stream, so iteration ends cleanly rather than throwing,
	* and `isAlive` turns false at once. A failure to kill is reported on the error channel, unless it
	* is only that the connection is gone, which takes the live query with it.
	*/
	async #abandon() {
		try {
			await this.kill();
		} catch (err) {
			if (!isConnectionGone(err)) this.#controller.propagateError(new LiveSubscriptionError(err));
		}
	}
	async #killRegistered(id$1) {
		try {
			await killLive(this.#controller, this.#session, id$1);
		} catch (err) {
			if (!isConnectionGone(err)) this.#controller.propagateError(new LiveSubscriptionError(err));
		}
	}
	async #listen() {
		let messageStream;
		try {
			const [id$1] = await this.#query.collect();
			this.#currentId = id$1;
			if (this.#killed) {
				await this.#killRegistered(id$1);
				return;
			}
			messageStream = this.#controller.liveQuery(id$1);
			this.#stream = messageStream[Symbol.asyncIterator]();
		} catch (err) {
			const error = new LiveSubscriptionError(err);
			if (!this.#killed) this.#controller.propagateError(error);
			throw error;
		}
		this.#consume(this.#stream);
	}
	/**
	* Stop reading the notifications of a live query which has ended, which releases the engine's
	* hold on them. A server which does not announce the end of a killed live query would otherwise
	* leave it held for as long as the connection lasts.
	*/
	#release(stream) {
		stream?.return?.()?.catch(() => {});
	}
	async #consume(stream) {
		try {
			for await (const message of { [Symbol.asyncIterator]: () => stream }) {
				for (const channel of this.#channels) channel.submit(message);
				if (message.action === "KILLED") {
					this.#serverKilled = true;
					this.#unwatch();
					this.#unsubscribe();
					for (const channel of this.#channels) channel.cancel();
					return;
				}
			}
		} catch (err) {
			this.#controller.propagateError(new LiveSubscriptionError(err));
		}
	}
};
/**
* An unmanaged live subscription which is constructed with only
* a known pre-existing ID. This subscription will not be automatically
* restarted when the connection is re-established.
*/
var UnmanagedLiveSubscription = class extends LiveSubscription {
	#id;
	#controller;
	#session;
	#killed = false;
	#serverKilled = false;
	#unwatch = () => {};
	#killing;
	#stream;
	#channels = /* @__PURE__ */ new Set();
	/**
	* @param abort When given, the subscription is killed once its signal aborts, and the scope is
	*              let go of when the subscription ends.
	*/
	constructor(controller, session, id$1, abort) {
		super();
		this.#controller = controller;
		this.#session = session;
		this.#id = id$1;
		if (this.#controller.status !== "connected") throw new ConnectionUnavailableError();
		this.#unwatch = watchAbort(abort, () => void this.#abandon())?.unwatch ?? this.#unwatch;
		(async () => {
			const messageStream = controller.liveQuery(id$1);
			const stream = messageStream[Symbol.asyncIterator]();
			this.#stream = stream;
			for await (const message of { [Symbol.asyncIterator]: () => stream }) {
				for (const channel of this.#channels) channel.submit(message);
				if (message.action === "KILLED") {
					this.#serverKilled = true;
					break;
				}
			}
			this.#unwatch();
			for (const channel of this.#channels) channel.cancel();
		})();
	}
	/** The signal of the subscription aborted: end it like a kill does, and tell the server */
	async #abandon() {
		try {
			await this.kill();
		} catch (err) {
			if (!isConnectionGone(err)) this.#controller.propagateError(new LiveSubscriptionError(err));
		}
	}
	get id() {
		return this.#id;
	}
	get isManaged() {
		return false;
	}
	get resource() {
		return void 0;
	}
	get isAlive() {
		return !this.#killed && !this.#serverKilled && this.#controller.hasSession(this.#session);
	}
	/**
	* Kill the live subscription. Killing it again, or after its signal aborted, is a no-op which
	* waits for the first kill, so that a `finally` block can kill it whatever came first.
	*/
	kill() {
		this.#killing ??= this.#kill();
		return this.#killing;
	}
	async #kill() {
		this.#killed = true;
		this.#unwatch();
		for (const channel of this.#channels) channel.cancel();
		this.#stream?.return?.()?.catch(() => {});
		if (this.id) await killLive(this.#controller, this.#session, this.id);
	}
	[Symbol.asyncIterator]() {
		if (this.#killed) throw new LiveSubscriptionError("Subscription has been killed");
		const channel = new ChannelIterator(() => {
			this.#channels.delete(channel);
		});
		this.#channels.add(channel);
		return channel;
	}
};

//#endregion
//#region src/utils/live-dispatcher.ts
/**
* Routes live-query notifications to per-id subscribers, buffering any that
* arrive before a subscriber has attached.
*
* A LIVE query is registered on the server before its round-trip resolves on
* the client, so the server can start emitting notifications while the client
* is still one tick away from subscribing to the per-id stream. Without a
* buffer those notifications are delivered to an id with no listener and are
* silently lost. Holding them until the first subscriber attaches closes that
* window without changing delivery order.
*/
var LiveDispatcher = class {
	#subscribers = /* @__PURE__ */ new Map();
	#pending = /* @__PURE__ */ new Map();
	#limit;
	/**
	* @param limit Maximum notifications buffered per id before the oldest are
	* dropped. Guards against a live query that is registered and receiving but
	* never subscribed to (e.g. a caller that abandons the round-trip).
	*/
	constructor(limit = 1024) {
		this.#limit = limit;
	}
	/**
	* Deliver a notification to the id's subscribers, or buffer it until one
	* attaches.
	*/
	dispatch(id$1, message) {
		const subscribers = this.#subscribers.get(id$1);
		if (subscribers && subscribers.size > 0) {
			for (const notify of subscribers) notify(message);
			return;
		}
		const buffer = this.#pending.get(id$1);
		if (buffer) {
			buffer.push(message);
			if (buffer.length > this.#limit) buffer.shift();
		} else this.#pending.set(id$1, [message]);
	}
	/**
	* Subscribe to notifications for an id, replaying any that were buffered
	* before this subscriber attached. Returns an unsubscribe function.
	*/
	subscribe(id$1, notify) {
		let subscribers = this.#subscribers.get(id$1);
		if (!subscribers) {
			subscribers = /* @__PURE__ */ new Set();
			this.#subscribers.set(id$1, subscribers);
		}
		subscribers.add(notify);
		const buffered = this.#pending.get(id$1);
		if (buffered) {
			this.#pending.delete(id$1);
			for (const message of buffered) notify(message);
		}
		return () => {
			const current = this.#subscribers.get(id$1);
			if (current?.delete(notify) && current.size === 0) this.#subscribers.delete(id$1);
		};
	}
	/**
	* Drop all buffered notifications. Called when the connection drops, since
	* any pending ids are for live queries that will be re-registered under a
	* fresh id once the connection is re-established.
	*/
	clear() {
		this.#pending.clear();
	}
};

//#endregion
//#region src/utils/publisher.ts
var Publisher = class {
	#subscriptions = {};
	subscribe(event, listener) {
		this.#subscriptions[event] ??= /* @__PURE__ */ new Set();
		this.#subscriptions[event]?.add(listener);
		return () => {
			const subscriptions = this.#subscriptions[event];
			if (subscriptions?.delete(listener) && subscriptions.size === 0) delete this.#subscriptions[event];
		};
	}
	subscribeFirst(...events) {
		const subscriptions = [];
		return new Promise((resolve) => {
			for (const event of events) {
				const unsubscribe = this.subscribe(event, (...payload) => {
					for (const subscription of subscriptions) subscription();
					resolve(payload);
				});
				subscriptions.push(unsubscribe);
			}
		});
	}
	publish(event, ...payload) {
		const subscriptions = this.#subscriptions[event];
		if (!subscriptions) return;
		const failures = [];
		for (const subscription of subscriptions) try {
			subscription(...payload);
		} catch (cause) {
			failures.push(cause);
		}
		if (failures.length > 0) throw new PublishError(failures);
	}
};

//#endregion
//#region src/utils/stream-views.ts
/**
* A view of a streamed query, read once, from the start.
*
* Nothing is sent until the first read, so making one costs nothing. Leaving it - by `break`ing out
* of a `for await`, by `return()`, or by `await using` - stops the query on the server, rather than
* leaving it to produce results nothing will read, and does so at once: a read which is parked
* waiting on the server is released, not waited out.
*
* It is a plain iterator rather than an async generator for that reason. A generator defers
* `return()` until the read which is in flight has finished, and a read can be waiting on a result
* which is not coming for as long as the query takes.
*
* Reads are made one at a time, in the order they were asked for, so a consumer which has several
* outstanding - a `Promise.all` over `next()`, or a read raced against a timeout and asked for
* again - receives each row once, in order, and a `done` only once nothing is left.
*
* **Memory is bounded by the server, not by the reader.** The WebSocket API offers no way to pause
* reading, so a reader which is slower than the server produces rows holds the difference in memory
* until it catches up. Leaving the view stops the query, which is the way to stop that.
*/
var StreamView = class {
	#open;
	#queue = [];
	#head = 0;
	#tail = Promise.resolve();
	#starting;
	#iterator;
	#source;
	#failure;
	#closed = false;
	constructor(open) {
		this.#open = open;
	}
	/**
	* Called once when the query has run out of chunks, for a view which held some back.
	*/
	finish(_emit) {}
	next() {
		const read = this.#tail.then(() => this.#read());
		this.#tail = read.then(() => void 0, () => void 0);
		return read;
	}
	async #read() {
		for (;;) {
			if (this.#head < this.#queue.length) {
				const value = this.#queue[this.#head++];
				if (this.#head === this.#queue.length) {
					this.#queue = [];
					this.#head = 0;
				}
				return {
					value,
					done: false
				};
			}
			if (this.#failure) {
				const { error } = this.#failure;
				this.#failure = void 0;
				throw error;
			}
			if (this.#closed) return {
				value: void 0,
				done: true
			};
			let iterator;
			try {
				iterator = await this.#start();
			} catch (error) {
				await this.#close();
				throw error;
			}
			if (!iterator || this.#closed) return {
				value: void 0,
				done: true
			};
			let result;
			try {
				result = await iterator.next();
			} catch (error) {
				if (this.#closed) return {
					value: void 0,
					done: true
				};
				await this.#close();
				throw error;
			}
			if (this.#closed) return {
				value: void 0,
				done: true
			};
			try {
				if (result.done) this.finish((item) => {
					this.#queue.push(item);
				});
				else this.accept(result.value, (item) => {
					this.#queue.push(item);
				});
			} catch (error) {
				this.#failure = { error };
			}
			if (result.done || this.#failure) await this.#close();
		}
	}
	async return() {
		this.#queue = [];
		this.#head = 0;
		this.#failure = void 0;
		await this.#close();
		return {
			value: void 0,
			done: true
		};
	}
	async throw(error) {
		await this.return();
		throw error;
	}
	[Symbol.asyncIterator]() {
		return this;
	}
	[Symbol.asyncDispose]() {
		return this.return().then(() => void 0);
	}
	#start() {
		this.#starting ??= (async () => {
			const source = await this.#open();
			let iterator;
			try {
				iterator = source.chunks[Symbol.asyncIterator]();
			} catch (error) {
				source.dispose();
				throw error;
			}
			this.#source = source;
			this.#iterator = iterator;
			if (this.#closed) {
				await this.#release();
				return void 0;
			}
			return iterator;
		})();
		return this.#starting;
	}
	async #close() {
		if (this.#closed) return;
		this.#closed = true;
		if (this.#iterator) await this.#release();
	}
	/** Abandons the request, stops the query, then lets go of what the request holds. Once. */
	async #release() {
		const iterator = this.#iterator;
		const source = this.#source;
		this.#iterator = void 0;
		this.#source = void 0;
		try {
			source?.abort();
			const returned = iterator?.return?.();
			returned?.catch(() => {});
			await Promise.race([returned, new Promise((resolve) => setTimeout(resolve, 0))]);
		} finally {
			source?.dispose();
		}
	}
};
/**
* The rows of a streamed query, as they arrive.
*
* For a query of several statements these are the rows of each in turn, in statement order, as
* `collect()` returns them. A statement which is one bare value - `SELECT ... FROM ONLY`,
* `RETURN 1 + 2` - is one row; one whose value is `NONE`, such as `LET`, is none.
*
* Statement order is kept even where the server does not produce it. Inside a `BEGIN ... COMMIT`
* written in the query, the server sends the value of a statement after the rows of statements
* which follow it, so those rows wait for the statement ahead of them to finish. Nowhere else is
* anything held back: a query without one delivers every row as it arrives.
*
* **A row is provisional until iteration completes without throwing.** Rows are delivered before
* the statement which produced them has finished, which is the point of streaming, so a statement
* which fails after yielding some voids them: iteration throws that statement's error, and what was
* yielded for it should be discarded. Use `statements()` to receive each statement only once it is
* final, or the frames of `stream()` to see the failure of one statement while the rest still run.
*/
var RowStream = class extends StreamView {
	#json;
	#parse;
	#front = 0;
	#finished = /* @__PURE__ */ new Set();
	#held = /* @__PURE__ */ new Map();
	constructor(open, json, parse) {
		super(open);
		this.#json = json;
		this.#parse = parse;
	}
	accept(chunk, emit) {
		if (chunk.error) throw chunk.error;
		const index = chunk.query;
		const value = chunk.result?.[0];
		const rows = chunk.kind === "single" ? value === void 0 ? [] : [value] : chunk.result;
		if (index === this.#front) for (const row of rows ?? []) emit(this.#row(row));
		else if (rows?.length) {
			let held = this.#held.get(index);
			if (!held) {
				held = [];
				this.#held.set(index, held);
			}
			for (const row of rows) held.push(row);
		}
		if (chunk.kind === "batched") return;
		this.#finished.add(index);
		while (this.#finished.has(this.#front)) {
			this.#front++;
			this.#flush(this.#front, emit);
		}
	}
	finish(emit) {
		for (const index of [...this.#held.keys()].sort((a, b) => a - b)) this.#flush(index, emit);
	}
	#flush(index, emit) {
		const held = this.#held.get(index);
		if (!held) return;
		this.#held.delete(index);
		for (const row of held) emit(this.#row(row));
	}
	#row(value) {
		const row = maybeJsonify(value, this.#json);
		return this.#parse ? this.#parse(row) : row;
	}
};
/**
* The statements of a streamed query, each once it is final.
*
* A statement is yielded when the server has said it is complete, with all of its rows, so what is
* yielded is never retracted by the statement failing afterwards. They are yielded in the order they
* finish, which is statement order wherever the server runs them in turn; `index` says which each
* is. A statement which fails throws its error and ends the iteration.
*
* A stream which fails as a whole after yielding - the connection being lost, say - still throws,
* and a statement which registered a live query can be told after the fact that it was discarded.
*
* This is the view to choose when the answer to one statement is needed whole before the next is
* looked at. It buffers each statement's rows until then, so the rows of a statement are not
* available any sooner than they would have been from `collect()`; what is gained is that the
* statements are, as each finishes.
*/
var StatementStream = class extends StreamView {
	#json;
	#rows = /* @__PURE__ */ new Map();
	#traces = /* @__PURE__ */ new Map();
	constructor(open, json) {
		super(open);
		this.#json = json;
	}
	accept(chunk, emit) {
		if (chunk.error) throw chunk.error;
		const { query: index } = chunk;
		const trace = mergeTraces(this.#traces.get(index), chunk.trace);
		if (chunk.kind === "single") {
			this.#traces.delete(index);
			emit(this.#statement(chunk, maybeJsonify(chunk.result?.[0], this.#json), true, trace));
			return;
		}
		if (trace) this.#traces.set(index, trace);
		let rows = this.#rows.get(index);
		if (!rows) {
			rows = [];
			this.#rows.set(index, rows);
		}
		for (const row of chunk.result ?? []) rows.push(maybeJsonify(row, this.#json));
		if (chunk.kind === "batched-final") {
			this.#rows.delete(index);
			this.#traces.delete(index);
			emit(this.#statement(chunk, rows, false, trace));
		}
	}
	#statement(chunk, value, single, trace) {
		const result = {
			index: chunk.query,
			value,
			stats: chunk.stats,
			type: chunk.type ?? "other",
			single,
			...trace && { trace }
		};
		return result;
	}
};

//#endregion
//#region src/utils/string-prefixes.ts
/**
* A template literal tag function for parsing a string type.
*
* @param string The string to parse
* @param values The interpolated values
* @returns The parsed string
*/
function s(string, ...values) {
	return string.reduce((prev, curr, i) => `${prev}${curr}${values[i] ?? ""}`, "");
}
/**
* A template literal tag function for parsing a string into a Date.
*
* @param string The string to parse
* @param values The interpolated values
* @returns The parsed Date
*/
function d(string, ...values) {
	return new DateTime(s(string, values));
}
/**
* A template literal tag function for parsing a string into a StringRecordId.
*
* @param string The string to parse
* @param values The interpolated values
* @returns The parsed StringRecordId
*/
function r(string, ...values) {
	return new StringRecordId(s(string, values));
}
/**
* A template literal tag function for parsing a string into a Uuid.
*
* @param string The string to parse
* @param values The interpolated values
* @returns The parsed Uuid
*/
function u(string, ...values) {
	return new Uuid(s(string, values));
}

//#endregion
//#region src/query/query.ts
/**
* A configurable query sent to a SurrealDB instance.
*/
var Query = class Query extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options.credential !== void 0 && !isCredentialed(options.query) ? {
			...options,
			query: markCredentialed(new BoundQuery(options.query))
		} : options;
	}
	/**
	* Retrieve the inner query that will be sent to the database.
	*/
	get inner() {
		return this.#options.query;
	}
	/**
	* Configure the query to return the result of each response as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new Query(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Ask the server to report the graph the statements of this query walked, alongside what it
	* answers. Requires SurrealDB 4.0.0 or later: against an older server the call is refused
	* with a `UnavailableFeatureError`, and with a SurrealQL query only.
	*
	* With no arguments every kind is asked for. Otherwise name the kinds wanted:
	*
	* - `relations`: the edges a lookup in a returned position walked, as `{ in, edge, out }`
	* - `references`: the references a `<~` lookup in a returned position walked
	* - `links`: the record links the result reads through, such as `author` in `author.name`
	* - `variables`: what each top-level `LET` bound
	* - `subscriptions`: the live queries a `LIVE SELECT` started
	*
	* Awaiting the query and `collect()` answer as they always do. The trace is read from the
	* views which carry what belongs to a statement:
	*
	* - `stream()` hands over the trace of each server frame as it was sent. It is on the first
	*   value frame of a batch of rows, on the value frame of a single value, or on the done
	*   frame. A trace belongs to its statement and not to the rows it arrived with, it is
	*   provisional until the statement is done, and an error frame retracts it with the rows.
	*   Entries repeat across frames, and are told apart by their ids or by `dedupeTrace()`.
	* - `responses()` and `statements()` collect it for the statement, as it was sent.
	*
	* @example
	* ```ts
	* const [post] = await db
	*     .query("SELECT title, author.name, ->tagged->tag AS tags FROM post")
	*     .trace("relations", "links")
	*     .responses();
	*
	* if (post.success) {
	*     post.trace?.relations; // [{ in: post:1, edge: tagged:a, out: tag:rust }]
	*     post.trace?.links; // [{ record: post:1, field: "author", target: person:tobie }]
	* }
	* ```
	*
	* @param kinds The kinds of trace to ask for, or none for every kind
	* @returns A new `Query` which asks for the trace.
	*/
	trace(...kinds) {
		return new Query(this.#connection, {
			...this.#options,
			trace: normalizeTraceKinds(kinds)
		});
	}
	/**
	* Run this call as a different identity than the one of the session, for this call only.
	*
	* The credential is presented with this request alone. The session, which other calls
	* share, is not authenticated, changed, or looked at, and the selected namespace and
	* database stay as they are. This is how a single connection can serve calls on behalf
	* of different users, where they are held apart by what each of them is permitted to do.
	*
	* Pass an access token, or the authentication details accepted by `signin()`, which are
	* exchanged for a token first and cost an additional request. A token is not checked
	* until the server sees it: a token which is invalid or expired fails the call.
	*
	* Only engines which present credentials with every request support this, which is the
	* HTTP engine. Other engines, such as WebSocket, reject the call with an
	* `UnsupportedFeatureError` instead of running it as the session, which would be the
	* wrong identity. With a WebSocket connection use `forkSession()` and then `authenticate()`
	* on the new session, which stays authenticated for as long as you keep it.
	*
	* @example
	* ```ts
	* const [mine] = await db.query("SELECT * FROM document").as(userToken).collect();
	* const visible = await db.select(new Table("document")).as(userToken);
	* ```
	*
	* @param credential An access token or authentication details to run this call as
	* @returns A new `Query` which runs as the provided identity.
	*/
	as(credential) {
		assertCredential(credential);
		return new Query(this.#connection, {
			...this.#options,
			credential
		});
	}
	/**
	* Configure the query to automatically retry when it fails due to a transaction conflict.
	*
	* Under concurrent load a query may fail because another transaction wrote to the same data.
	* When retry is enabled, the entire query is re-sent with exponential backoff until it
	* succeeds or the configured attempts are exhausted.
	*
	* Retry only applies to `.collect()` (and awaiting the query directly), as the whole query is
	* re-sent on conflict. It does not apply to `.responses()` (which exposes partial results) or
	* to `.stream()`, `.rows()` and `.statements()` (which yield results incrementally and cannot
	* be safely replayed mid-stream).
	*
	* A transaction written into the query is retried as well. When one fails, the server reports
	* an error for each of its statements, and the conflict may be on its `COMMIT`: the error
	* which is checked for a conflict is the one which made the transaction fail, as it is for
	* `.collect()`, not one of the "not executed" errors reported for the other statements.
	*
	* **NOTE:** Retrying re-sends the full query. Only use this for queries that are safe to replay,
	* such as a single statement or a query wrapped in an explicit `BEGIN`/`COMMIT` block.
	* Re-sending a non-atomic, multi-statement query may apply some statements more than once.
	*
	* @example
	* ```ts
	* const [person] = await this.query("BEGIN; UPDATE counter SET n += 1; COMMIT").retry();
	* ```
	*
	* @param options Retry behavior. Defaults to enabling retry using the connection defaults.
	* @returns A new `Query` configured to retry on conflict.
	*/
	retry(options = true) {
		return new Query(this.#connection, {
			...this.#options,
			retry: options
		});
	}
	/**
	* Configure the query to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, the query is not sent and fails straight away. If it aborts
	* later, the query stops waiting for the server and fails with the `reason` of the signal, so an
	* `AbortError` or a `TimeoutError` from `AbortSignal.timeout()` reaches the caller as it is. This
	* holds for `collect()`, for `responses()` and, by ending the iteration with the reason, for
	* `stream()`, which also lets go of what the stream holds. A query waiting to be retried is not
	* retried again.
	*
	* Aborting does not undo anything: it means "stop waiting", and nothing more. Over WebSocket the
	* server has no way of being told, so it may keep executing the query and discard the answer.
	* **A write which was sent before the signal aborted may or may not have been applied**, and a
	* caller which needs to know has to check. Over HTTP the request is cancelled, but a server may
	* well complete work it has begun.
	*
	* Calling this more than once, or in addition to a signal inherited from `withSignal()`,
	* combines the signals: the query is abandoned when any of them aborts.
	*
	* @example
	* ```ts
	* const people = await db
	*     .query("SELECT * FROM person")
	*     .signal(request.signal)
	*     .collect<[Person[]]>();
	*
	* // Give up after two seconds
	* await db.query("SELECT * FROM report").signal(AbortSignal.timeout(2000));
	* ```
	*
	* @param signal The signal which abandons the query. Without one, nothing changes.
	* @returns A new `Query` configured to be abandoned by the signal.
	*/
	signal(signal) {
		return new Query(this.#connection, {
			...this.#options,
			signals: addSignal(this.#options.signals, signal)
		});
	}
	/**
	* Configure how long to wait for the server to answer the query, in milliseconds, before giving up
	* on it with a `TimeoutError`. This overrides the `requestTimeout` of the connection for this query,
	* and is the way to allow a query longer than that default, or `0` to wait without limit.
	*
	* This is a limit on the client. It is not the `TIMEOUT` clause, which the server enforces and
	* the query builders expose as `.timeout()`. The server is not told that the client has given up,
	* and may well carry on: a write which timed out may or may not have been applied. Retries each
	* get the full time, as it applies to every request.
	*
	* To combine it with other reasons for abandoning a query, use `.signal()`: a timeout is no
	* different from `.signal(AbortSignal.timeout(milliseconds))`, apart from replacing the default.
	*
	* @example
	* ```ts
	* // Give the slow report a minute, whatever the connection default is
	* await db.query("SELECT * FROM report").requestTimeout(60_000);
	* ```
	*
	* @param milliseconds The time to wait for an answer, or `0` for no limit.
	* @returns A new `Query` configured with the request timeout.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new Query(this.#connection, {
			...this.#options,
			requestTimeout: milliseconds
		});
	}
	/**
	* Collect and return the results of all queries at once. If any of the queries fail, the promise
	* will reject with the error of the first one which failed.
	*
	* When the query holds a transaction, that is the error which made the transaction fail, wherever
	* it comes. The server also reports the transaction's other statements as errors ("not executed",
	* "cancelled"), and those are only thrown when there is nothing else to throw. `.responses()` and
	* `.stream()` do not choose: they report the error of every statement as the server sent it.
	*
	* You can optionally pass a list of query indexes to collect only the results of specific queries.
	*
	* This is the same as awaiting the query directly, but allows specifying which queries to collect.
	*
	* @example
	* ```ts
	* const [people] = await this.query("SELECT * FROM person").collect<[Person[]]>();
	* ```
	*
	* @param queries The queries to collect. If no queries are provided, all queries will be collected.
	* @returns A promise that resolves to the results of all queries at once.
	*/
	async collect(...queries) {
		return this.#abortable((signal) => this.#collect(signal, queries));
	}
	async #collect(signal, queries) {
		throwIfAborted(signal);
		await raceAbort(this.#connection.ready(), signal);
		const options = RetryContext.mergeOptions(this.#options.retry, this.#connection.retry);
		const context = new RetryContext(options, signal);
		return context.run(async () => {
			const { json } = this.#options;
			const chunks = this.#open(signal);
			const responses = [];
			const failures = [];
			const queryIndexes = queries.length > 0 ? new Map(queries.map((idx, i) => [idx, i])) : void 0;
			for await (const chunk of chunks) {
				if (chunk.error) {
					failures.push(chunk.error);
					if (isSecondaryError(chunk.error)) continue;
					break;
				}
				if (queryIndexes?.has(chunk.query) === false) continue;
				const index = queryIndexes?.get(chunk.query) ?? chunk.query;
				if (chunk.kind === "single") {
					responses[index] = maybeJsonify(chunk.result?.[0], json);
					continue;
				}
				const additions = maybeJsonify(chunk.result ?? [], json);
				let records = responses[index];
				if (!records) {
					records = [...additions];
					responses[index] = records;
				} else for (const addition of additions) records.push(addition);
			}
			if (failures.length > 0) throw findRootCause(failures);
			return responses;
		});
	}
	/**
	* Stream the rows of the query as they arrive.
	*
	* The first rows are available while the rest of the query is still running, and nothing is
	* held but what has arrived and not yet been read:
	*
	* ```ts
	* for await (const person of db.query<[Person[]]>("SELECT * FROM person").rows()) {
	*     console.log(person.name);
	* }
	* ```
	*
	* The row type is derived from the type of the query. For a query of several statements these
	* are the rows of each in turn, in the order the server produces them; a statement which is
	* one bare value, such as `SELECT ... FROM ONLY` or `RETURN 1 + 2`, is one row, and one whose
	* value is `NONE`, such as `LET`, is none. Use `statements()` to tell the statements apart.
	*
	* A `parse` function is applied to each row as it arrives, which is where a row can be
	* validated or turned into a class without the query being held whole first:
	*
	* ```ts
	* for await (const person of db.query("SELECT * FROM person").rows(Person.parse)) {
	*     person; // Person
	* }
	* ```
	*
	* **A row is provisional until iteration completes without throwing.** Rows arrive before the
	* statement which produced them has finished, so one which fails afterwards voids what it
	* yielded: iteration throws its error, and what was yielded for it should be discarded. To
	* receive each statement only once it is final, use `statements()`. To see one statement fail
	* while the others carry on, use the frames of `stream()`.
	*
	* Leaving the loop - `break`, `return()`, or `await using` - stops the query on the server and
	* releases a read which is waiting on it at once. What has arrived and not yet been read is
	* held in memory, and the WebSocket API offers no way to pause the server, so a reader which
	* is slower than the server holds the difference until it catches up. Leaving is how that is
	* stopped.
	*
	* Like `stream()`, this asks for a stream: it streams inside a transaction, where the caution
	* about committing before the end applies, and in spite of `streaming: false`.
	*
	* @param parse Applied to each row as it arrives. Without one, rows are yielded as they are.
	* @returns A single-use async iterable of rows, which can also be disposed.
	*/
	rows(parse) {
		return new RowStream(() => this.#openView(), this.#options.json, parse);
	}
	/**
	* Stream the statements of the query, each once it is final.
	*
	* Where `rows()` delivers rows as they arrive, this delivers a statement when the server has
	* said it is complete, with all of its rows. What is yielded is never retracted, so each
	* statement can be acted on as it arrives while the statements after it are still running:
	*
	* ```ts
	* const sql = "SELECT * FROM person; SELECT * FROM company";
	*
	* for await (const statement of db.query<[Person[], Company[]]>(sql).statements()) {
	*     console.log(statement.index, statement.value.length);
	* }
	* ```
	*
	* A statement's rows are held until it finishes, so the rows of a statement are no sooner than
	* with `collect()`; what is gained is each statement as it completes, and what is spared is the
	* decoding of one very large answer. A statement which fails throws its error and ends the
	* iteration. To see a failure and the statements after it, use `responses()` or the frames of
	* `stream()`.
	*
	* Asks for a stream, and is left the same way as `rows()`.
	*
	* @returns A single-use async iterable of statements, which can also be disposed.
	*/
	statements() {
		return new StatementStream(() => this.#openView(), this.#options.json);
	}
	/**
	* Open the query as a stream for a view to read, once, when it is first read from.
	*
	* Everything which `stream()` does to read through the signals of the query is done here too,
	* so a view is abandoned by a signal, or by the request timeout, the same way.
	*/
	async #openView() {
		const leaving = new AbortController();
		const scope = abortScope([...this.#options.signals ?? [], leaving.signal]);
		try {
			throwIfAborted(scope.signal);
			await raceAbort(this.#connection.ready(), scope.signal);
			return {
				chunks: this.#open(scope.signal, true),
				abort: () => leaving.abort(),
				dispose: scope.dispose
			};
		} catch (error) {
			scope.dispose();
			throw error;
		}
	}
	/**
	* Stream the response frames of the query as they are received as an AsyncIterable.
	*
	* This is the low level view, and almost always the wrong one to start with: use `rows()` for
	* the rows of a query as they arrive, or `statements()` for each statement once it is final.
	* Frames are for what neither can show, which is one statement failing while the statements
	* after it carry on, and the completion and statistics of each statement as it happens.
	*
	* Each iteration yields a **value**, **error**, or **done** frame. The provided
	* `isValue`, `isError`, and `isDone` methods can be used to check the type of frame, and
	* `isValueOf`, `isErrorOf`, and `isDoneOf` to check the type and that the frame belongs to
	* a specific statement, by its index.
	*
	* Values are provisional until the **done** frame for their statement arrives: an **error**
	* frame for a statement retracts every value already yielded for it, and the stream itself
	* throws when the query as a whole could not be completed. Statements are therefore counted
	* by their **done** frames.
	*
	* Abandoning the stream, such as by breaking out of the loop, stops the query on servers
	* which support it, so results which are no longer wanted are no longer produced. Frames which
	* have arrived and not yet been read are held in memory, and the WebSocket API offers no way to
	* pause the server, so a reader which is slower than the server holds the difference until it
	* catches up.
	*
	* Asking for a stream is asking for one. Unlike a query which is simply awaited, which is
	* streamed only where doing so is invisible, this streams inside a transaction, and in spite
	* of `streaming: false` on the driver; and where the connection is at the limit of streams
	* the server allows it, it fails rather than being quietly buffered. A server which does not
	* stream at all still answers, buffered, as it always has, and so do the HTTP and embedded
	* engines.
	*
	* **Inside a transaction, wait for the stream to end before committing.** Requests on a
	* connection are served concurrently, so a `commit` which arrives while the query is still
	* executing succeeds, and what it commits is the part of the query which had run, not the
	* whole of it - the query then fails, but the transaction is already finished.
	*
	* @example
	* ```ts
	* const stream = this.query("SELECT * FROM person").stream();
	*
	* for await (const frame of stream) {
	*     if (frame.isValue<Person>(0)) {
	*         // use frame.value
	*     }
	* }
	* ```
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		const scope = abortScope(this.#options.signals ?? []);
		try {
			yield* this.#frames(scope.signal);
		} finally {
			scope.dispose();
		}
	}
	async *#frames(signal) {
		throwIfAborted(signal);
		await raceAbort(this.#connection.ready(), signal);
		const { json } = this.#options;
		const chunks = this.#open(signal, true);
		for await (const chunk of chunks) {
			if (chunk.error) {
				yield new ErrorFrame(chunk.query, chunk.stats, chunk.error);
				continue;
			}
			let trace = chunk.trace;
			if (chunk.kind === "single") {
				yield new ValueFrame(chunk.query, maybeJsonify(chunk.result?.[0], json), true, trace);
				yield new DoneFrame(chunk.query, chunk.stats, chunk.type ?? "other");
				continue;
			}
			const values = chunk.result;
			for (const value of values) {
				yield new ValueFrame(chunk.query, maybeJsonify(value, json), false, trace);
				trace = void 0;
			}
			if (chunk.kind === "batched-final") yield new DoneFrame(chunk.query, chunk.stats, chunk.type ?? "other", trace);
		}
	}
	/**
	* Collect and return the responses of all queries at once. Failed queries will be returned
	* with `success: false` and the associated error, while successful queries will have
	* `success: true` and their result.
	*
	* You can optionally pass a list of query indexes to collect only the results of specific responses.
	*
	* @example
	* ```ts
	* const [people] = await this.query("SELECT * FROM person").responses<[Person[]]>();
	*
	* people.success; // true
	* people.result; // Person[]
	* ```
	*
	* @param queries The queries to collect. If no queries are provided, all queries will be collected.
	* @returns A promise that resolves to the responses of all queries at once.
	*/
	async responses(...queries) {
		return this.#abortable((signal) => this.#responses(signal, queries));
	}
	async #responses(signal, queries) {
		throwIfAborted(signal);
		await raceAbort(this.#connection.ready(), signal);
		const { json } = this.#options;
		const chunks = this.#open(signal);
		const collections = [];
		const traces = [];
		const responses = [];
		const queryIndexes = queries.length > 0 ? new Map(queries.map((idx, i) => [idx, i])) : void 0;
		for await (const chunk of chunks) {
			if (queryIndexes?.has(chunk.query) === false) {
				if (chunk.error) throw chunk.error;
				continue;
			}
			const index = queryIndexes?.get(chunk.query) ?? chunk.query;
			if (chunk.error) {
				responses[index] = {
					success: false,
					error: chunk.error,
					stats: chunk.stats
				};
				continue;
			}
			traces[index] = mergeTraces(traces[index], chunk.trace);
			if (chunk.kind === "single") {
				responses[index] = {
					success: true,
					result: maybeJsonify(chunk.result?.[0], json),
					stats: chunk.stats,
					type: chunk.type ?? "other",
					...traces[index] && { trace: traces[index] }
				};
				continue;
			}
			const additions = maybeJsonify(chunk.result ?? [], json);
			let records = collections[index];
			if (!records) {
				records = [...additions];
				collections[index] = records;
			} else for (const addition of additions) records.push(addition);
			if (chunk.kind === "batched-final") responses[index] = {
				success: true,
				result: records,
				stats: chunk.stats,
				type: chunk.type ?? "other",
				...traces[index] && { trace: traces[index] }
			};
		}
		return responses;
	}
	async dispatch() {
		return this.collect();
	}
	/**
	* Run work which is bound to the signals of this query, letting go of them once it is done.
	*/
	async #abortable(run) {
		const scope = abortScope(this.#options.signals ?? []);
		try {
			return await run(scope.signal);
		} finally {
			scope.dispose();
		}
	}
	/**
	* Send the query as one request, and return the chunks of its answer.
	*
	* This is the one place where the chunks of the engine are read through a signal. The request
	* is bound to the signal of the caller and to the request timeout, if there is one, which is
	* handed to the engine so it can stop the request itself. The chunks are read through
	* `abortableIterable`, which does not rely on the engine having done so: when the signal aborts
	* a read in progress fails with its reason at once, and the engine's iterator is returned, which
	* is what an engine which can stop a stream on the server acts on.
	*
	* The request timeout is measured from here, once per request, so a retry starts it afresh.
	*/
	#open(signal, stream = false) {
		const { query, transaction, session, credential, beforeSend, dialect, trace } = this.#options;
		if (trace?.length && dialect === "gql") throw new TypeError("A trace can only be asked for with a SurrealQL query");
		const timeout = this.#options.requestTimeout ?? this.#connection.requestTimeout;
		const request = abortScope(signal ? [signal] : [], timeout);
		try {
			throwIfAborted(request.signal);
			const options = request.signal || stream || trace?.length ? {
				...request.signal && { signal: request.signal },
				...stream && { stream },
				...trace?.length && { trace }
			} : void 0;
			const chunks = credential === void 0 ? dialect === "gql" ? this.#connection.gql(query, session, transaction, options) : this.#connection.query(query, session, transaction, beforeSend ? {
				...options,
				beforeSend
			} : options) : this.#connection.queryAs(query, session, transaction, {
				...options,
				credential,
				dialect
			});
			return abortableIterable(chunks, request.signal, request.dispose);
		} catch (error) {
			request.dispose();
			throw error;
		}
	}
};

//#endregion
//#region src/query/api.ts
/**
* A configurable `Promise` for an api request sent to a SurrealDB instance.
*/
var ApiPromise = class ApiPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new ApiPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Run this call as a different identity than the one of the session, for this call only.
	* The session is neither used nor changed. Supported by engines which present credentials
	* with every request, such as HTTP, and rejected with an `UnsupportedFeatureError` by
	* the others.
	*
	* @see {@link Query.as} for details.
	*
	* @param credential An access token or authentication details to run this call as
	* @returns A new `ApiPromise` which runs as the provided identity.
	*/
	as(credential) {
		assertCredential(credential);
		return new ApiPromise(this.#connection, {
			...this.#options,
			credential
		});
	}
	/**
	* Append a header to the api request.
	*
	* @param name The name of the header to append.
	* @param value The value of the header to append.
	*/
	header(name, value) {
		return new ApiPromise(this.#connection, {
			...this.#options,
			headers: {
				...this.#options.headers,
				[name]: value
			}
		});
	}
	/**
	* Append a query parameter to the api request.
	*
	* @param name The name of the query parameter to append.
	* @param value The value of the query parameter to append.
	* @returns A new ApiPromise instance.
	*/
	query(name, value) {
		return new ApiPromise(this.#connection, {
			...this.#options,
			query: {
				...this.#options.query,
				[name]: value
			}
		});
	}
	/**
	* Configure the query to return the response body value
	* as the result. If the response status is not 200, the promise will reject.
	*/
	value() {
		return new ApiPromise(this.#connection, {
			...this.#options,
			value: true
		});
	}
	/**
	* Configure the query to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, the query is not sent and fails straight away. If it aborts
	* later, the query stops waiting for the server and fails with the `reason` of the signal, as it
	* is: an `AbortError`, or the `TimeoutError` of `AbortSignal.timeout()`. This holds for awaiting
	* the query as well as for `.stream()`, which ends its iteration with the reason.
	*
	* Aborting means "stop waiting", and nothing more. The server may keep executing the query, and
	* **a write which was sent before the signal aborted may or may not have been applied**.
	*
	* Can be called more than once, and in addition to a signal inherited from `withSignal()`: the
	* query is abandoned when any of them aborts. See {@link Query.signal}.
	*
	* @example
	* ```ts
	* const result = await db.api().get("/report").signal(request.signal);
	* ```
	*
	* @param signal The signal which abandons the query. Without one, nothing changes.
	*/
	signal(signal) {
		return new ApiPromise(this.#connection, {
			...this.#options,
			signals: addSignal(this.#options.signals, signal)
		});
	}
	/**
	* Configure how long to wait for the server to answer the query, in milliseconds, before giving
	* up on it with a `TimeoutError`. Overrides the `requestTimeout` of the connection for this
	* query, so it can also allow a query longer than that default, or `0` to wait without limit.
	*
	* This is a limit on the client, and not the `TIMEOUT` clause which the server enforces and
	* which is set with `.timeout()`. The server is not told the client has given up, so **a write
	* which timed out may or may not have been applied**. See {@link Query.requestTimeout}.
	*
	* @param milliseconds The time to wait for an answer, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new ApiPromise(this.#connection, {
			...this.#options,
			requestTimeout: milliseconds
		});
	}
	/**
	* Check the request body against a [Standard Schema](https://standardschema.dev) (Zod,
	* Valibot, ArkType and others) before the request is sent. When it fails, the request is not
	* sent and the promise rejects with a `SchemaValidationError` listing every issue. What the
	* schema produces is what is sent, so a schema which transforms or coerces changes the body.
	*
	* Applies when the promise is awaited, and not to `.compile()` or `.stream()`.
	*
	* @example
	* ```ts
	* await db.api().post("/users", body).request(z.object({ name: z.string() }));
	* ```
	*
	* @param schema The schema the request body must satisfy.
	*/
	request(schema) {
		return new ApiPromise(this.#connection, {
			...this.#options,
			requestSchema: schema
		});
	}
	/**
	* Check the response body against a [Standard Schema](https://standardschema.dev) and type the
	* promise as what the schema produces. Only the body of a successful response (status 200 to
	* 299) is checked, because an error response carries a different body. When the body does not
	* match, the promise rejects with a `SchemaValidationError`.
	*
	* @example
	* ```ts
	* const users = await db.api().get("/users").response(z.array(User)).value();
	* ```
	*
	* @param schema The schema the response body must satisfy.
	*/
	response(schema) {
		return new ApiPromise(this.#connection, {
			...this.#options,
			responseSchema: schema
		});
	}
	/**
	* Compile an explicit `api::invoke` SQL query. Executing this compiled query requires
	* query access, including on remote connections whose API calls normally use HTTP.
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		const query = this.#build().stream();
		for await (const frame$1 of query) yield frame$1;
	}
	async dispatch() {
		const { path, method, requestSchema, responseSchema } = this.#options;
		const label = `${method.toUpperCase()} ${path}`;
		let options = this.#options;
		if (requestSchema) {
			const body = await validateWith(requestSchema, options.body, `request body for ${label}`);
			options = {
				...options,
				body
			};
		}
		const result = maybeJsonify(await this.#invoke(options), options.json);
		if (!("body" in result) || typeof result.status !== "number") throw new SurrealError("Body or status was missing from the API response");
		if (responseSchema && isSuccessful(result.status)) result.body = await validateWith(responseSchema, result.body, `response body of ${label}`);
		if (this.#options.value) {
			if ("status" in result && !isSuccessful(result.status)) throw new UnsuccessfulApiError(this.#options.path, this.#options.method, result);
			return result.body;
		}
		return result;
	}
	async #invoke(options) {
		const { path, transaction, session, credential } = options;
		const scope = abortScope(options.signals ?? []);
		let request;
		try {
			throwIfAborted(scope.signal);
			await raceAbort(this.#connection.ready(), scope.signal);
			request = abortScope([scope.signal], options.requestTimeout ?? this.#connection.requestTimeout);
			const { signal } = request;
			throwIfAborted(signal);
			return await raceAbort(credential === void 0 ? this.#connection.api(path, options, session, transaction, { signal }) : this.#connection.apiAs(path, options, session, transaction, {
				signal,
				credential
			}), signal);
		} finally {
			request?.dispose();
			scope.dispose();
		}
	}
	#build(options = this.#options) {
		const { path, body, method, headers, query, transaction, session, json } = options;
		return new Query(this.#connection, {
			credential: this.#options.credential,
			transaction,
			json,
			session,
			query: apiInvocation(path, {
				body,
				method,
				headers,
				query
			}),
			signals: this.#options.signals,
			requestTimeout: this.#options.requestTimeout
		});
	}
};
function isSuccessful(status) {
	return status >= 200 && status < 300;
}

//#endregion
//#region src/api/api.ts
/**
* Exposes a set of methods to interact with user defined APIs.
*
* @example
* ```ts
* type MyPaths = {
*     "/users": { get: [void, User[]] };
*     "/projects": { get: [void, Project[]] };
*     [K: `/users/${number}`]: { get: [void, User] };
* };
*
* const api = db.api<MyPaths>();
* api.get("/users");  // Returns ApiPromise<void, User[]>
* ```
*/
var SurrealApi = class {
	#connection;
	#transaction;
	#prefix;
	#session;
	#headers;
	#signals;
	constructor(connection, session, transaction, prefix, signals) {
		this.#connection = connection;
		this.#session = session;
		this.#transaction = transaction;
		this.#prefix = prefix ?? "";
		this.#headers = {};
		this.#signals = signals;
	}
	/**
	* Configure a header for all requests sent by this API instance.
	*
	* This is useful for setting a common header for all requests sent by this API instance.
	*
	* @param name The name of the header to configure.
	* @param value The value of the header to configure, or null to remove the header.
	*/
	header(name, value) {
		if (value === null) delete this.#headers[name];
		else this.#headers[name] = value;
	}
	/**
	* Invoke a user defined API initialized with a request object.
	*
	* Prefer the method specific functions for a more type-safe experience.
	*
	* @param path The path of the API to invoke.
	* @param request The request to send to the API.
	* @returns The response from the API.
	*/
	invoke(path, request) {
		this.#connection.assertFeature(Features.Api);
		return new ApiPromise(this.#connection, {
			path: normalizePath(this.#prefix, path),
			transaction: this.#transaction,
			session: this.#session,
			value: false,
			json: false,
			signals: this.#signals,
			headers: {
				...this.#headers,
				...request?.headers
			},
			query: request?.query ?? {},
			method: request?.method ?? "get",
			body: request?.body
		});
	}
	/**
	* Invoke a user defined GET API.
	*
	* @param path The path of the API to invoke.
	* @returns The response from the API.
	*/
	get(path) {
		return this.invoke(path, { method: "get" });
	}
	/**
	* Invoke a user defined POST API.
	*
	* @param path The path of the API to invoke.
	* @param body The request body to send to the API.
	* @returns The response from the API.
	*/
	post(path, body) {
		return this.invoke(path, {
			method: "post",
			body
		});
	}
	/**
	* Invoke a user defined PUT API.
	*
	* @param path The path of the API to invoke.
	* @param body The request body to send to the API.
	* @returns The response from the API.
	*/
	put(path, body) {
		return this.invoke(path, {
			method: "put",
			body
		});
	}
	/**
	* Invoke a user defined DELETE API.
	*
	* @param path The path of the API to invoke.
	* @param body The request body to send to the API.
	* @returns The response from the API.
	*/
	delete(path, body) {
		return this.invoke(path, {
			method: "delete",
			body
		});
	}
	/**
	* Invoke a user defined PATCH API.
	*
	* @param path The path of the API to invoke.
	* @param body The request body to send to the API.
	* @returns The response from the API.
	*/
	patch(path, body) {
		return this.invoke(path, {
			method: "patch",
			body
		});
	}
	/**
	* Invoke a user defined TRACE API.
	*
	* @param path The path of the API to invoke.
	* @param body The request body to send to the API.
	* @returns The response from the API.
	*/
	trace(path, body) {
		return this.invoke(path, {
			method: "trace",
			body
		});
	}
};

//#endregion
//#region src/internal/progress.ts
/** Keep a throwing callback from failing a half-applied import; rethrow it as a listener would */
function reportProgress(callback) {
	return (progress) => {
		try {
			callback(progress);
		} catch (error) {
			queueMicrotask(() => {
				throw error;
			});
		}
	};
}
/** Pass a stream on as it is, reporting the bytes read from it as they go by */
function countBytes(source, onProgress, total) {
	let loaded = 0;
	return source.pipeThrough(new TransformStream({ transform(chunk, controller) {
		loaded += chunk.byteLength;
		controller.enqueue(chunk);
		onProgress({
			loaded,
			total
		});
	} }));
}
/** A response whose body reports the bytes read from it, against its `Content-Length` if any */
function countResponse(response, callback) {
	if (!callback || !response.body) return response;
	const length = response.headers.get("Content-Length");
	const total = length === null ? void 0 : Number(length);
	return new Response(countBytes(response.body, reportProgress(callback), Number.isFinite(total) ? total : void 0), {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers
	});
}

//#endregion
//#region src/internal/wrap-sqon-error.ts
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
//#region src/internal/http.ts
/**
* Read a response body in full, without waiting on it beyond what the signal allows.
*
* A `fetch` given the signal errors the body itself when it aborts. This does not rely on it, so
* that a `fetchImpl` which ignores signals cannot keep the caller waiting for the rest of a body.
*/
function readBody(response, signal) {
	return raceAbort(response.arrayBuffer(), signal);
}
/**
* Read a response body in full, cancelling the stream if the signal aborts first.
*
* Unlike `readBody`, which is for the small answer of an RPC call and leaves the stream to `fetch`,
* this reads a body which may be very large and is likely to be streamed, so what it holds is let go
* of when the signal aborts, whatever `fetch` did with it. The reason of the signal is thrown.
*/
async function readChunks(response, signal, onChunk) {
	throwIfAborted(signal);
	if (!response.body) {
		onChunk(new Uint8Array(await raceAbort(response.arrayBuffer(), signal)));
		return;
	}
	const reader = response.body.getReader();
	const cancel = () => {
		reader.cancel(abortReason(signal)).catch(() => {});
	};
	signal.addEventListener("abort", cancel, { once: true });
	try {
		for (;;) {
			const { done, value } = await reader.read();
			throwIfAborted(signal);
			if (done) return;
			onChunk(value);
		}
	} finally {
		signal.removeEventListener("abort", cancel);
		reader.releaseLock();
	}
}
/**
* Read a response as text, cancelling the stream if the signal aborts first.
*/
async function readText(response, signal) {
	if (!signal) return response.text();
	const decoder = new TextDecoder();
	let text$1 = "";
	await readChunks(response, signal, (chunk) => {
		text$1 += decoder.decode(chunk, { stream: true });
	});
	return text$1 + decoder.decode();
}
/**
* Read a response as bytes, cancelling the stream if the signal aborts first.
*/
async function readBytes(response, signal) {
	if (!signal) return new Uint8Array(await response.arrayBuffer());
	const parts = [];
	let length = 0;
	await readChunks(response, signal, (chunk) => {
		parts.push(chunk);
		length += chunk.byteLength;
	});
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const part of parts) {
		bytes.set(part, offset);
		offset += part.byteLength;
	}
	return bytes;
}
/** Release a response nobody is going to read */
function releaseResponse(response) {
	response.body?.cancel().catch(() => {});
}
async function fetchSurreal(context, state, session, options) {
	const endpoint = new URL(options.url ?? state.url);
	const fetchImpl = context.options.fetchImpl ?? globalThis.fetch;
	const headerMap = {
		"Content-Type": "application/cbor",
		Accept: "application/cbor"
	};
	for (const [name, value] of Object.entries(options.headers ?? {})) setHeader(headerMap, name, value);
	if (session.namespace) setHeader(headerMap, "Surreal-NS", session.namespace);
	if (session.database) setHeader(headerMap, "Surreal-DB", session.database);
	endpoint.protocol = endpoint.protocol.replace("ws", "http");
	throwIfAborted(options.signal);
	const source = options.token === void 0 && options.resolve !== false ? state.credentials : void 0;
	const scoped = options.token !== void 0 || source !== void 0;
	if (scoped && endpoint.origin !== originOf(state.url)) throw new SurrealError("Request credentials are only sent to the origin of the connection");
	const encodedBody = encodeBody(options.codec ?? context.codecs.cbor, options.body, options.signal);
	let token = options.token ?? session.accessToken;
	if (source) try {
		token = await resolveToken(source, session.id, void 0, options.signal);
	} catch (error) {
		discardBody(encodedBody, error);
		throw error;
	}
	const progress = options.uploadProgress;
	const xhrBody = progress && encodedBody instanceof Blob && !scoped && !context.options.fetchImpl && typeof XMLHttpRequest === "function" ? encodedBody : void 0;
	const bodyFor = () => {
		if (!progress) return encodedBody;
		if (encodedBody instanceof ReadableStream) return countBytes(encodedBody, progress);
		if (encodedBody instanceof Blob && typeof XMLHttpRequest !== "function") {
			const stream = encodedBody.stream();
			return countBytes(options.signal ? abortableStream(stream, options.signal) : stream, progress, encodedBody.size);
		}
		return encodedBody;
	};
	const attempt = (bearer) => {
		const headers = { ...headerMap };
		if (bearer) setHeader(headers, "Authorization", `Bearer ${bearer}`);
		const method = options.method ?? "POST";
		if (xhrBody && progress) return uploadWithXhr(endpoint, {
			method,
			headers,
			body: xhrBody,
			credentials: context.options.fetchOptions?.credentials,
			signal: options.signal,
			progress
		});
		return raceAbort(fetchImpl(endpoint, {
			...context.options.fetchOptions,
			method,
			headers,
			body: bodyFor(),
			...scoped || options.manualRedirect ? { redirect: "manual" } : {},
			signal: options.signal,
			duplex: "half"
		}), options.signal, releaseResponse);
	};
	let response = await attempt(token);
	if (response.status === 401 && !options.answers?.(401) && source && token && !(encodedBody instanceof ReadableStream)) {
		const renewed = await resolveToken(source, session.id, token, options.signal);
		if (renewed && renewed !== token) {
			releaseResponse(response);
			response = await attempt(renewed);
		}
	}
	if (response.status === 200 || options.answers?.(response.status)) return response;
	const buffer = await readBody(response, options.signal);
	throw new HttpConnectionError(new TextDecoder("utf-8").decode(buffer), response.status, response.statusText, buffer);
}
/** Statuses whose response has no body, which a `Response` refuses to be given one for */
const NULL_BODY_STATUSES = new Set([
	101,
	204,
	205,
	304
]);
/**
* Upload a body with `XMLHttpRequest`, reporting its progress, and answer as `fetch` would: once the
* headers arrive, with a body which cancelling stops the download of. XHR cannot stream a response,
* so the body is read from the `Blob` it downloads into, which the browser keeps out of the page's
* memory.
*/
function uploadWithXhr(url, request) {
	const { signal, progress } = request;
	const xhr = new XMLHttpRequest();
	const onAbort = () => xhr.abort();
	let downloaded;
	const download = new Promise((resolve, reject) => {
		downloaded = {
			resolve,
			reject
		};
	});
	download.catch(() => {});
	return new Promise((resolve, reject) => {
		let answered = false;
		const fail = (reason) => answered ? downloaded.reject(reason) : reject(reason);
		xhr.open(request.method, url.href);
		xhr.responseType = "blob";
		xhr.withCredentials = request.credentials === "include";
		for (const [name, value] of Object.entries(request.headers)) xhr.setRequestHeader(name, value);
		xhr.upload.onprogress = (event) => {
			progress({
				loaded: event.loaded,
				total: event.lengthComputable ? event.total : request.body.size
			});
		};
		xhr.onreadystatechange = () => {
			if (xhr.readyState !== 2) return;
			answered = true;
			resolve(new Response(NULL_BODY_STATUSES.has(xhr.status) ? null : blobBody(download, xhr), {
				status: xhr.status,
				statusText: xhr.statusText
			}));
		};
		xhr.onload = () => downloaded.resolve(xhr.response);
		xhr.onerror = () => fail(/* @__PURE__ */ new TypeError("Failed to fetch"));
		xhr.onabort = () => fail(signal ? abortReason(signal) : /* @__PURE__ */ new TypeError("The request was aborted"));
		xhr.onloadend = () => signal?.removeEventListener("abort", onAbort);
		signal?.addEventListener("abort", onAbort, { once: true });
		xhr.send(request.body);
	});
}
/** A body read from a downloaded `Blob` a chunk at a time, whose cancelling aborts the download */
function blobBody(download, xhr) {
	let reader;
	return new ReadableStream({
		async pull(controller) {
			reader ??= (await download).stream().getReader();
			const { done, value } = await reader.read();
			if (done) controller.close();
			else controller.enqueue(value);
		},
		cancel(reason) {
			xhr.abort();
			return reader?.cancel(reason);
		}
	}, { highWaterMark: 0 });
}
/**
* Ask the connection for the credential of a request, for as long as the request is wanted.
*
* What is waited for is the resolver of the application, which cannot be stopped, so an abort ends
* the wait with the reason of the signal and what the resolver comes up with is left to the
* connection, which keeps it for the requests which follow. An abort wins over a resolver which
* fails at the same moment: a request which has been abandoned is not told that its credential
* could not be resolved.
*/
async function resolveToken(source, session, rejected, signal) {
	try {
		return await raceAbort(source.token(session, rejected, signal), signal);
	} catch (error) {
		throwIfAborted(signal);
		throw error;
	}
}
/**
* Let go of a stream which was to be uploaded, but will not be, because the request failed before
* anything was sent. It is cancelled with the reason, which a stream that has been cancelled
* already, by the abort which caused the failure, takes no further notice of.
*/
function discardBody(body, reason) {
	if (body instanceof ReadableStream) body.cancel(reason).catch(() => {});
}
function originOf(url) {
	const normalized = new URL(url);
	normalized.protocol = normalized.protocol.replace("ws", "http");
	return normalized.origin;
}
const REMOTE_PROTOCOLS = new Set([
	"http",
	"https",
	"ws",
	"wss"
]);
function parseEndpoint(value) {
	const url = typeof value === "string" ? new URL(value) : new URL(value.href);
	const protocol = url.protocol.slice(0, -1);
	if (REMOTE_PROTOCOLS.has(protocol) && !url.pathname.endsWith("/rpc")) {
		if (!url.pathname.endsWith("/")) url.pathname += "/";
		url.pathname += "rpc";
	}
	return url;
}
/**
* Pass a stream on, until a signal aborts: the stream is then cancelled with the reason of the
* signal, and what it was passed to is errored with it.
*
* This is written out rather than done with `pipeThrough(transform, { signal })`, whose `signal`
* option is not honoured by every runtime. Some, among them older versions of Bun, leave the source
* open when it aborts, which is exactly what this is here to prevent.
*/
function abortableStream(source, signal) {
	const reader = source.getReader();
	let onAbort;
	const unwatch = () => {
		if (onAbort) signal.removeEventListener("abort", onAbort);
		onAbort = void 0;
	};
	return new ReadableStream({
		start(controller) {
			onAbort = () => {
				const reason = abortReason(signal);
				onAbort = void 0;
				reader.cancel(reason).catch(() => {});
				controller.error(reason);
			};
			signal.addEventListener("abort", onAbort, { once: true });
		},
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (signal.aborted) return;
				if (done) {
					unwatch();
					controller.close();
					return;
				}
				controller.enqueue(value);
			} catch (error) {
				unwatch();
				controller.error(error);
			}
		},
		cancel(reason) {
			unwatch();
			return reader.cancel(signal.aborted ? abortReason(signal) : reason);
		}
	});
}
function encodeBody(codec, body, signal) {
	if (body instanceof ReadableStream) return signal ? abortableStream(body, signal) : body;
	if (body instanceof Blob) return body;
	return body === void 0 ? void 0 : new Uint8Array(wrapSqonError(() => codec.encode(body)));
}
/**
* Set a header, replacing one of the same name whatever its case, under the spelling it already
* has, so that a header given by the caller replaces a default rather than being sent beside it.
*/
function setHeader(headers, name, value) {
	const lower = name.toLowerCase();
	const existing = Object.keys(headers).find((key) => key.toLowerCase() === lower);
	headers[existing ?? name] = value;
}

//#endregion
//#region src/api/export.ts
/**
* A configurable `Promise` for export operations.
*/
var ExportPromise = class ExportPromise extends DispatchedPromise {
	#connection;
	#options;
	#raw;
	#abort;
	constructor(connection, options, raw$1, abort = {}) {
		super();
		this.#connection = connection;
		this.#options = options;
		this.#raw = raw$1;
		this.#abort = abort;
	}
	/**
	* Configure the export to return the raw `Response` instead of
	* a SurrealQL string. This is useful when you may receive a
	* large amount of data and need to handle the response stream
	* directly.
	*
	* The signal of the export, and its request timeout, keep governing the response after it has
	* been returned: when either fires, reading its body fails with the reason.
	*/
	raw() {
		return new ExportPromise(this.#connection, this.#options, true, this.#abort);
	}
	/**
	* Configure the export to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, nothing is requested. If it aborts later, the export
	* stops and fails with the `reason` of the signal, as it is, and the response stream is
	* cancelled so that nothing keeps downloading. Whether the server stops generating the export
	* is up to the server. Can be called more than once: the export is abandoned when any of the
	* signals aborts. See `Query.signal()`.
	*
	* @param signal The signal which abandons the export. Without one, nothing changes.
	*/
	signal(signal) {
		return new ExportPromise(this.#connection, this.#options, this.#raw, {
			...this.#abort,
			signals: addSignal(this.#abort.signals, signal)
		});
	}
	/**
	* Configure how long to allow the whole of the export, including the download, in
	* milliseconds, before giving up on it with a `TimeoutError`.
	*
	* Unlike for queries there is no default from the connection: an export is long running and
	* streamed, so a limit meant for queries would cut it short. Only a limit given here applies.
	* See `Query.requestTimeout()`.
	*
	* @param milliseconds The time to allow, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new ExportPromise(this.#connection, this.#options, this.#raw, {
			...this.#abort,
			requestTimeout: milliseconds
		});
	}
	/**
	* Run this export as a different identity than the one of the connection, for this export
	* only: it is what the server lets that identity export. The connection is neither
	* authenticated, changed, or looked at, and the credential of the connection is not resolved.
	* See `Query.as()`.
	*
	* Pass an access token, or the authentication details accepted by `signin()`, which are
	* exchanged for a token first. Only engines which present credentials with every request
	* support this, which is the HTTP engine: other engines reject the export with an
	* `UnsupportedFeatureError` rather than run it as the connection.
	*
	* @param credential An access token or authentication details to run this export as
	*/
	as(credential) {
		assertCredential(credential);
		return new ExportPromise(this.#connection, this.#options, this.#raw, {
			...this.#abort,
			credential
		});
	}
	/**
	* Configure a callback to be told how much of the export has been received, each time more of
	* it has been.
	*
	* The server streams an export as it generates it, without saying how large it will be, so the
	* total is not known. Of a raw export, what is reported is what has been read of its body. An
	* embedded engine generates the whole export before handing it over, all at once. Replaces a
	* callback configured before.
	*
	* @param callback Called with the bytes received so far
	*/
	progress(callback) {
		return new ExportPromise(this.#connection, this.#options, this.#raw, {
			...this.#abort,
			progress: callback
		});
	}
	async dispatch() {
		const scope = abortScope(this.#abort.signals ?? [], this.#abort.requestTimeout);
		try {
			throwIfAborted(scope.signal);
			await raceAbort(this.#connection.ready(), scope.signal);
			if (this.#raw) this.#connection.assertFeature(Features.ExportImportRaw);
			const { credential } = this.#abort;
			const request = scope.signal && { signal: scope.signal };
			const result = await raceAbort(credential === void 0 ? this.#connection.exportSql(this.#options, request) : this.#connection.exportSqlAs(this.#options, {
				...request,
				credential
			}), scope.signal, (late) => {
				if (typeof late !== "string") releaseResponse(late);
			});
			if (typeof result === "string") return result;
			const response = countResponse(result, this.#abort.progress);
			if (this.#raw) return response;
			return await readText(response, scope.signal);
		} finally {
			if (!this.#raw) scope.dispose();
		}
	}
};
/**
* A configurable `Promise` for model export operations.
*/
var ExportModelPromise = class ExportModelPromise extends DispatchedPromise {
	#connection;
	#options;
	#raw;
	#abort;
	constructor(connection, options, raw$1, abort = {}) {
		super();
		this.#connection = connection;
		this.#options = options;
		this.#raw = raw$1;
		this.#abort = abort;
	}
	/**
	* Configure the export to return the raw `Response` instead of
	* a `Uint8Array`. This is useful when you may receive a large
	* amount of data and need to handle the response stream directly.
	*
	* The signal of the export, and its request timeout, keep governing the response after it has
	* been returned: when either fires, reading its body fails with the reason.
	*/
	raw() {
		return new ExportModelPromise(this.#connection, this.#options, true, this.#abort);
	}
	/**
	* Configure the export to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, nothing is requested. If it aborts later, the export
	* stops and fails with the `reason` of the signal, as it is, and the response stream is
	* cancelled so that nothing keeps downloading. Can be called more than once: the export is
	* abandoned when any of the signals aborts. See `Query.signal()`.
	*
	* @param signal The signal which abandons the export. Without one, nothing changes.
	*/
	signal(signal) {
		return new ExportModelPromise(this.#connection, this.#options, this.#raw, {
			...this.#abort,
			signals: addSignal(this.#abort.signals, signal)
		});
	}
	/**
	* Configure how long to allow the whole of the export, including the download, in
	* milliseconds, before giving up on it with a `TimeoutError`.
	*
	* Unlike for queries there is no default from the connection, so only a limit given here
	* applies. See `Query.requestTimeout()`.
	*
	* @param milliseconds The time to allow, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new ExportModelPromise(this.#connection, this.#options, this.#raw, {
			...this.#abort,
			requestTimeout: milliseconds
		});
	}
	/**
	* Run this export as a different identity than the one of the connection, for this export
	* only. See `ExportPromise.as()`.
	*
	* @param credential An access token or authentication details to run this export as
	*/
	as(credential) {
		assertCredential(credential);
		return new ExportModelPromise(this.#connection, this.#options, this.#raw, {
			...this.#abort,
			credential
		});
	}
	/**
	* Configure a callback to be told how much of the model has been received, each time more of it
	* has been. See `ExportPromise.progress()`.
	*
	* @param callback Called with the bytes received so far, and the total when it is known
	*/
	progress(callback) {
		return new ExportModelPromise(this.#connection, this.#options, this.#raw, {
			...this.#abort,
			progress: callback
		});
	}
	async dispatch() {
		const scope = abortScope(this.#abort.signals ?? [], this.#abort.requestTimeout);
		try {
			throwIfAborted(scope.signal);
			await raceAbort(this.#connection.ready(), scope.signal);
			this.#connection.assertFeature(Features.SurrealML);
			if (this.#raw) this.#connection.assertFeature(Features.ExportImportRaw);
			const { credential } = this.#abort;
			const request = scope.signal && { signal: scope.signal };
			const result = await raceAbort(credential === void 0 ? this.#connection.exportMlModel(this.#options, request) : this.#connection.exportMlModelAs(this.#options, {
				...request,
				credential
			}), scope.signal, (late) => {
				if (!(late instanceof Uint8Array)) releaseResponse(late);
			});
			if (result instanceof Uint8Array) return result;
			const response = countResponse(result, this.#abort.progress);
			if (this.#raw) return response;
			return await readBytes(response, scope.signal);
		} finally {
			if (!this.#raw) scope.dispose();
		}
	}
};

//#endregion
//#region src/api/import.ts
/**
* A configurable `Promise` for import operations.
*
* Like every other query, it does nothing until it is awaited, or has `.then()` called on it.
*/
var ImportPromise = class ImportPromise extends DispatchedPromise {
	#connection;
	#input;
	#abort;
	constructor(connection, input, abort = {}) {
		super();
		this.#connection = connection;
		this.#input = input;
		this.#abort = abort;
	}
	/**
	* Configure the import to be abandoned when a signal aborts.
	*
	* If the signal has already aborted, nothing is sent. If it aborts later, the import stops
	* waiting and fails with the `reason` of the signal, as it is. A stream being uploaded is
	* cancelled with the same reason, so that nothing keeps reading from it.
	*
	* Aborting stops the upload and the waiting, and nothing more: if the server had received the
	* whole import and begun executing it, it may carry on, and **the import may or may not have been
	* applied**. Can be called more than once: the import is abandoned when any of the signals
	* aborts. See `Query.signal()`.
	*
	* @param signal The signal which abandons the import. Without one, nothing changes.
	*/
	signal(signal) {
		return new ImportPromise(this.#connection, this.#input, {
			...this.#abort,
			signals: addSignal(this.#abort.signals, signal)
		});
	}
	/**
	* Configure how long to allow the whole of the import, including the upload, in
	* milliseconds, before giving up on it with a `TimeoutError`.
	*
	* Unlike for queries there is no default from the connection: an import is long running and
	* may be streamed, so a limit meant for queries would cut it short. Only a limit given here
	* applies. As for a signal, the import may or may not have been applied when it expires. See
	* `Query.requestTimeout()`.
	*
	* @param milliseconds The time to allow, or `0` for no limit.
	*/
	requestTimeout(milliseconds) {
		assertTimeout(milliseconds, "requestTimeout");
		return new ImportPromise(this.#connection, this.#input, {
			...this.#abort,
			requestTimeout: milliseconds
		});
	}
	/**
	* Run this import as a different identity than the one of the connection, for this import
	* only. The connection is neither authenticated, changed, or looked at, and the credential
	* of the connection is not resolved. See `Query.as()`.
	*
	* Pass an access token, or the authentication details accepted by `signin()`, which are
	* exchanged for a token first. Only engines which present credentials with every request
	* support this, which is the HTTP engine: other engines reject the import with an
	* `UnsupportedFeatureError` rather than run it as the connection. A stream is uploaded once
	* and never sent again, so a token which the server refuses fails the import.
	*
	* @param credential An access token or authentication details to run this import as
	*/
	as(credential) {
		assertCredential(credential);
		return new ImportPromise(this.#connection, this.#input, {
			...this.#abort,
			credential
		});
	}
	/**
	* Configure a callback to be told how much of the import has been uploaded, each time more of
	* it has been.
	*
	* The server executes an import as it reads it, so what has been uploaded is close behind what
	* has been applied. Once all of it has been, the import waits for the server to finish the last
	* of it. The total is known for a string or a `Blob`, and not for a stream.
	*
	* Progress is reported by the HTTP and WebSocket engines, which upload an import. In a browser,
	* which cannot follow the upload of a string or a `Blob` with `fetch`, it is followed with
	* `XMLHttpRequest`, except on a connection given a `fetchImpl` or one which resolves a
	* credential for each request, which report nothing for them. Embedded engines apply an import
	* in one call and report nothing. Replaces a callback configured before.
	*
	* @param callback Called with the bytes uploaded so far, and the total when it is known
	*/
	progress(callback) {
		return new ImportPromise(this.#connection, this.#input, {
			...this.#abort,
			progress: callback
		});
	}
	async dispatch() {
		const scope = abortScope(this.#abort.signals ?? [], this.#abort.requestTimeout);
		try {
			throwIfAborted(scope.signal);
			await raceAbort(this.#connection.ready(), scope.signal);
			const { credential, progress } = this.#abort;
			const request = {
				signal: scope.signal,
				uploadProgress: progress && reportProgress(progress)
			};
			await raceAbort(credential === void 0 ? this.#connection.importSql(this.#input, request) : this.#connection.importSqlAs(this.#input, {
				...request,
				credential
			}), scope.signal);
		} finally {
			scope.dispose();
		}
	}
};

//#endregion
//#region src/internal/scan-statements.ts
const WHITESPACE = /\s/;
const WORD_START = /[A-Za-z_]/;
const WORD_PART = /[A-Za-z0-9_]/;
const LINE_BREAKS = new Set([
	10,
	13,
	8232,
	8233
]);
/**
* Skip a quoted run (a string, a backtick or an angle bracket identifier) which starts at
* `start` and is closed by `close`, honoring backslash escapes.
*
* @returns The index just past the closing character, or the end of the source if unclosed
*/
function skipQuoted(source, start, close) {
	let i = start + 1;
	while (i < source.length) {
		const char = source[i];
		if (char === "\\") i += 2;
		else if (char === close) return i + 1;
		else i++;
	}
	return source.length;
}
/**
* Skip a line comment starting at `start`.
*
* @returns The index of the line break which ends the comment, or the end of the source
*/
function skipLine(source, start) {
	let i = start;
	while (i < source.length && !LINE_BREAKS.has(source.charCodeAt(i))) i++;
	return i;
}
/**
* Split a SurrealQL source into its top level statements and report the keyword each one
* starts with, upper-cased. A statement which does not start with a word, such as a bare
* `(1 + 2)` or `{ a: 1 }`, is reported as an empty string. Empty statements are not reported.
*
* This is deliberately **not** a parser. It only knows enough about the lexical structure of
* SurrealQL to find where statements begin: strings, quoted identifiers and comments are
* skipped, and a `;` only ends a statement outside of any `{}`, `()` or `[]`. That is enough
* to answer "does a statement of this kind appear in this query?" without being fooled by a
* `BEGIN` inside a string, a comment or a block.
*
* @param source The SurrealQL to scan
* @returns The first keyword of each top level statement, in order
*/
function scanStatements(source) {
	const statements = [];
	let current;
	let depth = 0;
	let i = 0;
	const begin = (keyword) => {
		current ??= keyword;
	};
	while (i < source.length) {
		const char = source[i];
		if (WHITESPACE.test(char)) i++;
		else if (char === "#" || char === "-" && source[i + 1] === "-" || char === "/" && source[i + 1] === "/") i = skipLine(source, i);
		else if (char === "/" && source[i + 1] === "*") {
			const end = source.indexOf("*/", i + 2);
			i = end === -1 ? source.length : end + 2;
		} else if (char === "'" || char === "\"" || char === "`") {
			begin("");
			i = skipQuoted(source, i, char);
		} else if (char === "⟨") {
			begin("");
			i = skipQuoted(source, i, "⟩");
		} else if (char === ";" && depth === 0) {
			if (current !== void 0) statements.push(current);
			current = void 0;
			i++;
		} else if (char === "{" || char === "(" || char === "[") {
			begin("");
			depth++;
			i++;
		} else if (char === "}" || char === ")" || char === "]") {
			depth = Math.max(0, depth - 1);
			i++;
		} else if (current === void 0 && WORD_START.test(char)) {
			const start = i;
			while (i < source.length && WORD_PART.test(source[i])) i++;
			begin(source.slice(start, i).toUpperCase());
		} else {
			begin("");
			i++;
		}
	}
	if (current !== void 0) statements.push(current);
	return statements;
}

//#endregion
//#region src/internal/compose-queries.ts
/**
* Separates the inputs of a composed query.
*
* The `;` sits on a line of its own, rather than directly after the previous input, so that
* an input which ends in a line comment cannot swallow it. Empty statements are valid
* SurrealQL, so an input which already ends in a `;` is fine too.
*/
const SEPARATOR = "\n;\n";
function describe(input) {
	if (input === null) return "null";
	if (typeof input === "object") return input.constructor?.name ?? "an object";
	return typeof input;
}
function isCompilable(input) {
	return typeof input === "object" && input !== null && typeof input.compile === "function";
}
/**
* Whether the input is a `Query`, which exposes the query it will send as `inner`.
*
* Checked by shape rather than with `instanceof`, so that a `Query` created by another copy
* of the library is recognized just like a `BoundQuery` is.
*/
function hasInner(input) {
	return typeof input === "object" && input !== null && "inner" in input && input.inner instanceof BoundQuery;
}
function toBoundQuery(input, index, name) {
	let query;
	if (typeof input === "string") query = new BoundQuery(input);
	else if (input instanceof BoundQuery) query = input;
	else if (hasInner(input)) query = input.inner;
	else if (input instanceof ManagedLivePromise) throw new ExpressionError(`${name}[${index}] is a live query, which cannot be combined with other queries. Use live() instead`);
	else if (isCompilable(input)) {
		query = input.compile();
		if (!(query instanceof BoundQuery)) throw new ExpressionError(`${name}[${index}].compile() did not return a BoundQuery`);
	} else throw new ExpressionError(`${name}[${index}] is not a query: expected a string, a BoundQuery, a query builder or a Query, but received ${describe(input)}`);
	if (isCredentialed(query)) throw new ExpressionError(`${name}[${index}] runs as another identity with .as(), which cannot be combined with other queries. Call .as() on the combined query instead`);
	if (query.query.trim() === "") throw new ExpressionError(`${name}[${index}] is empty`);
	return query;
}
/**
* Convert each input into the {@link BoundQuery} it stands for, rejecting anything which is
* not a query, is empty, or is a live query.
*
* @param inputs The inputs to convert
* @param name How the caller names the array, used when reporting the index of a bad input
*/
function resolveQueries(inputs, name = "queries") {
	if (!Array.isArray(inputs)) throw new ExpressionError(`${name} must be an array of queries`);
	return inputs.map((input, index) => toBoundQuery(input, index, name));
}
/**
* Combine already resolved queries into a single {@link BoundQuery}, as if their statements
* had been written one after another in a single query.
*
* The combined query is **not** atomic, and each statement keeps its own result: an input
* which holds several statements contributes several results.
*
* Bindings are merged into one set. Two inputs binding the same name is a conflict, because
* one of the two would silently read the other's value. The `surql` template tag and the
* query builders never conflict, as they generate unique names, but hand written
* `BoundQuery` instances can.
*
* @param queries The queries to combine
* @param name How the caller names the array, used when reporting a conflict
*/
function joinQueries(queries, name = "queries") {
	const bindings = {};
	const owners = /* @__PURE__ */ new Map();
	const parts = [];
	for (const [index, query] of queries.entries()) {
		for (const [key, value] of Object.entries(query.bindings)) {
			const owner = owners.get(key);
			if (owner !== void 0) throw new ExpressionError(`Parameter conflict: '$${key}' is bound by both ${name}[${owner}] and ${name}[${index}]. Each query needs its own parameter names, which the surql template tag generates for you`);
			owners.set(key, index);
			bindings[key] = value;
		}
		parts.push(query.query);
	}
	return new BoundQuery(parts.join(SEPARATOR), bindings);
}
/**
* Combine the inputs of `query([...])` into a single {@link BoundQuery}.
*/
function composeQueries(inputs) {
	return joinQueries(resolveQueries(inputs));
}
const TRANSACTION_CONTROL = new Set([
	"BEGIN",
	"COMMIT",
	"CANCEL"
]);
/**
* Check that queries can be wrapped in a transaction, and run to completion once they are.
*
* - `BEGIN`, `COMMIT` and `CANCEL` are rejected, as `transaction()` supplies its own. A
*   `COMMIT` among the queries would commit early, and a `CANCEL` would throw it all away.
* - A `RETURN` which is followed by another statement is rejected. Inside a transaction a
*   `RETURN` ends it: the statements after it are skipped, yet the transaction still commits.
*   That would drop part of the work without an error, and shorten the results. Statements
*   which produce a value without ending the transaction, such as `SELECT` or a bare
*   expression, are fine, as is a `RETURN` which comes last.
* - On servers where a `RETURN` replaces the results of the statements before it, which is the
*   case before SurrealDB 3.0, every `RETURN` is rejected, as the results which are left can no
*   longer be matched to the queries.
*
* A `RETURN` nested inside a block, such as an `IF`, ends a transaction just the same, but
* cannot be told apart from a block which merely produces a value without understanding
* SurrealQL in full, so it is not detected.
*
* @param queries The queries which would be wrapped
* @param name How the caller names the array, used when reporting the index of an input
* @param rules What the server which the queries are for does with a `RETURN`
*/
function assertTransactionSafe(queries, name = "queries", { returnReplacesResults = false } = {}) {
	let returned;
	for (const [index, query] of queries.entries()) for (const keyword of scanStatements(query.query)) {
		if (TRANSACTION_CONTROL.has(keyword)) throw new ExpressionError(`${name}[${index}] contains a ${keyword} statement. transaction() wraps the queries in BEGIN and COMMIT itself, so they must not contain any`);
		if (keyword === "RETURN" && returnReplacesResults) throw new ExpressionError(`${name}[${index}] contains a RETURN statement. On SurrealDB before 3.0 a RETURN in a transaction replaces the results of the statements before it, so the results could no longer be matched to the queries. Use SELECT or a bare expression instead`);
		if (returned !== void 0) throw new ExpressionError(`${name}[${returned}] contains a RETURN statement which is followed by another statement (in ${name}[${index}]). Inside a transaction RETURN ends it early: the statements after it would be skipped but the transaction would still commit. Use SELECT or a bare expression instead, or move the RETURN to the end`);
		if (keyword === "RETURN") returned = index;
	}
}

//#endregion
//#region src/api/queryable.ts
/**
* Represents a scope capable of executing SurrealDB queries.
*/
var SurrealQueryable = class {
	#connection;
	#transaction;
	#session;
	#signals;
	constructor(connection, session, transaction, signals) {
		this.#connection = connection;
		this.#session = session;
		this.#transaction = transaction;
		this.#signals = signals;
	}
	/**
	* Access user defined APIs defined on the database.
	*
	* Path types can be passed to this method in order to
	* provide type safety when invoking APIs.
	*
	* An optional prefix can be provided to prepend to API paths.
	*
	* @example
	* ```ts
	* type MyPaths = {
	*     "/users": { get: [void, User[]] };
	*     [K: `/users/${number}`]: { get: [void, User] };
	* };
	*
	* // Type-safe path and response
	* const api = db.api<MyPaths>();
	* api.get("/users"); // User[]
	*
	* // Prefix to invoke GET /users/:id
	* const usersApi = db.api<MyPaths>("/users");
	* api.get(userId); // User
	* ```
	*
	* @param prefix An optional path prefix to prepend to API paths.
	* @returns A new `SurrealApi` instance.
	*/
	api(prefix) {
		return new SurrealApi(this.#connection, this.#session, this.#transaction, prefix, this.#signals);
	}
	query(query, bindings) {
		let bound;
		if (Array.isArray(query)) bound = composeQueries(query);
		else if (query instanceof BoundQuery) bound = query;
		else bound = new BoundQuery(query, bindings);
		return new Query(this.#connection, {
			query: bound,
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
	}
	/**
	* Runs an ISO GQL (ISO/IEC 39075) query against the database.
	*
	* GQL is the standardized graph query language. Unlike {@link query}, the
	* provided string is executed by the server's GQL engine rather than the
	* SurrealQL engine. The resulting `Query` instance behaves identically to a
	* SurrealQL query: await it (or use `.collect()`, `.stream()`, `.responses()`)
	* to process the results.
	*
	* A namespace and database must be selected before running a GQL query.
	*
	* @example
	* ```ts
	* const [people] = await db.gql("MATCH (p:person) RETURN p.name AS name");
	* ```
	*
	* @param query The GQL query string
	* @param bindings Assigns variables which can be referenced in the query
	* @returns A `Query` instance which can be used to execute or configure the query
	*/
	gql(query, bindings) {
		return new Query(this.#connection, {
			query: new BoundQuery(query, bindings),
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			dialect: "gql"
		});
	}
	/**
	* Returns the record representing the currently authenticated record user by
	* selecting the [$auth parameter](https://surrealdb.com/docs/surrealql/parameters#auth).
	*
	* Make sure the user actually has the permission to select their own record, otherwise you'll get back an empty result
	*
	* @return The record linked to the record ID used for authentication
	*/
	auth() {
		return new AuthPromise(this.#connection, {
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
	}
	/**
	* Create a new managed live query subscription to a table, record ID, or record ID range.
	*
	* Unlike `liveOf()`, which attaches to an already existing live query UUID, `live()` automatically
	* registers the `LIVE SELECT` statement on SurrealDB, tracks the live query UUID, and transparently
	* handles re-establishing the subscription across connection drops.
	*
	* When called on a view made with `withSignal()`, the subscription is killed when the signal
	* aborts: iteration ends, `isAlive` turns false, and the live query is killed on the server.
	* See `SurrealRequestScope`.
	*
	* @see {@link liveOf} for attaching an unmanaged subscriber to an existing live query ID.
	* @param what The table, record ID, or record ID range to subscribe to
	* @returns A new managed live subscription object
	*/
	live(what) {
		return new ManagedLivePromise(this.#connection, {
			what,
			session: this.#session,
			signals: this.#signals
		});
	}
	/**
	* Manually subscribe to an existing live query using its UUID.
	*
	* **NOTE:** This function is for use with live queries that are not managed by the driver,
	* such as those created directly via raw SurrealQL (`db.query("LIVE SELECT ...")`) or an
	* external service. Unlike `live()`, this does not create the live query on the database or
	* re-establish it on reconnection.
	*
	* When called on a view made with `withSignal()`, the live query is killed on the server when the
	* signal aborts, as `kill()` would, and a signal which has aborted already subscribes to nothing.
	*
	* @see {@link live} for automatic, driver-managed live queries with reconnect support.
	* @param id The UUID of the existing live query to subscribe to
	* @returns A new unmanaged live subscription object
	*/
	liveOf(id$1) {
		return new UnmanagedLivePromise(this.#connection, {
			id: id$1,
			session: this.#session,
			signals: this.#signals
		});
	}
	select(what) {
		return new SelectPromise(this.#connection, {
			what,
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
	}
	create(what) {
		return new CreatePromise(this.#connection, {
			what,
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
	}
	relate(from, what, to, data) {
		return new RelatePromise(this.#connection, {
			from,
			what,
			to,
			data,
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
	}
	insert(arg1, arg2) {
		if (arg1 instanceof _Table) return new InsertPromise(this.#connection, {
			table: arg1,
			what: arg2 ?? [],
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
		return new InsertPromise(this.#connection, {
			table: void 0,
			what: arg1,
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
	}
	update(what) {
		return new UpdatePromise(this.#connection, {
			what,
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
	}
	upsert(what) {
		return new UpsertPromise(this.#connection, {
			what,
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
	}
	delete(what) {
		return new DeletePromise(this.#connection, {
			what,
			output: "before",
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
	}
	run(name, arg2, arg3) {
		if (typeof arg2 === "string") return new RunPromise(this.#connection, {
			name,
			version: arg2,
			args: arg3 ?? [],
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
		return new RunPromise(this.#connection, {
			name,
			version: void 0,
			args: arg2 ?? [],
			transaction: this.#transaction,
			session: this.#session,
			json: false,
			signals: this.#signals
		});
	}
};

//#endregion
//#region src/internal/transaction.ts
/**
* The first version of SurrealDB to give a transaction the results which `transaction()`
* relies on. Before it:
*
* - the results hold only the statements between the `BEGIN` and the `COMMIT`, which are not
*   reported themselves;
* - a `RETURN` replaces the results of every statement before it with its own, so what a
*   transaction resolves to can no longer be matched to the queries which were passed.
*/
const MODERN_TRANSACTIONS_SINCE = "3.0.0";
/**
* Whether a server reports a result for the `BEGIN` and `COMMIT` of a transaction, and keeps
* the results of the statements before a `RETURN`.
*
* The SDK only supports servers up to 3.x, so a connection whose version is not known is
* expected to be a recent one.
*/
function isModernTransaction(version) {
	return version === void 0 || isVersionSupported(version, MODERN_TRANSACTIONS_SINCE);
}
/**
* Take the results of the statements the caller asked for out of the responses of a
* transaction which succeeded, leaving out those of the `BEGIN` and `COMMIT` around them.
*
* @param responses The response of each statement, none of which failed
* @param version The version of the server which produced them
*/
function unwrapResults(responses, version) {
	const control = isModernTransaction(version) ? 1 : 0;
	if (responses.length < control * 2) throw new UnexpectedServerResponseError(`Expected the transaction to report BEGIN and COMMIT, but it reported ${responses.length} results`);
	const results = [];
	for (let index = control; index < responses.length - control; index++) {
		const response = responses[index];
		if (!response?.success) throw new UnexpectedServerResponseError(`Statement ${index - control} of the transaction did not report a result`);
		results.push(response.result);
	}
	return results;
}
/**
* Wrap already combined queries in a transaction, as a single query.
*/
function wrapInTransaction(body) {
	return new BoundQuery(`BEGIN;\n${body.query}\n;\nCOMMIT;`, body.bindings);
}
/**
* Execute queries atomically as one request, without any state held on the connection.
*
* @param connection The connection to run the queries on
* @param session The session to run the queries in
* @param queries The queries to run
* @param options Options to configure the transaction
* @param signals The signals of the view this is run from, which abandon the transaction as the
*                `signal` option does
* @returns The result of each statement of the queries
*/
async function executeTransaction(connection, session, queries, options = {}, signals) {
	if (options.requestTimeout !== void 0) assertTimeout(options.requestTimeout, "requestTimeout");
	if (options.as !== void 0) assertCredential(options.as);
	const all = addSignal(signals, options.signal);
	const scope = abortScope(all ?? []);
	try {
		throwIfAborted(scope.signal);
		const resolved = resolveQueries(queries);
		if (resolved.length === 0) return [];
		await raceAbort(connection.ready(), scope.signal);
		assertTransactionSafe(resolved, "queries", { returnReplacesResults: !isModernTransaction(connection.serverVersion) });
		const query = new Query(connection, {
			query: wrapInTransaction(joinQueries(resolved)),
			transaction: void 0,
			session,
			json: false,
			signals: all,
			requestTimeout: options.requestTimeout,
			credential: options.as
		});
		const context = new RetryContext(RetryContext.mergeOptions(options.retry, connection.retry), scope.signal);
		return await context.run(async () => {
			const responses = await query.responses();
			const cause = findRootCause(responses.flatMap((r$1) => r$1 && !r$1.success ? [r$1.error] : []));
			if (cause) throw cause;
			return unwrapResults(responses, connection.serverVersion);
		});
	} finally {
		scope.dispose();
	}
}

//#endregion
//#region src/api/transaction.ts
/**
* A query transaction scoped to a session used to execute multiple queries atomically.
*
* When the desired queries have been executed, call `commit()` to apply the changes to the database.
* If the transaction is no longer needed, call `cancel()` to discard the changes.
*/
var SurrealTransaction = class SurrealTransaction extends SurrealQueryable {
	#connection;
	#session;
	#transaction;
	#signals;
	constructor(connection, session, transaction, signals) {
		super(connection, session, transaction, signals);
		this.#connection = connection;
		this.#session = session;
		this.#transaction = transaction;
		this.#signals = signals;
	}
	/**
	* Create a handle on this same transaction in which every query is also bound to a signal.
	*
	* The handle commits and cancels the transaction just as this one does. Only queries are bound
	* to the signal: `commit()` and `cancel()` are not, so a request which is being abandoned cannot
	* leave the outcome of a commit in doubt. See `SurrealRequestScope`.
	*
	* @param signal The signal to add. Without one, the handle is bound to the same signals as this.
	*/
	withSignal(signal) {
		return new SurrealTransaction(this.#connection, this.#session, this.#transaction, addSignal(this.#signals, signal));
	}
	/**
	* Commit this transaction to the datastore.
	*/
	commit() {
		if (!this.#connection) throw new ConnectionUnavailableError();
		return this.#connection.commit(this.#transaction, this.#session);
	}
	/**
	* Cancel and discard the changes made in this transaction.
	*/
	cancel() {
		if (!this.#connection) throw new ConnectionUnavailableError();
		return this.#connection.cancel(this.#transaction, this.#session);
	}
};

//#endregion
//#region src/api/request-scope.ts
/**
* A view of a session in which everything is bound to one or more `AbortSignal`s.
*
* It is created with `withSignal()`, which is how the work of a request handler is tied to the
* signal of the request without passing it to every call: a query made through the scope is
* abandoned when the signal aborts, exactly as if `.signal()` had been called on it, and a signal
* given to `.signal()` in addition is combined with it. That includes a list of queries run with
* `query([...])`, and an atomic `transaction([...])`.
*
* ```ts
* export default {
*     async fetch(request: Request) {
*         const scoped = db.withSignal(request.signal);
*         const people = await scoped.select(new Table("person"));
*         return Response.json(people);
*     },
* };
* ```
*
* A scope is a cheap object: it shares the connection and the session it was made from, owns
* nothing, and does not need to be closed. It does not change the session, so it is safe to make
* one per request on a connection shared between requests.
*
* A live subscription made through a scope, with `live()` or `liveOf()`, is killed when the signal
* aborts, as a live query which outlives its request would leak on the server. Aborting is the normal
* end of a live stream, so iteration of the subscription ends cleanly, without throwing the reason,
* `isAlive` turns false at once, and the live query is killed on the server. Killing it again
* afterwards is a no-op. A signal which has aborted already makes `live()` and `liveOf()` reject with
* its reason, registering and subscribing to nothing. If it aborts while the live query is being
* registered, the call rejects with the reason, and the live query which the server registers in the
* meantime is killed as soon as it lands. If it aborts while the credential for the registration is
* still being resolved, which is the case when the connection resolves credentials for each request,
* the call rejects with the reason and the registration is never sent. A live query has no `.as()`.
*
* ```ts
* // A server sent events handler: stream changes until the client goes away
* const subscription = await db.withSignal(request.signal).live(table);
*
* for await (const change of subscription) {
*     send(change);
* }
* // Reached when the client disconnects, with the live query already killed
* ```
*
* The calls which change the session, such as `use()` and `signin()`, are not offered by a scope,
* and the `commit()` and `cancel()` of a transaction are left alone, so that a request which is being
* abandoned cannot leave the outcome of a commit in doubt.
*/
var SurrealRequestScope = class SurrealRequestScope extends SurrealQueryable {
	#connection;
	#session;
	#signals;
	constructor(connection, session, signals) {
		super(connection, session, void 0, signals);
		this.#connection = connection;
		this.#session = session;
		this.#signals = signals;
	}
	/**
	* Create a view of the same session in which everything is bound to a further signal as well.
	* The view is abandoned when this scope's signals abort, or the one given.
	*
	* @param signal The signal to add. Without one, the view is bound to the same signals as this.
	*/
	withSignal(signal) {
		return new SurrealRequestScope(this.#connection, this.#session, addSignal(this.#signals, signal) ?? []);
	}
	/**
	* Import an existing export into the database, abandoned when the signals of this scope abort.
	* See `Surreal.import()`.
	*
	* Like on `Surreal`, this acts on the connection and its default session: it does not use the
	* namespace, database or authentication of a session this scope was made from.
	*
	* @param input The data to import
	*/
	import(input) {
		return new ImportPromise(this.#connection, input, { signals: this.#signals });
	}
	/**
	* Export the database as SurrealQL, abandoned when the signals of this scope abort. See
	* `Surreal.export()`, and the note on `import()` about sessions.
	*
	* @param options Optional export options
	*/
	export(options) {
		return new ExportPromise(this.#connection, options ?? {}, false, { signals: this.#signals });
	}
	/**
	* Export a SurrealML model, abandoned when the signals of this scope abort. See
	* `Surreal.exportModel()`, and the note on `import()` about sessions.
	*
	* @param name The name of the ML model to export
	* @param version The version of the ML model to export
	*/
	exportModel(name, version) {
		return new ExportModelPromise(this.#connection, {
			name,
			version
		}, false, { signals: this.#signals });
	}
	async transaction(queries, options) {
		if (!Array.isArray(queries)) throw new ExpressionError("transaction() expects an array of queries");
		return executeTransaction(this.#connection, this.#session, queries, options, this.#signals);
	}
	/**
	* Start a transaction on the session, bound to the signals of this scope. Every query made in
	* the transaction is abandoned when they abort, and a transaction which is abandoned
	* before it is committed is not applied.
	*
	* Starting it is itself abandoned if the signal aborts first, in which case the transaction
	* which may already have begun on the server is cancelled. Committing is not: once a request
	* has decided to commit, a signal does not leave the outcome in doubt.
	*
	* @returns A new transaction instance
	*/
	async beginTransaction() {
		const scope = abortScope(this.#signals);
		try {
			throwIfAborted(scope.signal);
			const id$1 = await raceAbort(this.#connection.begin(this.#session), scope.signal, (late) => {
				this.#connection.cancel(late, this.#session).catch(() => {});
			});
			return new SurrealTransaction(this.#connection, this.#session, id$1, this.#signals);
		} finally {
			scope.dispose();
		}
	}
};

//#endregion
//#region src/api/session.ts
/**
* A scoped contextual session attached to a connection to SurrealDB.
*
* Note that most methods in this class are dispatched once you subscribe to the
* returned Promise and offer various chainable configuration methods before
* making the actual request.
*
* You can create a new derived session by calling the `forkSession` method.
*/
var SurrealSession = class SurrealSession extends SurrealQueryable {
	#publisher = new Publisher();
	#connection;
	#session;
	#unsubAuth;
	#unsubUsing;
	subscribe(event, listener) {
		return this.#publisher.subscribe(event, listener);
	}
	constructor(connection, session) {
		super(connection, session);
		this.#connection = connection;
		this.#session = session;
		this.#unsubAuth = connection.subscribe("auth", (auth, session$1) => {
			if (session$1 === this.#session) this.#publisher.publish("auth", auth);
		});
		this.#unsubUsing = connection.subscribe("using", (using, session$1) => {
			if (session$1 === this.#session) this.#publisher.publish("using", using);
		});
	}
	/**
	* Returns the selected namespace
	*/
	get namespace() {
		return this.#connection.getSession(this.#session).namespace;
	}
	/**
	* Returns the selected database
	*/
	get database() {
		return this.#connection.getSession(this.#session).database;
	}
	/**
	* Returns the current authentication access token
	*/
	get accessToken() {
		return this.#connection.getSession(this.#session).accessToken;
	}
	/**
	* Returns the parameters currently defined on the session
	*/
	get parameters() {
		return this.#connection.getSession(this.#session).variables ?? {};
	}
	/**
	* Returns the ID of the current session. For the default session, undefined is returned.
	*/
	get session() {
		return this.#session;
	}
	/**
	* Returns whether the session is valid and can be used. This is always true for the default session,
	* however for other sessions it will be false after the session has been disposed.
	*/
	get isValid() {
		return this.#connection.hasSession(this.#session);
	}
	/**
	* Create a new session by cloning the current session and return a new `SurrealSession` instance scoped to it.
	*
	* This session will contain its own copy of global variables, namespace, database, and authentication state.
	* Connection related functions and event subscriptions will be shared with the original session. When the
	* connection reconnects, the session will be automatically restored.
	*
	* You can invoke `reset()` on the created session to destroy it, after which it cannot be used again.
	*
	* The following properties are inherited by the new session:
	* - namespace
	* - database
	* - variables
	* - authentication state
	*
	* @returns The new session
	*/
	async forkSession() {
		const created = await this.#connection.createSession(this.#session);
		return SurrealSession.of(this, created);
	}
	/**
	* Closes the current session and disposes of it. After this method is called, the session cannot be used again,
	* and `isValid` will return `false`.
	*/
	async closeSession() {
		await this.#connection.destroySession(this.#session);
		this.#unsubAuth();
		this.#unsubUsing();
	}
	[Symbol.asyncDispose]() {
		return this.closeSession();
	}
	/**
	* Create a view of this session in which every query is bound to an `AbortSignal`, which is how
	* the work of a request handler is tied to the signal of the request without passing it to every
	* call. A query made through the view is abandoned when the signal aborts, as if `.signal()` had
	* been called on it, and a signal given to `.signal()` in addition is combined with this one.
	*
	* The view offers the same query methods as the session and `beginTransaction()`, whose
	* transactions are bound to the signal too. It shares this session and does not change it, so one
	* can be made per request on a connection which is shared between requests.
	*
	* Aborting stops waiting and does not undo anything: the server may carry on, and a write which
	* was sent before the signal aborted may or may not have been applied.
	*
	* @example
	* ```ts
	* // Cloudflare Workers, Next.js route handlers, Hono: the request has a signal
	* const scoped = db.withSignal(request.signal);
	* const people = await scoped.select(new Table("person"));
	* ```
	*
	* @param signal The signal which abandons the work. Without one, the view is not bound to any.
	* @returns A view of this session bound to the signal
	*/
	withSignal(signal) {
		return new SurrealRequestScope(this.#connection, this.#session, signal ? [signal] : []);
	}
	/**
	* Create a new transaction scoped to the current session. Transactions allow you to execute
	* multiple queries atomically. When the desired queries have been executed, call `commit()` to apply the changes to the database.
	* If the transaction is no longer needed, call `cancel()` to discard the changes.
	*
	* @returns A new transaction instance
	*/
	async beginTransaction() {
		const transactionId = await this.#connection.begin(this.#session);
		return new SurrealTransaction(this.#connection, this.#session, transactionId);
	}
	async transaction(queries, options) {
		if (!Array.isArray(queries)) throw new ExpressionError("transaction() expects an array of queries");
		return executeTransaction(this.#connection, this.#session, queries, options);
	}
	/**
	* Switch to the specified {@link https://surrealdb.com/docs/surrealdb/introduction/concepts/namespace|namespace}
	* and {@link https://surrealdb.com/docs/surrealdb/introduction/concepts/database|database}
	*
	* Leaving the namespace or database undefined will leave the current namespace or database unchanged,
	* while passing null will unset the selected namespace or database.
	*
	* @param database Switches to a specific namespace
	* @param db Switches to a specific database
	* @returns The newly selected namespace and database
	*/
	async use(what) {
		return await this.#connection.use(what ?? {}, this.#session);
	}
	/**
	* Sign up to the SurrealDB instance as a new
	* {@link https://surrealdb.com/docs/surrealdb/security/authentication#record-users|record user}.
	*
	* When this method is called, the `authentication` property passed to `connect()`
	* will be ignored. You will be reponsible for handling session invalidation
	* by listening to the `auth` event.
	*
	* @param auth The authentication details to use.
	* @return The authentication tokens.
	*/
	signup(auth) {
		return this.#connection.signup(auth, this.#session);
	}
	/**
	* Authenticate with the SurrealDB using the provided authentication details.
	*
	* When this method is called, the `authentication` property passed to `connect()`
	* will be ignored. You will be reponsible for handling session invalidation
	* by listening to the `auth` event.
	*
	* @param auth The authentication details to use.
	* @return The authentication tokens.
	*/
	signin(auth) {
		return this.#connection.signin(auth, this.#session);
	}
	/**
	* Authenticates the current connection using an existing access token or
	* an access and refresh token combination.
	*
	* When authenticating with a refresh token, a new refresh token will be issued
	* and returned.
	*
	* When this method is called, the `authentication` property passed to `connect()`
	* will be ignored. You will be reponsible for handling session invalidation
	* by listening to the `auth` event.
	*
	* @param token The access token or access and refresh token combination.
	*/
	async authenticate(token) {
		if (typeof token === "object" && token.refresh) return this.#connection.refresh(token, this.#session);
		const access = typeof token === "string" ? token : token.access;
		await this.#connection.authenticate(access, this.#session);
		return { access };
	}
	/**
	* Revoke a refresh token, so that it can never again be exchanged for new tokens.
	*
	* Without arguments, the refresh token of this session is revoked. No session renews its
	* authentication with a revoked refresh token, including those forked from this one.
	* Revoking leaves the access token in place, and the session is then treated as one without a
	* refresh token: when the access token is about to expire, it is renewed with the
	* `authentication` option of `connect()` if that applies, and otherwise the session is
	* invalidated. Call `invalidate()` to sign out at once.
	*
	* Requires SurrealDB 3.0 or later.
	*
	* @param tokens The access and refresh token combination whose refresh token is revoked.
	* Defaults to the tokens of this session.
	*/
	revoke(tokens) {
		return this.#connection.revoke(tokens, this.#session);
	}
	/**
	* Run PostgreSQL text on this session, with the namespace, database, variables and
	* authentication it has, as SurrealDB 4.0's `pgsql` method does. A positional parameter
	* (`$1`, `$2`) binds to the variable `_1`, `_2`, and so on.
	*
	* The answer holds one entry per SQL statement. A statement which fails is an `ERR` entry
	* carrying its SQLSTATE, and the call itself still succeeds. Over WebSocket a `BEGIN` entry
	* opens a transaction which later calls on this session run inside, until a `COMMIT` or
	* `ROLLBACK` entry; over HTTP use the `atomic` option instead.
	*
	* Requires SurrealDB 4.0 or later, on an instance which does not deny the method.
	*
	* @example
	* ```ts
	* const { statements } = await db.pgsql("SELECT name FROM person WHERE age > $1", { _1: 18 });
	* ```
	*
	* @param statements The text, or a batch of texts and `{ text, vars }` entries
	* @param vars Variables for every statement, over those of the session
	* @param options How to run the statements and shape the rows
	*/
	pgsql(statements, vars, options) {
		return this.#connection.sql("pgsql", statements, vars, options, this.#session);
	}
	/**
	* Run MySQL text on this session, as SurrealDB 4.0's `mysql` method does. The n-th `?`
	* binds to the variable `_n`. `USE name` switches the database on the server, but not the
	* namespace and database this session tracks, so call `use()` to switch instead. See
	* `pgsql()` for the rest, which is the same.
	*
	* Requires SurrealDB 4.0 or later, on an instance which does not deny the method.
	*
	* @param statements The text, or a batch of texts and `{ text, vars }` entries
	* @param vars Variables for every statement, over those of the session
	* @param options How to run the statements and shape the rows
	*/
	mysql(statements, vars, options) {
		return this.#connection.sql("mysql", statements, vars, options, this.#session);
	}
	/**
	* Define a global variable for the current socket connection
	*
	* @param key Specifies the name of the variable
	* @param val Assigns the value to the variable name
	*/
	set(variable, value) {
		return this.#connection.set(variable, value, this.#session);
	}
	/**
	* Remove a variable from the current socket connection
	*
	* @param key Specifies the name of the variable.
	*/
	unset(variable) {
		return this.#connection.unset(variable, this.#session);
	}
	/**
	* Invalidates the authentication for the current connection.
	*/
	invalidate() {
		return this.#connection.invalidate(this.#session);
	}
	/**
	* Resets the current session to its initial state, clearing
	* authentication state, variables, and selected namespace/database.
	*/
	async reset() {
		await this.#connection.reset(this.#session);
	}
	/**
	* Compose a new `SurrealSession` instance with the provided parent connection
	* and session ID.
	*
	* You likely won't need to use this method directly, but it can be useful when
	* you need to compose a new `SurrealSession` instance from an id.
	*
	* @param session The parent connection or session to reference
	* @param id The ID of the session
	* @returns A new `SurrealSession` representing the provided ID
	*/
	static of(parent, id$1) {
		return new SurrealSession(parent.#connection, id$1);
	}
};

//#endregion
//#region src/internal/relay.ts
/**
* An async iterable which stands in front of another, opened on first read, without ever
* being a generator.
*
* A generator cannot be returned while it is parked on an await, so one placed in front of a
* stream which is waiting on the server would hold back the `return()` which is meant to reach
* it (and send the cancel) until the stream ended by itself. This forwards `return()` at once.
*
* @param open Opens the source, once, on the first read
* @param tap Observes what is yielded and how the source ends
*/
function relayIterable(open, tap = {}) {
	return { [Symbol.asyncIterator]() {
		let iterator;
		let starting;
		let closed = false;
		const start = () => {
			starting ??= (async () => {
				const source = await open();
				const opened = source[Symbol.asyncIterator]();
				iterator = opened;
				return opened;
			})();
			return starting;
		};
		return {
			async next() {
				if (closed) return {
					done: true,
					value: void 0
				};
				try {
					const source = await start();
					if (closed) return {
						done: true,
						value: void 0
					};
					const result = await source.next();
					if (closed) return {
						done: true,
						value: void 0
					};
					if (result.done) {
						closed = true;
						tap.end?.();
					} else tap.value?.(result.value);
					return result;
				} catch (error) {
					if (!closed) {
						closed = true;
						tap.end?.(error);
					}
					throw error;
				}
			},
			async return(value) {
				if (!closed) {
					closed = true;
					const source = iterator ?? await starting?.catch(() => void 0);
					await source?.return?.();
				}
				return {
					done: true,
					value
				};
			}
		};
	} };
}

//#endregion
//#region src/engine/diagnostics.ts
/**
* The DiagnosticsEngine is a utility allowing you to intercept low level communication
* within the SDK.
*/
var DiagnosticsEngine = class {
	#delegate;
	#callback;
	/**
	* Only present when the engine which is wrapped runs queries as someone else, so that it
	* is refused, rather than run as the session, when it does not.
	*/
	queryAs;
	/** Likewise for import and export, which are refused as well when the engine cannot */
	importSqlAs;
	exportSqlAs;
	exportMlModelAs;
	apiAs;
	/** Only present when the engine which is wrapped runs PostgreSQL and MySQL text */
	sql;
	constructor(delegate, callback) {
		this.#delegate = delegate;
		this.#callback = callback;
		const queryAs = delegate.queryAs;
		if (typeof queryAs === "function") this.queryAs = (query, session, txn, options) => this.#diagnoseQuery(query, session, txn, () => queryAs.call(delegate, query, session, txn, options));
		const { importSqlAs, exportSqlAs, exportMlModelAs, apiAs, sql } = delegate;
		if (typeof sql === "function") this.sql = (dialect, statements, vars, options, session) => this.#diagnose("sql", () => sql.call(delegate, dialect, statements, vars, options, session), () => ({
			dialect,
			session
		}));
		if (typeof importSqlAs === "function") this.importSqlAs = (data, request) => this.#diagnose("importSql", () => importSqlAs.call(delegate, data, request), () => void 0);
		if (typeof exportSqlAs === "function") this.exportSqlAs = (options, request) => this.#diagnose("exportSql", () => exportSqlAs.call(delegate, options, request), () => void 0);
		if (typeof exportMlModelAs === "function") this.exportMlModelAs = (options, request) => this.#diagnose("exportMlModel", () => exportMlModelAs.call(delegate, options, request), () => void 0);
		if (typeof apiAs === "function") this.apiAs = (path, request, session, txn, options) => this.#diagnoseApi(path, request, session, () => apiAs.call(delegate, path, request, session, txn, options));
	}
	get features() {
		return this.#delegate.features;
	}
	subscribe(event, listener) {
		return this.#delegate.subscribe(event, listener);
	}
	open(state) {
		this.#diagnose("open", () => Promise.resolve(this.#delegate.open(state)), () => ({ url: state.url }));
	}
	async close() {
		return this.#diagnose("close", () => this.#delegate.close(), () => void 0);
	}
	ready(version) {
		this.#delegate.ready(version);
	}
	async health() {
		return this.#diagnose("health", () => this.#delegate.health(), () => void 0);
	}
	async version() {
		return this.#diagnose("version", () => this.#delegate.version(), (info) => info);
	}
	async sessions() {
		return this.#diagnose("sessions", () => this.#delegate.sessions(), (list) => list);
	}
	async attach(session) {
		this.#diagnose("attach", () => this.#delegate.attach(session), () => void 0);
	}
	async detach(session) {
		return this.#diagnose("detach", () => this.#delegate.detach(session), () => void 0);
	}
	async use(what, session) {
		return this.#diagnose("use", () => this.#delegate.use(what, session), () => ({
			requested: what,
			session
		}));
	}
	async signup(auth, session) {
		return this.#diagnose("signup", () => this.#delegate.signup(auth, session), () => ({
			variant: "system_user",
			session
		}));
	}
	async signin(auth, session) {
		return this.#diagnose("signin", () => this.#delegate.signin(auth, session), () => {
			const variant = "key" in auth ? "bearer_access" : "variables" in auth ? "record_access" : "system_user";
			return {
				variant,
				session
			};
		});
	}
	async authenticate(token, session) {
		return this.#diagnose("authenticate", () => this.#delegate.authenticate(token, session), () => ({
			variant: "token",
			session
		}));
	}
	async set(name, value, session) {
		return this.#diagnose("set", () => this.#delegate.set(name, value, session), () => ({
			name,
			value,
			session
		}));
	}
	async unset(name, session) {
		return this.#diagnose("unset", () => this.#delegate.unset(name, session), () => ({
			name,
			session
		}));
	}
	async invalidate(session) {
		return this.#diagnose("invalidate", () => this.#delegate.invalidate(session), () => ({ session }));
	}
	async refresh(tokens, session) {
		return this.#diagnose("refresh", () => this.#delegate.refresh(tokens, session), () => ({ session }));
	}
	async revoke(tokens, session) {
		return this.#diagnose("revoke", () => this.#delegate.revoke(tokens, session), () => ({ session }));
	}
	async reset(session) {
		return this.#diagnose("reset", () => this.#delegate.reset(session), () => ({ session }));
	}
	async begin(session) {
		return this.#diagnose("begin", () => this.#delegate.begin(session), () => ({ session }));
	}
	async commit(txn, session) {
		return this.#diagnose("commit", () => this.#delegate.commit(txn, session), () => ({
			txn,
			session
		}));
	}
	async cancel(txn, session) {
		return this.#diagnose("cancel", () => this.#delegate.cancel(txn, session), () => ({
			txn,
			session
		}));
	}
	async importSql(data, request) {
		return this.#diagnose("importSql", () => this.#delegate.importSql(data, request), () => void 0);
	}
	async exportSql(options, request) {
		return this.#diagnose("exportSql", () => this.#delegate.exportSql(options, request), () => void 0);
	}
	async exportMlModel(options, request) {
		return this.#diagnose("exportMlModel", () => this.#delegate.exportMlModel(options, request), () => void 0);
	}
	query(query, session, txn, options) {
		return this.#diagnoseQuery(query, session, txn, () => this.#delegate.query(query, session, txn, options));
	}
	gql(query, session, txn, options) {
		return this.#diagnoseQuery(query, session, txn, () => this.#delegate.gql(query, session, txn, options));
	}
	api(path, request, session, txn, options) {
		return this.#diagnoseApi(path, request, session, () => this.#delegate.api(path, request, session, txn, options));
	}
	/** The body and headers of the request are not reported, as they may hold credentials */
	#diagnoseApi(path, request, session, run) {
		const method = request.method ?? "get";
		return this.#diagnose("api", run, (response) => ({
			path,
			method,
			status: response?.status,
			session
		}));
	}
	#diagnoseQuery(query, session, txn, run) {
		const measure = Duration.measure();
		const callback = this.#callback;
		const debugKey = Uuid.v4();
		callback({
			type: "query",
			key: debugKey,
			phase: "before"
		});
		const delegateResult = run();
		return relayIterable(() => delegateResult, {
			value: (chunk) => callback({
				type: "query",
				key: debugKey,
				phase: "progress",
				result: {
					query: query.query,
					params: query.bindings,
					transaction: txn,
					chunk,
					session
				}
			}),
			end: (error) => callback(error === void 0 ? {
				type: "query",
				key: debugKey,
				phase: "after",
				success: true,
				duration: measure(),
				result: {
					query: query.query,
					params: query.bindings,
					transaction: txn,
					session
				}
			} : {
				type: "query",
				key: debugKey,
				phase: "after",
				success: false,
				duration: measure(),
				error
			})
		});
	}
	liveQuery(id$1) {
		const measure = Duration.measure();
		const callback = this.#callback;
		const debugKey = Uuid.v4();
		callback({
			type: "liveQuery",
			key: debugKey,
			phase: "before"
		});
		const delegateResult = this.#delegate.liveQuery(id$1);
		return { async *[Symbol.asyncIterator]() {
			try {
				for await (const message of delegateResult) {
					callback({
						type: "liveQuery",
						key: debugKey,
						phase: "progress",
						result: {
							id: id$1,
							message
						}
					});
					yield message;
				}
				callback({
					type: "liveQuery",
					key: debugKey,
					phase: "after",
					success: true,
					duration: measure(),
					result: { id: id$1 }
				});
			} catch (error) {
				callback({
					type: "liveQuery",
					key: debugKey,
					phase: "after",
					success: false,
					duration: measure(),
					error
				});
				throw error;
			}
		} };
	}
	async #diagnose(type, callback, result) {
		const measure = Duration.measure();
		const key = Uuid.v4();
		this.#emit({
			type,
			key,
			phase: "before"
		});
		try {
			const response = await callback();
			this.#emit({
				type,
				key,
				phase: "after",
				success: true,
				duration: measure(),
				result: result(response)
			});
			return response;
		} catch (error) {
			this.#emit({
				type,
				key,
				phase: "after",
				success: false,
				duration: measure(),
				error
			});
			throw error;
		}
	}
	/** Past 25 kinds of event, TypeScript no longer relates one of a generic kind to the union */
	#emit(event) {
		this.#callback(event);
	}
};

//#endregion
//#region src/internal/build-rpc-auth.ts
function buildRpcAuth(session, auth) {
	if ("key" in auth) {
		if (auth.database && !auth.namespace) throw new MissingNamespaceDatabaseError();
		const result$1 = {
			ac: auth.access,
			key: auth.key
		};
		if (auth.namespace) result$1.ns = auth.namespace;
		if (auth.database) result$1.db = auth.database;
		return result$1;
	}
	if ("variables" in auth) {
		const namespace$1 = auth.namespace ?? session.namespace;
		const database$1 = auth.database ?? session.database;
		if (!database$1 || !namespace$1) throw new MissingNamespaceDatabaseError();
		return {
			...auth.variables,
			ac: auth.access,
			ns: namespace$1,
			db: database$1
		};
	}
	const access = "access" in auth ? auth.access : void 0;
	const namespace = "namespace" in auth ? auth.namespace : void 0;
	const database = "database" in auth ? auth.database : void 0;
	const result = {
		user: auth.username,
		pass: auth.password
	};
	if (database && !namespace) throw new MissingNamespaceDatabaseError();
	if (access) result.ac = access;
	if (namespace) result.ns = namespace;
	if (database) result.db = database;
	return result;
}

//#endregion
//#region src/internal/cbor-format.ts
/**
* The formats of the RPC wire. `cbor` is what every server speaks. SurrealDB 4.0 adds `cbor.2`,
* which is `cbor` plus the tags of its sized numbers, byte for byte the same for every other
* value; and `shaped`, which is `cbor.2` with each list of result rows written as a tag 57
* block. A server before 4.0 offers only `cbor`.
*
* Each format has one name, but the server spells it differently on each transport: over
* WebSocket it is the subprotocol, and over HTTP it is the media type, where `cbor.2` is
* `application/cbor` with the parameter `v=2`. Those are the server's names, as the
* surrealdb-protocol spec lists them (`spec/cbor-tags.yaml`, `spec/catalogs/http.yaml`).
*
* The two negotiate differently, because the WebSocket handshake picks one name for the
* connection while an HTTP request names its format every time:
*
* - Over WebSocket the server picks the first entry of ITS OWN list — json, cbor.2, cbor,
*   flatbuffers, shaped — which the client offered, not the client's first choice. `shaped`
*   comes last there, so offering "shaped, cbor" gets `cbor`: it has to be offered alone, and a
*   client which wants it reconnects offering the cbor ladder when the handshake fails, as it
*   does against a server before 4.0 which does not know the name.
* - Over HTTP a request asks for `shaped` in `Accept` while its body stays CBOR. From 4.0 a
*   `Content-Type` of `application/cbor` or `application/cbor; v=2` may take an `Accept` of
*   `application/cbor; v=2` or `application/vnd.surrealdb.shaped`; every other pair must match.
*/
/** `cbor` as a WebSocket subprotocol */
const CBOR_PROTOCOL = "cbor";
/** `cbor.2` as a WebSocket subprotocol */
const CBOR2_PROTOCOL = "cbor.2";
/** `shaped` as a WebSocket subprotocol */
const SHAPED_PROTOCOL = "shaped";
/** `cbor` as an HTTP media type */
const CBOR_MEDIA_TYPE = "application/cbor";
/** `cbor.2` as an HTTP media type: the CBOR media type at version 2 */
const CBOR2_MEDIA_TYPE = "application/cbor; v=2";
/** `shaped` as an HTTP media type */
const SHAPED_MEDIA_TYPE = "application/vnd.surrealdb.shaped";
/**
* The WebSocket subprotocols to offer, in order of preference.
*/
function cborProtocols(codecs) {
	return codecs.cbor2 ? [CBOR2_PROTOCOL, CBOR_PROTOCOL] : [CBOR_PROTOCOL];
}
/**
* Whether an HTTP response is written in `shaped`: a `Content-Type` of
* `application/vnd.surrealdb.shaped`, among any parameters and however it is spaced or cased.
*/
function isShapedMediaType(contentType) {
	return !!contentType && /^application\/vnd\.surrealdb\.shaped\s*(;|$)/i.test(contentType.trimStart());
}
/**
* Whether an HTTP response is written in `cbor.2`: a `Content-Type` of `application/cbor` with
* the parameter `v=2`, among any others and however it is spaced or cased.
*/
function isCbor2MediaType(contentType) {
	return !!contentType && /^application\/cbor\s*;(.*;)?\s*v\s*=\s*2\s*(;|$)/i.test(contentType);
}
/**
* The codec for messages in a dialect: `cbor.2` when it is the one in use and there is a codec
* for it, `cbor` otherwise.
*/
function cborCodec(codecs, cbor2) {
	if (!cbor2) return codecs.cbor;
	return codecs.cbor2 ?? codecs.shaped ?? codecs.cbor;
}
/**
* The codec for messages in the format a connection settled on, named as the transport names
* it: a WebSocket subprotocol, or the media type of an HTTP response.
*/
function wireCodec(codecs, format) {
	if (codecs.shaped && (format === SHAPED_PROTOCOL || isShapedMediaType(format))) return codecs.shaped;
	return cborCodec(codecs, format === CBOR2_PROTOCOL || isCbor2MediaType(format));
}

//#endregion
//#region src/internal/get-session-from-state.ts
function getSessionFromState(state, session) {
	const sessionState = session ? state.sessions.get(session) : state.rootSession;
	if (!sessionState) throw new InvalidSessionError(session);
	return sessionState;
}

//#endregion
//#region src/internal/parse-error.ts
/**
* Maps legacy JSON-RPC error codes to ErrorKind values.
* Used when `kind` is absent (old server format).
*/
const CODE_TO_KIND = {
	[-32700]: "Validation",
	[-32600]: "Validation",
	[-32601]: "NotFound",
	[-32602]: "NotAllowed",
	[-32603]: "Validation",
	[-32604]: "Configuration",
	[-32605]: "Configuration",
	[-32606]: "Configuration",
	[-32e3]: "Internal",
	[-32001]: "Connection",
	[-32002]: "NotAllowed",
	[-32003]: "Query",
	[-32004]: "Query",
	[-32005]: "Query",
	[-32009]: "Query",
	[-32006]: "Thrown",
	[-32007]: "Serialization",
	[-32008]: "Serialization"
};
/**
* Resolves the error kind from the raw server data.
* - If `kind` is present, uses it directly.
* - If `kind` is absent, derives it from the legacy `code`.
* - Falls back to `"Internal"` if neither yields a known kind.
*/
function resolveKind(kind, code) {
	if (kind) return kind;
	if (code !== void 0) return CODE_TO_KIND[code] ?? "Internal";
	return "Internal";
}
/**
* Recursively parse a cause chain from the wire format into a `ServerError` chain.
* Each cause becomes a fully typed `ServerError` (or subclass) with its own
* `cause` set as the native `Error.cause`, so the entire chain is visible
* in standard JS tooling.
*/
function parseCause(raw$1) {
	if (!raw$1) return void 0;
	const kind = resolveKind(raw$1.kind, void 0);
	return createServerError({
		kind,
		message: raw$1.message,
		details: raw$1.details,
		cause: parseCause(raw$1.cause) ?? null
	});
}
/**
* Factory that creates the correct `ServerError` subclass based on `kind`.
* Unknown kinds produce a plain `ServerError` instance (forward-compatible).
*/
function createServerError(options) {
	switch (options.kind) {
		case "Validation": return new ValidationError(options);
		case "Configuration": return new ConfigurationError(options);
		case "Thrown": return new ThrownError(options);
		case "Query": return new QueryError(options);
		case "Serialization": return new SerializationError(options);
		case "NotAllowed": return new NotAllowedError(options);
		case "NotFound": return new NotFoundError(options);
		case "AlreadyExists": return new AlreadyExistsError(options);
		case "Internal": return new InternalError(options);
		default: return new ServerError(options);
	}
}
/**
* Parse an RPC-level error object into a `ServerError` (or subclass).
* Handles both old format (`{ code, message }`) and new format
* (`{ code, kind, message, details? }`).
*/
function parseRpcError(raw$1) {
	return createServerError({
		kind: resolveKind(raw$1.kind, raw$1.code),
		code: raw$1.code,
		message: raw$1.message,
		details: raw$1.details,
		cause: parseCause(raw$1.cause) ?? null
	});
}
/**
* Parse a query result error into a `ServerError` (or subclass).
* Note: query result errors use `result` as the message field and
* have no `code` field.
*/
function parseQueryError(raw$1) {
	const kind = resolveKind(raw$1.kind, void 0);
	let details = raw$1.details;
	if (details && typeof details === "object" && details.kind === kind && "details" in details && typeof details.details === "object") details = details.details;
	return createServerError({
		kind,
		code: 0,
		message: raw$1.result,
		details,
		cause: parseCause(raw$1.cause) ?? null
	});
}

//#endregion
//#region src/internal/shaped.ts
/**
* Turning the blocks of a decoded response into their rows.
*
* A block names its shapes by id, and those ids live in a scope wider than the one block: the
* frames of one `query_stream` share a scope, so a shape announced in the first frame holds for
* every later one, and the notifications of one live query share a scope for the life of the
* subscription. A `query` response is its own scope, since nothing follows it.
*
* The codec therefore decodes tag 57 to a {@link ShapedBlock}, which still holds its bytes, and
* the engine resolves it here once the envelope says which scope it belongs to.
*/
/** The scopes of one connection, keyed by the stream or live query whose shapes they hold */
var ShapeScopes = class {
	#scopes = /* @__PURE__ */ new Map();
	/** The scope `key` names, started if this is the first block of it */
	get(key) {
		let scope = this.#scopes.get(key);
		if (!scope) {
			scope = new BlockReader();
			this.#scopes.set(key, scope);
		}
		return scope;
	}
	/** Ends the scope `key` names: its stream finished, or its live query was killed */
	end(key) {
		this.#scopes.delete(key);
	}
	/** Ends every scope, as a closed socket does */
	clear() {
		this.#scopes.clear();
	}
};
/**
* `value` with every block in it replaced by its rows, read in `scope`.
*
* A block only ever reaches a value by having been decoded from tag 57, which this SDK refuses
* on every format but `shaped`, so finding one anywhere in a response is the server having sent
* one there; user data cannot imitate it. The walk therefore does not need to know which field
* of which frame holds the block, only to leave everything else untouched — it descends through
* arrays and plain objects alone, never into a value class such as a `RecordId`.
*/
function resolveBlocks(value, codec, scope) {
	if (value instanceof ShapedBlock) return codec.rows(value, scope);
	if (Array.isArray(value)) {
		let changed = false;
		const out = value.map((item) => {
			const resolved = resolveBlocks(item, codec, scope);
			if (resolved !== item) changed = true;
			return resolved;
		});
		return changed ? out : value;
	}
	if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
		let changed = false;
		const out = {};
		for (const [key, item] of Object.entries(value)) {
			const resolved = resolveBlocks(item, codec, scope);
			if (resolved !== item) changed = true;
			out[key] = resolved;
		}
		return changed ? out : value;
	}
	return value;
}

//#endregion
//#region src/internal/query-stats.ts
/**
* The stats for a statement whose only reported measurement is its duration.
*
* No engine reports byte or record counts yet, and every path that builds a
* chunk has to put something in those fields. `-1` is the placeholder they all
* agree on, kept here so the buffered and streaming paths cannot drift into
* reporting different shapes for the same missing measurement.
*
* @param time The statement's duration, in the wire's textual form.
*/
function statsFromTime(time) {
	return {
		bytesReceived: -1,
		bytesScanned: -1,
		recordsReceived: -1,
		recordsScanned: -1,
		duration: Duration.parseFloat(time)
	};
}

//#endregion
//#region src/engine/rpc.ts
/** From 3.1, the server answers an import with the statements which failed, and only those */
const IMPORT_REPORTS_FAILURES = "3.1.0";
/** The status from which the server says, for itself, that statements of an import failed */
const IMPORT_FAILED = 422;
/** The most failures an `ImportError` carries, beyond which they are only counted */
const KEPT_FAILURES = 100;
/** A custom API answers with its own status, application errors included */
const isApiStatus = (status) => status >= 200 && status < 600;
const utf8 = new TextDecoder();
/**
* JSON-based engines implement the SurrealDB v1 protocol, which uses
* JSON objects to communicate with the server.
*/
var RpcEngine = class {
	_context;
	_state;
	/** The version of the server, as `ready()` is told it */
	_version;
	constructor(context) {
		this._context = context;
	}
	/**
	* Invoke a custom API by running `api::invoke` as a query, which works wherever queries do,
	* inside a transaction as well. Engines which reach the server over HTTP override it with
	* `apiOverHttp()`, which needs no query access.
	*/
	async api(path, request, session, txn, options) {
		const invocation = apiInvocation(path, request);
		for await (const chunk of this.query(invocation, session, txn, options)) {
			if (chunk.error) throw chunk.error;
			return chunk.result?.[0];
		}
		throw new UnexpectedServerResponseError(void 0);
	}
	/**
	* Invoke a custom API through the `/api/:namespace/:database` endpoint of the server, as the
	* session, or as the identity of the token when there is one. Unlike `api::invoke`, this is
	* allowed for those who may not run queries.
	*/
	async apiOverHttp(path, request, session, options, token) {
		const state = this._state;
		if (!state) throw new ConnectionUnavailableError();
		const selected = getSessionFromState(state, session);
		if (!selected.namespace || !selected.database) throw new MissingNamespaceDatabaseError();
		if (isDotSegment(selected.namespace) || isDotSegment(selected.database)) throw new SurrealError("HTTP API namespace and database cannot be dot segments");
		const method = (request.method ?? "get").toUpperCase();
		if ((method === "GET" || method === "HEAD") && request.body !== void 0) throw new SurrealError("HTTP API requests with GET or HEAD cannot have a body");
		const endpoint = new URL(state.url);
		const basepath = endpoint.pathname.slice(0, -4);
		const segments = path.split("/").filter(Boolean);
		if (segments.some(isDotSegment)) throw new SurrealError("HTTP API paths cannot contain dot segments");
		endpoint.pathname = `${basepath}/api/${encodeURIComponent(selected.namespace)}/${encodeURIComponent(selected.database)}/${segments.map(encodeURIComponent).join("/")}`;
		endpoint.search = "";
		endpoint.hash = "";
		for (const [name, value] of Object.entries(request.query ?? {})) endpoint.searchParams.set(name, value);
		const headers = new Headers(request.headers);
		const requestType = mediaType(headers.get("content-type")) ?? "application/cbor";
		let payload = request.body;
		if (payload !== void 0 && !(payload instanceof Blob) && requestType !== "application/cbor") if (isJson(requestType)) payload = new Blob([JSON.stringify(jsonify(payload))]);
		else if (typeof payload === "string" || payload instanceof Uint8Array) payload = new Blob([payload]);
		else throw new SurrealError("HTTP API bodies with this Content-Type must be a string, Uint8Array, or Blob");
		const response = await fetchSurreal(this._context, state, selected, {
			url: endpoint,
			method,
			body: payload,
			headers: headerRecord(headers),
			token,
			signal: options?.signal,
			answers: isApiStatus,
			manualRedirect: true
		});
		const bytes = await readBytes(response, options?.signal);
		const responseType = mediaType(response.headers.get("content-type"));
		let body;
		if (bytes.length === 0) body = void 0;
		else if (responseType === "application/cbor") body = wrapSqonError(() => this._context.codecs.cbor.decode(bytes));
		else if (responseType && isJson(responseType)) try {
			body = JSON.parse(utf8.decode(bytes));
		} catch (cause) {
			throw new SurrealError("The API response is not valid JSON", { cause });
		}
		else if (responseType?.startsWith("text/")) body = utf8.decode(bytes);
		else body = bytes;
		return {
			body,
			status: response.status,
			headers: headerRecord(response.headers)
		};
	}
	/**
	* There is no `health` RPC method, so an engine which knows no better asks with `ping`, which
	* any engine can send. Engines which reach the server over HTTP ask its `/health` endpoint.
	*/
	async health() {
		await this.send({ method: "ping" });
	}
	/**
	* Ask the `/health` endpoint of the server, which answers with an error when the datastore
	* cannot be reached. No credential is presented.
	*/
	async requestHealthEndpoint() {
		if (!this._state) throw new ConnectionUnavailableError();
		const endpoint = new URL(this._state.url);
		const basepath = endpoint.pathname.slice(0, -4);
		endpoint.pathname = `${basepath}/health`;
		const response = await fetchSurreal(this._context, this._state, this._state.rootSession, {
			url: endpoint,
			method: "GET",
			token: ""
		});
		releaseResponse(response);
	}
	async version() {
		const version = await this.send({ method: "version" });
		return { version };
	}
	async sessions() {
		return await this.send({ method: "sessions" });
	}
	async attach(session) {
		await this.send({
			method: "attach",
			session
		});
	}
	async detach(session) {
		return await this.send({
			method: "detach",
			session
		});
	}
	async use(what, session) {
		const res = await this.send({
			method: "use",
			params: [what.namespace, what.database],
			session
		});
		return res ?? {};
	}
	async signup(auth, session) {
		if (!this._state) throw new ConnectionUnavailableError();
		const sessionState = getSessionFromState(this._state, session);
		const response = await this.send({
			method: "signup",
			params: [buildRpcAuth(sessionState, auth)],
			session
		});
		return this.parseTokens(response);
	}
	async signin(auth, session) {
		if (!this._state) throw new ConnectionUnavailableError();
		const sessionState = getSessionFromState(this._state, session);
		const response = await this.send({
			method: "signin",
			params: [buildRpcAuth(sessionState, auth)],
			session
		});
		return this.parseTokens(response);
	}
	async authenticate(token, session) {
		await this.send({
			method: "authenticate",
			params: [token],
			session
		});
	}
	async set(name, value, session) {
		await this.send({
			method: "let",
			params: [name, value],
			session
		});
	}
	async unset(name, session) {
		await this.send({
			method: "unset",
			params: [name],
			session
		});
	}
	async refresh(tokens, session) {
		return this.parseTokens(await this.send({
			method: "refresh",
			params: [tokens],
			session
		}));
	}
	async sql(dialect, statements, vars, options, session) {
		const params = [statements];
		if (vars !== void 0 || options !== void 0) params.push(vars ?? null);
		if (options !== void 0) params.push(options);
		return this.send({
			method: dialect,
			params,
			session
		});
	}
	async revoke(tokens, session) {
		await this.send({
			method: "revoke",
			params: [tokens],
			session
		});
	}
	async invalidate(session) {
		await this.send({
			method: "invalidate",
			session
		});
	}
	async reset(session) {
		await this.send({
			method: "reset",
			session
		});
	}
	async begin(session) {
		const result = await this.send({
			method: "begin",
			session
		});
		return result;
	}
	async commit(txn, session) {
		await this.send({
			method: "commit",
			params: [txn],
			session
		});
	}
	async cancel(txn, session) {
		await this.send({
			method: "cancel",
			params: [txn],
			session
		});
	}
	async importSql(data, request) {
		await this.importWith(data, request);
	}
	async exportSql(options, request) {
		return this.exportWith(options, request);
	}
	async exportMlModel(options, request) {
		return this.exportMlModelWith(options, request);
	}
	/**
	* Import, presenting a token for this import alone when there is one, and otherwise the
	* credential of the connection, as it is for every request.
	*/
	async importWith(data, request, token) {
		if (!this._state) throw new ConnectionUnavailableError();
		const endpoint = new URL(this._state.url);
		const basepath = endpoint.pathname.slice(0, -4);
		endpoint.pathname = `${basepath}/import`;
		const reports = this._version !== void 0 && isVersionSupported(this._version, IMPORT_REPORTS_FAILURES);
		const response = await fetchSurreal(this._context, this._state, this._state.rootSession, {
			body: typeof data === "string" ? new Blob([data]) : data,
			url: endpoint,
			headers: { Accept: "application/json" },
			token,
			signal: request?.signal,
			uploadProgress: request?.uploadProgress,
			answers: reports ? (status) => status === IMPORT_FAILED : void 0
		});
		if (!reports) {
			releaseResponse(response);
			return;
		}
		let results;
		try {
			results = await raceAbort(response.json(), request?.signal);
		} catch {
			throwIfAborted(request?.signal);
		}
		const failures = Array.isArray(results) ? results.filter((result) => result?.status === "ERR") : [];
		if (failures.length > 0) throw new ImportError(failures.slice(0, KEPT_FAILURES).map(parseQueryError), failures.length);
		if (response.status !== 200) throw new HttpConnectionError("The import failed", response.status, response.statusText, /* @__PURE__ */ new ArrayBuffer(0));
	}
	/**
	* Export, presenting a token for this export alone when there is one. See `importWith()`.
	*/
	async exportWith(options, request, token) {
		if (!this._state) throw new ConnectionUnavailableError();
		const endpoint = new URL(this._state.url);
		const basepath = endpoint.pathname.slice(0, -4);
		endpoint.pathname = `${basepath}/export`;
		return fetchSurreal(this._context, this._state, this._state.rootSession, {
			body: options ?? {},
			url: endpoint,
			headers: { Accept: "plain/text" },
			token,
			signal: request?.signal
		});
	}
	/**
	* Export a model, presenting a token for this export alone when there is one. See
	* `importWith()`.
	*/
	async exportMlModelWith(options, request, token) {
		if (!this._state) throw new ConnectionUnavailableError();
		const endpoint = new URL(this._state.url);
		const basepath = endpoint.pathname.slice(0, -4);
		endpoint.pathname = `${basepath}/ml/export/${options.name}/${options.version}`;
		return fetchSurreal(this._context, this._state, this._state.rootSession, {
			url: endpoint,
			method: "GET",
			token,
			signal: request?.signal
		});
	}
	query(query, session, txn, options) {
		return this.#dispatchQuery("query", query, session, txn, options);
	}
	gql(query, session, txn, options) {
		return this.#dispatchQuery("gql", query, session, txn, options);
	}
	async *#dispatchQuery(method, query, session, txn, options) {
		const responses = await this.send({
			method,
			params: queryParams(query, method, options),
			session,
			txn
		}, options);
		yield* this.toChunks(responses);
	}
	/**
	* Translate the statement results of a `query` request into chunks
	*/
	*toChunks(responses) {
		let index = 0;
		for (const response of responses) {
			const chunk = {
				query: index++,
				batch: 0,
				kind: "single",
				stats: statsFromTime(response.time)
			};
			if (response.status === "OK") {
				chunk.type = response.type;
				Object.assign(chunk, traced(parseTrace(response.trace)));
				if (Array.isArray(response.result)) {
					chunk.kind = "batched-final";
					chunk.result = response.result;
				} else chunk.result = [response.result];
			} else chunk.error = parseQueryError(response);
			yield chunk;
		}
	}
	parseTokens(response) {
		if (typeof response === "string") return {
			access: response,
			refresh: void 0
		};
		if (typeof response === "object") return response;
		throw new UnexpectedServerResponseError(response);
	}
};
function isDotSegment(segment) {
	return segment === "." || segment === "..";
}
/** The media type of a `Content-Type`, without its parameters */
function mediaType(contentType) {
	return contentType?.split(";", 1)[0].trim().toLowerCase();
}
function isJson(type) {
	return type === "application/json" || type.endsWith("+json");
}
function headerRecord(headers) {
	const record$1 = {};
	headers.forEach((value, name) => {
		record$1[name] = value;
	});
	return record$1;
}

//#endregion
//#region src/engine/http.ts
const ALWAYS_ALLOW = new Set([
	"use",
	"signin",
	"signup",
	"authenticate",
	"version",
	"query",
	"info"
]);
const NEVER_RESOLVE = new Set([
	"signin",
	"signup",
	"authenticate",
	"refresh",
	"revoke",
	"version"
]);
/**
* An engine that communicates by sending individual HTTP requests
*/
var HttpEngine = class extends RpcEngine {
	#publisher = new Publisher();
	/**
	* Whether the server has answered in `cbor.2`. Until it has, requests are written in plain
	* `cbor`, which every server reads, and ask for `cbor.2` back: a server before 4.0 answers in
	* `cbor`, and one which speaks `cbor.2` turns this on.
	*/
	#cbor2 = false;
	/**
	* Whether an answer has shown that the server does not write `shaped`, after which it is no
	* longer asked for on this connection.
	*/
	#shapedUnavailable = false;
	/**
	* Whether an answer has come back written in `shaped`, which is the only thing which shows
	* the server was built with the format and so reads a block in a request body.
	*/
	#shapedConfirmed = false;
	features = new Set([
		Features.RefreshTokens,
		Features.Api,
		Features.ExportImportRaw,
		Features.SurrealML,
		Features.SqlDialects,
		Features.QueryTrace,
		Features.PerRequestAuth
	]);
	subscribe(event, listener) {
		return this.#publisher.subscribe(event, listener);
	}
	open(state) {
		this._state = state;
		this.#cbor2 = false;
		this.#shapedUnavailable = false;
		this.#shapedConfirmed = false;
		setTimeout(() => {
			this.#publisher.publish("connected");
		});
	}
	async close() {
		this._state = void 0;
		this.#publisher.publish("disconnected");
	}
	health() {
		return this.requestHealthEndpoint();
	}
	ready(version) {
		this._version = version;
	}
	api(path, request, session, _txn, options) {
		return this.apiOverHttp(path, request, session, options);
	}
	/**
	* Invoke a custom API as someone else. As for a query, the credential is presented with this
	* request alone, and the session is neither used for authentication nor changed.
	*/
	async apiAs(path, request, session, _txn, options) {
		const state = this._state;
		if (!state) throw new ConnectionUnavailableError();
		const token = await this.#present(options.credential, session, state, options.signal);
		return this.apiOverHttp(path, request, session, options, token);
	}
	/**
	* Run a query as someone else. The credential is presented with this request alone, and
	* the session is neither used for authentication nor changed.
	*/
	async *queryAs(query, session, txn, options) {
		const responses = await this.send({
			method: options.dialect === "gql" ? "gql" : "query",
			params: queryParams(query, options.dialect === "gql" ? "gql" : "query", options),
			session,
			txn
		}, {
			signal: options.signal,
			credential: options.credential
		});
		yield* this.toChunks(responses);
	}
	/**
	* Import as someone else. As for a query, the credential is presented with this request alone,
	* and the connection is neither used for authentication nor changed.
	*/
	async importSqlAs(data, request) {
		await this.importWith(data, request, await this.#tokenFor(request));
	}
	/**
	* Export as someone else. See `importSqlAs()`.
	*/
	async exportSqlAs(options, request) {
		return this.exportWith(options, request, await this.#tokenFor(request));
	}
	/**
	* Export a model as someone else. See `importSqlAs()`.
	*/
	async exportMlModelAs(options, request) {
		return this.exportMlModelWith(options, request, await this.#tokenFor(request));
	}
	/**
	* The token which presents the credential of an import or export, for as long as it is wanted.
	*/
	async #tokenFor(request) {
		const state = this._state;
		if (!state) throw new ConnectionUnavailableError();
		throwIfAborted(request.signal);
		return this.#present(request.credential, void 0, state, request.signal);
	}
	/**
	* The token which presents a credential: a token as it is, and authentication details
	* exchanged for one.
	*/
	async #present(credential, session, state, signal) {
		return typeof credential === "string" ? credential : this.#exchange(credential, session, state, signal);
	}
	/**
	* Exchange authentication details for a token, with nothing but the details to go on.
	*/
	async #exchange(auth, session, state, signal) {
		const response = await this.send({
			method: "signin",
			params: [buildRpcAuth(getSessionFromState(state, session), auth)],
			session
		}, {
			anonymous: true,
			signal
		});
		return this.parseTokens(response).access;
	}
	async send(request, options) {
		throwIfAborted(options?.signal);
		const state = this._state;
		if (!state) throw new ConnectionUnavailableError();
		switch (request.method) {
			case "use":
			case "let":
			case "unset":
			case "reset":
			case "invalidate":
				if (request.method === "use" && isEmptyUseParams(request.params)) break;
				return void 0;
		}
		const session = getSessionFromState(state, request.session);
		if ((!session.namespace || !session.database) && !ALWAYS_ALLOW.has(request.method)) throw new MissingNamespaceDatabaseError();
		switch (request.method) {
			case "query":
			case "gql": {
				const options$1 = request.params?.[2];
				request.params = [
					request.params?.[0],
					{
						...session.variables,
						...request.params?.[1] ?? {}
					},
					...options$1 === void 0 ? [] : [options$1]
				];
				break;
			}
			case "pgsql":
			case "mysql": {
				if (Object.keys(session.variables).length === 0) break;
				const [statements, vars, options$1] = request.params ?? [];
				request.params = [
					statements,
					{
						...session.variables,
						...vars ?? {}
					},
					...options$1 === void 0 ? [] : [options$1]
				];
				break;
			}
		}
		let token;
		if (options?.anonymous) token = "";
		else if (options?.credential !== void 0) token = await this.#present(options.credential, request.session, state, options.signal);
		const id$1 = this._context.uniqueId();
		const codecs = this._context.codecs;
		const res = await fetchSurreal(this._context, state, session, {
			body: {
				id: id$1,
				...request
			},
			codec: this.#shapedConfirmed && codecs.shaped ? codecs.shaped : cborCodec(codecs, this.#cbor2),
			headers: codecs.cbor2 || codecs.shaped ? {
				"Content-Type": this.#cbor2 ? CBOR2_MEDIA_TYPE : CBOR_MEDIA_TYPE,
				Accept: codecs.shaped && this.#cbor2 && !this.#shapedUnavailable ? SHAPED_MEDIA_TYPE : CBOR2_MEDIA_TYPE
			} : void 0,
			token,
			resolve: !NEVER_RESOLVE.has(request.method),
			signal: options?.signal
		});
		const contentType = res.headers.get("Content-Type");
		const shaped = !!codecs.shaped && isShapedMediaType(contentType);
		const cbor2 = isCbor2MediaType(contentType);
		if ((cbor2 || shaped) && codecs.cbor2 && state === this._state) this.#cbor2 = true;
		if (shaped && state === this._state) this.#shapedConfirmed = true;
		if (!shaped && !cbor2 && codecs.shaped && this.#cbor2 && state === this._state) this.#shapedUnavailable = true;
		const buffer = await readBody(res, options?.signal);
		let response;
		try {
			response = wrapSqonError(() => {
				const bytes = new Uint8Array(buffer);
				if (!shaped) return cborCodec(codecs, cbor2).decode(bytes);
				const codec = codecs.shaped;
				const decoded = codec.decode(bytes);
				return resolveBlocks(decoded, codec, new BlockReader());
			});
		} catch (error) {
			if (error instanceof SurrealSqonError) throw error;
			throw new UnexpectedServerResponseError(error);
		}
		if (response.error) throw parseRpcError(response.error);
		return response.result;
	}
	liveQuery() {
		throw new UnsupportedFeatureError(Features.LiveQueries);
	}
};
function isEmptyUseParams(params) {
	return Array.isArray(params) && typeof params[0] === "undefined" && typeof params[1] === "undefined";
}

//#endregion
//#region src/internal/query-stream.ts
/**
* The revision of the streaming protocol this SDK implements.
*
* Servers carry theirs on the `begin` frame as `version`. It changes only when a change is not
* backwards compatible, so a server speaking a higher revision than this one is answering in a
* shape this SDK cannot be trusted to read, and the stream is failed rather than guessed at. A
* `begin` frame with no `version` predates the field and speaks revision 1.
*
* Within a revision the server guarantees, and this SDK relies on, that:
*
* - a `stream` tag is never repurposed, so `begin`, `rows`, `value`, `finished` and `end` keep
*   their meanings;
* - new tags and new fields may be added, so a tag this SDK does not know and a field it does not
*   read are ignored rather than treated as errors - that is what makes adding one compatible;
* - every `finished` frame carries `single`, as it is all that tells a statement whose value is one
*   bare value from one whose value is a list when it emitted no payload frame.
*/
const QUERY_STREAM_VERSION = 1;
/**
* The key which tags a streaming query frame, holding the frame's kind.
*
* Frames are only ever sent in answer to a `query_stream` request, and every
* frame carries that request's id, so they are decoded by looking the id up in
* the engine's own stream registry - never by inspecting the shape of an
* arbitrary response payload, which user data could imitate.
*/
const STREAM_FRAME_KEY = "stream";
/**
* The error a frame reports, as the buffered protocol would have reported it.
*
* A statement's failure crosses the buffered protocol inside its query result,
* which carries no wire code, so `ServerError.code` is `0` there. A frame
* carries the full error object, code included, and letting it through would
* make the same failing query report a different code depending on whether the
* answer happened to be streamed. The kind, class, message, details and cause
* are all preserved; only the code the buffered path never had is dropped.
*/
function frameError(error) {
	if (!error.kind) return parseRpcError(error);
	return parseRpcError({
		...error,
		code: 0
	});
}
/**
* Returns whether the given response payload is a streaming query frame.
*
* Only ever applied to a payload which arrived under the request id of a
* streaming query this engine started.
*/
function isQueryStreamFrame(value) {
	if (typeof value !== "object" || value === null) return false;
	return typeof value[STREAM_FRAME_KEY] === "string";
}
/**
* Translates the frames of a streaming query answer into the query chunks the
* rest of the SDK consumes.
*
* The frame contract is preserved as it is translated:
*
* - Rows are provisional until their statement's `finished` frame. A `finished` frame carrying an
*   error becomes an error chunk, which is how the chunk consumers discard the rows already
*   delivered for that statement.
* - A statement contributes rows or one single value, never both, and only its `finished` frame
*   says which it was. A single value is therefore held back until then, as the chunk consumers
*   distinguish the two by the chunk kind. A `finished` frame which contradicts what was sent -
*   a single value with no value frame, or a value frame for a list - fails the stream.
* - An `end` frame carrying an error retracts every statement which never finished and fails the
*   whole query, so a stream which was stopped rather than answered is never mistaken for a
*   complete one.
* - A clean `end` frame names how many statements it delivered, which must agree with how many
*   `finished` frames arrived; a stream which disagrees with itself is failed, not completed.
* - A `begin` frame announcing a protocol revision this SDK does not implement fails the stream.
* - The stream is only complete once its `end` frame arrives. Frames running out without one means
*   the answer was truncated, which fails the query rather than silently returning a prefix of it -
*   unless the consumer asked to leave, in which case there is nobody the failure belongs to.
*
* @param frames The frames of a single streaming query answer, in the order they arrived.
* @returns The query chunks conveyed by those frames.
*/
async function* queryStreamChunks(frames, abandonment = {}) {
	const batches = /* @__PURE__ */ new Map();
	const singles = /* @__PURE__ */ new Map();
	const valueTraces = /* @__PURE__ */ new Map();
	const unfinished = /* @__PURE__ */ new Set();
	const finished = /* @__PURE__ */ new Set();
	let ended = false;
	for await (const frame$1 of frames) {
		if ((frame$1.stream === "rows" || frame$1.stream === "value" || frame$1.stream === "finished") && finished.has(frameIndex(frame$1.index))) continue;
		switch (frame$1.stream) {
			case "begin": {
				const { version } = frame$1;
				if (typeof version === "number" && Number.isInteger(version) && version > QUERY_STREAM_VERSION) throw new StreamProtocolError(`The server speaks revision ${version} of the streaming query protocol, and this SDK implements revision ${QUERY_STREAM_VERSION}. A higher revision is not backwards compatible: upgrade the SDK, or set \`streaming: false\` to receive buffered responses instead.`);
				break;
			}
			case "rows": {
				const index = frameIndex(frame$1.index);
				unfinished.add(index);
				yield {
					query: index,
					batch: nextBatch(batches, index),
					kind: "batched",
					result: Array.isArray(frame$1.values) ? frame$1.values : [],
					...traced(parseTrace(frame$1.trace))
				};
				break;
			}
			case "value": {
				const index = frameIndex(frame$1.index);
				unfinished.add(index);
				singles.set(index, frame$1.value);
				const trace = parseTrace(frame$1.trace);
				if (trace) valueTraces.set(index, trace);
				break;
			}
			case "finished": {
				const index = frameIndex(frame$1.index);
				const stats = frameStats(frame$1.time);
				const sentValue = singles.has(index);
				const single = sentValue ? [singles.get(index)] : void 0;
				const valueTrace = valueTraces.get(index);
				unfinished.delete(index);
				singles.delete(index);
				valueTraces.delete(index);
				finished.add(index);
				if (frame$1.error) {
					yield {
						query: index,
						batch: nextBatch(batches, index),
						kind: "batched-final",
						stats,
						error: frameError(frame$1.error)
					};
					break;
				}
				if (frame$1.single && !sentValue) throw new StreamProtocolError(`Statement ${index} finished as a single value, but no value was sent for it.`);
				if (!frame$1.single && sentValue) throw new StreamProtocolError(`Statement ${index} sent a single value, but finished as a list of rows.`);
				yield {
					query: index,
					batch: nextBatch(batches, index),
					kind: frame$1.single ? "single" : "batched-final",
					stats,
					type: frame$1.type,
					result: single ?? [],
					...traced(mergeTraces(valueTrace, parseTrace(frame$1.trace)))
				};
				break;
			}
			case "end":
				ended = true;
				if (frame$1.error) {
					const error = frameError(frame$1.error);
					const stats = frameStats(frame$1.time);
					const retracted = [...unfinished].sort((a, b) => a - b);
					unfinished.clear();
					for (const index of retracted) yield {
						query: index,
						batch: nextBatch(batches, index),
						kind: "batched-final",
						stats,
						error
					};
					throw error;
				}
				if (typeof frame$1.results === "number" && frame$1.results !== finished.size) throw new StreamProtocolError(`The stream ended reporting ${frame$1.results} statements, but ${finished.size} were delivered. The answer is incomplete.`);
				return;
			default: break;
		}
	}
	if (!ended && !abandonment.requested) throw new CallTerminatedError();
}
/**
* The batch number of the next chunk for a statement.
*/
function nextBatch(batches, index) {
	const batch = batches.get(index) ?? 0;
	batches.set(index, batch + 1);
	return batch;
}
/**
* The statement a frame belongs to, which crosses the wire as an integer of a
* width the codec is free to widen.
*
* An index this SDK cannot represent fails the stream rather than defaulting:
* attributing a frame to the wrong statement would silently corrupt an answer.
*/
function frameIndex(index) {
	const value = Number(index);
	if (!Number.isSafeInteger(value) || value < 0) throw new UnexpectedServerResponseError(index);
	return value;
}
/**
* The statistics conveyed by a frame. Only the duration is reported over the
* streaming protocol, matching the buffered protocol.
*/
function frameStats(time) {
	if (typeof time !== "string") return void 0;
	try {
		return {
			bytesReceived: -1,
			bytesScanned: -1,
			recordsReceived: -1,
			recordsScanned: -1,
			duration: Duration.parseFloat(time)
		};
	} catch {
		return void 0;
	}
}

//#endregion
//#region src/types/live.ts
const LIVE_ACTIONS = [
	"CREATE",
	"UPDATE",
	"DELETE",
	"KILLED"
];

//#endregion
//#region src/engine/websocket.ts
const DEFAULT_PING_INTERVAL = 3e4;
const DEFAULT_PONG_TIMEOUT = 1e4;
/**
* An engine that communicates over WebSocket protocol
*/
var WebSocketEngine = class extends RpcEngine {
	#publisher = new Publisher();
	#socket;
	#calls = /* @__PURE__ */ new Map();
	#streams = /* @__PURE__ */ new Map();
	#live = new LiveDispatcher();
	#pinger;
	#pongTimeout;
	#active = false;
	#terminated = false;
	#streaming = true;
	/** Whether to offer plain cbor alone, as the WebSocket implementation would not open a socket offering more */
	#cborOnly = false;
	/** Set once a handshake offering `shaped` failed, so reconnects do not try it again */
	#shapedUnavailable = false;
	/** The shape scopes of this socket: one per stream, and one per live query */
	#scopes = new ShapeScopes();
	features = new Set([
		Features.LiveQueries,
		Features.RefreshTokens,
		Features.Sessions,
		Features.Transactions,
		Features.Api,
		Features.ExportImportRaw,
		Features.SurrealML,
		Features.SqlDialects,
		Features.QueryTrace,
		Features.QueryStreaming
	]);
	subscribe(event, listener) {
		return this.#publisher.subscribe(event, listener);
	}
	open(state) {
		this.#terminated = false;
		this._state = state;
		const { reconnect } = state;
		(async () => {
			while (!this.#terminated) {
				let opened = false;
				const onConnected = () => {
					opened = true;
					this.#active = true;
					this.#streaming = true;
					reconnect.reset();
					this.#publisher.publish("connected");
				};
				const wantsShaped = !!this._context.codecs.shaped && !this.#shapedUnavailable;
				let error = wantsShaped ? await this.createSocket(onConnected, [SHAPED_PROTOCOL]) : null;
				if (wantsShaped && !opened && !this.#terminated) this.#shapedUnavailable = true;
				const protocols = this.#cborOnly ? [CBOR_PROTOCOL] : cborProtocols(this._context.codecs);
				if (!opened && !this.#terminated) {
					error = await this.createSocket(onConnected, protocols);
					if (!opened && !this.#terminated && protocols.length > 1) {
						error = await this.createSocket(onConnected, [CBOR_PROTOCOL]);
						if (opened) this.#cborOnly = true;
					}
				}
				this.#socket = void 0;
				this.#live.clear();
				this.#scopes.clear();
				this.failStreams(new CallTerminatedError());
				if (this.#terminated || !reconnect.enabled || !reconnect.allowed) {
					if (reconnect.enabled && !reconnect.allowed) this.#publisher.publish("error", new ReconnectExhaustionError());
					else if (error) this.#publisher.publish("error", error);
					this.terminatePending(new CallTerminatedError());
					this._state = void 0;
					this.#active = false;
					this.#publisher.publish("disconnected");
					break;
				}
				if (error) this.#publisher.publish("error", error);
				if (error) reconnect.propagate(error);
				this.#publisher.publish("reconnecting");
				await reconnect.iterate();
			}
		})();
	}
	async close() {
		if (this.#terminated) return;
		const WebSocketImpl = this._context.options.websocketImpl ?? globalThis.WebSocket;
		const socketState = this.#socket?.readyState;
		this._state = void 0;
		this.#terminated = true;
		this.#active = false;
		clearInterval(this.#pinger);
		this.#pinger = void 0;
		if (this.#pongTimeout !== void 0) {
			clearTimeout(this.#pongTimeout);
			this.#pongTimeout = void 0;
		}
		this.#socket?.close();
		this.terminatePending(new CallTerminatedError());
		if (socketState === WebSocketImpl.OPEN || socketState === WebSocketImpl.CLOSING) await this.#publisher.subscribeFirst("disconnected");
		else this.#publisher.publish("disconnected");
	}
	health() {
		return this.requestHealthEndpoint();
	}
	ready(version) {
		this._version = version;
		if (version !== void 0 && predatesStreaming(version)) this.#streaming = false;
		for (const { request } of this.#calls.values()) this.#socket?.send(new Uint8Array(wrapSqonError(() => this.#codec().encode(request))));
	}
	send(request, options) {
		return new Promise((resolve, reject) => {
			const signal = options?.signal;
			if (signal?.aborted) {
				reject(abortReason(signal));
				return;
			}
			if (!this.#active) {
				reject(new ConnectionUnavailableError());
				return;
			}
			const id$1 = this._context.uniqueId();
			let unwatch = () => {};
			const call = {
				request: {
					id: id$1,
					...request
				},
				resolve: (value) => {
					unwatch();
					resolve(value);
				},
				reject: (error) => {
					unwatch();
					reject(error);
				}
			};
			if (signal) {
				const onAbort = () => {
					if (this.#calls.get(id$1) !== call) return;
					this.#calls.delete(id$1);
					try {
						this.abandon(id$1, call.request);
					} catch {}
					reject(abortReason(signal));
				};
				signal.addEventListener("abort", onAbort, { once: true });
				unwatch = () => signal.removeEventListener("abort", onAbort);
			}
			this.#calls.set(id$1, call);
			try {
				this.#socket?.send(new Uint8Array(wrapSqonError(() => this.#codec().encode(call.request))));
			} catch (error) {
				this.#calls.delete(id$1);
				unwatch();
				throw error;
			}
		});
	}
	/**
	* Called when a pending call is given up on because its signal aborted, once it has been
	* forgotten by the engine and before the caller is told.
	*
	* By then the request has been sent, and this protocol has no way of taking it back: the server
	* carries on, and its response is ignored when it arrives. An engine whose server can be told
	* to stop what it is doing sends that here, with the id the request was sent under.
	*
	* @param _id The id the request was sent with
	* @param _request The request as it was sent
	*/
	abandon(_id, _request) {}
	query(query, session, txn, options) {
		const requested = options?.stream === true;
		if (txn !== void 0 && !requested || this._context.options.streaming === false && !requested || !this.#streaming || !this.#socket) return super.query(query, session, txn, options);
		const frames = {};
		const abandonment = {};
		const chunks = this.streamChunks(query, session, txn, options, requested, frames, abandonment);
		return { [Symbol.asyncIterator]: () => ({
			next: () => chunks.next(),
			throw: (error) => chunks.throw(error),
			return: (value) => {
				abandonment.requested = true;
				frames.current?.return?.(void 0);
				return chunks.return(value);
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		}) };
	}
	/**
	* Streams a query, falling back to the buffered method if the server refuses it.
	*/
	async *streamChunks(query, session, txn, options, requested, frames, abandonment) {
		const probe = { framed: false };
		frames.current = this.streamFrames(query, session, txn, probe, options);
		try {
			for await (const chunk of queryStreamChunks(frames.current, abandonment)) yield chunk;
		} catch (error) {
			if (probe.framed || !isRetriableAsBuffered(error)) throw error;
			const cannotStream = error.code === METHOD_NOT_FOUND || error.code === METHOD_NOT_ALLOWED && error instanceof NotAllowedError && error.methodName === STREAM_METHOD;
			if (cannotStream) this.#streaming = false;
			if (requested && !cannotStream) throw error;
			for await (const chunk of super.query(query, session, txn, options)) yield chunk;
		}
	}
	/**
	* Invoke a custom API through the HTTP endpoint of the server, as the HTTP engine does, so
	* that it needs no query access. The socket has no method for it. A call inside a transaction
	* is invoked in it instead, with `api::invoke`, because a request over HTTP cannot join it.
	*/
	api(path, request, session, txn, options) {
		if (txn) return super.api(path, request, session, txn, options);
		return this.apiOverHttp(path, request, session, options);
	}
	liveQuery(id$1) {
		const channel = new ChannelIterator(() => {
			unsub1();
			unsub2();
		});
		const unsub1 = this.#live.subscribe(id$1.toString(), (msg) => {
			channel.submit(msg);
		});
		const unsub2 = this.#publisher.subscribe("disconnected", () => {
			channel.cancel();
		});
		return channel;
	}
	/**
	* Sends a streaming query and returns the frames it is answered with, in order.
	*
	* The iterator acts on abandonment the moment it is asked to, rather than
	* when the frames next wake it: a stream can sit for a long time between
	* frames - or produce none at all - and a consumer which has left must not
	* wait on a frame to be let go, nor have an error delivered to it.
	*/
	streamFrames(query, session, txn, probe, options) {
		if (!this.#active || !this.#socket) throw new ConnectionUnavailableError();
		const id$1 = this._context.uniqueId();
		const stream = {
			channel: new ChannelIterator(),
			settled: false,
			abandoned: false
		};
		this.#socket.send(new Uint8Array(wrapSqonError(() => this.#codec().encode({
			id: id$1,
			method: STREAM_METHOD,
			params: queryParams(query, "query", options),
			session,
			...txn === void 0 ? {} : { txn }
		}))));
		this.#streams.set(id$1, stream);
		const frames = this.readFrames(id$1, stream, probe);
		return {
			next: () => frames.next(),
			throw: (error) => frames.throw(error),
			return: (value) => {
				this.abandonStream(id$1, stream);
				return frames.return(value);
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		};
	}
	/**
	* Yields the frames of a registered stream until it ends.
	*/
	async *readFrames(id$1, stream, probe) {
		try {
			for await (const event of stream.channel) {
				if (event.kind === "error") throw event.error;
				probe.framed = true;
				yield event.frame;
			}
		} finally {
			if (stream.settled) {
				this.#streams.delete(id$1);
				this.#scopes.end(id$1);
			} else this.abandonStream(id$1, stream);
		}
	}
	/**
	* Gives up on a stream whose consumer has left.
	*
	* Cancelling stops the server executing a query nothing will collect, and
	* closing the channel releases a read parked on a frame which may never
	* come. The registration stays until the terminal frame settles it, so the
	* frames still in flight are discarded rather than misrouted.
	*/
	abandonStream(id$1, stream) {
		if (stream.settled || stream.abandoned) {
			stream.channel.cancel();
			return;
		}
		stream.abandoned = true;
		stream.channel.cancel();
		this.cancelStream(id$1);
	}
	/**
	* Asks the server to stop a streaming query it is still executing.
	*/
	cancelStream(id$1) {
		if (!this.#active) {
			this.#streams.delete(id$1);
			this.#scopes.end(id$1);
			return;
		}
		this.send({
			method: "query_cancel",
			params: [id$1]
		}).catch(() => {});
	}
	/**
	* Fails everything in flight, for a connection which is not coming back.
	*
	* The calls and the streams are settled together: a query which reported a
	* closed connection differently for having been streamed would make the
	* two transports observably different, and one which reported nothing at
	* all would leave its caller waiting on it for the life of the process.
	*/
	terminatePending(error) {
		for (const { reject } of this.#calls.values()) reject(error);
		this.#calls.clear();
		this.failStreams(error);
	}
	/**
	* Fails the streaming queries in flight, as a stream cannot outlive its socket.
	*/
	failStreams(error) {
		for (const [id$1, stream] of this.#streams) {
			stream.settled = true;
			this.#streams.delete(id$1);
			this.#scopes.end(id$1);
			if (!stream.abandoned) stream.channel.submit({
				kind: "error",
				error
			});
		}
	}
	/**
	* Routes one response of a streaming query to the consumer waiting on it.
	*/
	handleStreamResponse(id$1, stream, response) {
		const frame$1 = response.error ? void 0 : response.result;
		if (response.error || !isQueryStreamFrame(frame$1)) {
			stream.settled = true;
			this.#streams.delete(id$1);
			this.#scopes.end(id$1);
			if (!stream.abandoned) stream.channel.submit({
				kind: "error",
				error: response.error ? parseRpcError(response.error) : new UnexpectedServerResponseError(frame$1)
			});
			return;
		}
		if (frame$1.stream === "end") {
			stream.settled = true;
			this.#streams.delete(id$1);
			this.#scopes.end(id$1);
		}
		if (!stream.abandoned) stream.channel.submit({
			kind: "frame",
			frame: frame$1
		});
	}
	/**
	* The codec to write and read messages in, named by the subprotocol the server picked for
	* the socket: `shaped`, `cbor.2`, or plain `cbor`.
	*/
	#codec(socket = this.#socket) {
		return wireCodec(this._context.codecs, socket?.protocol ?? null);
	}
	/**
	* The shaped codec once the socket settled on `shaped`, and `undefined` otherwise. Only a
	* socket on that format carries blocks, so only one needs its scopes read.
	*/
	#shaped(socket = this.#socket) {
		const { shaped } = this._context.codecs;
		return shaped && socket?.protocol === SHAPED_PROTOCOL ? shaped : void 0;
	}
	async createSocket(onConnected, protocols) {
		return new Promise((resolve, reject) => {
			if (!this._state) {
				reject(new ConnectionUnavailableError());
				return;
			}
			const WebSocketImpl = this._context.options.websocketImpl ?? globalThis.WebSocket;
			const socket = new WebSocketImpl(this._state.url.toString(), protocols);
			if (socket.binaryType !== "arraybuffer") socket.binaryType = "arraybuffer";
			this.#socket = socket;
			let caughtError = null;
			const onServerPing = () => {
				if (this.#pongTimeout !== void 0) {
					clearTimeout(this.#pongTimeout);
					this.#pongTimeout = void 0;
				}
			};
			const pingSocket = socket;
			if ("addEventListener" in socket && typeof pingSocket.addEventListener === "function") try {
				pingSocket.addEventListener("ping", onServerPing);
			} catch {}
			else if ("on" in socket && typeof pingSocket.on === "function") try {
				pingSocket.on("ping", onServerPing);
			} catch {}
			const clearPongTimeout = () => {
				if (this.#pongTimeout !== void 0) {
					clearTimeout(this.#pongTimeout);
					this.#pongTimeout = void 0;
				}
			};
			socket.addEventListener("open", () => {
				try {
					onConnected();
					const pingInterval = this._state?.pingInterval ?? this._context.options.pingInterval ?? DEFAULT_PING_INTERVAL;
					const pongTimeout = this._state?.pongTimeout ?? this._context.options.pongTimeout ?? DEFAULT_PONG_TIMEOUT;
					const sendPing = () => {
						const WebSocketImpl$1 = this._context.options.websocketImpl ?? globalThis.WebSocket;
						if (socket.readyState !== WebSocketImpl$1.OPEN) return;
						if (this.#pongTimeout !== void 0) return;
						this.#pongTimeout = setTimeout(() => {
							this.#pongTimeout = void 0;
							try {
								socket.close();
							} catch {}
						}, pongTimeout);
						this.send({ method: "ping" }).then(() => {
							clearPongTimeout();
						}).catch(() => {
							clearPongTimeout();
							const WebSocketImpl$2 = this._context.options.websocketImpl ?? globalThis.WebSocket;
							if (socket.readyState === WebSocketImpl$2.OPEN) try {
								socket.close();
							} catch {}
						});
					};
					if (pingInterval > 0) this.#pinger = setInterval(sendPing, pingInterval);
				} catch (err) {
					caughtError = err;
					socket.close();
				}
			});
			socket.addEventListener("error", (e) => {
				const error = new UnexpectedConnectionError("detail" in e && e.detail ? e.detail : "message" in e && e.message ? e.message : "error" in e && e.error ? e.error : "An unexpected error occurred");
				caughtError = error;
			});
			socket.addEventListener("close", () => {
				clearInterval(this.#pinger);
				this.#pinger = void 0;
				clearPongTimeout();
				if ("removeEventListener" in socket && typeof pingSocket.removeEventListener === "function") try {
					pingSocket.removeEventListener("ping", onServerPing);
				} catch {}
				else if ("off" in socket && typeof pingSocket.off === "function") try {
					pingSocket.off("ping", onServerPing);
				} catch {}
				resolve(caughtError);
			});
			socket.addEventListener("message", ({ data }) => {
				try {
					const buffer = this.parseBuffer(data);
					const decoded = wrapSqonError(() => this.#codec(socket).decode(buffer));
					if (typeof decoded === "object" && decoded != null && Object.getPrototypeOf(decoded) === Object.prototype) this.handleRpcResponse(decoded);
					else throw new UnexpectedServerResponseError(decoded);
				} catch (cause) {
					try {
						this.#publisher.publish("error", new UnexpectedConnectionError(cause));
					} catch {}
				}
			});
		});
	}
	parseBuffer(data) {
		if (data instanceof Uint8Array) return data;
		if (data instanceof ArrayBuffer) return new Uint8Array(data);
		throw new UnexpectedServerResponseError(data);
	}
	handleRpcResponse({ id: id$1,...res }) {
		if (typeof id$1 === "string") {
			const stream = this.#streams.get(id$1);
			if (stream) {
				this.handleStreamResponse(id$1, stream, this.#readBlocks(res, id$1));
				return;
			}
			try {
				const response = this.#readBlocks(res, void 0);
				const { resolve, reject } = this.#calls.get(id$1) ?? {};
				if (response.error) reject?.(parseRpcError(response.error));
				else resolve?.(response.result);
			} finally {
				this.#calls.delete(id$1);
			}
			return;
		}
		if (isLiveMessage(res.result)) {
			const frame$1 = res.result;
			const live = frame$1.id.toString();
			if (frame$1.action === "KILLED") {
				this.#scopes.end(live);
				this.#live.dispatch(live, {
					queryId: frame$1.id,
					action: "KILLED"
				});
				return;
			}
			const result = this.#shaped() ? unwrapRow(this.#readBlocks({ result: frame$1.result }, live).result, frame$1.result) : frame$1.result;
			this.#live.dispatch(live, {
				queryId: frame$1.id,
				action: frame$1.action,
				recordId: frame$1.record,
				value: result
			});
			return;
		}
		this.#publisher.publish("error", new UnexpectedServerResponseError(res));
	}
	/**
	* `value` with its blocks read as rows, in the scope `key` names — a stream or a live query
	* — or in a scope of its own when `key` is `undefined`. A socket which did not settle on
	* `shaped` carries no blocks, and the value is handed back untouched.
	*/
	#readBlocks(value, key) {
		const codec = this.#shaped();
		if (!codec) return value;
		return resolveBlocks(value, codec, key === void 0 ? new BlockReader() : this.#scopes.get(key));
	}
};
/**
* The one row `read` holds, for a notification whose value a block carried.
*
* A block is always read as a list of rows, but a notification's `result` is one record, so a
* block which carried one is a block of one row. Anything else is handed back as it came:
* `original` when the value was never a block at all, and the list itself when the server sent
* a row count this does not expect, which is better than guessing at which row was meant.
*/
function unwrapRow(read, original) {
	if (read === original || !Array.isArray(read)) return read;
	return read.length === 1 ? read[0] : read;
}
/**
* Whether a streaming query which framed nothing can be asked for again as a buffered one.
*
* Only a rejection by the server: it leaves the query unexecuted and the connection intact, so
* the buffered path can answer it straight away. A connection which went away is reported as it
* is instead of being asked for again, even though a buffered call would have been queued and
* re-sent, because the second request would have to be started from a stream whose consumer may
* be walking away at that very moment, leaving its rejection with nowhere to go.
*/
function isRetriableAsBuffered(error) {
	return error instanceof ServerError;
}
/**
* Whether a version is known to be older than the first to serve streaming queries.
*
* "Known" is the point: a version which does not begin with numbers - or is absent - is not one
* that is known to be older, and is asked. Nor is this the feature's own `supports`, which
* compares strings, so that anything which does not begin with a digit sorts past every number,
* and which also refuses a version newer than the range this SDK is tested against: a bound which
* says nothing about streaming, as a server newer than the SDK should still be asked.
*
* A prerelease is compared by the release it leads up to, as one of the release which introduced
* streaming may or may not have it, and the question settles that.
*/
function predatesStreaming(version) {
	const since = Features.QueryStreaming.sinceVersion;
	const have = releaseOf(version);
	const first = since === void 0 ? void 0 : releaseOf(since);
	if (!have || !first) return false;
	for (let index = 0; index < 3; index++) if (have[index] !== first[index]) return have[index] < first[index];
	return false;
}
/** The major, minor and patch of a version, or nothing when it does not begin with them. */
function releaseOf(version) {
	const match = /^(?:surrealdb-)?v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim());
	return match ? [
		Number(match[1]),
		Number(match[2]),
		Number(match[3] ?? 0)
	] : void 0;
}
/** The method a server is asked to stream a query with. */
const STREAM_METHOD = "query_stream";
/** The wire code for a method a server does not serve. */
const METHOD_NOT_FOUND = -32601;
/** The wire code for a method a server serves but does not allow. */
const METHOD_NOT_ALLOWED = -32602;
function isLiveMessage(v) {
	if (typeof v !== "object") return false;
	if (v === null) return false;
	if (!("id" in v && "action" in v)) return false;
	if (!(v.id instanceof Uuid)) return false;
	if (!LIVE_ACTIONS.includes(v.action)) return false;
	if (v.action === "KILLED") return true;
	if (!("result" in v && "record" in v)) return false;
	if (typeof v.result !== "object") return false;
	if (v.result === null) return false;
	if (!(v.record instanceof _RecordId)) return false;
	return true;
}

//#endregion
//#region src/engine/stream.ts
/**
* Turn a stream of frames into the chunks the query API consumes.
*
* Rows are forwarded the moment their frame arrives rather than held until the
* statement that produced them finishes, so time-to-first-row is the cost of one
* batch rather than of the whole result. A statement is closed by a final
* `batched-final` chunk carrying no further rows, which is what lets every
* preceding batch go out without knowing whether another will follow.
*
* # Rows are provisional until their statement finishes
*
* A statement may still fail after emitting rows, and inside a `BEGIN … COMMIT`
* block its transaction may still roll back. A `finished` frame carrying an
* error retracts every row already delivered for that statement, and it is
* reported here as an errored chunk for that statement — a consumer that acts on
* rows as they arrive has to be able to take them back.
*
* A failure belonging to no single statement arrives on the terminal frame and
* is thrown, because it invalidates every statement that never finished rather
* than any one of them. That includes a failure from before execution began — a
* parse error, a denied capability — which reaches a consumer as a stream whose
* only frame is the terminal one.
*/
async function* framesToChunks(frames) {
	/** The batch counter and held single value for each open statement. */
	const open = /* @__PURE__ */ new Map();
	const state = (index) => {
		let entry = open.get(index);
		if (!entry) {
			entry = { batch: 0 };
			open.set(index, entry);
		}
		return entry;
	};
	for await (const frame$1 of frames) switch (frame$1.stream) {
		case "begin": break;
		case "rows": {
			const entry = state(frame$1.index);
			yield {
				query: frame$1.index,
				batch: entry.batch++,
				kind: "batched",
				result: frame$1.values,
				...traced(parseTrace(frame$1.trace))
			};
			break;
		}
		case "value": {
			const entry = state(frame$1.index);
			entry.value = frame$1.value;
			entry.trace = parseTrace(frame$1.trace);
			break;
		}
		case "finished": {
			const entry = open.get(frame$1.index);
			open.delete(frame$1.index);
			const batch = entry?.batch ?? 0;
			const stats = statsFromTime(frame$1.time);
			if (frame$1.error) {
				yield {
					query: frame$1.index,
					batch,
					kind: "batched-final",
					stats,
					error: parseQueryError({
						status: "ERR",
						time: frame$1.time,
						result: frame$1.error.message,
						kind: frame$1.error.kind,
						details: frame$1.error.details,
						cause: frame$1.error.cause
					})
				};
				break;
			}
			yield frame$1.single ? {
				query: frame$1.index,
				batch,
				kind: "single",
				stats,
				type: frame$1.type,
				result: [entry?.value],
				...traced(mergeTraces(entry?.trace, parseTrace(frame$1.trace)))
			} : {
				query: frame$1.index,
				batch,
				kind: "batched-final",
				stats,
				type: frame$1.type,
				result: [],
				...traced(parseTrace(frame$1.trace))
			};
			break;
		}
		case "end":
			if (frame$1.error) throw parseRpcError(frame$1.error);
			break;
	}
}

//#endregion
//#region src/engine/index.ts
/**
* Configure the `ws`, `wss`, `http`, and `https` remote engines for the JavaScript SDK.
*
* When engines are not explicitly configured, the JavaScript SDK will configure the
* remote engines by default.
*
* @example
* ```ts
* import { Surreal, createRemoteEngines } from "surrealdb";
*
* const db = new Surreal({
*     engines: createRemoteEngines(),
* });
* ```
*/
const createRemoteEngines = () => ({
	ws: (ctx) => new WebSocketEngine(ctx),
	wss: (ctx) => new WebSocketEngine(ctx),
	http: (ctx) => new HttpEngine(ctx),
	https: (ctx) => new HttpEngine(ctx)
});
/**
* This utility allows you to wrap engines and listen to internal communication
* within the SDK. Each operation is wrapped in a diagnostic event and emitted to the
* provided callback.
*
* Note that use of this utility is discouraged in production environments as it may
* hinder performance and is considered unstable, meaning diagnostic events may change between versions.
*
* @param engines The engine implementations to wrap.
* @param callback The callback to emit diagnostic events to.
* @returns The wrapped engine implementations.
*/
const applyDiagnostics = (engines, callback) => {
	return Object.fromEntries(Object.entries(engines).map(([key, factory]) => [key, (ctx) => new DiagnosticsEngine(factory(ctx), callback)]));
};

//#endregion
//#region src/internal/backoff.ts
/**
* The delay in milliseconds before the given attempt, the first of which is 1, computed the
* way the delay between reconnect attempts is: exponential, with jitter, and never more than
* the maximum.
*/
function backoffDelay(options, attempt) {
	const multiplier = options.retryDelayMultiplier ** attempt;
	const jitterModifier = rand(-options.retryDelayJitter, options.retryDelayJitter);
	return Math.min(options.retryDelay * multiplier * (1 + jitterModifier), options.retryDelayMax);
}

//#endregion
//#region src/internal/reconnect.ts
/**
* A dropped connection is retried for as long as it stays dropped, with the delay growing to a
* cap of twenty seconds. Giving up after a fixed number of attempts would end the connection
* during an outage longer than the attempts last, which is the case a reconnect exists for; the
* clients of other databases retry without a limit for the same reason. The jitter keeps many
* clients from returning in step once a server comes back.
*/
const DEFAULT_RECONNECT_OPTIONS = {
	enabled: true,
	attempts: -1,
	retryDelay: 1e3,
	retryDelayMax: 2e4,
	retryDelayMultiplier: 2,
	retryDelayJitter: .1
};
var ReconnectContext = class {
	#attempts = 0;
	options;
	constructor(input) {
		const override = typeof input === "boolean" ? { enabled: input } : input;
		this.options = {
			...DEFAULT_RECONNECT_OPTIONS,
			...override
		};
	}
	get attempts() {
		return this.#attempts;
	}
	get enabled() {
		return this.options.enabled;
	}
	get allowed() {
		if (!this.options.enabled) return false;
		if (this.options.attempts !== -1 && this.#attempts >= this.options.attempts) return false;
		return true;
	}
	reset() {
		this.#attempts = 0;
	}
	propagate(error) {
		this.options.catch?.(error);
	}
	async iterate() {
		if (!this.allowed) throw new ReconnectIterationError();
		this.#attempts++;
		const multiplier = this.options.retryDelayMultiplier ** this.attempts;
		const adjustedDelay = this.options.retryDelay * multiplier;
		const jitterModifier = rand(-this.options.retryDelayJitter, this.options.retryDelayJitter);
		const nextDelay = Math.min(adjustedDelay * (1 + jitterModifier), this.options.retryDelayMax);
		await new Promise((r$1) => setTimeout(r$1, nextDelay));
	}
};

//#endregion
//#region src/controller/index.ts
const ONE_DAY_MS = 1440 * 60 * 1e3;
var ConnectionController = class {
	#eventPublisher = new Publisher();
	#context;
	#state;
	#engine;
	#nextEngine;
	#status = "disconnected";
	#authProvider;
	#requestResolver;
	#requestAuth;
	#renewals = /* @__PURE__ */ new WeakMap();
	#cachedVersion;
	#expiryMargin = 60;
	#skipRenewal = false;
	#checkVersion = false;
	#lastConnectionError = void 0;
	subscribe(event, listener) {
		return this.#eventPublisher.subscribe(event, listener);
	}
	constructor(context) {
		this.#context = context;
	}
	get state() {
		return this.#state;
	}
	get status() {
		return this.#status;
	}
	propagateError(error) {
		this.#eventPublisher.publish("error", error);
	}
	async connect(url, options) {
		if (options.requestTimeout !== void 0) assertTimeout(options.requestTimeout, "requestTimeout");
		const authentication = parseAuthentication(options.authentication);
		const engine = this.#instanceEngine(url);
		this.#nextEngine = engine;
		this.#status = "connecting";
		this.#lastConnectionError = void 0;
		await this.disconnect();
		if (this.#nextEngine !== engine) return true;
		this.#engine = engine;
		this.#nextEngine = void 0;
		this.#skipRenewal = options.invalidateOnExpiry ?? false;
		this.#checkVersion = options.versionCheck ?? true;
		this.#expiryMargin = options.expiryMargin ?? 60;
		this.#authProvider = authentication.provider;
		this.#requestResolver = authentication.request?.resolve;
		this.#requestAuth = authentication.request ? new RequestCredentials({
			cache: authentication.request.cache,
			margin: () => this.#expiryMargin,
			serialize: !engine.features.has(Features.PerRequestAuth)
		}) : void 0;
		this.#state = {
			url,
			sessions: /* @__PURE__ */ new Map(),
			reconnect: new ReconnectContext(options.reconnect),
			retry: RetryContext.mergeOptions(options.retry),
			requestTimeout: options.requestTimeout,
			pingInterval: options.pingInterval,
			pongTimeout: options.pongTimeout,
			rootSession: {
				...this.#createSessionState(void 0),
				namespace: options.namespace,
				database: options.database
			}
		};
		if (this.#requestAuth && engine.features.has(Features.PerRequestAuth)) this.#state.credentials = { token: (session, rejected, signal) => this.#requestToken(session, rejected, signal) };
		this.#engine.subscribe("connected", () => this.#onConnected());
		this.#engine.subscribe("disconnected", () => this.#onDisconnected());
		this.#engine.subscribe("reconnecting", () => this.#onReconnecting());
		this.#engine.subscribe("error", (error) => this.#onEngineError(error));
		this.#status = "connecting";
		this.#eventPublisher.publish("connecting");
		this.#engine.open(this.#state);
		await this.ready();
		return true;
	}
	async disconnect() {
		if (this.#engine) await this.#engine.close();
		return true;
	}
	async ready() {
		if (this.#status === "disconnected") throw this.#lastConnectionError ?? new ConnectionUnavailableError();
		if (this.#status === "connected") return;
		await this.#eventPublisher.subscribeFirst("connected", "disconnected");
		if (this.#status === "disconnected") throw this.#lastConnectionError ?? new ConnectionUnavailableError();
	}
	assertFeature(feature) {
		if (!this.#engine || !this.#cachedVersion) throw new ConnectionUnavailableError();
		if (!this.#engine.features.has(feature)) throw new UnsupportedFeatureError(feature);
		if (!feature.supports(this.#cachedVersion)) throw new UnavailableFeatureError(feature, this.#cachedVersion);
	}
	get retry() {
		if (!this.#state) throw new ConnectionUnavailableError();
		return this.#state.retry;
	}
	/** The default client side limit in milliseconds for each query request, if any */
	get requestTimeout() {
		return this.#state?.requestTimeout;
	}
	/**
	* The version reported by the server on the most recent (re)connect, or
	* `undefined` before the first connection has been established.
	*/
	get serverVersion() {
		return this.#cachedVersion;
	}
	#instanceEngine(url) {
		const engineMap = this.#context.options.engines ?? createRemoteEngines();
		const protocol = url.protocol.slice(0, -1);
		const factory = engineMap[protocol];
		if (!factory) throw new UnsupportedEngineError(protocol);
		return factory(this.#context);
	}
	health() {
		if (!this.#engine) throw new ConnectionUnavailableError();
		return this.#engine?.health();
	}
	version() {
		if (!this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.version();
	}
	async sessions() {
		if (!this.#engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Sessions);
		return this.#engine.sessions();
	}
	async attach(session) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Sessions);
		await this.#engine.attach(session);
	}
	async detach(session) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Sessions);
		return this.#engine.detach(session);
	}
	async signup(auth, session, skipOverride = false) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		const response = await this.#engine.signup(auth, session);
		const sessionState = this.getSession(session);
		sessionState.accessToken = response.access;
		sessionState.refreshToken = response.refresh;
		sessionState.authOverriden = sessionState.authOverriden || !skipOverride;
		this.#handleAuthChanged(session);
		return response;
	}
	async signin(auth, session, skipOverride = false) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		const response = await this.#engine.signin(auth, session);
		const sessionState = this.getSession(session);
		sessionState.accessToken = response.access;
		sessionState.refreshToken = response.refresh;
		sessionState.authOverriden = sessionState.authOverriden || !skipOverride;
		this.#handleAuthChanged(session);
		return response;
	}
	async authenticate(token, session, skipOverride = false) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		await this.#engine.authenticate(token, session);
		const sessionState = this.getSession(session);
		sessionState.accessToken = token;
		sessionState.authOverriden = sessionState.authOverriden || !skipOverride;
		this.#handleAuthChanged(session);
	}
	async refresh(tokens, session, skipOverride = false) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		this.assertFeature(Features.RefreshTokens);
		const response = await this.#engine.refresh(tokens, session);
		const sessionState = this.getSession(session);
		sessionState.accessToken = response.access;
		sessionState.refreshToken = response.refresh;
		sessionState.authOverriden = sessionState.authOverriden || !skipOverride;
		this.#handleAuthChanged(session);
		return response;
	}
	async sql(dialect, statements, vars, options, session) {
		const engine = this.#engine;
		if (!engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.SqlDialects);
		if (!engine.sql) throw new UnsupportedFeatureError(Features.SqlDialects);
		return engine.sql(dialect, statements, vars, options, session);
	}
	async revoke(tokens, session) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		this.assertFeature(Features.RefreshTokens);
		const revoked = tokens ?? this.#getTokens(session);
		if (!revoked?.refresh) throw new SurrealError("There is no refresh token to revoke");
		await this.#engine.revoke(revoked, session);
		const affected = this.#allSessions().filter((sessionState) => sessionState.refreshToken === revoked.refresh);
		for (const sessionState of affected) sessionState.refreshToken = void 0;
		const failures = [];
		for (const sessionState of affected) try {
			this.#eventPublisher.publish("auth", this.#getTokens(sessionState.id) ?? null, sessionState.id);
		} catch (error) {
			failures.push(...listenerFailures(error));
		}
		if (failures.length > 0) throw new PublishError(failures);
	}
	async use(what, session) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		if (what.namespace === null && what.database !== null) throw new MissingNamespaceDatabaseError();
		const res = await this.#engine.use(what, session);
		const namespace = res.namespace ?? what.namespace;
		const database = res.database ?? what.database;
		const sessionState = this.getSession(session);
		if (namespace === null) sessionState.namespace = void 0;
		if (database === null) sessionState.database = void 0;
		if (namespace) sessionState.namespace = namespace;
		if (database) sessionState.database = database;
		const selected = {
			namespace: sessionState.namespace,
			database: sessionState.database
		};
		this.#eventPublisher.publish("using", selected, session);
		return selected;
	}
	async set(name, value, session) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		await this.#engine.set(name, value, session);
		const sessionState = this.getSession(session);
		sessionState.variables[name] = value;
	}
	async unset(name, session) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		await this.#engine.unset(name, session);
		const sessionState = this.getSession(session);
		delete sessionState.variables[name];
	}
	async invalidate(session) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		await this.#engine.invalidate(session);
		this.#handleAuthInvalidate(session);
	}
	async reset(session) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		await this.#engine.reset(session);
		const sessionState = this.getSession(session);
		sessionState.namespace = void 0;
		sessionState.database = void 0;
		sessionState.variables = {};
		this.#handleAuthInvalidate(session);
		const payload = {
			namespace: void 0,
			database: void 0
		};
		this.#eventPublisher.publish("using", payload, session);
	}
	begin(session) {
		const engine = this.#engine;
		if (!engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Transactions);
		return this.#whenAuthenticated(session, () => engine.begin(session));
	}
	commit(txn, session) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Transactions);
		return this.#engine.commit(txn, session);
	}
	cancel(txn, session) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Transactions);
		return this.#engine.cancel(txn, session);
	}
	importSql(data, request) {
		const engine = this.#engine;
		if (!engine) throw new ConnectionUnavailableError();
		if (data instanceof ReadableStream || data instanceof Blob) this.assertFeature(Features.ExportImportRaw);
		return this.#whenAuthenticated(void 0, () => engine.importSql(data, request), request?.signal);
	}
	exportSql(options, request) {
		const engine = this.#engine;
		if (!engine) throw new ConnectionUnavailableError();
		return this.#whenAuthenticated(void 0, () => engine.exportSql(options, request), request?.signal);
	}
	exportMlModel(options, request) {
		const engine = this.#engine;
		if (!engine) throw new ConnectionUnavailableError();
		return this.#whenAuthenticated(void 0, () => engine.exportMlModel(options, request), request?.signal);
	}
	api(path, request, session, txn, options) {
		const engine = this.#engine;
		if (!engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Api);
		return this.#whenAuthenticated(session, () => engine.api(path, request, session, txn, options), options?.signal);
	}
	query(query, session, txn, options) {
		const engine = this.#engine;
		if (!engine) throw new ConnectionUnavailableError();
		if (options?.trace?.length) this.assertFeature(Features.QueryTrace);
		const { beforeSend,...rest } = options ?? {};
		const request = options && (beforeSend ? rest : options);
		if (!this.#needsPreparation()) return engine.query(query, session, txn, request);
		const prepare = async () => {
			const waiting = abortScope([request?.signal, beforeSend]);
			try {
				await this.#prepare(session, waiting.signal);
			} finally {
				waiting.dispose();
			}
		};
		return relayIterable(async () => {
			await prepare();
			return engine.query(query, session, txn, request);
		});
	}
	/**
	* Run a query as a different identity than the one of the session, for this query only.
	*
	* A call made as someone else must never silently run as the session. It is refused unless
	* the engine declares that it presents credentials with every request, and implements the
	* method which does so, which an engine, or something wrapping one, may not. The options
	* are those of `query()`, so that the query is abandoned by a signal the same way, and the
	* credential which is resolved for requests of the session is not asked for.
	*/
	queryAs(query, session, txn, options) {
		const engine = this.#engine;
		if (!engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.PerRequestAuth);
		assertCredential(options.credential);
		if (typeof engine.queryAs !== "function") throw new UnsupportedFeatureError(Features.PerRequestAuth);
		if (options.trace?.length) this.assertFeature(Features.QueryTrace);
		return engine.queryAs(query, session, txn, options);
	}
	/**
	* Import as a different identity than the one of the connection, for this import only. As for
	* `queryAs()`, it is refused rather than run as the connection when the engine cannot present
	* the credential.
	*/
	importSqlAs(data, request) {
		const engine = this.#credentialedEngine(request.credential);
		if (typeof engine.importSqlAs !== "function") throw new UnsupportedFeatureError(Features.PerRequestAuth);
		if (data instanceof ReadableStream || data instanceof Blob) this.assertFeature(Features.ExportImportRaw);
		return engine.importSqlAs(data, request);
	}
	/**
	* Export as a different identity than the one of the connection, for this export only. See
	* `importSqlAs()`.
	*/
	exportSqlAs(options, request) {
		const engine = this.#credentialedEngine(request.credential);
		if (typeof engine.exportSqlAs !== "function") throw new UnsupportedFeatureError(Features.PerRequestAuth);
		return engine.exportSqlAs(options, request);
	}
	/**
	* Export a model as a different identity than the one of the connection, for this export
	* only. See `importSqlAs()`.
	*/
	exportMlModelAs(options, request) {
		const engine = this.#credentialedEngine(request.credential);
		if (typeof engine.exportMlModelAs !== "function") throw new UnsupportedFeatureError(Features.PerRequestAuth);
		return engine.exportMlModelAs(options, request);
	}
	/**
	* Invoke a custom API as a different identity than the one of the session, for this call
	* only. See `importSqlAs()`.
	*/
	apiAs(path, request, session, txn, options) {
		const engine = this.#credentialedEngine(options.credential);
		this.assertFeature(Features.Api);
		if (typeof engine.apiAs !== "function") throw new UnsupportedFeatureError(Features.PerRequestAuth);
		return engine.apiAs(path, request, session, txn, options);
	}
	/**
	* The engine for a call which is made as someone else, which must never be made as the
	* connection instead: it is refused unless the engine declares that it presents credentials
	* with every request.
	*/
	#credentialedEngine(credential) {
		const engine = this.#engine;
		if (!engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.PerRequestAuth);
		assertCredential(credential);
		return engine;
	}
	gql(query, session, txn, options) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.gql(query, session, txn, options);
	}
	liveQuery(id$1) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.liveQuery(id$1);
	}
	async #onConnected() {
		try {
			const { version } = await this.version();
			this.#cachedVersion = version;
			if (this.#checkVersion && !isVersionSupported(version)) throw new UnsupportedVersionError(version, MINIMUM_VERSION, MAXIMUM_VERSION);
			for (const session of this.#allSessions()) {
				if (session.id) await this.attach(session.id);
				await this.#restoreSession(session);
			}
			this.#engine?.ready(version);
			this.#lastConnectionError = void 0;
			this.#status = "connected";
			this.#eventPublisher.publish("connected", version);
		} catch (err) {
			this.#lastConnectionError = err;
			this.#eventPublisher.publish("error", err);
			this.#engine?.close();
			return;
		}
	}
	#onDisconnected() {
		for (const session of this.#allSessions()) this.#cancelAuthRenewal(session.id);
		this.#requestAuth?.clear();
		this.#requestAuth = void 0;
		this.#state = void 0;
		this.#engine = void 0;
		this.#status = "disconnected";
		this.#eventPublisher.publish("disconnected");
	}
	#onReconnecting() {
		this.#status = "reconnecting";
		this.#eventPublisher.publish("reconnecting");
	}
	#onEngineError(error) {
		this.#lastConnectionError = error;
		this.#eventPublisher.publish("error", error);
	}
	#getTokens(session) {
		const sessionState = this.getSession(session);
		if (!sessionState.accessToken) return void 0;
		return {
			access: sessionState.accessToken,
			refresh: sessionState.refreshToken
		};
	}
	async #applyAuthProvider(session) {
		const provider = this.#authProvider;
		if (!provider) return false;
		const computed = await invokeProvider(provider, session);
		if (computed === null) return false;
		if (typeof computed === "string") await this.authenticate(computed, session, true);
		else await this.signin(computed, session, true);
		return true;
	}
	/**
	* Whether requests wait for credentials to be applied to their session. This is for
	* engines which hold credentials in a server side session: when the credentials change,
	* the session is authenticated again before the request is sent.
	*/
	#needsPreparation() {
		return !!this.#requestAuth && !this.#engine?.features.has(Features.PerRequestAuth);
	}
	/**
	* Run a request once the session holds a current credential, for as long as it is wanted:
	* when the signal of the request aborts while the credential is being settled, the request is
	* not made, and fails with the reason of the signal.
	*/
	#whenAuthenticated(session, run, signal) {
		if (!this.#needsPreparation()) return run();
		return this.#prepare(session, signal).then(run);
	}
	/**
	* Make sure the session holds a current credential before a request is sent on it.
	*
	* The request is only waiting for it. When its signal aborts, the wait ends with the reason of
	* the signal, which wins over a resolver which fails at the same moment, and nothing which has
	* begun is undone: a credential which is being applied to the session is applied in full,
	* for the next request, and one which has not begun to be resolved is not resolved for a
	* request which is no longer there.
	*/
	async #prepare(session, signal) {
		const requestAuth = this.#requestAuth;
		const resolver = this.#requestResolver;
		throwIfAborted(signal);
		if (!requestAuth || !resolver) return;
		if (this.getSession(session).authOverriden) return;
		try {
			await this.#applyResolved(requestAuth, resolver, session, signal);
		} catch (error) {
			throwIfAborted(signal);
			throw error;
		}
	}
	async #applyResolved(requestAuth, resolver, session, signal) {
		await requestAuth.get(session, async () => {
			const provided = await invokeProvider(resolver, session);
			const sessionState = this.getSession(session);
			if (provided === null) {
				if (sessionState.accessToken) await this.invalidate(session);
				return void 0;
			}
			if (typeof provided === "string") {
				if (provided !== sessionState.accessToken) await this.authenticate(provided, session, true);
				return provided;
			}
			return (await this.signin(provided, session, true)).access;
		}, void 0, signal);
	}
	/**
	* Resolve the token a request on a session presents, for engines which present
	* credentials with every request. Nothing is applied to the session and no timers are
	* started, so a request which is the only thing alive does not keep the process running.
	*
	* The request which asks may be abandoned meanwhile, which is for it to handle, in
	* `fetchSurreal`: it stops waiting, and what is resolved is kept for the requests which follow.
	*/
	async #requestToken(session, rejected, signal) {
		const requestAuth = this.#requestAuth;
		const resolver = this.#requestResolver;
		const engine = this.#engine;
		if (!requestAuth || !resolver || !engine) throw new ConnectionUnavailableError();
		const sessionState = this.getSession(session);
		if (sessionState.authOverriden) return sessionState.accessToken;
		return requestAuth.get(session, async () => {
			const provided = await invokeProvider(resolver, session);
			if (provided === null) return void 0;
			if (typeof provided === "string") return provided;
			return (await engine.signin(provided, session)).access;
		}, rejected, signal);
	}
	#cancelAuthRenewal(session) {
		if (!this.#state) return;
		const sessionState = this.getSession(session);
		this.#renewals.delete(sessionState);
		if (!sessionState.authRenewal) return;
		clearTimeout(sessionState.authRenewal);
		sessionState.authRenewal = void 0;
	}
	#handleAuthChanged(session) {
		if (!this.#state) return;
		const sessionState = this.getSession(session);
		const tokens = this.#getTokens(session);
		if (!tokens) return;
		this.#cancelAuthRenewal(session);
		this.#eventPublisher.publish("auth", tokens, session);
		if (this.#requestAuth && !sessionState.authOverriden) return;
		const payload = fastParseJwt(tokens.access);
		if (!payload || !payload.exp) return;
		const now = Math.floor(Date.now() / 1e3);
		const remaining = Math.max(payload.exp - now, 0);
		const delay = renewalDelay(remaining, this.#expiryMargin);
		const cycle = {
			retries: 0,
			failure: void 0
		};
		this.#renewals.set(sessionState, cycle);
		this.#scheduleRenewalTimer(session, cycle, delay * 1e3, () => this.#renew(session, cycle));
	}
	#scheduleRenewalTimer(session, cycle, delayMs, action) {
		const sessionState = this.getSession(session);
		const targetTime = Date.now() + Math.max(delayMs, 0);
		const tick = () => {
			if (!this.#isCurrentRenewal(session, cycle)) return;
			const remaining = targetTime - Date.now();
			if (remaining > 0) {
				const nextDelay = Math.min(remaining, ONE_DAY_MS);
				sessionState.authRenewal = setTimeout(tick, nextDelay);
			} else {
				sessionState.authRenewal = void 0;
				action();
			}
		};
		const firstDelay = Math.min(Math.max(delayMs, 0), ONE_DAY_MS);
		sessionState.authRenewal = setTimeout(tick, firstDelay);
	}
	#isCurrentRenewal(session, cycle) {
		return this.#state !== void 0 && this.hasSession(session) && this.#renewals.get(this.getSession(session)) === cycle;
	}
	#renew(session, cycle) {
		if (!this.#isCurrentRenewal(session, cycle)) return;
		this.getSession(session).authRenewal = void 0;
		this.#applyAuthentication(session).catch((error) => this.#renewalFailed(session, cycle, error));
	}
	/**
	* A renewal failed. Left alone, the session would hold a token which is about to expire with
	* nothing scheduled to ever replace it, so the renewal is tried again, backing off like a
	* reconnect does, for as long as the token is valid. A renewal which succeeds, a new sign in,
	* an invalidated or closed session, and a lost connection all replace or cancel the cycle,
	* which makes a failure which arrives late a thing of the past. Once the token has expired
	* the session is invalidated, rather than lingering in an unknown state.
	*
	* The failure is reported once for the cycle, and not for every attempt, followed by the
	* last one when the session is invalidated.
	*/
	#renewalFailed(session, cycle, error) {
		if (!this.#state || !this.#isCurrentRenewal(session, cycle)) return;
		const failure = error instanceof AuthenticationError ? error : new AuthenticationError(error);
		cycle.failure = failure;
		if (cycle.retries === 0) this.#eventPublisher.publish("error", failure);
		const sessionState = this.getSession(session);
		const expiry = sessionState.accessToken ? tokenExpiry(sessionState.accessToken) : void 0;
		const remaining = expiry === void 0 ? 0 : expiry * 1e3 - Date.now();
		if (remaining <= 0) {
			this.#giveUpRenewal(session, cycle);
			return;
		}
		const options = this.#state.reconnect.options;
		const delay = options.enabled ? backoffDelay(options, cycle.retries + 1) : Number.POSITIVE_INFINITY;
		if (delay >= remaining) {
			this.#scheduleRenewalTimer(session, cycle, remaining, () => this.#giveUpRenewal(session, cycle));
			return;
		}
		cycle.retries++;
		this.#scheduleRenewalTimer(session, cycle, delay, () => this.#renew(session, cycle));
	}
	#giveUpRenewal(session, cycle) {
		if (!this.#isCurrentRenewal(session, cycle)) return;
		const failure = cycle.failure;
		this.#abortAuthentication(session).then(() => {
			if (failure) this.#eventPublisher.publish("error", failure);
		}, (error) => {
			if (this.#state && this.hasSession(session)) this.#handleAuthInvalidate(session);
			this.#eventPublisher.publish("error", error instanceof AuthenticationError ? error : new AuthenticationError(error));
		});
	}
	async #abortAuthentication(session) {
		if (!this.#state) return;
		const sessionState = this.getSession(session);
		if (sessionState.accessToken) await this.invalidate(session);
	}
	async #applyAuthentication(session) {
		const sessionState = this.getSession(session);
		if (this.#requestAuth && !sessionState.authOverriden) {
			this.#requestAuth.forget(session);
			if (sessionState.accessToken) this.#handleAuthInvalidate(session);
			return;
		}
		if (this.#skipRenewal) {
			await this.#abortAuthentication(session);
			return;
		}
		if (sessionState.accessToken) {
			const payload = fastParseJwt(sessionState.accessToken);
			if (payload?.exp) {
				const now = Math.floor(Date.now() / 1e3);
				const remaining = Math.max(payload.exp - now, 0);
				if (remaining > renewalDelay(remaining, this.#expiryMargin)) try {
					await this.authenticate(sessionState.accessToken, session, true);
					return;
				} catch (err) {
					if (!(err instanceof ServerError)) throw err;
				}
			}
		}
		if (sessionState.refreshToken) {
			const tokens = this.#getTokens(session);
			if (tokens) try {
				await this.refresh(tokens, session, true);
				return;
			} catch (err) {
				if (!(err instanceof ServerError)) throw err;
			}
		}
		if (!sessionState.authOverriden) {
			const applied = await this.#applyAuthProvider(session);
			if (applied) return;
		}
		await this.#abortAuthentication(session);
	}
	#handleAuthInvalidate(session) {
		if (!this.#state) return;
		const sessionState = this.getSession(session);
		sessionState.accessToken = void 0;
		sessionState.refreshToken = void 0;
		this.#requestAuth?.forget(session);
		this.#cancelAuthRenewal(session);
		this.#eventPublisher.publish("auth", null, session);
	}
	hasSession(session) {
		if (!this.#state) return false;
		if (session === void 0) return true;
		return this.#state.sessions.has(session);
	}
	getSession(session) {
		if (!this.#state) throw new ConnectionUnavailableError();
		return getSessionFromState(this.#state, session);
	}
	async createSession(clone) {
		if (!this.#state) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Sessions);
		const sessionId = Uuid.v4();
		await this.attach(sessionId);
		if (clone === null) this.#state.sessions.set(sessionId, this.#createSessionState(sessionId));
		else {
			const state = this.#cloneSessionState(sessionId, clone);
			this.#state.sessions.set(sessionId, state);
			await this.#restoreSession(state);
		}
		return sessionId;
	}
	async destroySession(session) {
		if (!this.#state) throw new ConnectionUnavailableError();
		if (!session || !this.#state.sessions.has(session)) throw new InvalidSessionError(session);
		await this.detach(session);
		this.#cancelAuthRenewal(session);
		this.#requestAuth?.forget(session);
		this.#state.sessions.delete(session);
	}
	#allSessions() {
		if (!this.#state) return [];
		return [this.#state.rootSession, ...Array.from(this.#state.sessions.values())];
	}
	#createSessionState(id$1) {
		return {
			id: id$1,
			variables: {},
			namespace: void 0,
			database: void 0,
			accessToken: void 0,
			refreshToken: void 0,
			authRenewal: void 0,
			authOverriden: false
		};
	}
	#cloneSessionState(newId, existingId) {
		const state = this.getSession(existingId);
		return {
			id: newId,
			variables: { ...state.variables },
			namespace: state.namespace,
			database: state.database,
			accessToken: state.accessToken,
			refreshToken: state.refreshToken,
			authRenewal: void 0,
			authOverriden: false
		};
	}
	async #restoreSession(session) {
		if (session.namespace || session.database) {
			const what = {
				namespace: session.namespace,
				database: session.database
			};
			await this.use(what, session.id);
		}
		for (const [name, value] of Object.entries(session.variables)) await this.set(name, value, session.id);
		await this.#applyAuthentication(session.id);
	}
};
/**
* The errors which listeners threw, out of the `PublishError` which reports them. A session's
* listeners are reached through publishers of their own, so the errors may be nested several deep.
*/
function listenerFailures(error) {
	return error instanceof PublishError ? error.causes.flatMap(listenerFailures) : [error];
}

//#endregion
//#region src/api/surreal.ts
/**
* The Surreal class provides methods to connect to a SurrealDB instance,
* execute database queries, subscribe to events, and manage database sessions.
*
* Note that most methods in this class are dispatched once you subscribe to the
* returned Promise and offer various chainable configuration methods before
* making the actual request.
*
* By default the Surreal instance is scoped to a default session, however you
* can create a new session by calling the `newSession` or `forkSession` methods.
*/
var Surreal = class Surreal extends SurrealSession {
	#publisher = new Publisher();
	#connection;
	subscribe(event, listener) {
		return this.#publisher.subscribe(event, listener);
	}
	/**
	* Construct a new Surreal instance with the provided options
	*
	* @param options Driver wide configuration options
	*/
	constructor(options) {
		const driverOptions = options ?? {};
		const connection = new ConnectionController({
			options: driverOptions,
			uniqueId: getIncrementalID,
			codecs: Surreal.#compileCodecs(driverOptions)
		});
		super(connection, void 0);
		connection.subscribe("connecting", () => {
			this.#publisher.publish("connecting");
		});
		connection.subscribe("connected", (version) => {
			this.#publisher.publish("connected", version);
		});
		connection.subscribe("disconnected", () => {
			this.#publisher.publish("disconnected");
		});
		connection.subscribe("reconnecting", () => {
			this.#publisher.publish("reconnecting");
		});
		connection.subscribe("error", (error) => {
			this.#publisher.publish("error", error);
		});
		super.subscribe("auth", (token) => {
			this.#publisher.publish("auth", token);
		});
		super.subscribe("using", (using) => {
			this.#publisher.publish("using", using);
		});
		this.#connection = connection;
	}
	static #compileCodecs(options) {
		const userCodecs = options.codecs ?? {};
		const codecOptions = options.codecOptions ?? {};
		const cbor2 = userCodecs.cbor2 ? userCodecs.cbor2(codecOptions) : userCodecs.cbor ? void 0 : new CborCodec({
			...codecOptions,
			version: 2
		});
		const shaped = userCodecs.shaped ? userCodecs.shaped(codecOptions) : options.shaped && !userCodecs.cbor ? new ShapedCodec(codecOptions) : void 0;
		return {
			cbor: userCodecs.cbor?.(codecOptions) ?? new CborCodec(codecOptions),
			cbor2,
			shaped,
			flatbuffer: userCodecs.flatbuffer?.(codecOptions) ?? new FlatBufferCodec(codecOptions),
			json: userCodecs.json?.(codecOptions) ?? new JsonCodec(codecOptions)
		};
	}
	/**
	* Returns the status of the connection
	*/
	get status() {
		return this.#connection.status;
	}
	/**
	* Returns whether the connection is considered connected
	*
	* Equivalent to `this.status === "connected"`
	*/
	get isConnected() {
		return this.#connection.status === "connected";
	}
	/**
	* A promise which resolves when the connection is ready, or rejects
	* if a connection error occurs.
	*/
	get ready() {
		return this.#connection.ready();
	}
	/**
	* Connect to a local or remote SurrealDB instance using the provided URL.
	*
	* Calling `connect()` will reset and dispose any existing sessions created with `newSession()`.
	*
	* @param url The endpoint to connect to
	* @param opts Options to configure the connection
	*/
	async connect(url, opts = {}) {
		return this.#connection.connect(parseEndpoint(url), opts);
	}
	/**
	* Disconnect from the active SurrealDB instance
	*/
	async close() {
		return this.#connection.disconnect();
	}
	/**
	* Check the health of the connected SurrealDB instance
	*
	* A remote instance is asked through its `/health` endpoint, and an embedded one with `ping`.
	* Resolves when the instance is healthy, and rejects when it is not, or cannot be reached.
	*/
	health() {
		return this.#connection.health();
	}
	/**
	* Retrieves the version of the connected SurrealDB instance
	*
	* @example { version: "surrealdb-2.1.0" }
	*/
	version() {
		return this.#connection.version();
	}
	/**
	* Checks whether a feature is available in the current connection
	*
	* @param feature The feature to check
	*/
	isFeatureSupported(feature) {
		try {
			this.#connection.assertFeature(feature);
			return true;
		} catch (error) {
			if (error instanceof UnavailableFeatureError || error instanceof UnsupportedFeatureError) return false;
			throw error;
		}
	}
	/**
	* Lists all sessions created on the current connection.
	*
	* @returns A list of active session IDs
	*/
	sessions() {
		return this.#connection.sessions();
	}
	/**
	* Create a fresh new session on this connection and return a dedicated `Surreal` instance scoped to it.
	*
	* This session will contain its own copy of global variables, namespace, database, and authentication state.
	* Connection related functions and event subscriptions will be shared with the original session. When the
	* connection reconnects, the session will be automatically restored.
	*
	* You can invoke `reset()` on the created session to destroy it, after which it cannot be used again.
	*
	* @returns The new session
	*/
	async newSession() {
		const created = await this.#connection.createSession(null);
		return SurrealSession.of(this, created);
	}
	/**
	* Stop the primary session. This is equivalent to calling `close()` on the connection.
	*/
	async closeSession() {
		await this.close();
	}
	/**
	* Import an existing export into the database.
	*
	* Like the other query methods, the import is only started once the returned `Promise` is
	* awaited. Chain `.signal()` to abandon it, `.requestTimeout()` to limit it, or `.progress()`
	* to follow it.
	*
	* An import is not transactional: a statement which fails does not stop the others. Over HTTP
	* and WebSocket, SurrealDB 3.1 and later say which statements failed, and the import rejects
	* with an `ImportError` listing them.
	*
	* @param input The data to import
	*/
	import(input) {
		return new ImportPromise(this.#connection, input);
	}
	/**
	* Export the database as SurrealQL.
	*
	* By default, the result is returned as a string. Chain `.response()`
	* to receive the raw `Response` instead.
	*
	* @param options Optional export options
	*/
	export(options) {
		return new ExportPromise(this.#connection, options ?? {}, false);
	}
	/**
	* Export a SurrealML model.
	*
	* By default, the result is returned as a `Uint8Array`. Chain `.response()`
	* to receive the raw `Response` instead.
	*
	* @param name The name of the ML model to export
	* @param version The version of the ML model to export
	*/
	exportModel(name, version) {
		return new ExportModelPromise(this.#connection, {
			name,
			version
		}, false);
	}
};

//#endregion
export { AlreadyExistsError, AuthResolverError, AuthenticationError, BLOCK_THRESHOLD, BigDecimal, BlockReader, BoundExcluded, BoundIncluded, BoundQuery, ByteReader, CallTerminatedError, CborCodec, ChannelIterator, Columns, ConfigurationError, ConnectionUnavailableError, DateTime, Decimal, DoneFrame, Duration, ErrorFrame, ErrorKind, ExportModelPromise, ExportPromise, ExpressionError, F16, F32, Features, FileRef, FlatBufferCodec, Frame, Future, Geometry, GeometryCollection, GeometryLine, GeometryMultiLine, GeometryMultiPoint, GeometryMultiPolygon, GeometryPoint, GeometryPolygon, HttpConnectionError, HttpEngine, I16, I32, I8, ImportError, ImportPromise, InternalError, Interval, InvalidDateError, InvalidDecimalError, InvalidDurationError, InvalidNumberError, InvalidRecordIdError, InvalidRegexError, InvalidSessionError, InvalidTableError, JsonCodec, Kind, LIVE_ACTIONS, LiveDispatcher, LiveSubscription, LiveSubscriptionError, MAXIMUM_VERSION, MAX_COLUMNS, MAX_DEPTH, MAX_FIXED, MAX_SHAPES, MAY_BE_ABSENT, MAY_BE_NULL, MINIMUM_VERSION, ManagedLiveSubscription, MissingNamespaceDatabaseError, NO_SLOT, NotAllowedError, NotFoundError, PlainDate, PlainTime, PublishError, Publisher, QueryError, Range, ReconnectExhaustionError, ReconnectIterationError, _RecordId as RecordId, _RecordIdRange as RecordIdRange, Regex, ResponseError, RowStream, RpcEngine, SHAPED_TAG, VERSION as SHAPED_VERSION, SchemaValidationError, SerializationError, ServerError, Shape, ShapedBlock, ShapedCodec, ShapedFrameError, SizedNumber, Slices, SqonError, StatementStream, StreamProtocolError, StringRecordId, Surreal, SurrealApi, SurrealError, SurrealQueryable, SurrealRequestScope, SurrealSession, SurrealSqonError, SurrealTransaction, TRACE_KINDS, _Table as Table, TextCodec, TextParseError, ThrownError, Timestamp, U16, U32, U64, U8, UnavailableFeatureError, UnexpectedConnectionError, UnexpectedServerResponseError, UnmanagedLiveSubscription, UnsuccessfulApiError, UnsupportedEngineError, UnsupportedFeatureError, UnsupportedValueError, UnsupportedVersionError, Uuid, ValidationError, Value, ValueFrame, WebSocketEngine, and, applyDiagnostics, between, contains, containsAll, containsAny, containsNone, createRemoteEngines, d, decodeRow, dedupeTrace, deriveShape, eeq, eq, equals, escapeIdPart, escapeIdent, escapeNumber, escapeRangeBound, expr, framesToChunks, gt, gte, inside, intersects, isRetryableConflict, isVersionSupported, jsonify, kindOf, knn, lt, lte, matches, mergeBindings, ne, not, or, outside, parseRpcError, queryParams, r, raw, s, surql, toSurqlString, toSurqlString as toSurrealqlString, u, writeBlock, writeRow };