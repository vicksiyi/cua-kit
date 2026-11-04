// Node-based JSONL kernel. Start with --experimental-vm-modules.
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { parseArgs, TextDecoder, TextEncoder } from "node:util";
import { URL, URLSearchParams } from "node:url";
import vm, { SourceTextModule, SyntheticModule } from "node:vm";
import {
  createWorkerRuntime,
  makeRejectedThenable,
  trackExecBackgroundOperation,
  type ExecState,
} from "./worker_runtime";
import { type KernelBinding } from "./kernel_bindings";
import { createKernelModuleBuilder } from "./kernel_module_builder";
import { createKernelModuleResolver } from "./kernel_module_resolver";
import { createKernelModuleLoader } from "./kernel_module_loader";
type BindingModule = vm.Module & { namespace: Record<string, unknown> };
// vm contexts start with very few globals. Populate common Node/web globals
// so snippets and dependencies behave like a normal modern JS runtime.
function createRuntimeContext(
  options: vm.CreateContextOptions | undefined = undefined,
) {
  const runtimeContext = vm.createContext({}, options);
  runtimeContext.globalThis = runtimeContext;
  runtimeContext.global = runtimeContext;
  runtimeContext.Buffer = Buffer;
  runtimeContext.console = console;
  runtimeContext.URL = URL;
  runtimeContext.URLSearchParams = URLSearchParams;
  if (typeof TextEncoder !== "undefined") {
    runtimeContext.TextEncoder = TextEncoder;
  }
  if (typeof TextDecoder !== "undefined") {
    runtimeContext.TextDecoder = TextDecoder;
  }
  if (typeof AbortController !== "undefined") {
    runtimeContext.AbortController = AbortController;
  }
  if (typeof AbortSignal !== "undefined") {
    runtimeContext.AbortSignal = AbortSignal;
  }
  if (typeof structuredClone !== "undefined") {
    runtimeContext.structuredClone = structuredClone;
  }
  if (typeof fetch !== "undefined") {
    runtimeContext.fetch = fetch;
  }
  if (typeof Headers !== "undefined") {
    runtimeContext.Headers = Headers;
  }
  if (typeof Request !== "undefined") {
    runtimeContext.Request = Request;
  }
  if (typeof Response !== "undefined") {
    runtimeContext.Response = Response;
  }
  if (typeof performance !== "undefined") {
    runtimeContext.performance = performance;
  }
  runtimeContext.crypto = crypto.webcrypto ?? crypto;
  runtimeContext.setTimeout = setTimeout;
  runtimeContext.clearTimeout = clearTimeout;
  runtimeContext.setInterval = setInterval;
  runtimeContext.clearInterval = clearInterval;
  runtimeContext.queueMicrotask = queueMicrotask;
  if (typeof setImmediate !== "undefined") {
    runtimeContext.setImmediate = setImmediate;
    runtimeContext.clearImmediate = clearImmediate;
  }
  runtimeContext.atob = (data: string) =>
    Buffer.from(data, "base64").toString("binary");
  runtimeContext.btoa = (data: string) =>
    Buffer.from(data, "binary").toString("base64");
  return runtimeContext;
}

const runtimeContext = createRuntimeContext({
  codeGeneration: {
    strings: false,
    wasm: false,
  },
});
const moduleContext = Object.freeze({
  context: runtimeContext,
  kind: "module",
});
const packageModuleContext = Object.freeze({
  context: runtimeContext,
  isPackage: true,
  kind: "package",
});

function defineLockedGlobal(
  runtimeContext: vm.Context,
  name: string,
  value: unknown,
) {
  Object.defineProperty(runtimeContext, name, {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

function parseKernelBootstrapArgs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      "session-id": {
        type: "string",
      },
      "working-dir": {
        type: "string",
      },
    },
  });

  const sessionId = values["session-id"] ?? null;
  const workingDir = values["working-dir"] ?? null;

  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new Error("missing --session-id");
  }
  if (typeof workingDir !== "string" || workingDir.trim().length === 0) {
    throw new Error("missing --working-dir");
  }

  return {
    sessionId,
    workingDir,
  };
}

