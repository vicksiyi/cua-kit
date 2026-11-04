/** Original TS/vg/Pw in the extension kernel-host build. These intentionally do not
 * collect telemetry or use Node AsyncLocalStorage; browser entrypoint Sentry is separate. */
export const kernelErrorReporter = {
  captureException(..._args: unknown[]) {},
  setUser(..._args: unknown[]) {},
  setTag(..._args: unknown[]) {},
};
export const kernelCommandTiming = {
  startCommand(..._args: unknown[]) {
    return { finish(..._args: unknown[]) {}, async run<T>(callback: () => T | Promise<T>) { return await callback(); } };
  },
  startLocatorRetry(..._args: unknown[]) { return { attemptFailed(..._args: unknown[]) {}, finish(..._args: unknown[]) {} }; },
  trackElicitation<T>(value: T): T { return value; },
};
export const kernelPerformanceSpan = {
  async withSpan<T>(_name: unknown, _attributes: unknown, callback: () => T | Promise<T>) { return await callback(); },
  async withCommandTelemetry<T>(_name: unknown, _attributes: unknown, callback: () => T | Promise<T>, ..._rest: unknown[]) { return await callback(); },
  currentCommandAttrs() { return {}; },
  currentPlaywrightOperation<T>(value: T): T { return value; },
};
