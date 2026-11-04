import test from "node:test";
import assert from "node:assert/strict";
import {
  createBrowserDirectoryClass,
  createTurnEndedTrackerClass,
  BrowserClientApi,
} from "../packages/browser/src/service/runtime/browser_directory";
import { originalServiceBindings } from "./service-source";
async function run(original: boolean, mode: string) {
  const trace: any[] = [];
  const runtime = { turn: "first" };
  const clients: any[] = [];
  let discoveries = 0;
  let gateResolve: any;
  const gate = new Promise<void>((resolve) => (gateResolve = resolve));
  class Api {
    listeners: Function[] = [];
    constructor(
      public transport: any,
      ...args: any[]
    ) {
      clients.push(this);
      trace.push(["api", transport, args.length]);
      if (args.length) {
        this.metadata = args[1];
        this.headers = args[3];
      }
    }
    metadata?: Function;
    headers?: Function;
    addCloseListener(fn: Function) {
      trace.push(["listen", this.transport]);
      this.listeners.push(fn);
    }
    async close() {
      trace.push(["close", this.transport]);
      if (mode === "close-error" && this.transport === "dot-pipe")
        throw Error("close failed");
      for (const listener of this.listeners) listener();
    }
    async getInfo() {
      trace.push(["getInfo", this.transport]);
      if (mode === "info-error") throw Error("info failed");
      return {};
    }
  }
  const iab: any = {
    id: "iab",
    info: { type: "iab", name: "Browser" },
    pipe: "pipe",
    api: new Api("iab-pipe"),
  };
  const ext: any = {
    id: "chrome",
    info: { type: "extension", name: "Chrome" },
    api: new Api("extension-pipe"),
  };
  const deps: any = {
    ClientApi: BrowserClientApi,
    TurnEndedTracker: class {
      constructor(r: any) {
        trace.push(["tracker", r === runtime]);
      }
      dispose() {
        trace.push(["tracker dispose"]);
      }
    },
    BrowserApi: Api,
    async discover(r: any, factory: any, previous: any[]) {
      trace.push(["discover", r === runtime, previous.map((x) => x.id)]);
      discoveries++;
      if (mode === "refresh-error") throw Error("refresh failed");
      if (mode === "pending-refresh") await gate;
      const api = factory("discovered");
      runtime.turn = "second";
      trace.push(
        ["metadata", api.metadata()],
        ["headers", await api.headers()],
      );
      return mode === "empty" ? [] : mode === "no-iab" ? [ext] : [iab, ext];
    },
    turnMetadata: (r: any) => r.turn,
    surfaceEnabled: () => mode !== "disabled",
    assertSurfaceEnabled() {
      trace.push(["assert dot"]);
      if (mode === "disabled") throw Error("disabled");
    },
    findBrowser: (items: any[], id: string) => items.find((x) => x.id === id),
    selectDefault: (items: any[], pref: any) => {
      trace.push(["default", pref]);
      return items[0];
    },
    selectForUrl: async (items: any[], url: string, pref: any) => {
      trace.push(["url", url, pref]);
      return items[0];
    },
    matchesPreference: (info: any, pref: any) =>
      info.type === "extension" && pref != null,
    connect: async (pipe: string) => {
      trace.push(["connect", pipe]);
      if (mode === "connect-error") throw Error("connect failed");
      return pipe === "pipe" ? "dot-pipe" : "replacement-pipe";
    },
    readInfo: async () => {
      trace.push(["read info"]);
      if (mode === "read-error") throw Error("read failed");
      return {
        type: mode === "wrong-type" ? "extension" : "iab",
        apiSupportOverrides: {
          "Browser.user": mode !== "no-user",
          "BrowserUser.claimTab": mode !== "no-claim",
          "BrowserUser.openTabs": mode !== "no-tabs",
        },
      };
    },
  };
  const { Sx } = originalServiceBindings(["Hy", "Sx"]);
  const map: any = {
    fb: deps.TurnEndedTracker,
    mb: deps.ClientApi,
    id: deps.BrowserApi,
    M6: deps.discover,
    Me: deps.turnMetadata,
    pl: deps.surfaceEnabled,
    Is: deps.assertSurfaceEnabled,
    hb: deps.findBrowser,
    U6: deps.selectDefault,
    q6: deps.selectForUrl,
    bb: deps.matchesPreference,
    Vo: { create: deps.connect },
    Hx: deps.readInfo,
    Sx,
  };
  const Directory = original
    ? originalServiceBindings(["yb"], map).yb
    : createBrowserDirectoryClass(deps);
  const directory = new Directory(
    runtime,
    { preferredWindowId: 7 },
    { getExtensionRequestHeaders: async () => ({ fixture: "header" }) },
  );
  async function attempt(name: string, fn: () => any) {
    try {
      const result = await fn();
      trace.push([name, result?.id ?? result]);
    } catch (error: any) {
      trace.push([name + " error", error.message]);
    }
  }
  const refresh1 = directory.refresh(),
    refresh2 = directory.refresh();
  if (mode === "pending-refresh") {
    const disposal = directory.dispose();
    gateResolve();
    await attempt("pending disposal", () => disposal);
  }
  await attempt("refresh", () => Promise.all([refresh1, refresh2]));
  trace.push(["discoveries", discoveries]);
  if (mode === "refresh-error") return trace;
  if (mode === "concurrent-dot")
    await attempt("parallel dot", async () => {
      const values = await Promise.all([
        directory.getDotBrowser(),
        directory.getDotBrowser(),
        directory.getDotBrowser(),
      ]);
      return values.every((value) => value === values[0]);
    });
  await attempt("list", () => directory.list());
  await attempt("default result", () => directory.getDefault());
  await attempt("url result", () =>
    directory.getForUrl("https://fixture.invalid"),
  );
  await attempt("get result", () => directory.get("chrome"));
  await attempt("missing", () => directory.get("missing"));
  trace.push(["window", directory.preferredWindowIdFor(ext.info)]);
  await attempt("dot first", () => directory.get("dot"));
  await attempt("dot reused", () => directory.getDotBrowser());
  if (mode === "replace") {
    iab.pipe = "new-pipe";
    await attempt("dot replaced", () => directory.getDotBrowser());
  }
  if (mode === "close-event") {
    const dot = await directory.getDotBrowser();
    await dot.api.close();
    trace.push(["dot cleared", directory.dotBrowser === null]);
    await attempt("dot reopened", () => directory.getDotBrowser());
  }
  directory.trackBrowser(ext);
  await ext.api.close();
  trace.push(["after close", directory.browsers?.map((x: any) => x.id)]);
  await attempt("dispose", () => directory.dispose());
  trace.push(["final", directory.browsers, directory.dotBrowser]);
  return trace;
}
test("browser directory matches original discovery, selection, Dot reuse/replacement and cleanup", async () => {
  for (const mode of [
    "normal",
    "concurrent-dot",
    "disabled",
    "empty",
    "no-iab",
    "refresh-error",
    "pending-refresh",
    "connect-error",
    "read-error",
    "wrong-type",
    "no-user",
    "no-claim",
    "no-tabs",
    "info-error",
    "replace",
    "close-event",
    "close-error",
  ]) {
    const expected = await run(true, mode),
      actual = await run(false, mode);
    assert.deepEqual(actual, expected, mode);
    assert.equal(actual.find((row) => row[0] === "discoveries")[1], 1);
    if (mode === "replace")
      assert.ok(
        actual.some((row) => row[0] === "close" && row[1] === "dot-pipe"),
      );
  }
});
test("turn-ended tracker matches original session replacement, drain-before-await and disposal", async () => {
  async function execute(original: boolean) {
    const trace: any[] = [];
    let hook: any;
    const report = (error: Error) => trace.push(["report", error.message]);
    const Tracker = original
      ? originalServiceBindings(["fb"], { Dt: report }).fb
      : createTurnEndedTrackerClass(report);
    const tracker = new Tracker({
      addTurnEndedHandler(value: any) {
        hook = value;
        trace.push(["timeout", value.timeoutMs]);
        return () => trace.push(["remove"]);
      },
    });
    let release: any;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = async (turn: any) => {
      trace.push(["first", turn]);
      await gate;
    };
    const failing = async () => {
      trace.push(["failing"]);
      throw Error("secret error omitted");
    };
    const other = async (turn: any) => {
      trace.push(["other", turn]);
    };
    await tracker.track({ session_id: "s", turn_id: "old" }, first);
    await tracker.track({ session_id: "s", turn_id: "new" }, first);
    await tracker.track({ session_id: "s", turn_id: "new" }, failing);
    await tracker.track({ session_id: "other", turn_id: "new" }, other);
    await hook.run({ session_id: "s", turn_id: "old" });
    const pending = hook.run({ session_id: "s", turn_id: "new" });
    await hook.run({ session_id: "s", turn_id: "new" });
    release();
    await pending;
    await hook.run({ session_id: "other", turn_id: "new" });
    tracker.dispose();
    tracker.dispose();
    await tracker.track({ session_id: "s", turn_id: "new" }, first);
    await tracker.finishTurn({ session_id: "s", turn_id: "new" });
    trace.push(["sessions", tracker.sessions.size]);
    return trace;
  }
  assert.deepEqual(await execute(false), await execute(true));
  assert.throws(
    () => new (createTurnEndedTrackerClass(() => {}))({}),
    /requires Node REPL turn-ended hooks/,
  );
});

