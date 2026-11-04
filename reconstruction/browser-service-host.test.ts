import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import {
  createBrowserHostFactory,
  browserHostFilesystem,
  privilegedNodeRepl,
  defaultGaasConfigPath,
} from "../packages/browser/src/service/runtime/host";
import { originalServiceBindings } from "./service-source";
async function run(original: boolean, mode: string) {
  const trace: any[] = [];
  let runtime: any;
  const env: any = {
    BROWSER_USE_SECURITY_MODE:
      mode === "non-gaas" ? "other" : " gaas-browser-environment ",
    BROWSER_USE_CONFIG_PATH:
      mode === "default-config" ? " " : " /synthetic/config ",
    BROWSER_AUTH_BROKER_SOCKET_PATH:
      mode === "no-broker" ? " " : " /synthetic/socket ",
    BROWSER_USE_ACCESSIBILITY_CORE_WASM_PATH:
      mode === "relative"
        ? " relative.wasm "
        : mode === "absolute"
          ? " /synthetic/core.wasm "
          : undefined,
  };
  const repl: any = {
    env,
    config: {},
    requestMeta: { turn: 1 },
    gaasBrowserConfig: { synthetic: true },
    setResponseMeta() {},
    async createElicitation(request: any) {
      trace.push(["elicit", this === repl, request]);
      if (mode === "elicit-error") throw Error("elicitation failed");
      return {
        action: "accept",
        meta: { legacy: true },
        ...(mode === "meta-present"
          ? { _meta: { current: true } }
          : mode === "meta-null"
            ? { _meta: null }
            : mode === "meta-false"
              ? { _meta: false }
              : {}),
      };
    },
  };
  const filesystem: any = {
    async readFile(path: string) {
      trace.push(["read", path]);
      if (mode === "read-error") throw Error("read");
      return mode === "parse-error"
        ? "{"
        : mode === "null-config"
          ? "null"
          : '{"synthetic":1}';
    },
  };
  const deps: any = {
    getPrivilegedRepl: () => (mode === "no-repl" ? undefined : repl),
    filesystem,
    platform: () => {
      trace.push(["platform"]);
      return "darwin";
    },
    isAbsolute,
    createAccessAssertion: (r: any) => {
      trace.push(["access", r === runtime]);
      return async () => {};
    },
    registerAutomatedReviewHost: (r: any) => {
      trace.push(["register", r === runtime]);
    },
    createConfig: (r: any) => {
      trace.push(["config", r === repl]);
      return { fixture: "config" };
    },
    BrowserDirectory: class {
      constructor(r: any, selection: any, preferences: any) {
        trace.push(["directory", r === runtime, selection, preferences]);
        if (mode === "directory-error") throw Error("directory");
      }
    },
    extensionSelection: (r: any) => {
      trace.push(["extension", r === runtime]);
      return { preferredWindowId: 4 };
    },
    Preferences: class {
      constructor(config: any, r: any) {
        trace.push(["preferences", config, r === runtime]);
      }
    },
    commandTiming: "timing",
    createErrorReporter: (r: any) => {
      trace.push(["reporter", r === runtime]);
      return "reporter";
    },
    performanceSpan: "span",
    trackElicitation: async (request: any, perform: any) => {
      trace.push(["track", request]);
      return await perform();
    },
    initializeCredentialObservation: async (r: any) => {
      runtime = r;
      trace.push(["initialize", r.gaas?.config, r.gaas?.browserConfig]);
      if (mode === "initialize-error") throw Error("initialize");
    },
    getNativeCredentialObservationStatus: (r: any, ...args: any[]) => {
      trace.push(["status", r === runtime, args]);
      return "status";
    },
    createBrowserAuthBrokerChallenge: (r: any, ...args: any[]) => {
      trace.push(["challenge", r === runtime, args]);
      return "challenge";
    },
  };
  const external = {
    W6: deps.getPrivilegedRepl,
    H6: deps.createAccessAssertion,
    Uy: deps.registerAutomatedReviewHost,
    _6: deps.createConfig,
    yb: deps.BrowserDirectory,
    kA: deps.extensionSelection,
    lu: deps.Preferences,
    $6: deps.commandTiming,
    dH: deps.createErrorReporter,
    fH: filesystem,
    I6: deps.performanceSpan,
    Qfe: deps.platform,
    G6: deps.trackElicitation,
    EB: deps.initializeCredentialObservation,
    b6: deps.getNativeCredentialObservationStatus,
    lb: { create: deps.createBrowserAuthBrokerChallenge },
    the: isAbsolute,
    ii: "BROWSER_USE_SECURITY_MODE",
    rhe: defaultGaasConfigPath,
  };
  const create = original
    ? originalServiceBindings(["ohe", "nhe", "mH"], external).mH
    : createBrowserHostFactory(deps).createHost;
  try {
    const host = await create();
    trace.push([
      "result",
      host === runtime,
      host.platform,
      host.filesystem === filesystem,
      host.commandTiming,
      host.performanceSpan,
      host.setResponseMeta === repl.setResponseMeta,
      host.gaas?.getBrowserAuthBrokerChallenge != null,
    ]);
    repl.requestMeta = { turn: 2 };
    trace.push(["live-meta", host.requestMeta]);
    trace.push([
      "approval",
      await host.createElicitation({ message: "synthetic" }),
    ]);
    if (host.gaas?.getNativeCredentialObservationStatus)
      trace.push(
        ["status-result", host.gaas.getNativeCredentialObservationStatus(1, 2)],
        [
          "challenge-result",
          host.gaas.getBrowserAuthBrokerChallenge(1, 2, 3, 4),
        ],
      );
  } catch (error: any) {
    trace.push(["error", error.message]);
  }
  return JSON.parse(JSON.stringify(trace));
}
test("host reconstruction preserves original initialization, metadata and broker delegation", async () => {
  for (const mode of [
    "normal",
    "non-gaas",
    "default-config",
    "no-broker",
    "relative",
    "absolute",
    "read-error",
    "parse-error",
    "null-config",
    "no-repl",
    "directory-error",
    "initialize-error",
    "elicit-error",
    "meta-present",
    "meta-null",
    "meta-false",
  ]) {
    const actual = await run(false, mode);
    assert.deepEqual(actual, await run(true, mode), mode);
    if (mode === "relative") {
      assert.ok(actual.some((row: any) => row[0] === "initialize"));
      assert.ok(!actual.some((row: any) => row[0] === "register"));
    }
    if (mode === "meta-false")
      assert.equal(
        actual.find((row: any) => row[0] === "approval")[1]._meta,
        false,
      );
  }
});
test("host filesystem performs actual text/byte IO and privileged REPL gate matches source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cua-host-"));
  try {
    const path = join(directory, "nested");
    assert.equal(
      await browserHostFilesystem.mkdir(path, { recursive: true }),
      undefined,
    );
    const file = join(path, "fixture");
    assert.equal(
      await browserHostFilesystem.writeFile(file, "合成\n"),
      undefined,
    );
    assert.equal(await browserHostFilesystem.readFile(file), "合成\n");
    assert.deepEqual(
      await browserHostFilesystem.readBytes(file),
      Buffer.from("合成\n"),
    );
    await browserHostFilesystem.writeFile(file, new Uint8Array([0, 255]));
    assert.deepEqual(
      await browserHostFilesystem.readBytes(file),
      Buffer.from([0, 255]),
    );
    assert.equal(
      await browserHostFilesystem.rm(path, { recursive: true }),
      undefined,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const original = originalServiceBindings(["W6"]).W6;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  try {
    for (const value of [
      undefined,
      {},
      { config: null },
      { config: false },
      { config: {} },
    ]) {
      Object.defineProperty(globalThis, "nodeRepl", {
        value,
        writable: true,
        configurable: true,
      });
      assert.equal(privilegedNodeRepl(), original());
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "nodeRepl", descriptor);
    else delete (globalThis as any).nodeRepl;
  }
});

