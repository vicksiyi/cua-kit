import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { originalServiceBindings } from "./service-source";
import { PlaywrightLocatorDownloadMediaCommand as command } from "../packages/browser/src/service/commands/download_media";
const original = originalServiceBindings(["F", "W", "Ve", "l2"]).l2;
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  const media: any = {
    localName: "a",
    href:
      mode === "empty"
        ? ""
        : mode === "bad-url"
          ? "invalid"
          : mode.startsWith("blob")
            ? "blob:https://fixture.test/id"
            : "https://fixture.test/media.png?x=1",
    download: "fixture.bin",
    getAttribute: () => null,
  };
  if (mode === "current-src")
    media.currentSrc = "https://fixture.test/current.png";
  if (mode === "blank-src") {
    media.src = "https://fixture.test/";
    media.getAttribute = () => " ";
  }
  const element: any = {
    scrollIntoView(options: any) {
      trace.push(["scroll", options]);
    },
    closest() {
      return mode === "descendant" ? null : media;
    },
    querySelector() {
      return media;
    },
    ownerDocument: {
      createElement(tag: string) {
        trace.push(["create", tag]);
        return {
          style: {},
          click() {
            trace.push([
              "click",
              {
                ...this,
                style: { ...this.style },
                click: undefined,
                remove: undefined,
              },
            ]);
            if (mode === "click-error") throw Error("click failed");
          },
          remove() {
            trace.push("remove");
          },
        };
      },
      body: {
        appendChild() {
          trace.push("append");
        },
      },
    },
  };
  const context: any = {
    acquireAuthority() {
      trace.push("authority");
      return {
        actInFrame(url: string) {
          trace.push(["act", url]);
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
    cdp: {
      async call(...args: any[]) {
        trace.push(["cdp", ...args]);
        return { frameTree: { frame: { id: "main" } } };
      },
    },
    downloads: {
      async withDownload(id: number, action: () => Promise<any>) {
        trace.push(["with", id]);
        try {
          return await action();
        } finally {
          trace.push("cleanup");
        }
      },
      async enableMediaDownload(...args: any[]) {
        trace.push(["enable", ...args]);
        if (mode === "enable-error") throw Error("enable failed");
      },
      async waitForDownload(...args: any[]) {
        trace.push(["wait", ...args]);
        if (mode === "wait-error") throw Error("wait failed");
        return { filename: "/fixture/download.bin" };
      },
    },
    playwright: {
      async evaluateOnPlaywrightSelectorWithTarget(
        id: any,
        selector: any,
        fn: Function,
        options: any,
      ) {
        trace.push(["read", id, selector, options]);
        return {
          result: vm.runInNewContext(`(${fn.toString()})(element)`, {
            element,
            __name: (fn: Function) => fn,
          }),
          frameIdentity:
            mode === "no-frame"
              ? null
              : { frameId: mode === "blob-child" ? "child" : "main" },
        };
      },
      async evaluateOnPlaywrightSelector(
        id: any,
        selector: any,
        fn: Function,
        options: any,
      ) {
        trace.push([
          "trigger",
          id,
          selector,
          JSON.parse(JSON.stringify(options)),
        ]);
        return vm.runInNewContext(`(${fn.toString()})(element, null, arg)`, {
          element,
          arg: options.arg,
          __name: (fn: Function) => fn,
        });
      },
    },
  };
  try {
    return {
      value: await (source ? original : command)(
        {
          tab_id: mode === "invalid-tab" ? 0 : "7",
          selector: "#media",
          timeout_ms:
            mode === "clamped" ? 200000 : mode === "zero" ? 0 : undefined,
        },
        context,
      ),
      trace,
    };
  } catch (e) {
    return { error: (e as Error).message, trace };
  }
}
test("media download preserves original source selection, validation, triggering and cleanup order", async () => {
  for (const mode of [
    "normal",
    "empty",
    "bad-url",
    "blob-main",
    "blob-child",
    "current-src",
    "blank-src",
    "descendant",
    "click-error",
    "denied",
    "enable-error",
    "wait-error",
    "no-frame",
    "invalid-tab",
    "clamped",
    "zero",
  ])
    assert.deepEqual(
      JSON.parse(JSON.stringify(await run(false, mode))),
      JSON.parse(JSON.stringify(await run(true, mode))),
      mode,
    );
  assert.equal(
    (await run(false, "blob-child")).error,
    "Blob downloads are not supported in embedded frames.",
  );
  assert.equal(
    (await run(false, "no-frame")).error,
    "Could not determine the media frame",
  );
  const normal = await run(false, "normal");
  assert.deepEqual(normal.value, { path: "/fixture/download.bin" });
  assert.equal(
    normal.trace.find((x) => x[0] === "click")[1].download,
    "media.png",
  );
  assert.equal(
    (await run(false, "blob-main")).trace.find((x) => x[0] === "click")[1]
      .download,
    "fixture.bin",
  );
  assert.equal(
    (await run(false, "clamped")).trace.find((x) => x[0] === "wait")[2],
    120000,
  );
  assert.equal((await run(false, "click-error")).trace.at(-1), "cleanup");
});
test("media command serialized callbacks cause a real Chromium blob download with original filename", async () => {
  const { chromium } = await import("playwright");
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "cua-media-"));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.setContent('<a id="media">Download</a>');
    await page.evaluate(() => {
      const link = document.querySelector("a")!;
      link.href = URL.createObjectURL(
        new Blob(["fixture-media-bytes"], { type: "application/octet-stream" }),
      );
      link.download = "媒体.bin";
    });
    const session = await page.context().newCDPSession(page);
    const { frameTree } = await session.send("Page.getFrameTree");
    const events: string[] = [];
    let download: ReturnType<typeof page.waitForEvent>;
    const context: any = {
      acquireAuthority: () => ({
        actInFrame: () => ({
          assert: async () => {
            events.push("authorize");
          },
        }),
      }),
      security: { currentTabUrl: async () => page.url() },
      cdp: {
        call: (_id: number, method: string) => session.send(method as any),
      },
      // Browser download lifecycle is a test adapter; original Downloads policy is separately tested.
      downloads: {
        async withDownload(_id: number, action: () => Promise<any>) {
          try {
            return await action();
          } finally {
            events.push("cleanup");
          }
        },
        async enableMediaDownload() {
          events.push("enable");
          download = page.waitForEvent("download");
        },
        async waitForDownload() {
          const item: any = await download;
          assert.equal(item.suggestedFilename(), "媒体.bin");
          const filename = join(directory, item.suggestedFilename());
          await item.saveAs(filename);
          return { filename };
        },
      },
      playwright: {
        async evaluateOnPlaywrightSelectorWithTarget(
          _id: any,
          selector: string,
          fn: Function,
        ) {
          const result = await page
            .locator(selector)
            .evaluate((element, source) => {
              return new Function(
                "element",
                `const __name = (fn) => fn; return (${source})(element)`,
              )(element);
            }, fn.toString());
          return { result, frameIdentity: { frameId: frameTree.frame.id } };
        },
        async evaluateOnPlaywrightSelector(
          _id: any,
          selector: string,
          fn: Function,
          options: any,
        ) {
          return await page.locator(selector).evaluate(
            (element, { source, arg }) => {
              return new Function(
                "element",
                "arg",
                `const __name = (fn) => fn; return (${source})(element,null,arg)`,
              )(element, arg);
            },
            { source: fn.toString(), arg: options.arg },
          );
        },
      },
    };
    const result = await command({ tab_id: 7, selector: "#media" }, context);
    assert.equal(await readFile(result.path, "utf8"), "fixture-media-bytes");
    assert.equal(await page.locator("a").count(), 1);
    assert.deepEqual(events, ["authorize", "enable", "cleanup"]);
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
