import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { originalServiceBindings } from "./service-source";
import { inputTimeout } from "../packages/browser/src/service/input/input";
import {
  PlaywrightDomSnapshotCommand,
  normalizeSnapshot,
  snapshotFrameRef,
  expandSnapshotFrames,
} from "../packages/browser/src/service/commands/dom_snapshot";
const original = originalServiceBindings(
  [
    "F",
    "JN",
    "Wte",
    "$te",
    "e2",
    "t2",
    "Gte",
    "Vte",
    "ZN",
    "zte",
    "QN",
    "r2",
    "n2",
    "Kte",
    "Xte",
    "Yte",
  ],
  { Ve: inputTimeout },
);
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  const root = {};
  const helper = (child = false) => ({
    incrementalAriaSnapshot() {
      return child
        ? {
            full: '- generic:\n  - button "Child" [ref=e5]',
            iframeRefs: [],
            iframeDepths: {},
          }
        : {
            full: '- generic:\n  - iframe [ref=f1]\n  - iframe [ref=f2]\n  - img [ref=e9]\n  - button "Root" [ref=e1] [cursor=pointer]',
            iframeRefs: ["f1", "f2", "missing"],
            iframeDepths: { f1: 1, f2: 1 },
          };
    },
    parseSelector(s: string) {
      return s;
    },
    querySelectorAll(s: string) {
      if (mode === "missing-frame") return [];
      if (mode === "query-error") throw Error("missing");
      return [
        {
          getAttribute(name: string) {
            return name === "id"
              ? `id-${s}`
              : name === "name"
                ? 'quoted"name'
                : mode === "hidden" && s.endsWith("f2")
                  ? "true"
                  : null;
          },
        },
      ];
    },
    elementState() {
      return { matches: mode !== "invisible" };
    },
  });
  const context: any = {
    isIabBackend: mode === "iab",
    acquireAuthority() {
      trace.push("authority");
      return {
        observeContent(url: string) {
          trace.push(["observe", url]);
          return {
            async assert() {
              trace.push("assert");
              if (mode === "denied") throw Error("denied");
            },
          };
        },
      };
    },
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return "https://fixture.test/";
      },
    },
    playwright: {
      executionPolicy: { documentOnly: mode === "document-only" },
      async evaluateOnPlaywrightPage(
        id: string,
        callback: Function,
        options: any,
      ) {
        trace.push(["page", id, options]);
        if (mode === "page-error") throw Error("page failed");
        return vm.runInNewContext(`(${callback.toString()})(helper)`, {
          helper: helper(),
          document: {
            body: mode === "no-root" ? null : root,
            documentElement: null,
          },
        });
      },
      async evaluateOnPlaywrightSelector(
        id: string,
        selector: string,
        callback: Function,
        options: any,
      ) {
        trace.push(["frame", id, selector, options]);
        if (mode === "child-error") throw Error("child failed");
        return vm.runInNewContext(`(${callback.toString()})(root, helper)`, {
          root,
          helper: helper(true),
        });
      },
    },
  };
  const now = Date.now;
  Date.now = () => 1000;
  try {
    return {
      value: await (source ? original.e2 : PlaywrightDomSnapshotCommand)(
        { tab_id: "7", timeout_ms: 800 },
        context,
      ),
      trace,
    };
  } catch (e) {
    return { error: (e as Error).message, trace };
  } finally {
    Date.now = now;
  }
}
test("DOM snapshot command matches original page callbacks, frame routing and policy", async () => {
  for (const mode of [
    "normal",
    "iab",
    "document-only",
    "no-root",
    "denied",
    "page-error",
    "child-error",
    "hidden",
    "invisible",
    "missing-frame",
    "query-error",
  ]) {
    const actual = await run(false, mode),
      expected = await run(true, mode);
    assert.deepEqual(
      JSON.parse(JSON.stringify(actual)),
      JSON.parse(JSON.stringify(expected)),
      mode,
    );
  }
  const normal = await run(false, "normal");
  assert.match(normal.value.dom_snapshot, /button "Child"/);
  assert.doesNotMatch(
    normal.value.dom_snapshot,
    /\[ref=|cursor=|- generic|- img/,
  );
  assert.equal(
    (await run(false, "document-only")).trace.filter((x) => x[0] === "frame")
      .length,
    0,
  );
  const iab = await run(false, "iab");
  assert.deepEqual(iab.trace.find((x) => x[0] === "frame")[3], {
    deadlineMs: 2000,
    retry: false,
    scrollFrameIntoView: false,
    timeoutMs: 500,
  });
});
test("snapshot normalization matches original tree flattening and frame-ref recognition", () => {
  for (const text of [
    "",
    "plain text\n  unchanged",
    "- generic:\n  - button [ref=x]",
    "- img:\n  - text: gone",
    '- img "named" [ref=x]',
    '- group:\n  - listitem:\n    - link "keep" [cursor=pointer]',
    "\n- button\n\n  - text: child",
    "  - iframe [ref=x]:",
    '- iframe [id="quoted"] [ref=a]',
    "- button [ref=x] [ref=y]",
    "- generic [disabled]:\n   - text: uneven",
  ]) {
    assert.equal(normalizeSnapshot(text), original.ZN(text));
    assert.equal(snapshotFrameRef(text), original.Vte(text));
  }
  assert.equal(normalizeSnapshot("- generic:\n  - button [ref=x]"), "- button");
});
test("snapshot expansion preserves nested selectors, child failures and expired budgets", async () => {
  for (const expired of [false, true]) {
    async function execute(source: boolean) {
      const trace: any[] = [];
      const context: any = {
        playwright: {
          async evaluateOnPlaywrightSelector(
            id: any,
            selector: string,
            _callback: any,
            options: any,
          ) {
            trace.push([id, selector, options]);
            return selector.includes("aria-ref=b")
              ? { full: '- button "Nested"', iframeRefs: [], iframeDepths: {} }
              : {
                  full: "- iframe [ref=b]",
                  iframeRefs: ["b"],
                  iframeDepths: { b: 1 },
                };
          },
        },
      };
      const snapshot = {
        full: "- iframe [ref=a]",
        iframeRefs: ["a"],
        iframeDepths: { a: 1 },
      };
      return {
        value: await (source ? original.t2 : expandSnapshotFrames)(
          context,
          "7",
          snapshot,
          100,
          undefined,
          expired ? 0 : undefined,
        ),
        trace,
      };
    }
    assert.deepEqual(await execute(false), await execute(true));
    if (!expired)
      assert.match(
        (await execute(false)).trace[1][1],
        /aria-ref=a >> internal:control=enter-frame >> aria-ref=b/,
      );
  }
});
