import { AsyncLocalStorage } from "node:async_hooks";
type RetryOutcome = "success" | "timeout";
interface RetryStats {
  startedCount: number;
  success: { count: number; elapsedMs: number };
  timeout: { count: number; elapsedMs: number };
}
interface CommandState {
  startedAt: number;
  elapsedElicitationMs: number;
  locatorRetry?: RetryStats;
}
/** Original Vx/$6/cce/dce/pce. Each factory owns one asynchronous command context. */
export function createCommandTiming(
  now: () => number = () => performance.now(),
) {
  const storage = new AsyncLocalStorage<CommandState>();
  return {
    startCommand(
      command: string,
      emit: (
        event: string,
        command: string,
        attributes: Record<string, unknown>,
      ) => unknown,
    ) {
      const state: CommandState = { elapsedElicitationMs: 0, startedAt: now() };
      return {
        finish(outcome: string) {
          const retry = state.locatorRetry;
          emit("browser_use_agent_command", command, {
            duration_ms: Math.round(
              Math.max(0, now() - state.startedAt - state.elapsedElicitationMs),
            ),
            outcome,
            ...(retry == null
              ? {}
              : {
                  locator_retry_started_count: retry.startedCount,
                  locator_retry_success_count: retry.success.count,
                  locator_retry_success_elapsed_ms: Math.round(
                    retry.success.elapsedMs,
                  ),
                  locator_retry_timeout_count: retry.timeout.count,
                  locator_retry_timeout_elapsed_ms: Math.round(
                    retry.timeout.elapsedMs,
                  ),
                }),
          });
        },
        async run<T>(run: () => Promise<T> | T): Promise<T> {
          return await storage.run(state, run);
        },
      };
    },
    startLocatorRetry() {
      const state = storage.getStore();
      let startedAt: number | undefined;
      let finished = false;
      return {
        attemptFailed() {
          if (finished || state == null || startedAt != null) return;
          startedAt = now();
          state.locatorRetry = state.locatorRetry || {
            startedCount: 0,
            success: { count: 0, elapsedMs: 0 },
            timeout: { count: 0, elapsedMs: 0 },
          };
          state.locatorRetry.startedCount++;
        },
        finish(outcome: RetryOutcome) {
          if (finished) return;
          finished = true;
          const retry = state?.locatorRetry;
          if (retry == null || startedAt == null) return;
          retry[outcome].count++;
          retry[outcome].elapsedMs += now() - startedAt;
        },
      };
    },
    trackElicitation<T, R>(run: (value: T) => Promise<R> | R) {
      return async (value: T): Promise<R> => {
        const state = storage.getStore();
        if (state == null) return await run(value);
        const startedAt = now();
        try {
          return await run(value);
        } finally {
          state.elapsedElicitationMs += now() - startedAt;
        }
      };
    },
  };
}
export const commandTiming = createCommandTiming();
