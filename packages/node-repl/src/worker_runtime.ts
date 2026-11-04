import { Buffer } from "node:buffer";
import { types } from "node:util";
import { createExecContext } from "./exec_context";
import {
  getErrorDataProperty,
  isPlainObject,
  deepFreeze,
  formatLog,
  normalizeEmitImageValue,
} from "./worker_values";
import {
  makeRejectedThenable,
  trackExecBackgroundOperation,
  type BackgroundResult,
  type TrackedOperation,
} from "./background_operations";
export { isPlainObject, toByteArray } from "./worker_values";
export {
  makeRejectedThenable,
  trackExecBackgroundOperation,
} from "./background_operations";
export type ExecState = {
  id: unknown;
  contentItems: unknown[];
  formElicitationSupported: boolean;
  gaasBrowserConfig: Record<string, unknown>;
  outputEvents: Record<string, unknown>[];
  pendingBackgroundTasks: Set<Promise<BackgroundResult>>;
  requestMeta: unknown;
  responseMeta: unknown;
  [key: string]: unknown;
};
export type WorkerOptions = {
  audioEnabled?: boolean;
  cwd: string;
  env: Record<string, string | undefined>;
  homeDir: string;
  tmpDir: string;
};
type Response = {
  id: unknown;
  ok?: unknown;
  error?: string;
  [key: string]: unknown;
};
type Requests = Map<unknown, (response: Response) => void>;
type BridgeOptions = WorkerOptions & {
  execContext: ReturnType<typeof createExecContext<ExecState>>;
  pendingRequests: Requests;
  send: (message: unknown) => void;
};
type NodeReplBridge = {
  cwd: string;
  env: Record<string, string | undefined>;
  homeDir: string;
  tmpDir: string;
  readonly requestMeta: unknown;
  write(value: unknown, itemId?: unknown): void;
  emitImage(value: unknown): TrackedOperation<void>;
  emitAudio?: (value: unknown) => TrackedOperation<void>;
};
function createNodeReplBridge({
  audioEnabled,
  cwd,
  env,
  execContext,
  homeDir,
  pendingRequests,
  send,
  tmpDir,
}: BridgeOptions) {
  let emitImageCounter = 0;
  let emitAudioCounter = 0;
  const nodeRepl: NodeReplBridge = {
    cwd,
    env,
    homeDir,
    tmpDir,
    get requestMeta() {
      return execContext.getOptional()?.requestMeta ?? null;
    },
    write(value, itemId) {
      const execState = execContext.getCurrent();
      if (
        itemId !== undefined &&
        (typeof itemId !== "string" || itemId.length === 0)
      ) {
        throw new TypeError(
          "nodeRepl.write expected a nonempty string content item ID",
        );
      }
      execState.outputEvents.push({
        kind: "write",
        text: formatLog([value]),
        ...(itemId === undefined ? {} : { item_id: itemId }),
      });
    },
    emitImage(imageLike) {
      let execState;
      try {
        execState = execContext.getCurrent();
      } catch (error) {
        return makeRejectedThenable(error);
      }
      const operation = (async () => {
        const normalized = normalizeEmitImageValue(await imageLike);
        const id = `${execState.id}-emit-image-${emitImageCounter++}`;
        send({
          type: "emit_image",
          id,
          exec_id: execState.id,
          image_url: normalized.image_url,
        });
        return new Promise<void>((resolve, reject) => {
          pendingRequests.set(id, (response) => {
            if (!response.ok) {
              reject(new Error(response.error || "emitImage failed"));
              return;
            }
            resolve();
          });
        });
      })();
      return trackExecBackgroundOperation(execState, operation);
    },
  };
  if (audioEnabled) {
    nodeRepl.emitAudio = function emitAudio(audioDataUrl) {
      let execState;
      try {
        execState = execContext.getCurrent();
      } catch (error) {
        return makeRejectedThenable(error);
      }
      const operation = (async () => {
        const audioUrl = await audioDataUrl;
        if (typeof audioUrl !== "string" || !audioUrl) {
          throw new Error("nodeRepl.emitAudio expected a non-empty audio_url");
        }
        if (!/^data:/i.test(audioUrl)) {
          throw new Error("nodeRepl.emitAudio only accepts data URLs");
        }
        const id = `${execState.id}-emit-audio-${emitAudioCounter++}`;
        send({
          type: "emit_audio",
          id,
          exec_id: execState.id,
          audio_url: audioUrl,
        });
        return new Promise<void>((resolve, reject) => {
          pendingRequests.set(id, (response) => {
            if (!response.ok) {
              reject(new Error(response.error || "emitAudio failed"));
              return;
            }
            resolve();
          });
        });
      })();
      return trackExecBackgroundOperation(execState, operation);
    };
  }
  return nodeRepl;
}

