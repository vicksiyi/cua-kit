import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { brotliDecompressSync } from "node:zlib";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";
import { AccessibilityCaptureManager } from "../packages/browser/src/service/accessibility/capture_manager";
import { loadBrowserAccessibilityWasm } from "../packages/browser/src/service/accessibility/wasm";
const original = originalServiceBindings(
  [
    "iu",
    "zre",
    "Lv",
    "$h",
    "Lr",
    "K2",
    "Ji",
    "nu",
    "Kh",
    "Bo",
    "j2",
    "Uv",
    "gre",
    "bre",
    "Kre",
    "Xre",
    "hre",
    "Fv",
    "H2",
    "yre",
    "wre",
    "qv",
    "ko",
    "_re",
    "vre",
    "q2",
    "Lt",
    "W2",
    "jv",
    "$2",
  ],
  { Z2: {} },
);
const create = (restored: boolean, cdp: any, options: any = {}) =>
  restored
    ? new AccessibilityCaptureManager(
        cdp,
        () => "session",
        { perform: async () => {} },
        options,
      )
    : new original.Kh(
        cdp,
        () => "session",
        { perform: async () => {} },
        options,
      );
function cdpFixture() {
  const cdp: any = new EventEmitter();
  cdp.getJsDialog = () => undefined;
  cdp.addTabCleanupHandler = () => () => {};
  return cdp;
}

test("AX full capture manager matches original using real Chromium, iframe and installed WASM", async () => {
  const bytes = brotliDecompressSync(
    await readFile(
      `${process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai"}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-accessibility.wasm.br`,
    ),
  );
  const core = await loadBrowserAccessibilityWasm(bytes),
    browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<title>Capture test</title><button>Root action</button><input type=password value=private><iframe srcdoc="<button>Child action</button>"></iframe>',
    );
    await page.frameLocator("iframe").locator("button").waitFor();
    const session = await page.context().newCDPSession(page);
    async function run(restored: boolean) {
      const cdp = cdpFixture();
      cdp.call = (_tab: number, method: string, params: any) =>
        session.send(method as any, params);
      cdp.callTarget = (_target: any, method: string, params: any) =>
        session.send(method as any, params);
      cdp.targetForFrameOrAttach = async () => undefined;
      cdp.targetIdForFrame = () => undefined;
      cdp.readDocumentState = async () =>
        page.evaluate(() => ({
          href: location.href,
          readyState: document.readyState,
          painted: true,
        }));
      cdp.evaluateJavascript = (_tab: number, expression: string) =>
        page.evaluate(expression);
      const manager: any = create(restored, cdp, {
        accessibilityCore: core,
        getTab: () => ({
          title: "Capture test",
          url: "about:blank",
          active: true,
        }),
        getSiteInstruction: () => "test instruction",
      });
      const image = await manager.capture(1, "screenshot", {}, async () => ({
        data: "image",
      }));
      assert.equal(manager.sessions.size, 0);
      const first = await manager.capture(1, "axState", {});
      manager.validateCapture(1, first);
      const second = await manager.capture(1, "axState", {});
      const combined = await manager.capture(
        1,
        "all",
        { disableDiffing: true },
        async () => ({ data: "image" }),
      );
      const state = manager.currentState(1),
        targets = [];
      for (let id = 0; id < 40; id++) {
        try {
          targets.push(manager.targetForElement(1, id));
        } catch {}
      }
      state.loaderId = "different";
      let stale;
      try {
        manager.validateCapture(1, first);
      } catch (e: any) {
        stale = e.message;
      }
      manager.dispose();
      return { image, first, second, combined, targets, stale };
    }
    const expected = await run(false),
      actual = await run(true);
    assert.deepEqual(actual, expected);
    assert.match(actual.first.state, /Root action/);
    assert.match(actual.first.state, /Child action/);
    assert(!actual.first.state.includes("private"));
    assert(actual.targets.length > 0);
    assert.match(actual.stale!, /previous page/);
  } finally {
    await browser.close();
  }
});

