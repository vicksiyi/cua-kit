import test from "node:test";
import assert from "node:assert/strict";
import { startCdpHost } from "../packages/cdp-host/src/host";
import { connectNativeHost } from "@core/native-host";
import { BrowserRpcPeer } from "@core/core/browserRpcPeer";
import { prepareCdpEvent } from "../packages/cdp-host/src/event-forwarding";

test(
  "oversized console diagnostics cannot disconnect real native-pipe CDP input and screenshot",
  { timeout: 30000 },
  async () => {
    const host = await startCdpHost({ headless: true });
    const transport = await connectNativeHost(host.endpoint);
    try {
      const peer = new BrowserRpcPeer(transport);
      const request = (method: string, params: Record<string, unknown> = {}) =>
        peer.sendRequest(method, {
          session_id: "console-fixture",
          turn_id: "turn",
          ...params,
        });
      const tab = await request("createTab");
      await request("attach", {
        tabId: tab.id,
        networkPolicy: {
          constraints: [{ mode: "allowlist", kind: "origins", patterns: [] }],
        },
      });
      const command = (
        method: string,
        commandParams: Record<string, unknown> = {},
      ) =>
        request("executeCdp", {
          target: { tabId: tab.id },
          method,
          commandParams,
        });
      const events: any[] = [];
      peer.addEventListener("onCDPEvent", (event) => events.push(event));
      await command("Runtime.enable");
      await command("Runtime.evaluate", {
        expression: `document.body.innerHTML='<input><button onclick="document.querySelector(\\'output\\').textContent=document.querySelector(\\'input\\').value">Save</button><output></output>'; console.log('界'.repeat(600000)); document.querySelector('input').focus();`,
      });
      for (
        let i = 0;
        i < 100 && !events.some((e) => e.method === "Runtime.consoleAPICalled");
        i++
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
      const consoleEvent = events.find(
        (e) => e.method === "Runtime.consoleAPICalled",
      );
      assert.ok(
        consoleEvent,
        "console notification is explicitly retained as an omission marker",
      );
      assert.match(
        consoleEvent.params.args[0].value,
        /oversized console event omitted/,
      );
      await command("Input.insertText", { text: "after-large-console" });
      await command("Runtime.evaluate", {
        expression: "document.querySelector('button').click()",
      });
      const result = await command("Runtime.evaluate", {
        expression: "document.querySelector('output').textContent",
        returnByValue: true,
      });
      assert.equal(result.result.value, "after-large-console");
      const image = await command("Page.captureScreenshot", { format: "png" });
      assert.equal(
        Buffer.from(image.data, "base64").subarray(0, 8).toString("hex"),
        "89504e470d0a1a0a",
      );
      assert.equal((await request("getInfo")).type, "cdp");
    } finally {
      await transport.close();
      await host.close();
    }
  },
);

test("ordinary console and lifecycle events remain intact; tunneled CDP stays filtered", () => {
  for (const event of [
    {
      method: "Runtime.consoleAPICalled",
      params: { type: "log", args: [{ type: "string", value: "normal" }] },
    },
    { method: "Target.detachedFromTarget", params: { sessionId: "child" } },
  ])
    assert.deepEqual(prepareCdpEvent(event), event);
  assert.equal(
    prepareCdpEvent({ method: "Target.receivedMessageFromTarget", params: {} }),
    null,
  );
});
