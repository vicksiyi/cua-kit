import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  discoverWebMcpFrames,
  staleWebMcpRegistration,
} from "../packages/browser/src/service/webmcp/frame_discovery";
const original = originalServiceBindings(["Es", "Ct", "uN"]);
const frame = (id: string, extra: any = {}) => ({
  id,
  loaderId: "loader-" + id,
  secureContextType: "Secure",
  securityOrigin: "https://fixture.test",
  url: "https://fixture.test/" + id,
  urlFragment: "#fragment",
  ...extra,
});
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  const root = { tabId: 7 };
  const tree = {
    frame: frame("root", mode === "empty-url" ? { url: "" } : {}),
    childFrames: [
      {
        frame: frame("child", {
          parentId: "root",
          name: mode === "exclude" ? "probe" : "",
          ...(mode === "file"
            ? {
                securityOrigin: "file://",
                url: "file:///tmp/page.html?query=x#old",
                urlFragment: "",
              }
            : mode === "insecure"
              ? { secureContextType: "Insecure" }
              : mode === "sandbox"
                ? {
                    securityOrigin:
                      "codex-sandbox://x.web-sandbox.oaiusercontent.com",
                  }
                : mode === "bad-sandbox"
                  ? { securityOrigin: "codex-sandbox://evil.test" }
                  : mode === "local"
                    ? {
                        secureContextType: "SecureLocalhost",
                        securityOrigin: "http://localhost",
                        securityOriginDetails: { isLocalhost: true },
                      }
                    : {}),
        }),
        childFrames: [{ frame: frame("grandchild", { parentId: "child" }) }],
      },
    ],
  };
  const api: any = {
    async getFrameTree(target: any) {
      trace.push(["tree", target]);
      return target.targetId
        ? {
            frameTree: {
              frame: frame(mode === "stale" ? "wrong" : target.targetId),
            },
          }
        : { frameTree: tree };
    },
    async getTargets() {
      trace.push("targets");
      return {
        targetInfos: [
          { type: "iframe", targetId: "a", tabId: 7 },
          { type: "other", targetId: "b", url: "" },
          { type: "iframe", targetId: "foreign", tabId: 9 },
          { type: "other", targetId: "no-url" },
          { type: "page", targetId: "page" },
        ],
      };
    },
    async observe(target: any) {
      trace.push(["observe", target]);
      if (mode === "observe-error") throw Error("observe failed");
    },
    async getFrameOwner(target: any, id: string) {
      trace.push(["owner", target, id]);
      if (mode === "owner-error") throw Error("unexpected failure");
      if (id === "b" && target.targetId !== "a")
        throw mode === "string-error"
          ? "Frame with the given id was not found"
          : new Error("Frame with the given id does not belong to the target");
      return {};
    },
    async attach(id: string) {
      trace.push(["attach", id]);
      if (mode === "attach-error") throw Error("attach failed");
      return { tabId: 7, targetId: id, sessionId: "session-" + id };
    },
  };
  try {
    return {
      value: await (source ? original.uN : discoverWebMcpFrames)(
        root,
        api,
        mode === "exclude" ? "probe" : undefined,
      ),
      trace,
    };
  } catch (e) {
    return { error: (e as Error).message, trace };
  }
}
test("WebMCP frame discovery matches original traversal, target ownership and registration identity", async () => {
  for (const mode of [
    "normal",
    "empty-url",
    "exclude",
    "file",
    "insecure",
    "sandbox",
    "bad-sandbox",
    "local",
    "stale",
    "observe-error",
    "owner-error",
    "string-error",
    "attach-error",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  const normal = await run(false, "normal");
  assert.deepEqual(
    normal.value!.frames.map((x: any) => x.frameId),
    ["root", "child", "grandchild", "a", "b"],
  );
  assert.equal(normal.value!.pageUrl, "https://fixture.test/root#fragment");
  assert.deepEqual(
    (await run(false, "exclude")).value!.frames.map((x: any) => x.frameId),
    ["root", "a", "b"],
  );
  assert.equal(
    (await run(false, "file")).value!.frames[1].fileUrl,
    "file:///tmp/page.html",
  );
  assert.equal((await run(false, "stale")).error, staleWebMcpRegistration);
});
test("secure-context origin combinations preserve the original acceptance boundary", async () => {
  for (const secureContextType of [
    "Secure",
    "SecureLocalhost",
    "Insecure",
    undefined,
  ])
    for (const securityOrigin of [
      "https://fixture.test",
      "http://localhost",
      "http://remote.test",
      "file://",
      "codex-sandbox://x.web-sandbox.oaiusercontent.com",
      "codex-sandbox://u:p@web-sandbox.oaiusercontent.com",
      "null",
    ])
      for (const isLocalhost of [true, false]) {
        const root = { tabId: 7 };
        const api: any = {
          getFrameTree: async () => ({
            frameTree: {
              frame: frame("root", {
                secureContextType,
                securityOrigin,
                securityOriginDetails: { isLocalhost },
                url:
                  securityOrigin === "file://"
                    ? "file:///tmp/file?x#y"
                    : "https://fixture.test/",
              }),
            },
          }),
          getTargets: async () => ({ targetInfos: [] }),
          observe: async () => {},
        };
        assert.deepEqual(
          await discoverWebMcpFrames(root, api),
          await original.uN(root, api),
        );
      }
});
test("WebMCP discovery reads actual Chromium frame identity and excludes probe subtrees", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body:
          new URL(route.request().url()).pathname === "/root"
            ? '<iframe name="ordinary" src="/child"></iframe><iframe name="probe" src="/probe"></iframe><iframe name="inline" srcdoc="<p>Inline</p>"></iframe>'
            : "<button>Child</button>",
      }),
    );
    await page.goto("https://fixture.test/root#fragment");
    const session = await page.context().newCDPSession(page);
    await session.send("Page.enable");
    const api: any = {
      getFrameTree: () => session.send("Page.getFrameTree"),
      getTargets: () => session.send("Target.getTargets"),
      observe: async () => {},
      getFrameOwner: (_target: any, frameId: string) =>
        session.send("DOM.getFrameOwner", { frameId }),
      attach: async () => {
        throw Error("This fixture does not attach OOPIF targets");
      },
    };
    const first = await discoverWebMcpFrames({ tabId: 7 }, api, "probe");
    const tree = await session.send("Page.getFrameTree");
    const ordinary = tree.frameTree.childFrames!.find(
        (entry) => entry.frame.name === "ordinary",
      )!,
      probe = tree.frameTree.childFrames!.find(
        (entry) => entry.frame.name === "probe",
      )!;
    assert.ok(
      first.frames.some((entry) => entry.frameId === ordinary.frame.id),
      JSON.stringify(tree),
    );
    assert.ok(!first.frames.some((entry) => entry.frameId === probe.frame.id));
    const inline = tree.frameTree.childFrames!.find(
      (entry) => entry.frame.name === "inline",
    )!;
    assert.equal(inline.frame.securityOrigin, "://");
    assert.ok(!first.frames.some((entry) => entry.frameId === inline.frame.id));
    assert.ok(first.snapshot.includes(inline.frame.id));
    assert.ok(!first.snapshot.includes(probe.frame.id));
    assert.equal(first.pageUrl, "https://fixture.test/root#fragment");
    assert.equal(
      first.snapshot,
      (await discoverWebMcpFrames({ tabId: 7 }, api, "probe")).snapshot,
    );
  } finally {
    await browser.close();
  }
});
