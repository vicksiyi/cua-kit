import { SerialQueue } from './serial.js';
export interface ClipboardContent { text: string; html?: string }
export interface ClipboardBackend {
  acquire(content: ClipboardContent): Promise<{ restore(): Promise<boolean> }>;
}
/** One process-wide critical section across browser/app sessions sharing a system clipboard. */
const clipboardQueue = new SerialQueue();
export function withClipboard<T>(backend: ClipboardBackend, content: ClipboardContent, fn: () => Promise<T>, beforeAcquire?: () => Promise<void>): Promise<{ result: T; restored: boolean }> {
  return clipboardQueue.run(async () => {
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
