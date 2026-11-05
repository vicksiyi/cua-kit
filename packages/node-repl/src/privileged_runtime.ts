import type { KeyObject } from "node:crypto";
import { createPrivilegedNodeReplConfig } from "./privileged_config";
import { createLifecycleHandlers } from "./lifecycle_handlers";
import { createNativePipeBridge } from "./native_pipe_bridge";
import { createPrivilegedHostOperations } from "./privileged_host_operations";
import { isPlainObject } from "./worker_values";
import {
  makeRejectedThenable,
  trackExecBackgroundOperation,
} from "./background_operations";
import type { createWorkerRuntime, ExecState } from "./worker_runtime";
type PrivateKeys = Readonly<{ get(name: string): KeyObject | undefined }>;
type Runtime = ReturnType<typeof createWorkerRuntime>;
type HostOperations = ReturnType<typeof createPrivilegedHostOperations>;
type BridgeOptions = HostOperations & {
  addAfterSubmittedCodeHook: ReturnType<typeof createLifecycleHandlers>["add"];
  addTurnEndedHandler: ReturnType<typeof createLifecycleHandlers>["add"];
  env: Record<string, string | undefined>;
  getCurrentExecState: () => ExecState;
  nativePipe: ReturnType<typeof createNativePipeBridge>["nativePipe"];
  nodeRepl: Runtime["nodeRepl"];
  privateKeys?: PrivateKeys;
  pendingRequests: Runtime["pendingRequests"];
  send: Runtime["send"];
  getTelemetryBridge: () => unknown;
};
export type PrivilegedNodeRepl = Runtime["nodeRepl"] &
  Readonly<{
    privateKeys: PrivateKeys | undefined;
    addAfterSubmittedCodeHook: BridgeOptions["addAfterSubmittedCodeHook"];
    addTurnEndedHandler: BridgeOptions["addTurnEndedHandler"];
    gaasBrowserConfig: ExecState["gaasBrowserConfig"];
    launchServices: {
      openApplication(
        target: unknown,
      ): ReturnType<typeof trackExecBackgroundOperation<unknown>>;
    };
    config: ReturnType<typeof createPrivilegedNodeReplConfig>;
    env: BridgeOptions["env"];
    createElicitation: HostOperations["createElicitation"];
    fetch: HostOperations["authenticatedFetch"];
    setResponseMeta(meta: unknown): void;
    nativePipe: BridgeOptions["nativePipe"];
    otel: { log(name: unknown, attributes?: unknown): void };
    emitContentItem(text: unknown): void;
    withSuspendedTimeout(
      fn: unknown,
    ): ReturnType<typeof trackExecBackgroundOperation<unknown>>;
    telemetry: unknown;
  }>;
