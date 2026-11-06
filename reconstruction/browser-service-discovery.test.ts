import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  createBrowserDiscovery,
  listBackendPipes,
  discoveryError,
} from "../packages/browser/src/service/runtime/browser_discovery";
import {
  codexTurnMetadata,
  metadataSession,
} from "../packages/browser/src/service/preferences/request_context";
import { serviceExpression, originalServiceBindings } from "./service-source";
async function run(original: boolean, mode: string) {
  const trace: any[] = [];
  let reads = 0;
  const meta: any = {
    session_id: "session",
    turn_id: "turn",
    thread_id: "thread",
  };
  if (mode === "missing") delete meta.turn_id;
  if (mode === "subagent") {
    meta.thread_source = "subagent";
    meta.thread_id = "sub-session";
  }
  const runtime: any = {
    env: {
      BROWSER_USE_CODEX_APP_BUILD_FLAVOR:
        mode === "flavor" ? " wanted " : undefined,
      CDP_BROWSER_BACKEND_PIPE_PATH:
        mode === "exact" ? " extension " : undefined,
      BROWSER_AUTH_EVAL_EXACT_CDP_BACKEND_SOCKET:
        mode === "exact" ? " true " : undefined,
    },
    platform: "darwin",
    get requestMeta() {
      reads++;
      return { "x-codex-turn-metadata": meta };
    },
  };
  const errors: any[] = [];
  const api = (pipe: string) => ({
    pipe,
    async close() {
      trace.push(["close", pipe]);
      if (mode === "close-error") throw Error("close failed");
    },
  });
  const prior = [
    { id: "old", pipe: "old", api: api("old"), info: { type: "extension" } },
    {
      id: "reuse",
      pipe: "reuse",
      api: api("reuse"),
      info: { type: "extension" },
    },
  ];
  const ignored = Error("ignored");
  const deps: any = {
    async connect(pipe: string) {
      trace.push(["connect", pipe]);
      if (mode === "connect-error" || mode === "many-errors")
        throw Error("connect failed");
      return pipe;
    },
    async readInfo(_r: any, client: any) {
      trace.push(["info", client.pipe]);
      if (mode === "info-error") throw Error("info failed");
      if (mode === "ignored") throw ignored;
      return {
        type: client.pipe === "extension" ? "extension" : "iab",
        metadata: {
          codexSessionId:
            mode === "wrong-session"
              ? "other"
              : mode === "subagent"
                ? "sub-session"
                : "session",
          codexAppBuildFlavor: "actual",
        },
      };
    },
    async span(name: string, attrs: any, perform: any, options: any) {
      trace.push(["span", name, attrs]);
      const value = await perform();
      if (options) trace.push(["result", options.resultAttrs(value)]);
      return value;
    },
    surfaceEnabled(_r: any, type: string) {
      trace.push(["enabled", type]);
      return mode !== "disabled";
    },
    surfaceForType: (type: string) => type,
    reportError(error: any) {
      errors.push(error);
      trace.push(["error", error.message]);
    },
    reportDiscoveryFailure(_r: any, details: any, reason: any, count: any) {
      trace.push(["diagnostic", details, reason, count]);
    },
    ignoredHandshakeError: ignored,
    async listPipes() {
      trace.push(["list"]);
      if (mode === "listing-error")
        throw Object.assign(Error("listing"), { code: "ENOENT" });
      return mode === "many-errors"
        ? Array.from({ length: 10 }, (_, i) => "p" + i)
        : mode === "empty"
          ? []
          : ["iab", "extension", "reuse"];
    },
  };
  const external: any = {
    DA: (r: any) => {
      const m = codexTurnMetadata(r),
        missing = ["session_id", "turn_id"].filter(
          (key) => typeof m?.[key] !== "string",
        );
      if (missing.length)
        throw Error(
          `Missing required Codex turn metadata: ${missing.join(", ")}`,
        );
    },
    Me: codexTurnMetadata,
    xt: metadataSession,
    Zt: (r: any, key: string) =>
      typeof r.env[key] === "string"
        ? r.env[key].trim() || undefined
        : undefined,
    dC: "BROWSER_USE_CODEX_APP_BUILD_FLAVOR",
    mn: deps.span,
    Vo: { create: deps.connect },
    Hx: deps.readInfo,
    Dt: deps.reportError,
    BC: ignored,
    zle: deps.listPipes,
    pl: deps.surfaceEnabled,
    ro: deps.surfaceForType,
    Zle: deps.reportDiscoveryFailure,
  };
  const names = [
    "jx",
    "N6",
    "Jle",
    "Yle",
    "Qle",
    "Ule",
    "Lle",
    "Fle",
    "Hle",
    "Wle",
    "$le",
    "jle",
    "qle",
    "M6",
  ];
  const discover = original
    ? new Function(
        ...Object.keys(external),
        "let Nle=1;" +
          names
            .map((name) => `const ${name}=${serviceExpression(name)};`)
            .join("\n") +
          "return M6;",
      )(...Object.values(external))
    : createBrowserDiscovery(deps).discover;
  try {
    const result = await discover(
      runtime,
      (transport: any) => {
        trace.push(["create", transport]);
        if (mode === "factory-error") throw Error("factory failed");
        return api(transport);
      },
      prior,
      {},
    );
    trace.push([
      "browsers",
      result.map(({ id, pipe, info }: any) => ({ id, pipe, info })),
    ]);
  } catch (error: any) {
    trace.push(["rejected", error.message]);
  }
  trace.push(["metadata reads", reads]);
  return JSON.parse(JSON.stringify(trace));
}
test("discovery matches original concurrency, reuse, session/surface filtering and failure diagnostics", async () => {
  for (const mode of [
    "normal",
    "missing",
    "subagent",
    "flavor",
    "exact",
    "connect-error",
    "factory-error",
    "info-error",
    "ignored",
    "wrong-session",
    "disabled",
    "listing-error",
    "empty",
    "many-errors",
    "close-error",
  ]) {
    const actual = await run(false, mode);
    assert.deepEqual(actual, await run(true, mode), mode);
    if (mode === "missing")
      assert.ok(!actual.some((row: any) => row[0] === "list"));
    if (mode === "many-errors")
      assert.equal(
        actual.find((row: any) => row[0] === "diagnostic")[1].failures.length,
        8,
      );
    if (mode === "ignored")
      assert.ok(!actual.some((row: any) => row[0] === "error"));
  }
});
test("pipe inventory and error formatting preserve original platform and accessor behavior", async () => {
  for (const platform of ["darwin", "win32"])
    for (const configured of [
      undefined,
      "",
      platform === "win32" ? "C:\\a;C:\\a;;D:\\b" : "/a:/a::/b",
      "relative",
    ]) {
      async function execute(original: boolean) {
        const calls: any[] = [];
        const read = async (root: string) => {
          calls.push(root);
          return ["one", "codex-browser-use-test", "two"];
        };
        const runtime = {
          platform,
          env: { BROWSER_USE_BACKEND_PATHS: configured },
        };
        try {
          const listing = original
            ? originalServiceBindings(["Gl", "Yle", "Jle", "Xle"], {
                N6: read,
                bb: path,
              }).Xle
            : (r: any) => listBackendPipes(r, read);
          calls.push(await listing(runtime));
        } catch (error: any) {
          calls.push(error.message);
        }
        return calls;
      }
      assert.deepEqual(await execute(false), await execute(true));
    }
  const { L6: N6 } = originalServiceBindings(["$x", "L6"]);
  for (const error of [
    "string",
    null,
    undefined,
    42,
    {},
    Error(" message "),
    { name: "Error", message: "ENOENT: failed", code: "ENOENT" },
    { name: "", message: "", code: "CODE" },
  ])
    assert.equal(discoveryError(error), N6(error));
  for (const original of [false, true]) {
    const reads: string[] = [];
    const error = Object.fromEntries(
      ["name", "message", "code"].map((key) => [key, key]),
    );
    for (const key of Object.keys(error))
      Object.defineProperty(error, key, {
        get() {
          reads.push(key);
          return key;
        },
      });
    (original ? N6 : discoveryError)(error);
    assert.deepEqual(reads, ["name", "message", "code"]);
  }
});