const kernelBootstrap = (() => {
  try {
    return parseKernelBootstrapArgs(process.argv.slice(2));
  } catch (err: any) {
    console.error(
      `node_repl invalid kernel bootstrap args: ${err?.message ?? err}`,
    );
    process.exit(1);
  }
})();

/**
 * @typedef {{ name: string, kind: "const"|"let"|"var"|"function"|"class" }} Binding
 */

// REPL state model:
// - Every exec is compiled as a fresh ESM "cell".
// - `previousModule` is the most recently committed module namespace.
// - `previousBindings` tracks which top-level names should be carried forward.
// Each new cell imports a synthetic view of the previous namespace and
// redeclares those names so user variables behave like a persistent REPL.
let previousModule: BindingModule | null = null;
/** @type {Binding[]} */
let previousBindings: KernelBinding[] = [];
let cellCounter = 0;
let internalBindingCounter = 0;
const jsBanner = process.env.NODE_REPL_JS_BANNER;
delete process.env.NODE_REPL_JS_BANNER;
let jsBannerExecuted = false;
const internalBindingSalt = (() => {
  const raw = kernelBootstrap.sessionId;
  const sanitized = raw.replace(/[^A-Za-z0-9_$]/g, "_");
  return sanitized || "session";
})();
let fatalExitScheduled = false;

try {
  process.chdir(kernelBootstrap.workingDir);
} catch (err: any) {
  console.error(
    `node_repl failed to switch to working directory "${kernelBootstrap.workingDir}": ${err?.message ?? err}`,
  );
  process.exit(1);
}

let trustedServiceRequestCounter = 0;
const cwd = process.cwd();
// Use Node's standard temp-dir resolution. Sandboxed launches redirect it by
// setting TMPDIR/TMP/TEMP to the writable workspace root before Node starts.
const tmpDir = os.tmpdir();
const homeDir = process.env.HOME ?? null;
const untrustedEnv = freezeEnvSnapshot(
  pickEnv(process.env, process.env.NODE_REPL_UNTRUSTED_ENV_ALLOWLIST),
);
const runtime = createWorkerRuntime({
  audioEnabled: process.env.NODE_REPL_ENABLE_AUDIO === "1",
  cwd,
  env: untrustedEnv,
  homeDir,
  tmpDir,
});
const {
  drainExecBackgroundTasks,
  execContext,
  getErrorKind,
  nodeRepl,
  pendingRequests,
  send,
  withErrorKind,
} = runtime;
const { getCurrent: getCurrentExecState } = execContext;

function freezeEnvSnapshot(sourceEnv: Record<string, string | undefined>) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(sourceEnv).filter(
        ([, value]) => typeof value === "string",
      ),
    ),
  );
}

function pickEnv(
  sourceEnv: Record<string, string | undefined>,
  allowlist: string | undefined,
) {
  const allowedNames = new Set(
    (allowlist ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  return Object.fromEntries(
    [...allowedNames]
      .map((name) => [name, sourceEnv[name]])
      .filter(([, value]) => typeof value === "string"),
  );
}

const resolver = createKernelModuleResolver({ cwd, withErrorKind });
const { setImportMeta, resolveSpecifier, addModuleSearchBase } = resolver;
const loader = createKernelModuleLoader({ resolver, packageModuleContext });
const { clearLocalFileModuleCaches, importResolved } = loader;
const { buildModuleSource, canReadCommittedBinding, collectCommittedBindings } =
  createKernelModuleBuilder({
    getPreviousState: () => ({ previousModule, previousBindings }),
    nextInternalBindingName: () =>
      `__codex_internal_commit_${internalBindingSalt}_${internalBindingCounter++}`,
  });
function formatErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return error.message ? String(error.message) : String(error);
  }
  return String(error);
}

