import { SerialQueue } from './serial.js';
export interface ClipboardContent { text: string; html?: string }
export interface ClipboardBackend {
  acquire(content: ClipboardContent): Promise<{ restore(): Promise<boolean> }>;
}
/** One process-wide critical section across browser/app sessions sharing a system clipboard. */
const clipboardQueue = new SerialQueue();
/** Caller scheduling only; native operations own their clipboard transaction. */
export function runClipboardOperation<T>(operation: () => Promise<T>): Promise<T> {
  return clipboardQueue.run(operation);
}
export function withClipboard<T>(backend: ClipboardBackend, content: ClipboardContent, fn: () => Promise<T>, beforeAcquire?: () => Promise<void>): Promise<{ result: T; restored: boolean }> {
  return runClipboardOperation(async () => {
    await beforeAcquire?.();
    const lease = await backend.acquire(content);
    let result: T;
    try { result = await fn(); }
    catch (error) {
      try { await lease.restore(); } catch (restoreError) { throw new AggregateError([error,restoreError],'Paste failed and clipboard restoration failed.'); }
      throw error;
    }
    return { result, restored: await lease.restore() };
  });
}
