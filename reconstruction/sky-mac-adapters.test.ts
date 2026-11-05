import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { create_client } from "../packages/sky/src/targets/mac/create_client";
import { client } from "../packages/sky/src/targets/mac/client";
import {
  decodeMessageFrames,
  encodeMessageFrame,
} from "../packages/sky/src/targets/mac/native-pipe";
import { to_base64 } from "../packages/sky/src/core/uint8";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const base = `${root}/sky/dist/project/cua/sky_js/src/targets/mac/`;
const original = await import(pathToFileURL(base + "create_client.js").href),
  originalClient = (await import(pathToFileURL(base + "client.js").href))
    .client;
async function result(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { name: e.name, error: e.message };
  }
}
async function fixture(
  originalMode: boolean,
  options: any,
  run: (api: any, trace: any[]) => Promise<any>,
) {
  const target: any = originalMode ? originalClient : client,
    priorHost = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  const keys = [
      "SKY_ENABLE_AUDIO",
      "SKY_AUDIO_ATTACHMENTS",
      "SKY_AUDIO_MODEL_ALLOWLIST",
    ],
    priorEnv = keys.map((k) => process.env[k]);
  const saved = new Map<string, PropertyDescriptor | undefined>(),
    trace: any[] = [];
  function replace(name: string, fn: any) {
    saved.set(name, Object.getOwnPropertyDescriptor(target, name));
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value: fn,
    });
  }
  for (const name of [
    "click",
    "drag",
    "paste",
    "performSecondaryAction",
    "pressKey",
    "scroll",
    "selectText",
    "setValue",
    "typeText",
    "startAudioRecording",
  ])
    replace(name, async (args: any) => {
      trace.push([name, args]);
    });
  replace("getAppPolicy", async (app: string) => {
    trace.push(["policy", app]);
    return {
      decision: "allowed",
      allowPersistentApproval: false,
      target: {
        appPath: "/approved/Fixture.app",
        bundleIdentifier: "com.fixture",
        displayName: "Fixture",
        risk: "low",
      },
    };
  });
  replace("getAppState", async (args: any) => {
    trace.push(["state", args]);
    return {
      app: { bundleIdentifier: "com.fixture" },
      skyshot: { text: "state", screenshot: { url: "file:///fixture.png" } },
      appSpecificInstructions: "instructions",
    };
  });
  replace("listApps", async () => [
    {
      bundleIdentifier: "bundle",
      displayName: "A",
      appPath: "omit",
      lastUsedDate: null,
      useCount: 0,
    },
    { displayName: "B", isRunning: true },
    { lastUsedDate: "today" },
  ]);
  replace("stopAudioRecording", async () => {
    trace.push(["stop"]);
    return { url: options.url };
  });
  const runtime: any = {
    env: { NODE_REPL_DISABLE_ANALYTICS: "1" },
    setResponseMeta(meta: any) {
      trace.push(["surface", meta]);
    },
    requestMeta: {
      "x-codex-turn-metadata": options.metadata ?? {
        session_id: "thread",
        turn_id: "turn",
        model: "audio",
      },
    },
    async createElicitation(args: any) {
      trace.push(["approval", args]);
      return { action: options.action ?? "accept" };
    },
    withSuspendedTimeout:
      options.suspended === false
        ? undefined
        : async function (this: any, fn: any) {
            trace.push(["suspended", this === undefined]);
            return fn();
          },
    nativePipe: {
      async createConnection(pipe: string) {
        trace.push(["pipe", pipe]);
        const socket: any = new EventEmitter();
        socket.end = () => trace.push(["end"]);
        socket.write = (bytes: Uint8Array) => {
          const request = JSON.parse(
            decodeMessageFrames(Buffer.from(bytes)).messages[0],
          );
          trace.push(["attach", { ...request, id: "id" }]);
          queueMicrotask(() =>
            socket.emit(
              "data",
              encodeMessageFrame(
                JSON.stringify({ id: request.id, result: {} }),
              ),
            ),
          );
        };
        return socket;
      },
    },
  };
  if (options.attach === "1")
    runtime.env.NODE_REPL_HOST_SERVICES_PIPE_PATH = "/synthetic-host";
  try {
    for (const [i, value] of [
      options.audio ?? "1",
      options.attach,
      options.allow,
    ].entries()) {
      if (value === undefined) delete process.env[keys[i]];
      else process.env[keys[i]] = value;
    }
    Object.defineProperty(globalThis, "nodeRepl", {
      configurable: true,
      value: runtime,
    });
    return await run(
      (originalMode ? original.create_client : create_client)({}),
      trace,
    );
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else Reflect.deleteProperty(target, name);
    }
    if (priorHost) Object.defineProperty(globalThis, "nodeRepl", priorHost);
    else Reflect.deleteProperty(globalThis, "nodeRepl");
    keys.forEach((key, i) => {
      if (priorEnv[i] === undefined) delete process.env[key];
      else process.env[key] = priorEnv[i];
    });
  }
}
test("Mac factory and every operation adapter match original fields, policy order and per-factory window state", async () => {
  for (const audio of ["1", "0", "true"]) {
    const calls: any[] = [
      ["list_apps", undefined],
      ["get_app_state", { app: "requested", disableDiff: true }],
      ["get_app_state", { app: "requested" }],
      [
        "click",
        {
          app: "requested",
          click_count: 2,
          element_index: 1,
          key: "shift",
          duration: 1,
          mouse_button: "right",
          x: 3,
          y: 4,
        },
      ],
      ["drag", { app: "requested", from_x: 1, from_y: 2, to_x: 3, to_y: 4 }],
      ["paste", { app: "requested", text: "x", format: "md" }],
      [
        "perform_secondary_action",
        { app: "requested", action: "show", element_index: 2 },
      ],
      ["press_key", { app: "requested", key: "a", duration: 0 }],
      [
        "scroll",
        {
          app: "requested",
          direction: "down",
          element_index: 3,
          pages: 2,
          x: 1,
          y: 2,
        },
      ],
      [
        "select_text",
        {
          app: "requested",
          element_index: 3,
          text: "t",
          prefix: "p",
          suffix: "s",
          selection_type: "cursor_after",
        },
      ],
      ["set_value", { app: "requested", element_index: 4, value: "new" }],
      ["type_text", { app: "requested", text: "typed" }],
    ];
    async function run(originalMode: boolean) {
      return fixture(originalMode, { audio }, async (api, trace) => {
        const results = [];
        for (const [name, args] of calls)
          results.push(await result(() => api[name](args)));
        const second = (originalMode ? original.create_client : create_client)(
          {},
        );
        results.push(await second.get_app_state({ app: "requested" }));
        return { keys: Object.keys(api), results, trace };
      });
    }
    assert.deepEqual(await run(false), await run(true));
  }
});
test("Mac start audio preserves duration defaults, bounds and approval before client recording", async () => {
  for (const duration of [
    undefined,
    null,
    99,
    100,
    60000,
    300000,
    300001,
    1.5,
    Infinity,
  ])
    for (const action of ["accept", "decline"]) {
      async function run(originalMode: boolean) {
        return fixture(originalMode, { action }, async (api, trace) => ({
          response: await result(() =>
            api.start_audio_recording({ max_duration_ms: duration }),
          ),
          trace,
        }));
      }
      assert.deepEqual(await run(false), await run(true));
    }
});
test("Mac stop audio reads synthetic local bytes without extra host attachment calls", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sky-audio-")),
    filepath = path.join(directory, "fixture.wav");
  await writeFile(filepath, Buffer.from([0, 1, 2, 255]));
  try {
    for (const options of [
      { url: pathToFileURL(filepath).href },
      { url: pathToFileURL(filepath).href, suspended: false },
      { url: pathToFileURL(filepath).href, attach: "1", allow: '["audio"]' },
      { url: pathToFileURL(filepath).href, attach: "1", allow: '["other"]' },
      { url: pathToFileURL(filepath).href, attach: "1", metadata: "invalid" },
      {
        url: pathToFileURL(filepath).href,
        attach: "1",
        metadata: { model: "audio" },
      },
      { url: undefined },
      { url: "" },
      { url: "https://example.test/audio.wav" },
      { url: "invalid" },
    ]) {
      async function run(originalMode: boolean) {
        return fixture(originalMode, options, async (api, trace) => ({
          response: await result(() => api.stop_audio_recording()),
          trace,
        }));
      }
      assert.deepEqual(
        await run(false),
        await run(true),
        JSON.stringify(options),
      );
    }
    const view = new Uint8Array([9, 1, 2, 9]).subarray(1, 3);
    assert.equal(to_base64(view), "AQI=");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