function sendFatalExecResultSync(
  kind: string,
  error: unknown,
  errorKind: string,
) {
  if (!execContext.activeId) {
    return;
  }
  const payload = {
    type: "exec_result",
    id: execContext.activeId,
    ok: false,
    output: "",
    error: `node_repl kernel ${kind}: ${formatErrorMessage(error)}; kernel reset. Catch or handle async errors (including Promise rejections and EventEmitter 'error' events) to avoid kernel termination.`,
    error_kind: getErrorKind(error, errorKind),
  };
  try {
    fs.writeSync(process.stdout.fd, `${JSON.stringify(payload)}\n`);
  } catch {
    // Best effort only; the host will still surface stdout EOF diagnostics.
  }
}

function scheduleFatalExit(kind: string, error: unknown, errorKind: string) {
  if (fatalExitScheduled) {
    process.exitCode = 1;
    return;
  }
  fatalExitScheduled = true;
  sendFatalExecResultSync(kind, error, errorKind);

  try {
    fs.writeSync(
      process.stderr.fd,
      `node_repl kernel ${kind}: ${formatErrorMessage(error)}\n`,
    );
  } catch {
    // ignore
  }

  // The host will observe stdout EOF, reset kernel state, and restart on demand.
  setImmediate(() => {
    process.exit(1);
  });
}

function renderOutputEvents(outputEvents: Record<string, any>[]) {
  let output = "";
  let lastDefaultKind;
  const named = new Map();
  for (const event of outputEvents) {
    if (event.item_id !== undefined) {
      named.set(event.item_id, (named.get(event.item_id) ?? "") + event.text);
      continue;
    }
    output += event.text;
    if (event.kind === "line") {
      output += "\n";
    }
    lastDefaultKind = event.kind;
  }
  if (lastDefaultKind === "line" && output.endsWith("\n")) {
    output = output.slice(0, -1);
  }
  return { output, named_outputs: [...named.values()] };
}

function withCapturedConsole<T>(ctx: vm.Context, fn: () => Promise<T>) {
  const original = ctx.console ?? console;
  ctx.console = runtime.createConsole(original);
  return fn().finally(() => {
    ctx.console = original;
  });
}

async function runAfterSubmittedCode(execState: ExecState) {
  send({
    type: "submitted_code_complete",
    exec_id: execState.id,
    execution_duration_ms: execState.submittedCodeExecutionMs,
  });
  if (process.env.NODE_REPL_TRUSTED_RPC_ENABLED === "1") {
    try {
      await requestTrustedWorker(execState, "trusted_service_hooks", {});
    } catch {
      // Hooks are best-effort side effects.
    }
  }
}

function requestTrustedWorker(
  execState: ExecState,
  type: string,
  payload: Record<string, unknown>,
) {
  const id = `${execState.id}-trusted-rpc-${trustedServiceRequestCounter++}`;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, (response) => {
      for (const output of (response.output ?? []) as Record<
        string,
        unknown
      >[]) {
        execState.outputEvents.push(output);
      }
      execState.contentItems.push(
        ...((response.content_items ?? []) as unknown[]),
      );
      if (!response.ok) {
        reject(
          withErrorKind(
            new Error(response.error || "Trusted RPC request failed"),
            response.error_kind,
          ),
        );
        return;
      }
      resolve(response.value);
    });
    try {
      send({ type, id, exec_id: execState.id, ...payload });
    } catch (error) {
      pendingRequests.delete(id);
      reject(error);
    }
  });
}

if (process.env.NODE_REPL_TRUSTED_RPC_ENABLED === "1") {
  (nodeRepl as typeof nodeRepl & { rpc: unknown }).rpc = function rpc(
    service: unknown,
    request: unknown,
  ) {
    let execState;
    try {
      execState = getCurrentExecState();
      if (typeof service !== "string" || service.length === 0) {
        throw new Error("nodeRepl.rpc expected a nonempty service identifier");
      }
      if (
        request === undefined ||
        typeof request === "function" ||
        typeof request === "symbol"
      ) {
        throw new Error("nodeRepl.rpc expected a JSON-serializable request");
      }
    } catch (error) {
      return makeRejectedThenable(error);
    }

    const operation = requestTrustedWorker(
      execState,
      "trusted_service_request",
      {
        service,
        request,
      },
    );
    return trackExecBackgroundOperation(execState, operation);
  };
}
Object.freeze(nodeRepl);