export function createWorkerRuntime({
  audioEnabled,
  cwd,
  env,
  homeDir,
  tmpDir,
}: WorkerOptions) {
  // Keep diagnostics off errors exposed to submitted JavaScript.
  const errorKinds = new WeakMap<object, string>();
  function getErrorKind(error: unknown, fallback = "unknown") {
    try {
      const kind = errorKinds.get(error as object);
      if (typeof kind === "string" && kind !== "unknown") {
        return kind;
      }
      if (types.isNativeError(error)) {
        switch (getErrorDataProperty(error, "code")) {
          case "MODULE_NOT_FOUND":
          case "ERR_MODULE_NOT_FOUND":
          case "ERR_UNKNOWN_BUILTIN_MODULE":
            return "import_error";
        }
        if (fallback === "unknown") {
          switch (getErrorDataProperty(error, "name")) {
            case "SyntaxError":
              return "syntax_error";
            case "ReferenceError":
              return "reference_error";
            case "TypeError":
              return "type_error";
          }
        }
      }
    } catch {
      // Diagnostics must not replace the original error, including thrown proxies.
    }
    return fallback;
  }

  function withErrorKind<T>(error: T, kind: unknown): T {
    if (
      typeof kind === "string" &&
      error !== null &&
      (typeof error === "object" || typeof error === "function")
    ) {
      errorKinds.set(error, kind);
    }
    return error;
  }

  async function drainExecBackgroundTasks(execState: ExecState) {
    while (execState.pendingBackgroundTasks.size > 0) {
      const backgroundTasks = [...execState.pendingBackgroundTasks];
      execState.pendingBackgroundTasks.clear();
      const backgroundResults = await Promise.all(backgroundTasks);
      const firstUnhandledBackgroundError = backgroundResults.find(
        (result) => !result.ok && !result.observation.observed,
      );
      if (firstUnhandledBackgroundError) {
        const error = firstUnhandledBackgroundError.error;
        throw withErrorKind(error, getErrorKind(error, "unhandled_rejection"));
      }
    }
  }

  const execContext = createExecContext<ExecState>();
  const pendingRequests: Requests = new Map();

  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    // The host can close its response pipe before stdin during reset or exit.
    if (error.code === "EPIPE") {
      process.exit(0);
    }
    throw error;
  });

  function send(message: unknown) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }

  function createExecState(
    message: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ): ExecState {
    return {
      contentItems: [],
      formElicitationSupported: message.form_elicitation_supported === true,
      gaasBrowserConfig: isPlainObject(message.gaas_browser_config)
        ? Object.freeze(message.gaas_browser_config)
        : Object.freeze({}),
      id: message.exec_id ?? message.id,
      outputEvents: [],
      pendingBackgroundTasks: new Set<Promise<BackgroundResult>>(),
      requestMeta: isPlainObject(message.request_meta)
        ? deepFreeze(structuredClone(message.request_meta))
        : null,
      responseMeta: null,
      ...extra,
    };
  }

  function createConsole(
    original: Record<string, (...args: unknown[]) => unknown>,
  ) {
    return {
      ...original,
      ...Object.fromEntries(
        ["log", "info", "warn", "error", "debug"].map((name) => [
          name,
          (...args: unknown[]) => {
            const execState = execContext.getOptional();
            if (execState) {
              execState.outputEvents.push({
                kind: "line",
                text: formatLog(args),
              });
            } else {
              original[name](...args);
            }
          },
        ]),
      ),
    };
  }

  function settle(message: Response) {
    const resolver = pendingRequests.get(message.id);
    if (!resolver) {
      return false;
    }
    pendingRequests.delete(message.id);
    resolver(message);
    return true;
  }

  function listen(handleMessage: (message: any) => void) {
    let pendingInputSegments: Buffer[] = [];

    function handleInputFrame(frame: Buffer) {
      if (frame.length > 0 && frame[frame.length - 1] === 0x0d) {
        frame = frame.subarray(0, frame.length - 1);
      }
      const line = frame.toString("utf8");
      if (!line.trim()) {
        return;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        // Malformed JSONL frames cannot be dispatched.
        return;
      }
      handleMessage(message);
    }

    process.stdin.on("data", (chunk) => {
      const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      let segmentStart = 0;
      let frameEnd = input.indexOf(0x0a);
      while (frameEnd !== -1) {
        pendingInputSegments.push(input.subarray(segmentStart, frameEnd));
        // Keep raw stdin chunks queued until a full JSONL frame is ready so we
        // only assemble the frame bytes once.
        const frame =
          pendingInputSegments.length === 1
            ? pendingInputSegments[0]
            : Buffer.concat(pendingInputSegments);
        pendingInputSegments = [];
        handleInputFrame(frame);
        segmentStart = frameEnd + 1;
        frameEnd = input.indexOf(0x0a, segmentStart);
      }
      if (segmentStart < input.length) {
        pendingInputSegments.push(input.subarray(segmentStart));
      }
    });

    process.stdin.on("end", () => {
      // The host owns worker lifetime. Once stdin closes, it can no longer
      // service worker requests, and user-created handles may keep Node alive.
      process.exit(0);
    });
  }

  return {
    createConsole,
    createExecState,
    drainExecBackgroundTasks,
    execContext,
    getErrorKind,
    listen,
    nodeRepl: createNodeReplBridge({
      audioEnabled,
      cwd,
      env,
      execContext,
      homeDir,
      pendingRequests,
      send,
      tmpDir,
    }),
    pendingRequests,
    send,
    settle,
    withErrorKind,
  };
}
