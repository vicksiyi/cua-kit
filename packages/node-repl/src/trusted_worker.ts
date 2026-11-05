import { createPrivateKey, type KeyObject } from "node:crypto";
// Trusted service host. JSONL stdout belongs to the supervisor.
import { Console } from "node:console";
import { realpathSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPrivilegedWorkerRuntime } from "./privileged_runtime";
import { createResponseMetaTracer } from "./tracing";
import { createWorkerRuntime } from "./worker_runtime";

interface ServiceHandler {
  handleRpc(request: unknown): unknown | Promise<unknown>;
  classifyError?: (error: unknown) => unknown | Promise<unknown>;
}
// Incoming JSONL fields are intentionally not prevalidated: the original host
// dispatches their values directly to the runtime and configured service.
type HostMessage = Record<string, any> & { id: unknown };
type SetErrorKind = (kind: unknown) => void;

process.chdir(process.argv[2]);

const stderrConsole = new Console(process.stderr);

// The Windows realpath fallback may preserve a verbatim prefix on only one side.
const canonicalPath = (filename: string) =>
  path.toNamespacedPath(realpathSync.native(filename));

const configuredServices = JSON.parse(process.env.NODE_REPL_TRUSTED_SERVICES!);
const handlers = new Map<unknown, Promise<ServiceHandler>>();
const moduleSearchPaths = (process.env.NODE_REPL_NODE_MODULE_DIRS ?? "")
  .split(path.delimiter)
  .filter(Boolean);
const trustedCodeRoots = (process.env.NODE_REPL_TRUSTED_CODE_PATHS ?? "")
  .split(path.delimiter)
  .filter((entry) => path.isAbsolute(entry))
  .flatMap((root) => {
    try {
      // Native realpath accepts Windows verbatim paths and expands short aliases.
      return [canonicalPath(root)];
    } catch {
      return [];
    }
  });
function isTrustedCodePath(filename: string) {
  return trustedCodeRoots.some((root) => {
    const relative = path.relative(root, filename);
    return (
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    );
  });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (resolved.url.startsWith("file:")) {
      const filename = canonicalPath(fileURLToPath(resolved.url));
      if (!isTrustedCodePath(filename)) {
        throw new Error(
          `Trusted RPC dependency must resolve within a configured trusted code path: ${specifier}`,
        );
      }
      return { ...resolved, url: pathToFileURL(filename).href };
    }
    return resolved;
  },
});

const env = Object.freeze(
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([, value]) => typeof value === "string",
    ),
  ),
);
const runtime = createWorkerRuntime({
  audioEnabled: process.env.NODE_REPL_ENABLE_AUDIO === "1",
  cwd: process.cwd(),
  env,
  homeDir: process.env.HOME ?? null,
  tmpDir: os.tmpdir(),
});
const { drainExecBackgroundTasks, execContext, getErrorKind, send } = runtime;
const traceEnabled = process.env.NODE_REPL_TRACE_META === "1";
const responseMetaTracer = createResponseMetaTracer({
  enabled: traceEnabled,
  getCurrentExecState: execContext.getCurrent,
});
globalThis.console = runtime.createConsole(
  stderrConsole as unknown as Record<string, (...args: unknown[]) => unknown>,
) as unknown as typeof console;
Object.freeze(runtime.nodeRepl);
const privateKeys = new Map<string, KeyObject>();
let privateInitializationClosed = false;
const privilegedRuntime = createPrivilegedWorkerRuntime({
  privateKeys: Object.freeze({ get: (name: string) => privateKeys.get(name) }),
  env,
  runtime,
  getTelemetryBridge: () =>
    responseMetaTracer.isEnabled() ? responseMetaTracer.bridge : undefined,
});
Object.defineProperty(globalThis, "nodeRepl", {
  configurable: false,
  enumerable: false,
  value: privilegedRuntime.nodeRepl,
  writable: false,
});
Object.defineProperty(globalThis, "tmpDir", {
  configurable: false,
  enumerable: false,
  value: os.tmpdir(),
  writable: false,
});

function resolveTrustedService(configured: string) {
  if (configured.startsWith("file:") || path.isAbsolute(configured)) {
    return configured.startsWith("file:")
      ? configured
      : pathToFileURL(configured).href;
  }

  for (const configuredRoot of moduleSearchPaths) {
    try {
      const root = canonicalPath(configuredRoot);
      const resolved = canonicalPath(
        createRequire(path.join(root, "node-repl-trusted.js")).resolve(
          configured,
        ),
      );
      const relative = path.relative(root, resolved);
      if (
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      ) {
        return pathToFileURL(resolved).href;
      }
    } catch {
      // Another explicitly configured trusted root may contain the package.
    }
  }

  throw new Error(
    `Trusted RPC package must resolve within a configured trusted module directory: ${configured}`,
  );
}

