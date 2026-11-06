import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
import { positiveTabId } from "../packages/browser/src/service/tab_id";
import { inputTimeout } from "../packages/browser/src/service/input/input";
import {
  PlaywrightDomSnapshotCommand,
  normalizeSnapshot,
  snapshotFrameRef,
  expandSnapshotFrames,
} from "../packages/browser/src/service/commands/dom_snapshot";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
const original = originalServiceBindings(
  [
    "l2",
    "Ja",
    "Dc",
    "Co",
    "Mc",
    "Gte",
    "c2",
    "Wte",
    "$te",
    "m2",
    "d2",
    "p2",
    "zte",
    "Kte",
    "Vte",
    "u2",
  ],
  {
    O: defineCommand,
    H: positiveTabId,
    Oe: inputTimeout,
    Hte: 1000,
    jte: 500,
    a2: " >> internal:control=enter-frame >> ",
  },
);
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  const root = {};
  let reads = 0;
  const enabled = mode.startsWith("siwc");
  const helper = (child = false) => ({
    siwcDocumentId: () =>
      mode === "siwc-changed" && reads > 1 ? "new" : "generation",
    siwcDetect: () =>
      mode === "siwc-empty"
        ? []
        : [
            {
              ref: "e1",
              evidence: "chatgpt_button_detected",
              visibility: "rendered",
            },
          ],
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
    supportsTabCapability: async () => enabled,
    getCurrentSessionId: () => "session",
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
        reads++;
        if (mode === "siwc-observation-fails" && reads > 1)
          throw Error("observation failed");
        if (mode === "page-error") throw Error("page failed");
        return vm.runInNewContext(`(${callback.toString()})(helper, enabled)`, {
          enabled: options.arg,
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
      value: await (source ? original.l2 : PlaywrightDomSnapshotCommand)(
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
    "siwc",
    "siwc-empty",
    "siwc-changed",
    "siwc-observation-fails",
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
  const withSiwc = await run(false, "siwc");
  assert.match(withSiwc.value.dom_snapshot, /Root.*\[ref=e1\]/);
  assert.doesNotMatch(withSiwc.value.dom_snapshot, /Child.*\[ref=/);
  assert.equal(withSiwc.value.siwc.status, "possible_matches");
  assert.doesNotMatch(
    (await run(false, "siwc-changed")).value.dom_snapshot,
    /Root/,
  );
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
    for (const preserve of [false, true])
      assert.equal(
        normalizeSnapshot(text, preserve),
        original.Gte(text, preserve),
      );
    assert.equal(snapshotFrameRef(text), original.$te(text));
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
        value: await (source ? original.c2 : expandSnapshotFrames)(
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