test("URL selection and browser aliases match original ranking and provider failures", async () => {
  const selection =
    await import("../packages/browser/src/service/runtime/browser_selection");
  const { isIP } = await import("node:net");
  const { isBrowserFamily } =
    await import("../packages/browser/src/service/browser_family");
  const original = originalServiceBindings(
    [
      "Hy",
      "Wy",
      "NA",
      "hb",
      "bb",
      "U6",
      "jB",
      "j6",
      "L6",
      "nce",
      "ds",
      "gb",
      "rce",
      "oce",
      "q6",
    ],
    {
      ky: isBrowserFamily,
      ece: isIP,
      Lt: (value: string) => {
        try {
          return new URL(value);
        } catch {
          return null;
        }
      },
      tce: 1000,
      Wx: selection.browserBackendDeadline,
    },
  );
  const urls = [
    "https://example.com/a#two",
    "https://example.com/a?q=2",
    "https://example.com/b",
    "https://sub.example.com/a",
    "https://other.invalid",
    "file:///synthetic",
    "http://localhost:8080",
    "http://127.0.0.1",
    "http://[::1]",
  ];
  for (const preferred of [false, true])
    for (const order of [false, true])
      for (const input of urls) {
        let candidates = [
          {
            id: "iab",
            type: "iab",
            openTabUrls: ["https://else.invalid"],
            matchesPreferredExtension: false,
          },
          {
            id: "chrome",
            type: "extension",
            openTabUrls: ["https://example.com/a#one", "invalid"],
            matchesPreferredExtension: preferred,
          },
          {
            id: "edge",
            type: "extension",
            openTabUrls: ["https://sub.example.com/a"],
            matchesPreferredExtension: !preferred,
          },
          { id: "cdp", type: "cdp", openTabUrls: [input] },
        ];
        if (order) candidates.reverse();
        assert.equal(
          selection.chooseBrowserForUrl(candidates, input),
          original.rce(candidates, input),
        );
      }
  for (const left of [
    "EXAMPLE.COM.",
    "sub.example.com",
    "com",
    "127.0.0.1",
    "a.127.0.0.1",
    "example.com",
  ])
    for (const right of [
      "example.com",
      "b.example.com",
      "sub.example.com.",
      "127.0.0.1",
    ])
      assert.equal(
        selection.hostnameHierarchyMatches(left, right),
        original.nce(left, right),
      );
  const browsers = [
    {
      id: "unique",
      info: { type: "extension", metadata: { extensionInstanceId: "wanted" } },
    },
    { id: "edge-id", info: { type: "extension", family: "edge" } },
    { id: "iab-id", info: { type: "iab" } },
    { id: "dot", info: { type: "iab" } },
  ];
  for (const requested of [
    "chrome",
    "edge",
    "extension",
    "iab",
    "dot",
    "cdp",
    "unique",
    "missing",
  ])
    assert.equal(
      selection.findDirectoryBrowser(browsers, requested),
      original.hb(browsers, requested),
    );
  for (const list of [browsers, browsers.slice(0, 2), [], browsers.slice(1)])
    for (const preference of [
      null,
      { extensionInstanceId: "wanted" },
      { extensionInstanceId: "missing" },
    ])
      assert.equal(
        selection.selectDefaultBrowser(list, preference),
        original.U6(list, preference),
      );
  for (const mode of ["normal", "reject", "sync-error", "invalid-result"])
    for (const type of ["extension", "iab", "cdp"]) {
      async function execute(source: boolean) {
        const trace: any[] = [];
        const api = {
          getTabs() {
            trace.push("tabs");
            if (mode === "sync-error") throw Error("sync");
            return mode === "reject"
              ? Promise.reject(Error("async"))
              : Promise.resolve(
                  mode === "invalid-result"
                    ? null
                    : [{ url: "https://fixture.invalid" }, { url: 3 }],
                );
          },
          getUserTabs() {
            trace.push("user");
            return this.getTabs();
          },
        };
        try {
          trace.push(
            await (source
              ? original.oce(api, type)
              : selection.openBrowserTabUrls(api, type)),
          );
        } catch (error: any) {
          trace.push(error.message);
        }
        return trace;
      }
      assert.deepEqual(await execute(false), await execute(true));
    }
  for (const count of [0, 1, 3])
    for (const input of [...urls, "invalid"]) {
      async function execute(source: boolean) {
        const trace: any[] = [];
        const entries = ["extension", "iab", "cdp"]
          .slice(0, count)
          .map((type, index) => ({
            id: String(index),
            info: { type },
            api: {
              async getUserTabs() {
                trace.push(["user", index]);
                return [{ url: "https://example.com/a" }];
              },
              async getTabs() {
                trace.push(["tabs", index]);
                return [{ url: "https://other.invalid" }];
              },
            },
          }));
        try {
          const result = await (source
            ? original.q6(entries, input, null)
            : selection.selectBrowserForUrl(entries, input, null));
          trace.push(["selected", result?.id]);
        } catch (error: any) {
          trace.push(["error", error.message]);
        }
        return trace;
      }
      assert.deepEqual(await execute(false), await execute(true));
    }
  assert.throws(() => selection.chooseBrowserForUrl([], "not a url"));
  await assert.rejects(
    selection.browserBackendDeadline(new Promise(() => {}), 1, "fixture"),
    /Timed out after 1ms waiting for fixture\./,
  );
  // Exercise the default selection functions through actual directory methods.
  const Directory = createBrowserDirectoryClass({
    ClientApi: BrowserClientApi,
    TurnEndedTracker: class {
      dispose() {}
    },
    BrowserApi: class {},
    discover: async () => browsers,
    turnMetadata: () => null,
    surfaceEnabled: () => false,
    assertSurfaceEnabled() {},
    connect: async () => {},
    readInfo: async () => ({}),
  });
  const directory = new Directory({}, null);
  directory.browsers = browsers;
  assert.equal(await directory.get("chrome"), browsers[0]);
  assert.equal(await directory.getDefault(), browsers[2]);
  assert.equal(await directory.getForUrl("file:///synthetic"), browsers[2]);
});
