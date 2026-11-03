/** Reconstructed from duration_seconds.js; validation order and error text preserved. */
export function duration_seconds(durationMs: number): number {
  if (!(
    Number.isSafeInteger(durationMs) &&
    durationMs >= 0 &&
    durationMs <= 30000
  )) {
    throw new Error(
      "durationMs must be an integer from 0 to 30000 milliseconds.",
    );
  }
  return durationMs / 1000;
}
