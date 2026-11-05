import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startOwnedCdpBrowser } from "../packages/cdp-host/src/owned-browser";
import { CdpConnection } from "../packages/cdp-host/src/connection";
test(
  "extension-free owned CDP navigation, input, event and screenshot",
  { timeout: 30000 },
  async () => {
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "text/html");
      res.end(
        "<title>CDP acceptance</title><input aria-label=\"Query\"><button onclick=\"document.querySelector('output').textContent=document.querySelector('input').value\">Submit</button><output></output>",
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    let browser: Awaited<ReturnType<typeof startOwnedCdpBrowser>> | undefined;
    try {
      browser = await startOwnedCdpBrowser({ headless: true });
      const targets = await browser.connection.send("Target.getTargets");
      assert.equal(
        targets.targetInfos.some((t: any) =>
          t.url.startsWith("chrome-extension://"),
        ),
        false,
      );
      const { targetId } = await browser.connection.send(
        "Target.createTarget",
        { url: "about:blank" },
      );
      const { sessionId } = await browser.connection.send(
        "Target.attachToTarget",
        { targetId, flatten: true },
      );
      const events: string[] = [];
      const stop = browser.connection.onEvent((event) => {
        if (event.sessionId === sessionId) events.push(event.method);
      });
      await browser.connection.send("Page.enable", {}, sessionId);
      const port = (server.address() as { port: number }).port;
      await browser.connection.send(
        "Page.navigate",
        { url: `http://127.0.0.1:${port}` },
        sessionId,
      );
      let ready = false;
      for (let n = 0; n < 100; n++) {
        const result = await browser.connection.send(
          "Runtime.evaluate",
          { expression: "document.title", returnByValue: true },
          sessionId,
        );
        if (result.result.value === "CDP acceptance") {
          ready = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.ok(ready);
      await browser.connection.send(
        "Runtime.evaluate",
        { expression: 'document.querySelector("input").focus()' },
        sessionId,
      );
      await browser.connection.send(
        "Input.insertText",
        { text: "deepseek" },
        sessionId,
      );
      await browser.connection.send(
        "Runtime.evaluate",
        { expression: 'document.querySelector("button").click()' },
        sessionId,
      );
      const result = await browser.connection.send(
        "Runtime.evaluate",
        {
          expression: 'document.querySelector("output").textContent',
          returnByValue: true,
        },
        sessionId,
      );
      assert.equal(result.result.value, "deepseek");
      const image = await browser.connection.send(
        "Page.captureScreenshot",
        { format: "png" },
        sessionId,
      );
      assert.equal(
        Buffer.from(image.data, "base64").subarray(0, 8).toString("hex"),
        "89504e470d0a1a0a",
      );
      assert.ok(events.includes("Page.frameNavigated"));
      stop();
    } finally {
      await browser?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
test("CDP rejects non-local or credential-bearing endpoints before connecting", async () => {
  for (const endpoint of [
    "ws://example.com/devtools/browser/test",
    "ws://user:password@127.0.0.1:1234/test",
  ])
    await assert.rejects(CdpConnection.connect(endpoint), /loopback/);
});
