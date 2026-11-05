import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startOwnedCdpBrowser } from "../packages/cdp-host/src/owned-browser";
import { attachCdpBrowser } from "../packages/cdp-host/src/attached-browser";
import { installPageHttpRouting } from "../packages/cdp-host/src/page-http-routing";
test(
  "page HTTP lease preserves unrelated tabs and preexisting handlers after release",
  { timeout: 30000 },
  async () => {
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
      res.end("actual-network-response");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const browser = await startOwnedCdpBrowser({ headless: true });
    let attached: Awaited<ReturnType<typeof attachCdpBrowser>> | undefined;
    let lease: Awaited<ReturnType<typeof installPageHttpRouting>> | undefined;
    try {
      const first = browser.context.pages()[0]!,
        second = await browser.context.newPage();
      const root = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      await first.goto(root + "/controlled");
      await second.goto(root + "/unrelated");
      attached = await attachCdpBrowser(browser.endpoint);
      const target = attached.context
        .pages()
        .find((page) => page.url().endsWith("/controlled"))!;
      let priorHandlerCalls = 0;
      const prior = async (route: import("playwright").Route) => {
        priorHandlerCalls++;
        await route.continue();
      };
      await target.route("**/*", prior);
      lease = await installPageHttpRouting(
        target,
        (url) => !new URL(url).pathname.startsWith("/denied"),
      );
      await assert.rejects(target.goto(root + "/denied"), /BLOCKED_BY_CLIENT/);
      const before = requests;
      await second.goto(root + "/denied-in-unrelated-tab");
      assert.ok(requests > before, "Unrelated page must retain network access");
      await target.goto(root + "/allowed");
      assert.ok(
        priorHandlerCalls > 0,
        "Existing route must remain in the chain",
      );
      await lease.close();
      await lease.close();
      const callsBefore = priorHandlerCalls;
      await target.goto(root + "/denied-but-now-released");
      assert.ok(
        priorHandlerCalls > callsBefore,
        "Only the lease handler should be removed",
      );
      await target.unroute("**/*", prior);
      await attached.close();
      assert.equal(first.isClosed(), false);
      assert.equal(second.isClosed(), false);
    } finally {
      await lease?.close();
      await attached?.close();
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
