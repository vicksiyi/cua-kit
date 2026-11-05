import test from "node:test";
import assert from "node:assert/strict";
import { startOwnedCdpBrowser } from "../packages/cdp-host/src/owned-browser";
import { attachCdpBrowser } from "../packages/cdp-host/src/attached-browser";
test(
  "disconnecting an attached CDP client preserves the existing browser and tab",
  { timeout: 30000 },
  async () => {
    // This represents an externally owned browser to the second attachment. The
    // test owns its lifetime, so no daily browser or unrelated profile is touched.
    const original = await startOwnedCdpBrowser({ headless: true });
    let attached: Awaited<ReturnType<typeof attachCdpBrowser>> | undefined;
    try {
      const page = original.context.pages()[0]!;
      await page.setContent(
        "<title>Existing browser tab</title><p>preserve-existing-state</p>",
      );
      const before = await original.connection.send("Target.getTargets");
      attached = await attachCdpBrowser(original.endpoint);
      assert.equal(attached.ownership, "attached");
      const snapshot = await attached.connection.send("Target.getTargets");
      assert.ok(
        snapshot.targetInfos.some(
          (target: any) => target.title === "Existing browser tab",
        ),
      );
      await attached.close();
      await attached.close();
      assert.equal(page.isClosed(), false);
      assert.equal(
        await page.locator("p").textContent(),
        "preserve-existing-state",
      );
      const after = await original.connection.send("Target.getTargets");
      assert.deepEqual(
        after.targetInfos.map((target: any) => target.targetId).sort(),
        before.targetInfos.map((target: any) => target.targetId).sort(),
      );
    } finally {
      await attached?.close();
      await original.close();
    }
  },
);
