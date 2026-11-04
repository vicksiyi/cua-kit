/** Independently authored host diagnostics. Never changes worker protocol bytes. */
import { createNativePipeDiagnostics } from "./native-pipe-diagnostics";
import { Transform } from "node:stream";
import { performance } from "node:perf_hooks";

const maxLineBytes = 64 * 1024;
const maxPending = 1024;
/** Only classify known vendor routes; never log arbitrary URLs, bodies or errors. */
function fetchCategory(value: unknown): string {
  try {
    const url = new URL(String(value));
    if (
      url.hostname === "chatgpt.com" ||
      url.hostname === "chatgpt-staging.com"
    ) {
      if (url.pathname === "/backend-api/aura/site_status")
        return "site-status";
      if (url.pathname === "/backend-api/aura/identity") return "identity";
    }
  } catch {}
  return "other-fetch";
}
/** Fixed categories only: the raw native error may contain credentials or URLs. */
export function fetchFailureCategory(error: unknown): string {
  if (typeof error !== "string") return "unspecified";
  if (/timed?[- ]?out|timeout|deadline/i.test(error)) return "timeout";
  if (/certificate|TLS|SSL/i.test(error)) return "tls";
  if (/unauthorized|forbidden|authentication|credentials/i.test(error))
    return "authentication";
  if (/resolve|DNS|name lookup/i.test(error)) return "dns";
  if (/connect|connection/i.test(error)) return "connection";
  if (/send(?:ing)? (?:a )?request/i.test(error)) return "request-send";
  if (/response|body|decode/i.test(error)) return "response";
  return "unspecified";
}

export function createRuntimeDiagnostics(
  write: (line: string) => void,
  now = () => performance.now(),
) {
  const pending = new Map<
    string,
    { label: string; started: number; sequence: number }
  >();
  let sequence = 0;
  const emit = (text: string) => {
    try {
      write(`[CUA runtime] ${text}`);
    } catch {
      /* Diagnostics are best effort. */
    }
  };
  const nativePipe = createNativePipeDiagnostics(emit);
  function observe(message: any, direction: "request" | "response") {
    nativePipe.observe(message, direction);
    if (!message || typeof message.id !== "string") return;
    if (direction === "request" && message.type === "authenticated_fetch") {
      if (pending.size >= maxPending) return;
      const entry = {
        label: fetchCategory(message.request?.url),
        started: now(),
        sequence: ++sequence,
      };
      pending.set(message.id, entry);
      emit(`fetch #${entry.sequence} ${entry.label} started`);
    } else if (
      direction === "response" &&
      message.type === "authenticated_fetch_result"
    ) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      const status = message.response?.status;
      const outcome =
        message.ok === true
          ? Number.isInteger(status) && status >= 100 && status <= 599
            ? `HTTP ${status}`
            : "response"
          : "transport error";
      const elapsedMs = Math.max(0, Math.round(now() - entry.started));
      emit(
        `fetch #${entry.sequence} ${entry.label} ${outcome} (${elapsedMs} ms)`,
      );
      if (message.ok !== true)
        emit(
          `fetch #${entry.sequence} failure category: ${fetchFailureCategory(message.error)}`,
        );
      if (
        entry.label === "site-status" &&
        message.ok !== true &&
        elapsedMs >= 25000
      )
        emit(
          "Slow upstream site-status transport failure; inspect the authenticated-fetch host connection. This is not evidence of a page-load timeout or a CAPTCHA. No authorization or policy setting was changed.",
        );
    }
  }
  function stream(direction: "request" | "response") {
    let pieces: Buffer[] = [],
      length = 0,
      discard = false;
    return new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        // Forward the exact original bytes, even malformed/oversize protocol lines.
        this.push(chunk);
        let start = 0;
        while (start < chunk.length) {
          const newline = chunk.indexOf(10, start);
          const end = newline < 0 ? chunk.length : newline;
          if (!discard) {
            length += end - start;
            if (length > maxLineBytes) {
              discard = true;
              pieces = [];
            } else pieces.push(Buffer.from(chunk.subarray(start, end)));
          }
          if (newline < 0) break;
          if (!discard) {
            try {
              observe(
                JSON.parse(Buffer.concat(pieces).toString("utf8")),
                direction,
              );
            } catch {}
          }
          pieces = [];
          length = 0;
          discard = false;
          start = newline + 1;
        }
        callback();
      },
    });
  }
  return {
    requests: stream("request"),
    responses: stream("response"),
    close() {
      nativePipe.close();
      for (const entry of pending.values())
        emit(
          `fetch #${entry.sequence} ${entry.label} unresolved at worker exit (${Math.max(0, Math.round(now() - entry.started))} ms); no response observed`,
        );
      pending.clear();
    },
  };
}
