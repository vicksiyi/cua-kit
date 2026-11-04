import { originalServiceBindings } from "./service-source";
import test from "node:test";
import assert from "node:assert/strict";
import {
  BrowserRpcPeer,
  createBrowserRpcPeerClass,
} from "../packages/core/src/browser_rpc_peer";
import { ExtensionBrowserPeer } from "../packages/browser-extension/src/browser_peer";
import { createNativeTransportClass } from "../packages/browser-extension/src/native_transport";
import { extensionBindings } from "./extension-source";
const original = extensionBindings(["fc", "pc"], {});
const serviceOriginal = originalServiceBindings(["to"], {});
function transport() {
  const sent: any[] = [];
  let receive: any,
    close: any,
    fail = false;
  return {
    sent,
    setMessageCallback(fn: any) {
      receive = fn;
    },
    addCloseListener(fn: any) {
      close = fn;
    },
    sendMessage(value: any) {
      if (fail) throw Error("send failed");
      sent.push(value);
    },
    receive: (message: any) => receive(message),
    close: (error?: any) => close(error),
    setFail: () => {
      fail = true;
    },
  };
}
const settled = (promise: Promise<any>) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({ error: error instanceof Error ? error.message : error }),
  );
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
async function peerCases(Class: any) {
  const wire = transport(),
    peer = new Class(wire),
    events: any[] = [];
  const keys = Object.keys(peer);
  class Handler {
    value = 7;
    echo(params: any) {
      return { value: this.value, params };
    }
    fail() {
      throw "failure";
    }
  }
  peer.registerRequestHandlerObject(new Handler());
  await peer.handleIncomingMessage({ method: "echo", id: 0, params: 2 });
  await peer.handleIncomingMessage({ method: "missing", id: "m" });
  await peer.handleIncomingMessage({ method: "fail", id: "f" });
  const handler = (params: any) => events.push(params);
  peer.addEventListener("event", handler);
  await peer.handleIncomingMessage({ method: "event", params: "first" });
  peer.removeEventListener("event", handler);
  await peer.handleIncomingMessage({ method: "event", params: "removed" });
  const reply = settled(peer.sendRequest({ toString: () => "out" }, { x: 1 }));
  await peer.handleIncomingMessage({ id: 1, result: 42 });
  const error = settled(peer.sendRequest("bad"));
  await peer.handleIncomingMessage({ id: 2, error: { message: "" } });
  let release: any;
  peer.registerRequestHandler(
    "deferred",
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const inFlight = peer.handleIncomingMessage({ id: 9, method: "deferred" });
  const pending = settled(peer.sendRequest("pending"));
  wire.close({ message: "closed now" });
  release("too late");
  await inFlight;
  wire.setFail();
  const send = settled(peer.sendRequest("send"));
  return {
    keys,
    sent: wire.sent,
    events,
    outcomes: await Promise.all([reply, error, pending, send]),
    closed: peer.closed,
    pending: peer.pendingRequests.size,
  };
}
test("shared peer matches extension fc requests, errors, notifications, closure and property order", async () => {
  assert.deepEqual(
    await peerCases(createBrowserRpcPeerClass(false)),
    await peerCases(original.fc),
  );
  assert.deepEqual(
    await peerCases(BrowserRpcPeer),
    await peerCases(serviceOriginal.to),
  );
});
async function facadeCases(Class: any) {
  const wire = transport(),
    errors: any[] = [],
    events: any[] = [];
  const handler = {
    moveMouse(params: any) {
      if (params === "sync") throw Error("sync");
      return Promise.reject(Error("async"));
    },
    ping() {
      return "local pong";
    },
  };
  const peer = new Class(wire, handler, {
    onMoveMouseError: (error: any, params: any) =>
      errors.push([error.message, params]),
    onWebMcpToolInvoked: (params: any) => events.push(params),
  });
  const ping = settled(peer.ping());
  await peer.handleIncomingMessage({ id: 1, result: "remote pong" });
  await peer.handleIncomingMessage({ method: "moveMouse", params: "async" });
  await flush();
  const sync = await settled(
    peer.handleIncomingMessage({ method: "moveMouse", params: "sync" }),
  );
  await peer.handleIncomingMessage({
    method: "webMcpToolInvoked",
    params: { name: "fixture" },
  });
  peer.sendCdpEvent({ event: 1 });
  peer.sendCdpDetach({ event: 2 });
  peer.sendDownloadChange({ event: 3 });
  peer.sendPageEvent({ event: 4 });
  peer.sendBrowserTabMentionsInvalidated();
  wire.setFail();
  peer.sendBrowserTabMentionsInvalidated();
  return { ping: await ping, sync, errors, events, sent: wire.sent };
}
test("extension pc facade preserves event names, promise errors and synchronous moveMouse throws", async () => {
  assert.deepEqual(
    await facadeCases(ExtensionBrowserPeer),
    await facadeCases(original.pc),
  );
});
test("restored native transport and extension peer multiplex host and browser RPC without ID collision", async () => {
  const sent: any[] = [],
    listeners: any[] = [];
  const chrome: any = {
    runtime: {
      connectNative() {
        return {
          postMessage: (message: any) => sent.push(message),
          onMessage: { addListener: (fn: any) => listeners.push(fn) },
          onDisconnect: { addListener() {} },
          disconnect() {},
        };
      },
    },
    alarms: { onAlarm: { addListener() {} }, clear: async () => true },
  };
  const Native = createNativeTransportClass({
    chrome,
    now: () => 1,
    setTimeout,
    clearTimeout,
  });
  const native = new Native();
  const peer = new ExtensionBrowserPeer(native, {
    moveMouse() {},
    getInfo() {
      return { type: "extension" };
    },
  });
  const host = native.requestHost("host-method", {}),
    browser = peer.ping();
  for (const listener of listeners) {
    listener({ id: "native-host:1", result: "host-result" });
    listener({ id: 1, result: "browser-result" });
    listener({ id: 4, method: "getInfo" });
  }
  await flush();
  assert.equal(await host, "host-result");
  assert.equal(await browser, "browser-result");
  assert.deepEqual(sent.at(-1), {
    jsonrpc: "2.0",
    id: 4,
    result: { type: "extension" },
  });
  assert.equal(native.pendingHostRequests.size, 0);
  assert.equal(peer.pendingRequests.size, 0);
});

test("shared class initialization retains original own-field behavior with subclass setters", () => {
  for (const [Original, Shared] of [
    [original.fc, createBrowserRpcPeerClass(false)],
    [serviceOriginal.to, BrowserRpcPeer],
  ]) {
    function inspect(Base: any) {
      class Child extends Base {
        set closed(_value: unknown) {
          throw Error("prototype setter should not run");
        }
      }
      const peer = new Child(transport());
      return Object.fromEntries(
        Object.keys(peer).map((key) => {
          const { value, ...flags } = Object.getOwnPropertyDescriptor(
            peer,
            key,
          )!;
          return [key, flags];
        }),
      );
    }
    assert.deepEqual(inspect(Shared), inspect(Original));
  }
});
