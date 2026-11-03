export interface CdpDeadlineOptions {
  deadlineMs?: number;
  timeoutMs?: number;
  beforeDispatch?: () => unknown;
}
/** Original Cv/eu. One shared setup token is used by attachment and dispatch. */
export const CDP_DEADLINE_MESSAGE =
  "CDP operation exceeded its deadline before command dispatch";
export const tabAttachmentSetup = Symbol("tab attachment setup");
/** Original Lh. */
export function isDeadlineError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /(?:deadline|timed out)/i.test(message);
}
/** Original $t. */
export function assertCdpDeadline(options: CdpDeadlineOptions) {
  if (options.deadlineMs != null && Date.now() >= options.deadlineMs)
    throw new Error(CDP_DEADLINE_MESSAGE);
}
/** Original Av. */
export function remainingCdpTimeout(options: CdpDeadlineOptions) {
  assertCdpDeadline(options);
  if (options.deadlineMs == null) return options.timeoutMs;
  const remaining = options.deadlineMs - Date.now();
  return Math.max(1, Math.min(options.timeoutMs ?? remaining, remaining));
}
/** Original tu. beforeDispatch runs before the final deadline calculation. */
export function dispatchTimeout(options: CdpDeadlineOptions) {
  options.beforeDispatch?.();
  return remainingCdpTimeout(options);
}
/** Original jN. */
export async function prepareCdpDispatch<T>(
  options: CdpDeadlineOptions,
  prepare: () => Promise<T>,
) {
  assertCdpDeadline(options);
  return await awaitCdpDeadline(prepare(), options);
}
/** Original Pv. Expired work remains handled; racing does not cancel the underlying operation. */
export async function awaitCdpDeadline<T>(
  operation: Promise<T>,
  options: CdpDeadlineOptions,
): Promise<T> {
  if (options.deadlineMs == null) return await operation;
  const remaining = options.deadlineMs - Date.now();
  if (remaining <= 0) {
    operation.catch(() => {});
    throw new Error(CDP_DEADLINE_MESSAGE);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(CDP_DEADLINE_MESSAGE)),
      remaining,
    );
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}
