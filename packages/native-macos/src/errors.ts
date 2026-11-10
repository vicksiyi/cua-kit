// Independently authored; reused from the earlier local native prototype, not vendor source.
export type ErrorCode =
  | 'TARGET_NOT_FOUND' | 'AMBIGUOUS_TARGET' | 'STALE_OBSERVATION'
  | 'PERMISSION_DENIED' | 'SCREEN_LOCKED' | 'UNSUPPORTED_CAPABILITY' | 'INVALID_ARGUMENT' | 'INVALID_STATE'
  | 'CANCELLED' | 'ACTION_OUTCOME_UNKNOWN' | 'SESSION_CLOSED'
  | 'ELEMENT_NOT_INTERACTABLE' | 'PROVIDER_DISCONNECTED'
  | 'ACCESSIBILITY_ERROR' | 'NATIVE_ERROR';

export class CuaError extends Error {
  constructor(public readonly code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CuaError';
  }
}

export function assert(condition: unknown, code: ErrorCode, message: string): asserts condition {
  if (!condition) throw new CuaError(code, message);
}

export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CuaError('CANCELLED', 'Operation cancelled before dispatch.');
}