async function loadHandler(service: string) {
  let handler = handlers.get(service);
  if (handler === undefined) {
    const configured = configuredServices[service];
    if (typeof configured !== "string") {
      throw new Error(`Trusted RPC service is not configured: ${service}`);
    }
    handler = responseMetaTracer.bridge.withSpan(
      "node_repl.service.load",
      { "node_repl.service": traceService(service) },
      async () => {
        const module = await import(resolveTrustedService(configured));
        if (typeof module.handleRpc !== "function") {
          throw new Error(
            `Trusted RPC service ${service} does not export handleRpc`,
          );
        }
        return {
          handleRpc: module.handleRpc,
          classifyError: module.classifyError,
        };
      },
    ) as Promise<ServiceHandler>;
    handlers.set(service, handler);
  }
  return await handler;
}

function traceService(service: unknown) {
  return service === "browser" || service === "sky" ? service : "other";
}
function traceOperation(request: any) {
  const operation = request?.type ?? request?.method;
  switch (operation) {
    case "setup":
    case "execute":
    case "drag_start":
    case "drag_move":
    case "drag_end":
      return operation;
    default:
      return "other";
  }
}

async function runInExecContext(
  message: HostMessage,
  operation: (setErrorKind: SetErrorKind) => unknown | Promise<unknown>,
) {
  const execState = runtime.createExecState(message);
  let errorKind: string | undefined;
  execContext.activate(execState.id);
  const response = {
    type: "trusted_service_response",
    id: message.id,
    output: execState.outputEvents,
    content_items: execState.contentItems,
  };
  const sendResponse = (result: Record<string, unknown>) => {
    if (message.type === "run_hooks") {
      const trace = responseMetaTracer.buildTrace(execState);
      if (trace !== null) {
        send({ type: "response_meta_trace", id: execState.id, trace });
      }
    }
    send({ ...response, ...result });
  };
  try {
    const value = await execContext.run(execState, async () => {
      const result = await operation((kind) => {
        if (typeof kind === "string" && kind !== "unknown") errorKind = kind;
      });
      if (message.type !== "run_hooks") {
        await drainExecBackgroundTasks(execState);
      }
      return result ?? null;
    });
    sendResponse({ ok: true, value });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      error_kind: errorKind ?? getErrorKind(error),
    });
  }
}

async function handleServiceRequest(message: HostMessage) {
  await runInExecContext(message, async (setErrorKind) =>
    responseMetaTracer.bridge.withSpan(
      "node_repl.service.request",
      {
        "node_repl.operation": traceOperation(message.request),
        "node_repl.service": traceService(message.service),
      },
      async () => {
        const { handleRpc, classifyError } = await loadHandler(message.service);
        try {
          return await handleRpc(message.request);
        } catch (error) {
          try {
            if (typeof classifyError === "function")
              setErrorKind(await classifyError(error));
          } catch {
            /* Classification must not replace the original failure. */
          }
          throw error;
        }
      },
    ),
  );
}

function handleNodeReplMessage(message: HostMessage) {
  if (message.type === "private_keys") {
    try {
      if (privateInitializationClosed) throw new Error();
      privateInitializationClosed = true;
      for (const [name, pem] of Object.entries(message.keys)) {
        privateKeys.set(name, createPrivateKey(pem as string));
      }
    } catch {
      stderrConsole.error("Private key initialization failed");
      process.exit(1);
    }
    return;
  }
  privateInitializationClosed = true;
  if (message.type === "service") {
    void handleServiceRequest(message);
    return;
  }
  if (message.type === "turn_ended") {
    const execState = runtime.createExecState(message);
    execContext.activate(execState.id);
    void execContext
      .run(execState, () =>
        privilegedRuntime.turnEndedHandlers.run(Object.freeze(message.event)),
      )
      .finally(() => {
        execContext.clear(execState.id);
        send({ type: "turn_ended_result", id: message.id });
      });
    return;
  }
  if (message.type === "run_hooks") {
    void runInExecContext(message, () =>
      privilegedRuntime.afterSubmittedCodeHooks.run(),
    ).finally(() => {
      execContext.clear(message.exec_id);
    });
    return;
  }
  if (!runtime.settle(message)) {
    privilegedRuntime.nativePipeBridge.handleMessage(message);
  }
}

runtime.listen(handleNodeReplMessage);
