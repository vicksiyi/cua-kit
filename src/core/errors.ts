export type ErrorCode =
  | 'TARGET_NOT_FOUND' | 'AMBIGUOUS_TARGET' | 'STALE_OBSERVATION'
  | 'PERMISSION_DENIED' | 'UNSUPPORTED_CAPABILITY' | 'INVALID_ARGUMENT'
  | 'CANCELLED' | 'ACTION_OUTCOME_UNKNOWN' | 'SESSION_CLOSED'
  | 'ELEMENT_NOT_INTERACTABLE' | 'PROVIDER_DISCONNECTED';

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
