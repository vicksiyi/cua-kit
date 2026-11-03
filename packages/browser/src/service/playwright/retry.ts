import { LocatorError } from "../errors/locator_error";
import { assertSelectorDeadline } from "./execution_state";
import type { ExecutionOptions } from "./execution_state";
export interface LocatorTiming {
  startLocatorRetry(): {
    finish(status: "success" | "timeout"): unknown;
    attemptFailed(): unknown;
  };
}
/** Original sg/eS/EF. */
export function isTerminalSelectorError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error);
  return (
    message.includes("strict mode violation:") ||
    message.includes("is restricted for this document.") ||
    message.includes("MCP App document was replaced")
  );
}
export function selectorDeadline<T extends ExecutionOptions>(
  options: T,
  startedAt: number,
  timeoutMs: number,
): T {
  const deadline = startedAt + timeoutMs;
  return timeoutMs <= 0 ||
    (options.deadlineMs != null && options.deadlineMs <= deadline)
    ? options
    : { ...options, deadlineMs: deadline };
}
export function selectorRetryDelay(options: ExecutionOptions) {
  return options.deadlineMs == null
    ? 100
    : Math.max(1, Math.min(100, options.deadlineMs - Date.now()));
}
/** Original Qv: telemetry and error boundaries are intentionally distinct for timeout vs deadline. */
export async function retryLocator<T>(
  selector: string,
  run: () => Promise<T>,
  options: ExecutionOptions & {
    retry?: boolean;
    startedAt: number;
    timeoutMs: number;
  },
  timing: LocatorTiming,
): Promise<T> {
  const tracker =
    options.retry !== false ? timing.startLocatorRetry() : undefined;
  try {
    for (;;) {
      assertSelectorDeadline(options);
      try {
        const result = await run();
        tracker?.finish("success");
        return result;
      } catch (error) {
        if (isTerminalSelectorError(error) || options.retry === false)
          throw error;
        tracker?.attemptFailed();
        if (Date.now() - options.startedAt >= options.timeoutMs) {
          tracker?.finish("timeout");
          const message =
            error instanceof Error ? error.message : String(error);
          throw new LocatorError(
            "locator_timeout",
            `Timed out after ${options.timeoutMs}ms waiting for selector ${selector}: ${message}`,
            { cause: error },
          );
        }
        assertSelectorDeadline(options);
        await new Promise<void>((resolve) =>
          setTimeout(resolve, selectorRetryDelay(options)),
        );
      }
    }
  } catch (error) {
    if (
      error instanceof LocatorError &&
      error.code === "selector_deadline_exceeded" &&
      options.timeoutMs > 0 &&
      options.deadlineMs === options.startedAt + options.timeoutMs
    )
      tracker?.finish("timeout");
    throw error;
  }
}
