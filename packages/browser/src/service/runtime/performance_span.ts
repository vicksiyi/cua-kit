import { AsyncLocalStorage } from "node:async_hooks";
import { BrowserAuthHandoff } from "../../commands/browser_auth";
import { ManualHandoff } from "../../commands/tab_control";

type Attributes = Record<string, unknown>;
interface SpanOptions<T> {
  resultAttrs?(result: T): Attributes;
}
interface Span {
  end(result: { attrs: Attributes; status: "ok" | "error" }): void;
}
interface Telemetry {
  withSpan?<T>(
    name: string,
    attributes: Attributes,
    run: () => Promise<T>,
    options: SpanOptions<T>,
  ): Promise<T>;
  startSpan(name: string, attributes: Attributes): Span | undefined;
}
interface CommandTrace {
  name: string;
  action?: string;
  operation?: string;
  attrs?(payload: unknown): Attributes;
  resultAttrs?(result: unknown): Attributes;
}
const handoffResult = BrowserAuthHandoff.ResultSchema.pick({
  status: true,
  reason: true,
}).extend({
  locator_error: BrowserAuthHandoff.ResultSchema.shape.locator_error
    .unwrap()
    .pick({ reason: true })
    .optional(),
  submission_diagnostics: BrowserAuthHandoff.SubmissionDiagnosticsSchema.pick({
    request_id: true,
    submission_mode: true,
  })
    .extend({
      terminal_rejection: BrowserAuthHandoff.SubmissionRejectionSchema.pick({
        reason: true,
        request_class: true,
        submission_phase: true,
      }).optional(),
    })
    .optional(),
});
function field(value: unknown, key: string) {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Attributes)[key]
    : undefined;
}
function stringField(value: unknown, key: string) {
  const result = field(value, key);
  return typeof result === "string" ? result : undefined;
}
function numberField(value: unknown, key: string) {
  const result = field(value, key),
    number = typeof result === "string" ? Number(result) : result;
  return typeof number === "number" && Number.isFinite(number)
    ? number
    : undefined;
}
function origin(value: string | undefined) {
  if (value != null)
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:"
        ? url.origin
        : url.protocol.replace(/:$/, "");
    } catch {}
}
function stringCount(value: unknown, seen = new Set<object>()): number {
  if (typeof value === "string") return value.length;
  if (value == null || typeof value !== "object" || seen.has(value)) return 0;
  seen.add(value);
  return (Array.isArray(value) ? value : Object.values(value)).reduce(
    (total, item) => total + stringCount(item, seen),
    0,
  );
}
function characters(value: unknown) {
  return { "browser_use.result.character_count": stringCount(value) };
}
function authResult(value: unknown): Attributes {
  const parsed = handoffResult.safeParse(value);
  if (!parsed.success) return { "browser_use.auth.outcome": "unknown" };
  const {
    status,
    reason,
    locator_error,
    submission_diagnostics: diagnostics,
  } = parsed.data;
  const rejection = diagnostics?.terminal_rejection;
  return {
    "browser_use.auth.outcome": status,
    "browser_use.auth.reason": reason ?? locator_error?.reason,
    "browser_use.auth.submission.request_id": diagnostics?.request_id,
    "browser_use.auth.submission.mode": diagnostics?.submission_mode,
    "browser_use.auth.submission.rejection.reason": rejection?.reason,
    "browser_use.auth.submission.rejection.request_class":
      rejection?.request_class,
    "browser_use.auth.submission.rejection.phase": rejection?.submission_phase,
  };
}
const commands: Record<string, CommandTrace> = {
  [ManualHandoff.commandType]: {
    name: "browser_use.tab.takeover",
    attrs: (value) => ({
      "browser_use.tab.takeover.reason":
        ManualHandoff.ReasonSchema.safeParse(field(value, "reason")).data ??
        "unknown",
    }),
  },
  [BrowserAuthHandoff.commandType]: {
    name: "browser_use.auth.attempt",
    attrs: (value) => ({
      "url.origin": origin(stringField(value, "origin")),
      "browser_use.auth.submit_requested": field(value, "submit") != null,
      "browser_use.auth.outcome": "error",
    }),
    resultAttrs: authResult,
  },
  cua_click: { action: "click", name: "browser_use.tab.click" },
  cua_double_click: { action: "dblclick", name: "browser_use.tab.click" },
  cua_type: { action: "type", name: "browser_use.tab.type" },
  navigate_tab_url: {
    attrs: (value) => ({ "url.origin": origin(stringField(value, "url")) }),
    name: "browser_use.tab.goto",
  },
  dom_cua_get_visible_dom: {
    name: "browser_use.command.execute",
    resultAttrs: (value) => characters(typeof value === "string" ? value : ""),
  },
  playwright_dom_snapshot: {
    attrs: () => ({
      "browser_use.playwright.snapshot.mode": "ai",
      "browser_use.playwright.snapshot.target": "body_or_document",
    }),
    name: "browser_use.playwright.dom_snapshot",
    operation: "dom_snapshot",
    resultAttrs: (value) => {
      const text = stringField(value, "dom_snapshot") ?? "";
      return {
        "browser_use.playwright.snapshot.length": text.length,
        "browser_use.playwright.snapshot.line_count":
          text === "" ? 0 : text.split("\n").length,
      };
    },
  },
  playwright_evaluate: {
    name: "browser_use.command.execute",
    resultAttrs: (value) => characters(field(value, "value")),
  },
  playwright_locator_all_text_contents: {
    name: "browser_use.command.execute",
    resultAttrs: (value) => characters(field(value, "values")),
  },
  playwright_locator_click: { action: "click", name: "browser_use.tab.click" },
  playwright_locator_dblclick: {
    action: "dblclick",
    name: "browser_use.tab.click",
  },
  playwright_locator_fill: { action: "fill", name: "browser_use.tab.type" },
  playwright_locator_get_attribute: {
    name: "browser_use.command.execute",
    resultAttrs: (value) => characters(stringField(value, "value") ?? ""),
  },
  playwright_locator_inner_text: {
    name: "browser_use.command.execute",
    resultAttrs: (value) => characters(stringField(value, "value") ?? ""),
  },
  playwright_locator_press: { action: "press", name: "browser_use.tab.type" },
  playwright_locator_press_sequentially: {
    action: "press_sequentially",
    name: "browser_use.tab.type",
  },
  playwright_locator_read_all: {
    name: "browser_use.command.execute",
    resultAttrs: (value) => characters(field(value, "values")),
  },
  playwright_locator_set_checked: {
    action: "set_checked",
    name: "browser_use.tab.click",
  },
  playwright_locator_text_content: {
    name: "browser_use.command.execute",
    resultAttrs: (value) => characters(stringField(value, "value") ?? ""),
  },
  tab_screenshot: { name: "browser_use.tab.screenshot" },
  tabs_content: {
    name: "browser_use.command.execute",
    resultAttrs: (value) => {
      const results = field(value, "results");
      return characters(
        (Array.isArray(results) ? results : []).map(
          (result) => stringField(result, "content") ?? "",
        ),
      );
    },
  },
  playwright_wait_for_load_state: {
    attrs: (value) => ({ "load.state": stringField(value, "state") ?? "load" }),
    name: "browser_use.tab.wait_for_load_state",
  },
  playwright_wait_for_timeout: { name: "browser_use.tab.wait_for_timeout" },
};
/** Original Lx: retain primitive attributes, including non-finite numbers. */
function attributes(value: Attributes) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) =>
        typeof item === "boolean" ||
        typeof item === "number" ||
        typeof item === "string",
    ),
  );
}
/** Original mn/Ele/I6. Host telemetry is a capability; there is no new tracing SDK. */
export function createBrowserPerformanceSpan(
  getTelemetry: () => Telemetry | undefined = () =>
    (globalThis as any).nodeRepl?.telemetry,
) {
  const context = new AsyncLocalStorage<{
    commandType: string;
    playwrightOperation: string;
  }>();
  const noop: Span = { end() {} };
  function start(name: string, attrs: Attributes) {
    try {
      return getTelemetry()?.startSpan(name, attributes(attrs)) ?? noop;
    } catch {
      return noop;
    }
  }
  function end(span: Span, result: Parameters<Span["end"]>[0]) {
    try {
      span.end(result);
    } catch {}
  }
  async function withSpan<T>(
    name: string,
    attrs: Attributes,
    run: () => Promise<T>,
    options: SpanOptions<T> = {},
  ) {
    const filtered = attributes(attrs),
      telemetry = getTelemetry();
    if (telemetry?.withSpan)
      return await telemetry.withSpan(name, filtered, run, options);
    const span = start(name, filtered);
    try {
      const value = await run();
      end(span, {
        attrs: attributes(options.resultAttrs?.(value) ?? {}),
        status: "ok",
      });
      return value;
    } catch (error) {
      end(span, {
        attrs: {
          "error.kind":
            error instanceof Error && error.name ? error.name : typeof error,
        },
        status: "error",
      });
      throw error;
    }
  }
  async function withCommandTelemetry<T>(
    commandType: string,
    payload: unknown,
    run: () => Promise<T>,
    metadata?: Attributes,
  ) {
    const command = commands[commandType];
    return await context.run(
      { commandType, playwrightOperation: command?.operation ?? commandType },
      async () =>
        await withSpan(
          command?.name ?? "browser_use.command.execute",
          {
            "browser.action": command?.action,
            "browser_use.command.type": commandType,
            "browser_use.playwright.operation": command?.operation,
            "browser_use.session.id": metadata?.session_id,
            "browser_use.turn.id": metadata?.turn_id,
            "browser_use.tab.id": numberField(payload, "tab_id"),
            "tab.id": numberField(payload, "tab_id"),
            timeout_ms: numberField(payload, "timeout_ms"),
            ...command?.attrs?.(payload),
          },
          run,
          { resultAttrs: command?.resultAttrs },
        ),
    );
  }
  return {
    withSpan,
    withCommandTelemetry,
    currentCommandAttrs() {
      const current = context.getStore();
      return current == null
        ? {}
        : { "browser_use.command.type": current.commandType };
    },
    currentPlaywrightOperation(fallback: string) {
      return context.getStore()?.playwrightOperation ?? fallback;
    },
  };
}
export const browserPerformanceSpan = createBrowserPerformanceSpan();
