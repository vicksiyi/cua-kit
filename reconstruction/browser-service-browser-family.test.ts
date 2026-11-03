import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  browserFamilies,
  browserFamily,
  isBrowserFamily,
  extensionDistributions,
  chromiumExtensionChannels,
  chromeBetaDistribution,
  chromeStableDistribution,
  edgeStableDistribution,
} from "../packages/browser/src/service/browser_family";
import { MarkTabCommand } from "../packages/browser/src/service/commands/handoff";
import { PlaywrightFileChooserSetFilesCommand } from "../packages/browser/src/service/commands/file_chooser";
const original = originalServiceBindings([
  "dp",
  "HC",
  "WC",
  "si",
  "pp",
  "sl",
  "ks",
  "ky",
  "F",
  "W",
  "ON",
]);
test("browser family catalog preserves all original platform metadata and shared distributions", () => {
  for (const [actual, expected] of [
    [chromeBetaDistribution, original.dp],
    [chromeStableDistribution, original.HC],
    [edgeStableDistribution, original.WC],
    [extensionDistributions, original.si],
    [chromiumExtensionChannels, original.pp],
    [browserFamilies, original.sl],
  ])
    assert.deepEqual(actual, expected);
  for (const name of ["chrome", "brave", "opera", "vivaldi"] as const)
    assert.equal(
      browserFamilies[name].extensionChannels,
      chromiumExtensionChannels,
    );
  assert.notEqual(
    browserFamilies.edge.extensionChannels,
    chromiumExtensionChannels,
  );
  assert.equal(
    chromiumExtensionChannels.dev.distributions,
    extensionDistributions.chrome.dev,
  );
  assert.equal(extensionDistributions.chrome.dev[2], chromeBetaDistribution);
  assert.equal(extensionDistributions.edge.internal[1], edgeStableDistribution);
  assert.equal(extensionDistributions.edge.internal[2], chromeBetaDistribution);
  assert.equal(extensionDistributions.edge.prod[2], chromeStableDistribution);
  for (const family of [
    undefined,
    null,
    "chrome",
    "edge",
    "brave",
    "opera",
    "vivaldi",
    "",
    "unknown",
    "toString",
    "__proto__",
  ]) {
    const actual = browserFamily({ family });
    const expected = original.ks({ family });
    if (typeof actual === "function") assert.equal(actual, expected);
    else assert.deepEqual(actual, expected);
    assert.equal(isBrowserFamily(family as any), original.ky(family));
  }
  assert.equal(browserFamily(), browserFamilies.chrome);
  assert.equal(browserFamily(null), browserFamilies.chrome);
});
test("assembled mark command supplies original family names and preserves original error cause", async () => {
  for (const family of [
    undefined,
    "chrome",
    "edge",
    "brave",
    "opera",
    "vivaldi",
    "unknown",
  ]) {
    const error = new Error("fixture mark failure");
    const context: any = {
      clientInfo: { type: "extension", family },
      tabs: {
        async mark() {
          throw error;
        },
      },
    };
    const result = async (fn: any) => {
      try {
        await fn({ tab_id: 7, status: "handoff" }, context);
      } catch (e) {
        return { message: (e as Error).message, cause: (e as Error).cause };
      }
    };
    assert.deepEqual(await result(MarkTabCommand), await result(original.ON));
    if (family !== "unknown")
      assert.equal((await result(MarkTabCommand))?.cause, error);
  }
});
test("assembled file chooser uses actual browser catalog for extension upload rejection", async () => {
  for (const family of ["chrome", "edge", "brave", "opera", "vivaldi"]) {
    const record = { tabId: 7, backendNodeId: 12, isMultiple: false };
    const context: any = {
      clientInfo: { type: "extension", family },

      security: {
        currentTabUrl: async () => "https://fixture.test/",
        currentTabFileTransferUrl: async () => "https://fixture.test/",
      },
      acquireAuthority: () => ({
        actInFrame: () => ({ assert: async () => {} }),
        uploadFiles: () => ({ assert: async () => {} }),
      }),
      cdp: {
        fileChoosersById: new Map([["chooser", record]]),
        async call() {
          throw new Error("Not allowed");
        },
      },
    };
    await assert.rejects(
      PlaywrightFileChooserSetFilesCommand(
        {
          tab_id: 7,
          file_chooser_id: "chooser",
          files: ["/fixture/file.txt"],
        } as any,
        context,
      ),
      new RegExp(browserFamily({ family }).displayName),
    );
  }
});