test("AX capture loop matches original retries, sparse captures, screenshot delay and final failure", async () => {
  const now = Date.now,
    timeout = globalThis.setTimeout;
  async function run(restored: boolean, scenario: string) {
    let clock = 0;
    const trace: any[] = [],
      manager: any = create(restored, cdpFixture()),
      state = manager.currentState(1);
    state.initialized = true;
    state.mainFrameId = "main";
    state.loaderId = "loader";
    state.painted = true;
    if (scenario !== "fast") {
      state.pendingNavigationState = manager.navigationState(state);
      state.pendingNavigationState.loading = scenario !== "screenshot";
    }
    Date.now = () => clock;
    globalThis.setTimeout = ((callback: any, ms: number) => {
      clock += ms;
      trace.push(["sleep", ms]);
      queueMicrotask(callback);
      return 0;
    }) as any;
    manager.ensureTracked = async () => state;
    for (const name of [
      "waitForNavigation",
      "waitForFirstPaint",
      "waitForAXQuiet",
    ])
      manager[name] = async (_state: any, previous: any, navigated: any) => {
        trace.push([name, navigated]);
        return manager.navigationState(state);
      };
    manager.probeNavigationState = async () => {
      trace.push("probe");
      return {
        ...manager.navigationState(state),
        documentElementCount: scenario === "sparse" ? 300 : 0,
      };
    };
    let count = 0;
    manager.captureCandidate = async () => {
      count++;
      trace.push(["capture", count]);
      const candidate = {
        documentKey: "main:loader",
        tab: { id: 1 },
        rendered: "tree",
        elementCount: scenario === "sparse" ? 10 : 100,
        frames: new Map(),
        targets: new Map(),
        accessibilityRevision: {
          text: "tree",
          identityForElement: () => undefined,
        },
      };
      if (scenario === "unstable") {
        state.revision++;
        state.loading = true;
        state.painted = false;
        candidate.elementCount = 1;
      }
      return {
        documentKey:
          scenario === "mismatch" || (scenario === "retry" && count === 1)
            ? "other"
            : "main:loader",
        candidate:
          scenario === "empty" || scenario === "screenshot"
            ? undefined
            : candidate,
        data: scenario === "screenshot" ? "image" : undefined,
      };
    };
    let result, error;
    try {
      result = await manager.capture(
        1,
        scenario === "screenshot" ? "screenshot" : "axState",
        {},
      );
    } catch (e: any) {
      error = e.message;
    }
    return { trace, result, error, clock };
  }
  try {
    for (const scenario of [
      "fast",
      "normal",
      "sparse",
      "screenshot",
      "empty",
      "retry",
      "mismatch",
      "unstable",
    ])
      assert.deepEqual(
        await run(true, scenario),
        await run(false, scenario),
        scenario,
      );
  } finally {
    Date.now = now;
    globalThis.setTimeout = timeout;
  }
});

test("AX dialog candidate builder preserves synthesized targets and screenshot-unavailable protocol", async () => {
  async function run(restored: boolean, type: string, content: string) {
    const cdp = cdpFixture(),
      dialog = {
        id: "dialog",
        type,
        message: "Message",
        url: "https://example.com",
        promptText: "input",
        target: { tabId: 1 },
      };
    cdp.getJsDialog = () => dialog;
    cdp.activeJsDialog = () => dialog;
    const snapshots: any[] = [];
    const core = {
      buildRevision: (_previous: any, snapshot: any, options: any) => {
        const { capturedAt, ...stable } = snapshot;
        snapshots.push({ snapshot: stable, options });
        return { text: "dialog tree", identityForElement: () => undefined };
      },
    };
    const manager: any = create(restored, cdp, { accessibilityCore: core });
    const result = await manager.capture(1, content, { disableDiffing: true });
    const state = manager.currentState(1);
    manager.validateCapture(1, result);
    return {
      result,
      snapshots,
      frames: [...state.frames],
      targets: [...state.targets],
      initialized: state.initialized,
    };
  }
  for (const type of ["alert", "confirm", "prompt"])
    for (const content of ["axState", "screenshot", "all"])
      assert.deepEqual(
        await run(true, type, content),
        await run(false, type, content),
      );
});
