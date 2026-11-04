import assert from "node:assert/strict";
import test from "node:test";
import { registerAssembledBackgroundKernel } from "../packages/browser-extension/src/kernel_background_assembly";

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
test("background composition routes real browser/control RPC and cleans disconnected scopes", async () => {
  let onConnect!: (port: any) => void, onMessage!: (message: any) => void, onDisconnect!: () => void;
  let gate!: (value: boolean) => void, end!: (scope: string, metadata: unknown) => Promise<void>;
  const sent: any[] = [], ended: unknown[] = [], content: unknown[] = [];
  class Handler {
    moveMouse() {}
    getInfo() { return { type: "extension", identity: "shared-handler" }; }
    async turnEnded(value: unknown) { ended.push(value); }
  }
  const handler = new Handler();
  const runtime: any = { id: "extension", getURL: (path: string) => `chrome-extension://extension/${path}`, onConnect: { addListener: (fn: any) => { onConnect = fn; } } };
  const peers = registerAssembledBackgroundKernel({
    runtime, handler,
    controlHost: {
      getScope: () => ({ content }),
      siteStatusUrl: new URL("https://chatgpt.com/"), fetch, defaultAllowedPages: [],
    } as any,
    observeGate: async (fn) => { gate = fn; }, registerTurnEnded: async (fn) => { end = fn; },
    reportGateError: error => { throw error; }, reportTurnEndedError: error => { throw error; }, warn: message => { throw Error(message); },
  });
  assert.equal(onConnect, undefined);
  gate(true);
  const port = {
    name: "browser-use-kernel:scope", sender: { id: "extension", url: runtime.getURL("js-kernel-host.html?scopeId=scope") },
    onMessage: { addListener: (fn: any) => { onMessage = fn; } },
    onDisconnect: { addListener: (fn: any) => { onDisconnect = fn; } },
    postMessage: (message: any) => { sent.push(message); }, disconnect: () => onDisconnect(),
  };
  onConnect(port);
  assert.equal(peers.get("scope")!.browser.handler, handler);
  onMessage({ id: "info", method: "getInfo" });
  onMessage({ type: "control", id: "display", method: "displayValue", params: { value: 7 } });
  await flush();
  assert.deepEqual(sent.find(x => x.id === "info")?.result, { type: "extension", identity: "shared-handler" });
  assert.deepEqual(content, [{ type: "text", text: '{"value":7}' }]);
  const request = end("scope", { turn_id: "turn" });
  await flush();
  const outbound = sent.find(x => x.method === "turnEnded");
  assert.equal(outbound.type, "control");
  onMessage({ type: "control", id: outbound.id, result: null });
  await request;
  assert.deepEqual(ended, []);
  const fetchAbort = new AbortController();
  peers.get("scope")!.controlImpl.fetches.set("pending", fetchAbort);
  onDisconnect();
  assert.equal(fetchAbort.signal.aborted, true);
  assert.equal(peers.size, 0);
  await end("scope", { turn_id: "after-disconnect" });
  assert.deepEqual(ended, [{ turn_id: "after-disconnect" }]);
});
