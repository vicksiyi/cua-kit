import {
  getDocumentation,
  getBrowserDocumentation,
} from "../packages/browser/src/service/commands/browser_inventory";
import { createCommandScheduling } from "../packages/browser/src/service/runtime/command_scheduler";
import { createCredentialObservationState } from "../packages/browser/src/service/security/credential_observation";
import assert from "node:assert/strict";
import test from "node:test";
import { createCommandRuntimeFactory } from "../packages/browser/src/service/runtime/command_runtime";
import { serviceExpression } from "./service-source";
const bindings = {
  jM: "setExceptionReporter",
  IB: "setSecurityCheckReporter",
  G3: "securityCheckAttributes",
  gv: "configureRuntimeTelemetry",
  dt: "emitEvent",
  Vr: "release",
  t6: "createCommandRecorder",
  Z3: "createNavigationRecorder",
  Q3: "createInteractionRecorder",
  n6: "createResponseRecorder",
  u6: "collectNotifications",
  Dt: "reportNotificationError",
  oD: "loadApiManifest",
  iD: "loadDocumentManifest",
  wp: "disabledApiMembers",
  ib: "Documentation",
  j3: "readDocumentation",
  mF: "createBackendSessionReporter",
  q3: "createCommandScheduler",
  Me: "readRequestMetadata",
  c6: "managementCommands",
  ro: "surfaceForBackend",
  $o: "shouldEmitResponseMetadata",
  bu: "emitResponseMetadata",
  Wy: "isBrowserAlias",
  Is: "assertSurfaceEnabled",
  ob: "BrowserContext",
  Sh: "configureBackendTelemetry",
  xh: "configureTurnTelemetry",
  H3: "recordCommandUsage",
  l6: "browserCommands",
  Uc: "telemetryTurnIds",
  vh: "browserTelemetryAttributes",
  Wh: "downloadCommand",
  Gp: "claimTabCommand",
  Vp: "releaseTabCommand",
  Mh: "webMcpCallCommand",
  Bc: "lookupWebMcpTool",
  Q2: "initializeAccessibility",
  TA: "executeWithCommandContext",
  Ic: "manualHandoffCommand",
  Qa: "classifyError",
  rp: "securityBlockReason",
  wa: "UrlPolicyError",
  OA: "formatCommandError",
  Je: "canRecordCommand",
  a6: "trackRecordingContext",
  V3: "reportCommandRecovery",
  Fh: "closeTabCommand",
};
function original(deps: any) {
  const names = Object.keys(bindings);
  return new Function(
    ...names,
    `let Vue=20000,Rx=null,zue,Kue=new Set(),d6=false;
    ${["p6", "Xue", "Yue", "Ix", "Jue"].map(serviceExpression).join("\n")}
    return {createRuntime:p6,dispose:Xue};`,
  )(...Object.values(bindings).map((name) => deps[name]));
}
function fixture(factory: any, flags: any = {}) {
  const trace: any[] = [];
  const hooks: any[] = [];
  const listeners: any[] = [];
  let documentOptions: any;
  let context: any;
  let accessDenied = false;
  const info = { type: "extension", family: "chrome" };
  const api = {
    addCloseListener(fn: any) {
      listeners.push(fn);
    },
  };
  const browser = { api, id: "browser-1", info };
  const command = (type: string, run: any) => Object.assign(run, { type });
  const span = {
    async withSpan(name: any, attrs: any, run: any) {
      trace.push(["span", name, attrs]);
      return run();
    },
    async withCommandTelemetry(type: any, params: any, run: any, meta: any) {
      trace.push(["telemetry", type, meta]);
      return run();
    },
  };
  const directory = {
    async get(id: any) {
      trace.push(["get", id]);
      if (flags.onGet) await flags.onGet();
      return browser;
    },
    preferredWindowIdFor() {
      return 7;
    },
    async dispose() {
      trace.push(["directory.dispose"]);
    },
  };
  const runtime: any = {
    env: {
      CUA_REPL_ENABLED_SURFACES: "browser",
      CUA_REPL_BROWSER_DOCUMENTATION_ADDENDUM: " addendum ",
      BROWSER_USE_ACCESSIBILITY_CORE_WASM_PATH: " /synthetic/a.wasm ",
      ...flags.env,
    },
    requestMeta: {
      thread_id: "t",
      turn_id: "u",
      "openai/confirmation_policies": {
        browser_use: flags.policy ?? " custom policy ",
      },
    },
    platform: "synthetic",
    config: {},
    filesystem: {},
    browserContext: directory,
    performanceSpan: span,
    errorReporter: { captureException() {} },
    commandTiming: {
      startCommand(type: any, notify: any) {
        trace.push(["timing.start", type]);
        return {
          async run(fn: any) {
            return fn();
          },
          finish(outcome: any) {
            trace.push(["timing.finish", outcome]);
            notify("finished", "test", { outcome });
          },
        };
      },
    },
    addAfterSubmittedCodeHook(h: any) {
      trace.push(["hook", h.timeoutMs]);
      hooks.push(h);
    },
    async assertBrowserAccess() {
      trace.push(["access"]);
      if (accessDenied) throw Error("access denied");
    },
    emitContentItem(item: any) {
      trace.push(["content", item]);
    },
  };
  class Context {
    clientInfo = info;
    browserId = "browser-1";
    recordable = !flags.unrecordable;
    cdp = {
      currentTopLevelUrl: (tab: any) => {
        trace.push(["currentUrl", tab]);
        return flags.cachedUrl;
      },
      isTabAttached: (tab: any) => {
        trace.push(["attached", tab]);
        return !flags.detached;
      },
      readCommittedTabUrl: async (tab: any) => {
        trace.push(["committedUrl", tab]);
        if (flags.urlError) throw Error("url");
        return "https://synthetic.invalid/";
      },
    };
    tabLifecycle = {
      needsReclaim: (tab: any) => {
        trace.push(["needsReclaim", tab]);
        return !!flags.reclaim;
      },
      recordAcquired: (id: any) => trace.push(["acquired", id]),
    };
    browserUser = {
      claimTab: async (tab: any) => {
        trace.push(["claim", tab]);
        return { id: tab };
      },
    };
    constructor(api: any, id: any, info: any, opts: any) {
      trace.push([
        "context",
        id,
        opts.preferredWindowId,
        opts.elicitationDisplayName,
      ]);
      context = this;
    }
    async dispose() {
      trace.push(["context.dispose"]);
      if (flags.disposeError) throw Error("dispose failed");
    }
    async executeUnhandledCommand(cmd: any) {
      trace.push(["unhandled", cmd]);
      return { fallback: true };
    }
    async followSessionTab(tab: any, reason: any) {
      trace.push(["follow", tab, reason]);
    }
  }
  class UrlPolicyError extends Error {
    urlPolicyReason = "blocked";
    urlSchemeCategory = "file";
  }
  const run = async (params: any, ctx: any) => {
    trace.push([
      "command",
      params,
      !!ctx.finishNativeCredentialModelCommand,
      !!ctx.finishDownloadSetup,
    ]);
    if (flags.commandError) throw new UrlPolicyError("denied");
    if (flags.commandRun) await flags.commandRun(ctx);
    return { ok: true };
  };
  const deps: any = {
    setExceptionReporter: () => {},
    setSecurityCheckReporter: () => {},
    securityCheckAttributes: (v: any) => v,
    configureRuntimeTelemetry: () => {},
    emitEvent: (_r: any, ...args: any[]) => trace.push(["event", ...args]),
    release: "test",
    createCommandRecorder: () => {
      trace.push(["recorder.create"]);
      return {
        recordCommand: (type: any, entry: any) =>
          trace.push([
            "record",
            type,
            {
              backend: entry.backend,
              succeeded: entry.commandSucceeded,
              url: entry.currentUrl,
              result: entry.result,
              webMcpTool: entry.webMcpTool,
            },
          ]),
      };
    },
    createNavigationRecorder: () => 1,
    createInteractionRecorder: () => 2,
    createResponseRecorder: () => 3,
    collectNotifications: async () => {
      if (flags.notificationError) throw Error("notification failed");
      return "notification";
    },
    reportNotificationError: (e: any) =>
      trace.push(["notification.error", e.message]),
    loadApiManifest: async () => ["api"],
    loadDocumentManifest: async () => [
      { name: "confirmations", mode: "required" },
      { name: "browser", mode: "model" },
    ],
    disabledApiMembers: () => ["disabled"],
    Documentation: class {
      constructor(opts: any) {
        documentOptions = opts;
        trace.push(["docs", opts.documentManifest, opts.addendum]);
      }
      assertRequiredDocumentationRead(type: any) {
        trace.push(["docs.check", type]);
        if (flags.docsError) throw Error("read documentation");
      }
    },
    readDocumentation: async (_r: any, name: any) => "file:" + name,
    createBackendSessionReporter:
      (emit: any, seen: any) => (surface: any, meta: any, info: any) => {
        if (!seen.has(surface)) {
          seen.add(surface);
          emit(surface, { family: info.family }, meta);
        }
      },
    createCommandScheduler:
      (execute: any, resolve: any, options: any) => async (cmd: any) => {
        trace.push(["scheduler", options(cmd)]);
        return execute(cmd, flags.nativeCompletion ? () => {} : undefined);
      },
    readRequestMetadata: (r: any) => r.requestMeta,
    managementCommands: {
      get: command("get_browser", async () => {
        trace.push(["management"]);
        return { id: "browser-1" };
      }),
    },
    surfaceForBackend: (t: any) => (t === "extension" ? "chrome" : t),
    shouldEmitResponseMetadata: async () => true,
    emitResponseMetadata: (_r: any, surface: any, params: any) =>
      trace.push(["response", surface, params]),
    isBrowserAlias: (id: any) => ["chrome", "dot"].includes(id),
    assertSurfaceEnabled: (_r: any, surface: any) =>
      trace.push(["surface", surface]),
    BrowserContext: Context,
    configureBackendTelemetry: () => {},
    configureTurnTelemetry: () => {},
    recordCommandUsage: (v: any) => trace.push(["usage", v]),
    browserCommands: [
      "known",
      "download",
      "tab_manual_handoff_request",
      "tab_ax_action",
      "web_mcp_call",
      "close",
      "claim",
      "release",
    ].map((type) =>
      command(type, (params: any, context: any) => run(params, context)),
    ),
    telemetryTurnIds: () => ({ thread_id: "t", turn_id: "u" }),
    browserTelemetryAttributes: () => ({ family: "chrome" }),
    downloadCommand: { type: "download" },
    claimTabCommand: { type: "claim" },
    releaseTabCommand: { type: "release" },
    webMcpCallCommand: { type: "web_mcp_call" },
    lookupWebMcpTool: (_c: any, tab: any, id: any) => ({ tab, id }),
    initializeAccessibility: async (path: any) => trace.push(["ax", path]),
    executeWithCommandContext: async (ctx: any, params: any, fn: any) =>
      fn(ctx, params),
    manualHandoffCommand: { type: "tab_manual_handoff_request" },
    classifyError: () => "policy",
    securityBlockReason: () => "blocked",
    UrlPolicyError,
    formatCommandError: (e: any) => new Error("formatted:" + e.message),
    canRecordCommand: (c: any) => c.recordable,
    trackRecordingContext: () => trace.push(["track"]),
    reportCommandRecovery: () => ({ serial: true }),
    closeTabCommand: { type: "close" },
  };
  if (flags.realDocumentation) {
    delete deps.Documentation;
    deps.loadApiManifest = async () => ({
      root: "Browser",
      interfaces: {
        Browser: {
          name: { declarations: [{ text: "name: string;", references: [] }] },
        },
      },
      types: {},
    });
    deps.loadDocumentManifest = async () => [
      { name: "confirmations", mode: "included", requiredFor: ["known"] },
      { name: "intro", mode: "lookup", description: "Intro" },
    ];
    deps.managementCommands = { getDocumentation, getBrowserDocumentation };
  }
  if (flags.scheduling) {
    deps.createCommandScheduler = flags.scheduling.createCommandScheduler;
    deps.shouldEmitResponseMetadata =
      flags.scheduling.shouldEmitResponseMetadata;
    deps.canRecordCommand = flags.scheduling.canObserve;
  }
  return {
    factory: factory(deps),
    runtime,
    trace,
    hooks,
    listeners,
    getContext: () => context,
    getDocs: () => documentOptions,
    denyAccess: () => (accessDenied = true),
  };
}
const scenarios: any = {
  async normal(f: any) {
    const r = await f.factory.createRuntime({}, f.runtime);
    await r.executeAgentCommand({
      type: "known",
      browser_id: "chrome",
      tab_id: 3,
    });
    await r.executeAgentCommand({
      type: "known",
      browser_id: "chrome",
      tab_id: 3,
    });
    await f.factory.dispose();
    await f.factory.dispose();
    await assert.rejects(
      r.executeAgentCommand({ type: "known", browser_id: "chrome" }),
      /disposed/,
    );
  },
  async management(f: any) {
    const r = await f.factory.createRuntime({}, f.runtime);
    await r.executeAgentCommand({ type: "get_browser", id: "dot" });
  },
  async missing(f: any) {
    const r = await f.factory.createRuntime({}, f.runtime);
    await assert.rejects(
      r.executeAgentCommand({ type: "known" }),
      /Browser ID/,
    );
  },
  async unknown(f: any) {
    const r = await f.factory.createRuntime({}, f.runtime);
    assert.deepEqual(
      await r.executeAgentCommand({
        type: "unknown",
        browser_id: "browser-1",
        tab_id: 2,
      }),
      { fallback: true },
    );
  },
  async error(f: any) {
    const r = await f.factory.createRuntime({}, f.runtime);
    await assert.rejects(
      r.executeAgentCommand({
        type: "download",
        browser_id: "browser-1",
        tab_id: 2,
      }),
      /formatted:denied/,
    );
    await f.factory.dispose();
  },
  async specialized(f: any) {
    const r = await f.factory.createRuntime({}, f.runtime);
    for (const type of [
      "tab_ax_action",
      "web_mcp_call",
      "claim",
      "release",
      "close",
      "tab_manual_handoff_request",
      "mark_tab",
    ])
      await r.executeAgentCommand({
        type,
        browser_id: "browser-1",
        tab_id: 3,
        registration_id: "registration",
        status: "deliverable",
      });
  },
  async handoff(f: any) {
    const r = await f.factory.createRuntime({}, f.runtime);
    await r.executeAgentCommand({
      type: "tab_manual_handoff_request",
      browser_id: "browser-1",
      tab_id: 4,
    });
  },
  async recreate(f: any) {
    const one = await f.factory.createRuntime({}, f.runtime);
    await one.executeAgentCommand({ type: "known", browser_id: "browser-1" });
    const two = await f.factory.createRuntime({}, f.runtime);
    await assert.rejects(
      one.executeAgentCommand({ type: "known", browser_id: "browser-1" }),
      /disposed/,
    );
    await two.executeAgentCommand({ type: "known", browser_id: "browser-1" });
    await f.factory.dispose();
  },
  async close(f: any) {
    const r = await f.factory.createRuntime({}, f.runtime);
    await r.executeAgentCommand({ type: "known", browser_id: "browser-1" });
    f.listeners[0]();
    await r.executeAgentCommand({ type: "known", browser_id: "browser-1" });
  },
  async hook(f: any) {
    await f.factory.createRuntime({}, f.runtime);
    await f.hooks[0].run();
    f.denyAccess();
    await f.hooks[0].run();
  },
  async docs(f: any) {
    await f.factory.createRuntime({}, f.runtime);
    f.trace.push([
      "read",
      await f.getDocs().readDocumentation("confirmations"),
      await f.getDocs().readDocumentation("browser"),
    ]);
  },
};
const cases: any[] = [
  ["normal", { reclaim: true, nativeCompletion: true }],
  ["management", {}],
  ["missing", {}],
  ["unknown", {}],
  ["error", { commandError: true }],
  ["specialized", { reclaim: true }],
  ["handoff", { unrecordable: true }],
  ["recreate", {}],
  ["close", {}],
  ["hook", {}],
  ["hook", { notificationError: true }],
  ["docs", {}],
  ["docs", { env: { CUA_REPL_BROWSER_ENV: "orbit" } }],
  ["docs", { policy: "汉".repeat(6667) }],
  ["docs", { policy: " ".repeat(3) }],
  ["normal", { cachedUrl: "cached" }],
  ["normal", { detached: true }],
  ["normal", { urlError: true }],
];
test("p6 full runtime matches original initialization, dispatch, lifecycle and failure traces", async () => {
  for (const [name, flags] of cases) {
    const a = fixture(original, flags),
      b = fixture(createCommandRuntimeFactory, flags);
    await scenarios[name](a);
    await scenarios[name](b);
    assert.deepEqual(b.trace, a.trace, `${name} ${JSON.stringify(flags)}`);
    if (name === "normal") {
      assert.equal(b.trace.filter((x) => x[0] === "context").length, 1);
      assert.equal(b.trace.filter((x) => x[0] === "context.dispose").length, 1);
      assert.equal(b.trace.filter((x) => x[0] === "record").length, 2);
    }
    if (name === "error") {
      assert(
        b.trace.some((x) => x[0] === "timing.finish" && x[1] === "failure"),
      );
      assert(!b.trace.some((x) => x[0] === "record"));
      assert(
        b.trace.some(
          (x) => x[0] === "event" && x[1] === "browser_use_security_blocked",
        ),
      );
    }
    if (name === "recreate") {
      assert.equal(b.trace.filter((x) => x[0] === "hook").length, 1);
      assert.equal(b.trace.filter((x) => x[0] === "recorder.create").length, 1);
      assert.equal(b.trace.filter((x) => x[0] === "context.dispose").length, 2);
    }
    if (name === "specialized") {
      assert(b.trace.some((x) => x[0] === "ax"));
      assert(b.trace.some((x) => x[0] === "follow"));
      assert.equal(b.trace.filter((x) => x[0] === "claim").length, 5);
    }
    if (name === "handoff") {
      assert.deepEqual(b.trace.find((x) => x[0] === "record")[2].result, {});
    }
  }
});
test("p6 download barrier releases waiting commands on completion and failure", async () => {
  for (const fail of [false, true])
    for (const factory of [original, createCommandRuntimeFactory]) {
      let release!: () => void, entered!: () => void;
      const gate = new Promise<void>((r) => (release = r)),
        started = new Promise<void>((r) => (entered = r));
      let first = true;
      const f = fixture(factory, {
        commandRun: async () => {
          if (first) {
            first = false;
            entered();
            await gate;
            if (fail) throw Error("download failure");
          }
        },
      });
      const r = await f.factory.createRuntime({}, f.runtime);
      const firstCall = r.executeAgentCommand({
        type: "download",
        browser_id: "browser-1",
        tab_id: 5,
      });
      const firstOutcome = firstCall.then(
        () => true,
        () => false,
      );
      await started;
      const second = r.executeAgentCommand({
        type: "known",
        browser_id: "browser-1",
        tab_id: 5,
      });
      await new Promise(setImmediate);
      assert.equal(f.trace.filter((x) => x[0] === "command").length, 1);
      release();
      assert.equal(await firstOutcome, !fail);
      await second;
      assert.equal(f.trace.filter((x) => x[0] === "command").length, 2);
    }
});
test("runtime disposal during lookup prevents context creation; disposal rejection remains cached", async () => {
  for (const factory of [original, createCommandRuntimeFactory]) {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      started = new Promise<void>((r) => (entered = r));
    const f = fixture(factory, {
      onGet: async () => {
        entered();
        await gate;
      },
    });
    const r = await f.factory.createRuntime({}, f.runtime);
    const pending = r.executeAgentCommand({
      type: "known",
      browser_id: "browser-1",
      tab_id: 3,
    });
    const outcome = assert.rejects(pending, /disposed/);
    await started;
    await f.factory.dispose();
    release();
    await outcome;
    assert(!f.trace.some((x) => x[0] === "context"));
    const g = fixture(factory, { disposeError: true });
    const second = await g.factory.createRuntime({}, g.runtime);
    await second.executeAgentCommand({
      type: "known",
      browser_id: "browser-1",
    });
    await assert.rejects(g.factory.dispose(), /dispose failed/);
    await assert.rejects(g.factory.dispose(), /dispose failed/);
    assert.equal(g.trace.filter((x) => x[0] === "context.dispose").length, 1);
    assert(!g.trace.some((x) => x[0] === "directory.dispose"));
  }
});

