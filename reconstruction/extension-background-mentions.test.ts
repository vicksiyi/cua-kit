import assert from "node:assert/strict";
import test from "node:test";
import { extensionFunctionLocals } from "./extension-source";
import { createBackgroundMentionInvalidationStarter } from "../packages/browser-extension/src/background_mentions";
import { sendTabMentionsInvalidated } from "../packages/browser-extension/src/tab_mention_messages";

test("lazy mention fanout matches original dR capture, ordering and current kernel peers", async () => {
  for (const available of [false, true]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: unknown[] = [],
        listeners: Array<() => void> = [];
      const peer = (name: string) => ({
        sendBrowserTabMentionsInvalidated() {
          trace.push(name);
        },
      });
      const native = available ? peer("native") : null;
      const peers = new Map([["one", { browser: peer("kernel-one") }]]);
      const runtime = {
        sendMessage: async (message: unknown) => {
          trace.push(message);
          throw Error("no receiver");
        },
      } as any;
      const observe = (fn: () => void) => {
        trace.push("observe");
        listeners.push(fn);
      };
      const subscribe = (fn: () => void) => {
        trace.push("subscribe");
        listeners.push(fn);
      };
      const start = restored
        ? createBackgroundMentionInvalidationStarter({
            nativePeer: () => native,
            kernelPeers: () => peers.values(),
            runtime,
            observeTabs: observe,
            subscribeProvider: subscribe,
          })
        : extensionFunctionLocals("dR", ["o"], {
            a: native,
            s: peers,
            chrome: { runtime },
            hR: sendTabMentionsInvalidated,
            kS: observe,
            c: { subscribeInvalidations: subscribe },
          }).o;
      start();
      listeners[0]?.();
      peers.delete("one");
      peers.set("two", { browser: peer("kernel-two") });
      listeners[1]?.();
      await Promise.resolve();
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1], outputs[0]);
    if (!available) assert.deepEqual(outputs[1], []);
    else assert.ok(JSON.stringify(outputs[1]).includes("kernel-two"));
  }
});