defineLockedGlobal(runtimeContext, "nodeRepl", nodeRepl);
defineLockedGlobal(runtimeContext, "tmpDir", tmpDir);

async function handleExec(message: Record<string, any>) {
  clearLocalFileModuleCaches();
  execContext.activate(message.id);
  const execState = runtime.createExecState(message, {
    submittedCodeExecutionMs: null,
  });

  let module: BindingModule | null = null;
  /** @type {Binding[]} */
  let currentBindings: KernelBinding[] = [];
  /** @type {Binding[]} */
  let nextBindings: KernelBinding[] = [];
  /** @type {Binding[]} */
  let priorBindings = previousBindings;
  let moduleLinked = false;
  let preludeCompleted = false;
  const committedCurrentBindingNames = new Set<string>();
  const markCommittedBindings = (...names: string[]) => {
    for (const name of names) {
      committedCurrentBindingNames.add(name);
    }
  };
  const markPreludeCompleted = () => {
    preludeCompleted = true;
  };

  try {
    const code = typeof message.code === "string" ? message.code : "";
    const builtSource = await buildModuleSource(code);
    const banner =
      !jsBannerExecuted && jsBanner?.trim()
        ? `await (async () => {\n${jsBanner}\n})();\nimport.meta.__codexInternalMarkBannerExecuted();\n`
        : "";
    const source = `${banner}${builtSource.source}`;
    currentBindings = builtSource.currentBindings;
    nextBindings = builtSource.nextBindings;
    priorBindings = builtSource.priorBindings;
    send({
      type: "exec_redacted_source",
      id: message.id,
      source: builtSource.redactedSource,
    });
    // AsyncLocalStorage keeps the current tool-call state available to helper
    // methods and async callbacks without exposing mutable host bookkeeping.
    await execContext.run(execState, async () => {
      await withCapturedConsole(runtimeContext, async () => {
        const cellIdentifier = path.join(
          cwd,
          `.node_repl_cell_${cellCounter++}.mjs`,
        );
        module = new SourceTextModule(source, {
          context: runtimeContext,
          identifier: cellIdentifier,
          initializeImportMeta(
            meta: ImportMeta & {
              __codexInternalMarkCommittedBindings?: (
                ...names: string[]
              ) => void;
              __codexInternalMarkPreludeCompleted?: () => void;
              __codexInternalMarkBannerExecuted?: () => void;
            },
            mod,
          ) {
            setImportMeta(meta, mod, moduleContext, true);
            meta.__codexInternalMarkCommittedBindings = markCommittedBindings;
            meta.__codexInternalMarkPreludeCompleted = markPreludeCompleted;
            if (banner) {
              meta.__codexInternalMarkBannerExecuted = () => {
                jsBannerExecuted = true;
                delete meta.__codexInternalMarkBannerExecuted;
              };
            }
          },
          importModuleDynamically(specifier, referrer) {
            return importResolved(
              resolveSpecifier(specifier, referrer?.identifier, moduleContext),
              moduleContext,
            ) as unknown as Promise<vm.Module>;
          },
        }) as unknown as BindingModule;

        await module.link(async (specifier) => {
          if (specifier === "@prev" && previousModule) {
            const exportNames = previousBindings.map((b) => b.name);
            // Build a synthetic module snapshot of the prior cell's exports.
            // This is the bridge that carries values from cell N to cell N+1.
            const synthetic = new SyntheticModule(
              exportNames,
              function initSynthetic() {
                for (const binding of previousBindings) {
                  this.setExport(
                    binding.name,
                    previousModule!.namespace[binding.name],
                  );
                }
              },
              { context: runtimeContext },
            );
            return synthetic;
          }
          throw withErrorKind(
            new Error(
              `Top-level static import "${specifier}" is not supported in node_repl. Use await import("${specifier}") instead.`,
            ),
            "import_error",
          );
        });
        moduleLinked = true;

        const submittedCodeStartedAtMs = performance.now();
        try {
          for (const name of builtSource.warnedConstNames) {
            runtimeContext.console.warn(
              `Warning: ${name} was declared with const; use let for reassignable variables.`,
            );
          }
          await module.evaluate();
        } finally {
          execState.submittedCodeExecutionMs = Math.round(
            performance.now() - submittedCodeStartedAtMs,
          );
        }
        await drainExecBackgroundTasks(execState);
        await runAfterSubmittedCode(execState);
      });
    });

    previousModule = module;
    previousBindings = nextBindings;
    send({
      type: "exec_result",
      content_items: execState.contentItems,
      id: message.id,
      ok: true,
      ...renderOutputEvents(execState.outputEvents),
      error: null,
    });
  } catch (error: any) {
    // An error skips the happy-path drain. Let tracked submitted-code work
    // settle before ending its timeout phase.
    try {
      await drainExecBackgroundTasks(execState);
    } catch {}
    // The execution context and console capture unwound with the error. Restore
    // them so trusted service hooks run and keep console output captured.
    await execContext.run(execState, () =>
      withCapturedConsole(runtimeContext, () =>
        runAfterSubmittedCode(execState),
      ),
    );
    const { bindings: committedBindings, committedCurrentBindingCount } =
      collectCommittedBindings(
        moduleLinked ? module : null,
        priorBindings,
        currentBindings,
        committedCurrentBindingNames,
      );
    // Preserve the last successfully linked module across link-time failures.
    // A module whose link step failed cannot safely back @prev because reading
    // its namespace throws before evaluation ever begins. Likewise, if a
    // linked module failed before its prelude recreated carried bindings, keep
    // the old module so @prev still points at the last cell whose prelude and
    // body actually established the carried values. Once the prelude has run,
    // promote the failed module even if it only updated existing bindings.
    if (
      module &&
      moduleLinked &&
      (committedCurrentBindingCount > 0 ||
        (preludeCompleted && priorBindings.length > 0))
    ) {
      const shadowedUncommittedBindings = new Set(
        currentBindings
          .filter(
            (binding) =>
              priorBindings.some((prior) => prior.name === binding.name) &&
              !committedCurrentBindingNames.has(binding.name) &&
              !canReadCommittedBinding(module, binding),
          )
          .map((binding) => binding.name),
      );

      if (shadowedUncommittedBindings.size > 0) {
        const priorModule = previousModule;
        const recoveredModule = new SyntheticModule(
          committedBindings.map((binding) => binding.name),
          function initSynthetic() {
            for (const binding of committedBindings) {
              this.setExport(
                binding.name,
                shadowedUncommittedBindings.has(binding.name)
                  ? priorModule!.namespace[binding.name]
                  : module!.namespace[binding.name],
              );
            }
          },
          { context: runtimeContext },
        );
        await recoveredModule.link(() => {
          throw new Error("Recovered REPL bindings must not import modules");
        });
        await recoveredModule.evaluate();
        previousModule = recoveredModule as unknown as BindingModule;
      } else {
        previousModule = module;
      }
      previousBindings = committedBindings;
    }
    send({
      type: "exec_result",
      content_items: execState.contentItems,
      id: message.id,
      ok: false,
      ...renderOutputEvents(execState.outputEvents),
      error: error && error.message ? error.message : String(error),
      error_kind: getErrorKind(error),
    });
  } finally {
    execContext.clear(message.id);
  }
}

let queue = Promise.resolve();

process.on("uncaughtException", (error) => {
  scheduleFatalExit("uncaught exception", error, "uncaught_exception");
});

process.on("unhandledRejection", (reason) => {
  scheduleFatalExit("unhandled rejection", reason, "unhandled_rejection");
});

runtime.listen((message) => {
  if (message.type === "exec") {
    queue = queue.then(() => handleExec(message));
    return;
  }
  if (message.type === "add_node_module_dir") {
    addModuleSearchBase(message.path);
    return;
  }
  runtime.settle(message);
});
