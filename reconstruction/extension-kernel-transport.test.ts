import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createKernelPortTransportClass,
  splitKernelTransport,
  registerKernelConnections,
} from "../packages/browser-extension/src/kernel_transport";

function fixture() {
  const trace: any[] = [];
  let connect!: Function;
  const runtime: any = {
    id: "extension",
    getURL: (path: string) => `chrome-extension://extension/${path}`,
    onConnect: {
      addListener(fn: Function) {
        connect = fn;
      },
    },
  };
  function port(label: string, patch: any = {}) {
    const listeners: any = {};
    const p: any = {
      name: "browser-use-kernel:scope",
      sender: {
        id: "extension",
        url: "chrome-extension://extension/js-kernel-host.html?scopeId=scope",
      },
      onMessage: {
        addListener(fn: Function) {
          listeners.message = fn;
        },
      },
      onDisconnect: {
        addListener(fn: Function) {
          listeners.disconnect = fn;
        },
      },
      postMessage(message: any) {
        trace.push([label, "send", message]);
      },
      disconnect() {
        trace.push([label, "disconnect"]);
        listeners.disconnect?.();
      },
      ...patch,
    };
    return { p, listeners };
  }
  return { runtime, trace, port, connect: (port: any) => connect(port) };
}

test("kernel port acceptance, replacement and multiplexing match bundled implementation", async () => {
  for (const mode of [
    "valid",
    "prefix",
    "foreign",
    "empty",
    "url",
    "host",
    "path",
    "tab",
    "scope",
    "handler-throw",
    "replace",
    "disconnect-error",
  ]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const f = fixture();
      const original = extensionBindings(["Gg", "zg", "Wg"], {
        chrome: { runtime: f.runtime },
        Vg: "browser-use-kernel:",
      });
      const channels: any[] = [];
      const connected = (scope: string, browser: any, control: any) => {
        f.trace.push(["connected", scope]);
        channels.push({ browser, control });
        browser.setMessageCallback((message: any) =>
          f.trace.push(["browser", message]),
        );
        control.setMessageCallback((message: any) =>
          f.trace.push(["control", message]),
        );
        if (mode === "handler-throw") throw Error("failed");
      };
      const disconnected = (scope: string) =>
        f.trace.push(["disconnected", scope]);
      if (restored)
        registerKernelConnections(f.runtime, connected, disconnected);
      else original.Wg(connected, disconnected);
      const first = f.port("first");
      if (mode === "prefix") first.p.name = "other";
      if (mode === "foreign") first.p.sender.id = "other";
      if (mode === "empty") first.p.name = "browser-use-kernel:";
      if (mode === "url") first.p.sender.url = "bad";
      if (mode === "host")
        first.p.sender.url =
          "chrome-extension://other/js-kernel-host.html?scopeId=scope";
      if (mode === "path")
        first.p.sender.url =
          "chrome-extension://extension/other.html?scopeId=scope";
      if (mode === "tab") first.p.sender.tab = { id: 1 };
      if (mode === "scope")
        first.p.sender.url =
          "chrome-extension://extension/js-kernel-host.html?scopeId=other";
      try {
        f.connect(first.p);
      } catch (error: any) {
        f.trace.push(["caught", error.message]);
      }
      if (channels.length && mode !== "handler-throw") {
        const channel = channels[0];
        channel.browser.sendMessage({ id: "b" });
        channel.control.sendMessage({ id: "c", type: "wrong" });
        first.listeners.message({ id: "b", type: "anything" });
        first.listeners.message({ id: "c", type: "control" });
        if (mode === "replace") {
          const next = f.port("next");
          f.connect(next.p);
          first.listeners.disconnect();
          next.listeners.disconnect();
        } else {
          if (mode === "disconnect-error")
            f.runtime.lastError = { message: "lost" };
          channel.browser.addCloseListener((error: any) =>
            f.trace.push(["close", error?.message]),
          );
          first.listeners.disconnect();
        }
        assert.throws(() => channel.control.sendMessage({}), /closed/);
      }
      await Promise.resolve();
      outputs.push(f.trace);
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

test("kernel transport close callbacks retain removal, sync throw and async rejection semantics", async () => {
  for (const mode of ["normal", "sync-throw", "async-reject"]) {
    const results = [];
    for (const restored of [false, true]) {
      const f = fixture();
      const original = extensionBindings(["Gg", "zg"], {
        chrome: { runtime: f.runtime },
      });
      const Transport = restored
        ? createKernelPortTransportClass(f.runtime)
        : original.Gg;
      const { p, listeners } = f.port("port");
      const transport = new Transport(p);
      const split = restored
        ? splitKernelTransport(transport)
        : original.zg(transport);
      split.browserTransport.addCloseListener(() =>
        f.trace.push(["removed"]),
      )();
      split.controlTransport.addCloseListener(() => {
        f.trace.push(["first"]);
        if (mode === "sync-throw") throw Error("sync");
        if (mode === "async-reject") return Promise.reject(Error("async"));
      });
      split.browserTransport.addCloseListener(() => f.trace.push(["second"]));
      try {
        await split.controlTransport.close();
      } catch (error: any) {
        f.trace.push(["rejected", error.message]);
      }
      listeners.disconnect();
      await split.browserTransport.close();
      await Promise.resolve();
      results.push({
        trace: f.trace,
        closed: transport.closed,
        listeners: transport.closeListeners.size,
      });
    }
    assert.deepEqual(results[1], results[0], mode);
  }
});