test("elicitation telemetry matches original span and result attributes across approval modes", async () => {
  const { createElicitationTelemetry } =
    await import("../packages/browser/src/service/runtime/elicitation_telemetry");
  const timeout =
    "The automatic permission approval review did not finish before its deadline. Do not assume the action is unsafe based on the timeout alone. You may retry once, or ask the user for guidance or explicit approval.";
  const { go } = originalServiceBindings(["PX", "ga", "go"]);
  for (const kind of [undefined, "browser_auth", "browser_email_otp", "other"])
    for (const automatic of [false, true])
      for (const reviewer of [
        undefined,
        "user",
        "guardian_subagent",
        "auto_review",
        "unexpected",
      ])
        for (const action of ["accept", "decline", "cancel", "invalid"])
          for (const reason of ["none", "unsupported", "takeover", "timeout"]) {
            const request = {
                meta: {
                  codex_approval_kind: kind,
                  codex_request_type: automatic
                    ? "approval_request"
                    : undefined,
                },
              },
              result = {
                action,
                _meta: {
                  approvals_reviewer: reviewer,
                  ...(reason === "unsupported"
                    ? {
                        "openai/client_unsupported": true,
                        "openai/user_took_over": true,
                      }
                    : reason === "takeover"
                      ? { "openai/user_took_over": true }
                      : reason === "timeout"
                        ? { message: timeout }
                        : {}),
                },
              };
            async function execute(original: boolean) {
              const trace: any[] = [];
              const span = async (
                name: any,
                attrs: any,
                perform: any,
                options: any,
              ) => {
                trace.push(name, attrs);
                const value = await perform();
                trace.push(options.resultAttrs(value));
                return value;
              };
              const fn = original
                ? originalServiceBindings(["G6"], { mn: span, go }).G6
                : createElicitationTelemetry(span);
              const returned = await fn(request, async () => result);
              assert.equal(returned, result);
              return trace;
            }
            assert.deepEqual(await execute(false), await execute(true));
          }
});
