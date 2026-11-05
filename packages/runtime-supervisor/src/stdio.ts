/** Standalone MCP transport lifecycle; deliberately requires explicit worker/host policy. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Readable, Writable } from "node:stream";
import { createSupervisorMcpServer } from "./mcp";
import type { SessionOptions } from "./session";
export async function serveSupervisorStdio(
  options: SessionOptions,
  io: {
    stdin?: Readable;
    stdout?: Writable;
    signals?: boolean;
    onError?: (error: Error) => void;
  } = {},
) {
  const input = io.stdin ?? process.stdin,
    output = io.stdout ?? process.stdout;
  const runtime = createSupervisorMcpServer(options);
  const transport = new StdioServerTransport(input, output, {
    maxBufferSize: 16 * 1024 * 1024,
  });
  let closing: Promise<void> | undefined;
  let resolveClosed!: () => void, rejectClosed!: (error: unknown) => void;
  const closed = new Promise<void>((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });
  void closed.catch(() => {});
  const report = (error: unknown) => {
    const normalized = error instanceof Error ? error : Error(String(error));
    try {
      io.onError?.(normalized);
    } catch {
      /* Diagnostics cannot prevent teardown. */
    }
  };
  const shutdown = () => {
    void close().catch(report);
  };
  const fail = (error: Error) => {
    report(error);
    shutdown();
  };
  const close = () => {
    if (!closing)
      closing = Promise.resolve().then(async () => {
        try {
          await runtime.close();
        } finally {
          input.off("end", shutdown);
          input.off("close", shutdown);
          input.off("error", fail);
          output.off("error", fail);
          if (io.signals !== false) {
            process.off("SIGINT", shutdown);
            process.off("SIGTERM", shutdown);
          }
        }
      });
    void closing.then(resolveClosed, rejectClosed);
    return closing;
  };
  const onclose = runtime.server.onclose;
  runtime.server.onclose = () => {
    onclose?.();
    shutdown();
  };
  runtime.server.onerror = report;
  input.on("end", shutdown);
  input.on("close", shutdown);
  input.on("error", fail);
  output.on("error", fail);
  if (io.signals !== false) {
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
  try {
    await runtime.server.connect(transport);
  } catch (error) {
    await close();
    throw error;
  }
  return { close, closed };
}
