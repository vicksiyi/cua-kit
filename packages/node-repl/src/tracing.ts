import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";


interface TraceExecState { id: unknown; requestMeta?: unknown }
type TraceAttrs = Record<string, string | number | boolean>;
interface TraceSpanRecord { id: string; name: string; start_ms: number; duration_ms: number; status: string; attrs: TraceAttrs; parent_id?: string }
interface TraceState { droppedSpanCount: number; spanCounter: number; spans: TraceSpanRecord[]; startedAtMs: number }
interface ResponseMetaTrace { version: number; started_at_ms: number; spans: TraceSpanRecord[]; dropped_span_count?: number }
interface SpanEndOptions { attrs?: unknown; status?: unknown }
interface TelemetrySpan { end(options?: SpanEndOptions): void }
type ResultAttrs = ((result: unknown) => unknown) | null | undefined;

const responseMetaTraceVersion = 1;
// Reserve room for nested CDP spans and their enclosing command span. At 128,
// children could fill the buffer before the command span ended.
const maxResponseMetaTraceSpans = 1024;
// Keep these bounds aligned with src/otel_traces.rs. Text lengths count Unicode
// code points via string iteration, not UTF-16 code units.
const maxResponseMetaTraceAttrs = 32;
const maxResponseMetaTraceAttrKeyLength = 128;
const maxResponseMetaTraceNameLength = 128;
const maxResponseMetaTraceAttrStringLength = 256;

function roundTraceMs(value: number) {
  return Math.round(value * 1000) / 1000;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function truncateTraceText(value: string, maxLength: number) {
  let result = "";
  let length = 0;
  for (const character of value) {
    if (length === maxLength) break;
    result += character;
    length += 1;
  }
  return result;
}

function sanitizeTraceAttrValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    return truncateTraceText(value, maxResponseMetaTraceAttrStringLength);
  }
  return undefined;
}

function sanitizeTraceName(value: unknown) {
  const name = String(value);
  if (name.length === 0) {
    return "unknown";
  }
  return truncateTraceText(name, maxResponseMetaTraceNameLength);
}

function sanitizeTraceAttrs(value: unknown) {
  if (!isPlainObject(value)) {
    return {};
  }

  const attrs: TraceAttrs = {};
  let attrCount = 0;
  for (const [key, rawValue] of Object.entries(value)) {
    if (
      typeof key !== "string" ||
      key.length === 0 ||
      truncateTraceText(key, maxResponseMetaTraceAttrKeyLength) !== key
    ) {
      continue;
    }
    const sanitizedValue = sanitizeTraceAttrValue(rawValue);
    if (sanitizedValue === undefined) {
      continue;
    }
    attrs[key] = sanitizedValue;
    attrCount += 1;
    if (attrCount >= maxResponseMetaTraceAttrs) {
      break;
    }
  }
  return attrs;
}

export function createResponseMetaTracer({ enabled, getCurrentExecState }: { enabled: boolean; getCurrentExecState: () => TraceExecState }) {
  const spanStorage = new AsyncLocalStorage<{ spanId: string }>();
  const traces = new Map<unknown, TraceState>();

  function isEnabled() {
    if (enabled) {
      return true;
    }
    try {
      return typeof (getCurrentExecState().requestMeta as { traceparent?: unknown } | null | undefined)?.traceparent === "string";
    } catch {
      return false;
    }
  }

  function getTraceState(execState: TraceExecState) {
    let state = traces.get(execState.id);
    if (state === undefined) {
      state = {
        droppedSpanCount: 0,
        spanCounter: 0,
        spans: [],
        startedAtMs: performance.now(),
      };
      traces.set(execState.id, state);
    }
    return state;
  }

  function buildTrace(execState: TraceExecState) {
    const state = traces.get(execState.id);
    traces.delete(execState.id);
    if (state === undefined || state.spans.length === 0) {
      return null;
    }

    const trace: ResponseMetaTrace = {
      version: responseMetaTraceVersion,
      started_at_ms: performance.timeOrigin + state.startedAtMs,
      spans: state.spans.slice().sort((a, b) => a.start_ms - b.start_ms),
    };
    if (state.droppedSpanCount > 0) {
      trace.dropped_span_count = state.droppedSpanCount;
    }
    return trace;
  }

  function makeNoopTelemetrySpan() {
    return Object.freeze({
      end() {},
    });
  }

  function telemetryStatus(value: unknown) {
    return value === "error" ? "error" : "ok";
  }

  function telemetryErrorKind(error: unknown) {
    return error instanceof Error && error.name ? error.name : typeof error;
  }

  function objectAttrs(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function currentParentSpanId() {
    const activeSpan = spanStorage.getStore();
    return typeof activeSpan?.spanId === "string" ? activeSpan.spanId : null;
  }

  function startSpan(name: unknown, attrs: unknown = {}): { span: TelemetrySpan; spanId?: string } {
    if (!isEnabled()) {
      return { span: makeNoopTelemetrySpan() };
    }

    let execState;
    try {
      execState = getCurrentExecState();
    } catch {
      return { span: makeNoopTelemetrySpan() };
    }

    const state = getTraceState(execState);
    const spanId = `span-${++state.spanCounter}`;
    const parentSpanId = currentParentSpanId();
    const startMs = performance.now();
    let ended = false;

    const span = Object.freeze({
      end(options: SpanEndOptions = {}) {
        if (ended) {
          return;
        }
        ended = true;

        const endMs = performance.now();
        if (state.spans.length >= maxResponseMetaTraceSpans) {
          state.droppedSpanCount += 1;
          return;
        }

        const startAttrs = objectAttrs(attrs);
        const endAttrs = objectAttrs(options.attrs);
        const record: TraceSpanRecord = {
          id: spanId,
          name: sanitizeTraceName(name),
          start_ms: roundTraceMs(startMs - state.startedAtMs),
          duration_ms: roundTraceMs(endMs - startMs),
          status: telemetryStatus(options.status),
          attrs: sanitizeTraceAttrs({ ...startAttrs, ...endAttrs }),
        };
        if (parentSpanId != null) {
          record.parent_id = parentSpanId;
        }
        state.spans.push(record);
      },
    });

    return { span, spanId };
  }

  function resultAttrsFor(result: unknown, resultAttrs: ResultAttrs) {
    if (typeof resultAttrs !== "function") {
      return undefined;
    }
    try {
      const attrs = resultAttrs(result);
      if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
        return attrs;
      }
    } catch {
      // Telemetry must not affect runtime behavior.
    }
    return undefined;
  }

  const bridge = Object.freeze({
    startSpan(name: unknown, attrs: unknown = {}) {
      return startSpan(name, attrs).span;
    },

    async withSpan(name: unknown, attrs: unknown = {}, operation: unknown, options: { resultAttrs?: ResultAttrs } | null = {}) {
      if (typeof operation !== "function") {
        return undefined;
      }

      const resultAttrs =
        options && typeof options.resultAttrs === "function"
          ? options.resultAttrs
          : null;
      const { span, spanId } = startSpan(name, attrs);
      const run = async () => {
        try {
          const result = await operation();
          span.end({
            attrs: resultAttrsFor(result, resultAttrs),
            status: "ok",
          });
          return result;
        } catch (error) {
          span.end({
            attrs: { "error.kind": telemetryErrorKind(error) },
            status: "error",
          });
          throw error;
        }
      };

      if (!spanId) {
        return await run();
      }
      return await spanStorage.run({ spanId }, run);
    },
  });

  return Object.freeze({
    bridge,
    buildTrace,
    isEnabled,
  });
}

