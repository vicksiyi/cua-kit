import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { MacComputerUseClient } from "../packages/sky/src/targets/mac/client";
import { MacNativePipeTransport } from "../packages/sky/src/targets/mac/native-pipe";
import { window_result } from "../packages/sky/src/targets/mac/window_result";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const base = `${root}/sky/dist/project/cua/sky_js/src/targets/mac/`;
const original = await import(pathToFileURL(base + "client.js").href),
  originalTransport = await import(pathToFileURL(base + "native-pipe.js").href),
  originalWindow = await import(pathToFileURL(base + "window_result.js").href);
async function result(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { error: error.message, name: error.name };
  }
}
async function withTransport(
  Client: any,
  Transport: any,
  create: any,
  run: (client: any) => Promise<any>,
  options?: any,
) {
  const prior = Transport.create;
  Transport.create = create;
  try {
    return await run(new Client(options));
  } finally {
    Transport.create = prior;
  }
}
test("Mac client matches all native operation envelopes, argument validation and defaults", async () => {
  const calls: any[] = [
    ["listApps", []],
    ["startAudioRecording", [{ maxDurationMilliseconds: 1200 }]],
    ["stopAudioRecording", []],
    ["getAppPolicy", ["com.fixture"]],
    ["startApp", [{ app: "com.fixture" }]],
    ["getAppState", [{ app: "com.fixture", disableDiff: true }]],
    ["getAppState", ["com.fixture"]],
    ["click", [{ app: "com.fixture", x: 1, y: 2 }]],
    ["drag", [{ app: "com.fixture", fromX: 1, fromY: 2, toX: 3, toY: 4 }]],
    ["paste", [{ app: "com.fixture", text: "a", format: "html" }]],
    [
      "performSecondaryAction",
      [{ app: "com.fixture", action: "show", elementIndex: 0 }],
    ],
    ["pressKey", [{ app: "com.fixture", key: " cmd+a ", duration: 0 }]],
    ["scroll", [{ app: "com.fixture", elementIndex: 2, direction: " U " }]],
    ["setValue", [{ app: "com.fixture", elementIndex: -1, value: "new" }]],
    ["selectText", [{ app: "com.fixture", elementIndex: 2, text: "a" }]],
    [
      "selectText",
      [
        {
          app: "com.fixture",
          elementIndex: 2,
          text: "a",
          prefix: "p",
          suffix: "s",
          selection: "cursor_after",
        },
      ],
    ],
    ["typeText", [{ app: "com.fixture", text: "text" }]],
  ];
  for (const button of [undefined, " R ", "m", 0, 1, 2, 3, "unknown"])
    calls.push([
      "click",
      [
        {
          app: " com.fixture ",
          elementIndex: 4,
          mouseButton: button,
          clickCount: 2,
          key: "shift",
          duration: 0,
        },
      ],
    ]);
  for (const index of [null, undefined, 0, 1.5, NaN])
    calls.push([
      "click",
      [{ app: "com.fixture", elementIndex: index, x: 2, y: 3 }],
    ]);
  for (const duration of [Infinity, NaN, -1])
    for (const method of ["click", "pressKey"])
      calls.push([
        method,
        [{ app: "com.fixture", elementIndex: 1, key: "a", duration }],
      ]);
  for (const pages of [0, -1, Infinity, NaN, 0.5])
    calls.push([
      "scroll",
      [{ app: "com.fixture", x: 1, y: 2, direction: "left", pages }],
    ]);
  for (const direction of ["down", "r", "other"])
    calls.push(["scroll", [{ app: "com.fixture", x: 1, y: 2, direction }]]);
  calls.push(
    ["click", [{ app: "com.fixture", x: Infinity, y: 2 }]],
    ["drag", [{ app: "com.fixture", fromX: 0, fromY: 0, toX: NaN, toY: 1 }]],
    ["pressKey", [{ app: "com.fixture", key: " " }]],
    ["getAppPolicy", [" "]],
    ["startApp", [{}]],
    ["setValue", [{ app: "com.fixture", elementIndex: 1.5, value: "a" }]],
  );
  async function run(Client: any, Transport: any) {
    const requests: any[] = [],
      versions: string[] = [];
    return withTransport(
      Client,
      Transport,
      async (version: string) => {
        versions.push(version);
        return {
          isClosed: false,
          async request(args: any) {
            requests.push(args);
            return "result";
          },
        };
      },
      async (client) => ({
        results: await Promise.all(
          calls.map(([name, args]) => result(() => client[name](...args))),
        ),
        requests,
        versions,
      }),
    );
  }
  assert.deepEqual(
    await run(MacComputerUseClient, MacNativePipeTransport),
    await run(
      original.MacComputerUseClient,
      originalTransport.MacNativePipeTransport,
    ),
  );
});
test("Mac client metadata precedence and undefined pruning match original after transport acquisition", async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  try {
    async function run(Client: any, Transport: any) {
      const requests: any[] = [],
        versions: string[] = [];
      Object.defineProperty(globalThis, "nodeRepl", {
        configurable: true,
        value: { requestMeta: { "x-codex-turn-metadata": { live: 1 } } },
      });
      return withTransport(
        Client,
        Transport,
        async (version: string) => {
          versions.push(version);
          return {
            isClosed: false,
            async request(args: any) {
              requests.push(args);
              return "result";
            },
          };
        },
        async (client) => {
          await client.startAudioRecording({
            nested: {
              keep: 1,
              drop: undefined,
              values: [undefined, { a: undefined, b: 2 }],
            },
          });
          await client.listApps({
            apiVersion: "v2",
            timeoutSeconds: 0,
            codexMetadata: null,
          });
          await client.listApps({ codexMetadata: '{"explicit":true}' });
          (globalThis as any).nodeRepl.requestMeta["x-codex-turn-metadata"] = {
            live: 2,
          };
          await client.listApps();
          return { requests, versions };
        },
        { timeoutSeconds: 7 },
      );
    }
    assert.deepEqual(
      await run(MacComputerUseClient, MacNativePipeTransport),
      await run(
        original.MacComputerUseClient,
        originalTransport.MacNativePipeTransport,
      ),
    );
  } finally {
    if (prior) Object.defineProperty(globalThis, "nodeRepl", prior);
    else Reflect.deleteProperty(globalThis, "nodeRepl");
  }
});
test("Mac client deduplicates transport creation and recovers failed/closed cached transports", async () => {
  async function run(Client: any, Transport: any) {
    let creates = 0;
    const transports: any[] = [];
    const requests: any[] = [];
    return withTransport(
      Client,
      Transport,
      async (version: string) => {
        creates++;
        if (creates === 1) throw Error("first connect");
        const transport = {
          isClosed: false,
          async request(args: any) {
            requests.push([version, args.requestType]);
            return version;
          },
        };
        transports.push(transport);
        return transport;
      },
      async (client) => {
        const first = await Promise.all([
          result(() => client.listApps()),
          result(() => client.listApps()),
        ]);
        const second = await Promise.all([
          client.listApps(),
          client.listApps(),
        ]);
        transports[0].isClosed = true;
        const third = await Promise.all([client.listApps(), client.listApps()]);
        const fourth = await client.listApps({ apiVersion: "alternate" });
        return { first, second, third, fourth, creates, requests };
      },
    );
  }
  assert.deepEqual(
    await run(MacComputerUseClient, MacNativePipeTransport),
    await run(
      original.MacComputerUseClient,
      originalTransport.MacNativePipeTransport,
    ),
  );
});
test("Mac window result validates state and emits instructions once per resolved identity", async () => {
  const cases: any[] = [
    {},
    { skyshot: { text: "a" } },
    { skyshot: { text: "a", screenshot: { url: 42 } } },
    { skyshot: { text: 42 } },
    { skyshot: { text: "a" }, appSpecificInstructions: 3 },
    ...["", null, "file:///synthetic"].map((url) => ({
      app: { bundleIdentifier: "com.fixture" },
      skyshot: { text: "state", screenshot: { url } },
      appSpecificInstructions: "instructions",
    })),
    {
      app: { bundleIdentifier: "com.apple.iWork.Numbers" },
      skyshot: { text: "numbers" },
      appSpecificInstructions: "omit",
    },
    {
      app: "other",
      skyshot: { text: "other" },
      appSpecificInstructions: "show",
    },
    {
      app: { pid: 1 },
      skyshot: { text: "fallback" },
      appSpecificInstructions: "fallback",
    },
  ];
  async function run(fn: any) {
    const seen = new Set<string>(),
      responses = [];
    for (const state of cases)
      for (let i = 0; i < 2; i++)
        responses.push(await result(() => fn("requested", state, seen)));
    return { responses, seen: [...seen] };
  }
  assert.deepEqual(
    await run(window_result),
    await run(originalWindow.window_result),
  );
});