test("p6 runtime composes restored scheduler and actual credential gates", async () => {
  const state = createCredentialObservationState();
  const scheduling = createCommandScheduling(state);
  const f = fixture(createCommandRuntimeFactory, { scheduling });
  const r = await f.factory.createRuntime({}, f.runtime);
  await r.executeAgentCommand({
    type: "get_tab",
    browser_id: "browser-1",
    tab_id: 3,
  });
  assert.equal(f.trace.filter((x) => x[0] === "record").length, 1);
  const gate = state.getGate("browser-1", {
    on() {},
    removeListener() {},
    async call() {
      return { frameTree: { frame: { id: "frame", loaderId: "protected" } } };
    },
  });
  await gate.protect(3);
  await assert.rejects(
    r.executeAgentCommand({
      type: "get_tab",
      browser_id: "browser-1",
      tab_id: 3,
    }),
    (error: any) =>
      error.details.reason === "credential_observation_restricted",
  );
  assert.equal(f.trace.filter((x) => x[0] === "unhandled").length, 1);
  assert.equal(f.trace.filter((x) => x[0] === "record").length, 1);
  await f.factory.dispose();
});

test("runtime uses restored documentation controller and real documentation commands", async () => {
  const f = fixture(createCommandRuntimeFactory, {
    realDocumentation: true,
    scheduling: createCommandScheduling(createCredentialObservationState()),
  });
  const r = await f.factory.createRuntime({}, f.runtime);
  await assert.rejects(
    r.executeAgentCommand({
      type: "known",
      browser_id: "browser-1",
      tab_id: 3,
    }),
    /Required documentation has not been read/,
  );
  assert.equal(f.trace.filter((x) => x[0] === "context").length, 0);
  const content = await r.executeAgentCommand({
    type: "get_browser_documentation",
    browser_id: "browser-1",
  });
  assert(content.includes(" custom policy "));
  assert(content.includes("interface Browser {"));
  assert(content.includes("name: string;"));
  await r.executeAgentCommand({
    type: "known",
    browser_id: "browser-1",
    tab_id: 3,
  });
  assert.equal(
    await r.executeAgentCommand({ type: "get_documentation", name: "intro" }),
    "file:intro",
  );
  assert.equal(f.trace.filter((x) => x[0] === "command").length, 1);
  await f.factory.dispose();
});
