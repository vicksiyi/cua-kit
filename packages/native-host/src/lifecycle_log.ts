import { constants, openSync, fstatSync, ftruncateSync, writeSync, closeSync } from "node:fs";

export type NativeHostLifecycleEvent =
  | "starting" | "ready" | "input-ended" | "input-error" | "output-error"
  | "invalid-extension-message" | "server-error" | "client-cleanup-error"
  | "explicit-close" | "signal-SIGINT" | "signal-SIGTERM" | "startup-error";

/** Local bounded metadata only. Never serialize RPCs, URLs, capability tokens or errors. */
export function createLifecycleLog(path: string) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())) throw Error("Native host lifecycle log must be private and owned by the current user");
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  let closed = false;
  return {
    record(event: NativeHostLifecycleEvent) {
      if (closed) return;
      if (fstatSync(fd).size >= 1024 * 1024) ftruncateSync(fd, 0);
      writeSync(fd, JSON.stringify({ time: new Date().toISOString(), pid: process.pid, event }) + "\n");
    },
    close() { if (!closed) { closed = true; closeSync(fd); } },
  };
}
