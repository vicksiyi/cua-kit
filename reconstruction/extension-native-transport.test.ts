import test from "node:test";
import assert from "node:assert/strict";
import { createNativeTransportClass } from "../packages/browser-extension/src/native_transport";
import { extensionBindings } from "./extension-source";
const missing = "Specified native messaging host not found.";
function fixture(original: boolean) {
  const trace: any[] = [];
  const timers = new Map<number, () => void>();
  const ports: any[] = [];
  const alarms: Function[] = [];
  let timer = 0,
    clock = 100,
    alarmError = false,
    postError = false;
  const failures: unknown[] = [];
  const chrome: any = {
    runtime: {
      connectNative(name: string) {
        trace.push(["connect", name]);
        const failure = failures.shift();
        if (failure) throw failure;
        const messages: Function[] = [],
          disconnects: Function[] = [];
        const port = {
          postMessage(message: any) {
            trace.push(["post", message]);
            if (postError) throw "post failed";
          },
          disconnect() {
            trace.push(["disconnect"]);
            disconnects.forEach((fn) => fn());
          },
          onMessage: {
            addListener(fn: Function) {
              messages.push(fn);
            },
          },
          onDisconnect: {
            addListener(fn: Function) {
              disconnects.push(fn);
            },
          },
          messages,
          disconnects,
        };
        ports.push(port);
        return port;
      },
    },
    alarms: {
      onAlarm: {
        addListener(fn: Function) {
          alarms.push(fn);
        },
      },
      async get(name: string) {
        trace.push(["alarm.get", name]);
        if (alarmError) throw Error("alarm denied");
      },
      async create(name: string, options: any) {
        trace.push(["alarm.create", name, options]);
      },
      async clear(name: string) {
        trace.push(["alarm.clear", name]);
        return true;
      },
    },
  };
  const setTimeout = ((fn: () => void, delay: number) => {
    const id = ++timer;
    timers.set(id, fn);
    trace.push(["timer", id, delay]);
    return id;
  }) as any;
  const clearTimeout = ((id: number) => {
    timers.delete(id);
    trace.push(["clear", id]);
  }) as any;
  const now = () => ++clock;
  const Class = original
    ? extensionBindings(
        ["$E", "Si", "FE", "BE", "jE", "zE", "qE", "HE", "Ei", "GE"],
        { chrome, Date: { now }, setTimeout, clearTimeout },
      ).GE
    : createNativeTransportClass({ chrome, now, setTimeout, clearTimeout });
  return {
    Class,
    chrome,
    trace,
    timers,
    ports,
    alarms,
    failures,
    setAlarmError: () => {
      alarmError = true;
    },
    setPostError: () => {
      postError = true;
    },
  };
}
const settle = (promise: Promise<any>) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({
      error: error.message,
      name: error.name,
      type: error.errorType,
      method: error.method,
      timeout: error.timeoutMs,
    }),
  );
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
async function requests(original: boolean) {
  const f = fixture(original),
    transport = new f.Class(),
    received: any[] = [];
  transport.setMessageCallback((message: any) => received.push(message));
  const port = f.ports[0],
    respond = (message: any) =>
      port.messages.forEach((fn: Function) => fn(message));
  const success = settle(transport.requestHost("one"));
  respond({ id: "native-host:1", result: { ok: 1 } });
  const error = settle(transport.requestHost("two", null));
  respond({
    id: "native-host:2",
    error: { message: "denied", data: { type: "policy" } },
  });
  const invalid = settle(transport.requestHost("three", {}));
  respond({ id: "native-host:3" });
  const timeout = settle(
    transport.requestHost("four", { value: 1 }, { timeoutMs: 17 }),
  );
  [...f.timers.values()][0]();
  respond({ id: "native-host:4", result: "late" });
  respond({ id: "other:4", result: "external" });
  respond({ method: "notify" });
  const pending = settle(transport.requestHost("five", {}, { timeoutMs: 40 }));
  transport.reconnectNow("manual");
  respond({ method: "stale" });
  const current = f.ports.at(-1);
  const disconnected = settle(transport.requestHost("six"));
  current.disconnect();
  await flush();
  return {
    outcomes: await Promise.all([
      success,
      error,
      invalid,
      timeout,
      pending,
      disconnected,
    ]),
    received,
    status: transport.getStatus(),
    trace: f.trace,
    pending: transport.pendingHostRequests.size,
  };
}
test("original extension transport request correlation, errors, timeout, stale replies and reconnect match", async () => {
  assert.deepEqual(await requests(false), await requests(true));
});
async function reconnect(original: boolean) {
  const f = fixture(original);
  f.failures.push(Error(missing), Error(missing));
  const transport = new f.Class(["first", "second"]);
  await flush();
  const before = transport.getStatus();
  transport.scheduleReconnect();
  await flush();
  const callback = [...f.timers.values()][0];
  callback();
  await flush();
  f.alarms[0]({ name: "unrelated" });
  f.alarms[0]({ name: transport.reconnectAlarmName });
  f.chrome.runtime.lastError = { message: missing };
  f.failures.push(Error("different failure"));
  f.ports.at(-1).disconnect();
  await flush();
  const status = transport.refreshStatus();
  const copy = transport.getStatus();
  copy.state = "mutated";
  return {
    before,
    status,
    final: transport.getStatus(),
    trace: f.trace,
    application: transport.application,
    alarm: transport.reconnectAlarmName,
  };
}
test("original extension host fallback, alarm/timer retry and status snapshots match", async () => {
  assert.deepEqual(await reconnect(false), await reconnect(true));
});
async function failures(original: boolean) {
  const f = fixture(original);
  f.failures.push(Error("unavailable"));
  f.setAlarmError();
  const transport = new f.Class();
  await flush();
  const disconnected = await settle(transport.requestHost("offline"));
  let sendError;
  try {
    transport.sendMessage({ hello: 1 });
  } catch (error) {
    sendError = (error as Error).message;
  }
  await flush();
  const offline = transport.getStatus();
  transport.runReconnectAttempt();
  f.setPostError();
  const post = await settle(
    transport.requestHost("post", {}, { timeoutMs: 9 }),
  );
  await flush();
  return {
    disconnected,
    sendError,
    offline,
    post,
    trace: f.trace,
    status: transport.getStatus(),
  };
}
test("original extension disconnected sends, rejected alarm and post failures match", async () => {
  assert.deepEqual(await failures(false), await failures(true));
});