function createPrivilegedNodeReplBridge({
  addAfterSubmittedCodeHook,
  addTurnEndedHandler,
  authenticatedFetch,
  createElicitation,
  env,
  getCurrentExecState,
  nativePipe,
  nodeRepl,
  pendingRequests,
  privateKeys,
  send,
  getTelemetryBridge,
}: BridgeOptions): PrivilegedNodeRepl {
  let privilegedNodeReplRequestCounter = 0;

  function sendPrivileged(
    execState: ExecState,
    message: Record<string, unknown>,
  ) {
    send({
      ...message,
      exec_id: execState.id,
    });
  }

  function handlePrivilegedNodeReplOperation(
    operationName: string,
    buildPayload: () => Promise<Record<string, unknown>>,
  ) {
    let execState;
    try {
      execState = getCurrentExecState();
    } catch (error) {
      return makeRejectedThenable(error);
    }

    const operation = (async () => {
      const payload = await buildPayload();
      const id = `${execState.id}-privileged-node-repl-${privilegedNodeReplRequestCounter++}`;
      sendPrivileged(execState, {
        ...payload,
        id,
      });
      return new Promise((resolve, reject) => {
        pendingRequests.set(id, (res) => {
          if (!res.ok) {
            reject(new Error(res.error || `${operationName} failed`));
            return;
          }
          resolve(Object.hasOwn(res, "value") ? res.value : {});
        });
      });
    })();

    return trackExecBackgroundOperation(execState, operation);
  }

  function withSuspendedTimeout(fn: unknown) {
    let execState;
    try {
      execState = getCurrentExecState();
      if (typeof fn !== "function") {
        throw new Error("nodeRepl.withSuspendedTimeout expected a function");
      }
    } catch (error) {
      return makeRejectedThenable(error);
    }

    const operation = (async () => {
      sendPrivileged(execState, {
        type: "suspend_timeout",
      });
      try {
        return await fn();
      } finally {
        sendPrivileged(execState, {
          type: "resume_timeout",
        });
      }
    })();

    return trackExecBackgroundOperation(execState, operation);
  }

  const privilegedNodeReplConfig = createPrivilegedNodeReplConfig({
    handlePrivilegedNodeReplOperation,
    isPlainObject,
  });
  const launchServices = Object.freeze({
    openApplication(target: unknown) {
      return handlePrivilegedNodeReplOperation(
        "nodeRepl.launchServices.openApplication",
        async () => {
          const normalized = normalizeLaunchServicesTarget(
            await target,
            isPlainObject,
          );
          return {
            type: "launch_services_action",
            action: "open_application",
            application_path: normalized.applicationPath,
            bundle_identifier: normalized.bundleIdentifier,
          };
        },
      );
    },
  });

  const privilegedNodeReplProperties: PropertyDescriptorMap = {
    privateKeys: {
      configurable: false,
      enumerable: true,
      value: privateKeys,
      writable: false,
    },
    addTurnEndedHandler: {
      configurable: false,
      enumerable: true,
      value: addTurnEndedHandler,
      writable: false,
    },
    addAfterSubmittedCodeHook: {
      configurable: false,
      enumerable: true,
      value: addAfterSubmittedCodeHook,
      writable: false,
    },
    gaasBrowserConfig: {
      configurable: false,
      enumerable: true,
      get() {
        return getCurrentExecState().gaasBrowserConfig;
      },
    },
    launchServices: {
      configurable: false,
      enumerable: true,
      value: launchServices,
      writable: false,
    },
    config: {
      configurable: false,
      enumerable: true,
      value: privilegedNodeReplConfig,
      writable: false,
    },
    env: {
      configurable: false,
      enumerable: true,
      value: env,
      writable: false,
    },
    createElicitation: {
      configurable: false,
      enumerable: true,
      value(request: unknown) {
        return createElicitation(request);
      },
      writable: false,
    },
    fetch: {
      configurable: false,
      enumerable: true,
      value(
        input: RequestInfo | URL | PromiseLike<RequestInfo | URL>,
        init?: RequestInit,
      ) {
        return authenticatedFetch(input, init);
      },
      writable: false,
    },
    setResponseMeta: {
      configurable: false,
      enumerable: true,
      value(meta: unknown) {
        const execState = getCurrentExecState();
        if (!isPlainObject(meta)) {
          throw new Error("nodeRepl.setResponseMeta expected a plain object");
        }
        const previous = execState.responseMeta;
        const responseMeta = previous
          ? {
              ...(previous as Record<string, unknown>),
              ...structuredClone(meta),
            }
          : structuredClone(meta);
        execState.responseMeta = responseMeta;
        send({
          type: "response_meta",
          id: execState.id,
          response_meta: responseMeta,
        });
      },
      writable: false,
    },
    nativePipe: {
      configurable: false,
      enumerable: true,
      value: nativePipe,
      writable: false,
    },
    otel: {
      configurable: false,
      enumerable: true,
      writable: false,
      value: Object.freeze({
        log(name: unknown, attributes: unknown = {}) {
          try {
            sendPrivileged(getCurrentExecState(), {
              type: "otel_log",
              name,
              attributes,
            });
          } catch {
            // Audit export is best effort and must not affect the operation.
          }
        },
      }),
    },
    emitContentItem: {
      configurable: false,
      enumerable: true,
      value(text: unknown) {
        if (typeof text !== "string") {
          throw new Error("nodeRepl.emitContentItem expected a string");
        }
        getCurrentExecState().contentItems.push(text);
      },
      writable: false,
    },
    withSuspendedTimeout: {
      configurable: false,
      enumerable: true,
      value: withSuspendedTimeout,
      writable: false,
    },
  };
  privilegedNodeReplProperties.telemetry = {
    configurable: false,
    enumerable: true,
    get: getTelemetryBridge,
  };
  return Object.freeze(Object.create(nodeRepl, privilegedNodeReplProperties));
}

function normalizeLaunchServicesTarget(
  target: unknown,
  isPlainObject: (value: unknown) => value is Record<string, unknown>,
) {
  if (!isPlainObject(target)) {
    throw new Error(
      "nodeRepl.launchServices.openApplication expected a target object",
    );
  }
  const unexpectedKeys = Object.keys(target).filter(
    (key) => key !== "applicationPath" && key !== "bundleIdentifier",
  );
  if (unexpectedKeys.length > 0) {
    throw new Error(
      "nodeRepl.launchServices.openApplication received an unsupported target",
    );
  }
  const applicationPath = nonEmptyString(target.applicationPath);
  const bundleIdentifier = nonEmptyString(target.bundleIdentifier);
  if ((applicationPath == null) === (bundleIdentifier == null)) {
    throw new Error(
      "nodeRepl.launchServices.openApplication expected exactly one of applicationPath or bundleIdentifier",
    );
  }
  return { applicationPath, bundleIdentifier };
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function createPrivilegedWorkerRuntime({
  env,
  runtime,
  privateKeys,
  getTelemetryBridge = () => undefined,
}: {
  env: Record<string, string | undefined>;
  runtime: Runtime;
  privateKeys?: PrivateKeys;
  getTelemetryBridge?: () => unknown;
}) {
  const { execContext, pendingRequests, send } = runtime;
  const afterSubmittedCodeHooks = createLifecycleHandlers(
    "addAfterSubmittedCodeHook",
  );
  const turnEndedHandlers = createLifecycleHandlers(
    "addTurnEndedHandler",
    true,
  );
  const nativePipeBridge = createNativePipeBridge({
    execContext,
    send,
  });
  const { authenticatedFetch, createElicitation } =
    createPrivilegedHostOperations({ execContext, pendingRequests, send });

  return {
    afterSubmittedCodeHooks,
    turnEndedHandlers,
    nativePipeBridge,
    nodeRepl: createPrivilegedNodeReplBridge({
      addAfterSubmittedCodeHook: afterSubmittedCodeHooks.add,
      addTurnEndedHandler: turnEndedHandlers.add,
      authenticatedFetch,
      createElicitation,
      env,
      getCurrentExecState: execContext.getCurrent,
      nativePipe: nativePipeBridge.nativePipe,
      nodeRepl: runtime.nodeRepl,
      privateKeys,
      pendingRequests,
      send,
      getTelemetryBridge,
    }),
  };
}
