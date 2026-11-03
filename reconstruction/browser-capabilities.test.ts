import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BrowserCapability,
  TabCapability,
  Capabilities,
  defineBrowserCapability,
  defineTabCapability,
} from "../packages/browser/dist/capabilities/base.js";
import {
  ManagementBrowserCapability,
  VisibilityBrowserCapability,
  ViewportBrowserCapability,
  browserCapabilityDefinitions,
  browserCapabilityFactories,
} from "../packages/browser/dist/capabilities/browser.js";
import * as commands from "../packages/browser/dist/commands/browser_capabilities.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {Gl,Hl,Ql,Yl,Xl,Lh,em,pm,_m,ym,Ch,Mh,Uh,Jh,am,cm};").toString("base64")}`
);
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}

test("capability bases and definition factories retain info identity, document path and static-info precedence", async () => {
  for (const [Base, Original, isTab] of [
    [BrowserCapability, original.Gl, false],
    [TabCapability, original.Hl, true],
  ] as any) {
    async function run(Class: any) {
      const log: any[] = [];
      const info = { id: "test", description: "desc" };
      const transport = {};
      const docs = {
        get: async function (path: string) {
          log.push([path, this === docs]);
          return path;
        },
      };
      const instance = isTab
        ? new Class(transport, "b", "t", docs, info)
        : new Class(transport, "b", docs, info);
      const first = await instance.documentation();
      info.id = "changed";
      const second = await instance.documentation();
      return {
        first,
        second,
        log,
        keys: Object.keys(instance),
        infoIdentity: instance.info === info,
        transportIdentity: instance.transport === transport,
        id: instance.id,
      };
    }
    assert.deepEqual(await run(Base), await run(Original));
  }
  for (const [define, originalDefine] of [
    [defineBrowserCapability, original.Yl],
    [defineTabCapability, original.Xl],
  ])
    for (const internalOnly of [undefined, null, false, true]) {
      function run(factory: any) {
        const info = { id: "static", description: "static desc" };
        class C {
          constructor(public options: any) {}
        }
        const definition = factory({ capability: C, info, internalOnly });
        const created = definition.create({ info: { id: "caller" }, extra: 1 });
        return {
          keys: Object.keys(definition),
          id: definition.id,
          infoSame: definition.info === info,
          createdInfoSame: created.options.info === info,
          options: created.options,
          internalOnly: definition.internalOnly,
          ctorSame: definition.capability === C,
        };
      }
      assert.deepEqual(run(define), run(originalDefine));
    }
  assert.deepEqual(
    browserCapabilityDefinitions.map((x) => x.info),
    original._m.map((x: any) => x.info),
  );
  assert.deepEqual(
    [...browserCapabilityFactories.keys()],
    [...original.ym.keys()],
  );
});

test("capability collection preserves reference lookup, enumeration order, inherited keys and missing failures", async () => {
  async function run(Class: any) {
    const proto = {
      inherited: { info: { id: "inherited", description: "d" } },
    };
    const map = Object.assign(Object.create(proto), {
      second: { info: { id: "two", description: "d" } },
      first: { info: { id: "one", description: "d" } },
    });
    const c = new Class(map);
    const values = [
      await c.list(),
      await outcome(() => c.get("missing")),
      (await c.get("second")) === map.second,
      (await c.get("inherited")) === proto.inherited,
      typeof (await c.get("constructor")),
    ];
    map.third = { info: { id: "three", description: "d" } };
    values.push(await c.list());
    return values;
  }
  assert.deepEqual(await run(Capabilities), await run(original.Ql));
});

test("browser capabilities preserve command payloads and result-schema errors", async () => {
  async function run(
    Class: any,
    method: string,
    args: any[],
    response: any,
    fail = false,
  ) {
    const log: any[] = [];
    const instance = new Class({
      browserId: "b",
      info: { id: "cap", description: "d" },
      documentation: { get: async () => "docs" },
      transport: {
        send: async ({ command }: any) => {
          log.push(command.toJSON());
          if (fail) throw new Error("service failed");
          return response;
        },
      },
    });
    return { result: await outcome(() => instance[method](...args)), log };
  }
  for (const [Class, Original, cases] of [
    [
      ManagementBrowserCapability,
      original.Lh,
      [
        ["invoke", ["tabs", "query", { active: true }]],
        ["getAuditTrail", []],
      ],
    ],
    [
      VisibilityBrowserCapability,
      original.em,
      [
        ["get", []],
        ["set", [false]],
        ["set", ["raw-invalid"]],
      ],
    ],
    [
      ViewportBrowserCapability,
      original.pm,
      [
        ["reset", []],
        ["set", [{ width: 800, height: 600 }]],
        ["set", [{ width: 0, height: -1, browser_id: "override" }]],
        ["set", [null]],
      ],
    ],
  ] as any)
    for (const [method, args] of cases)
      for (const response of [
        { value: { ok: 1 } },
        { visible: true },
        { changes: [] },
        {},
        null,
        [],
      ])
        for (const fail of [false, true]) {
          assert.deepEqual(
            await run(Class, method, args, response, fail),
            await run(Original, method, args, response, fail),
          );
        }
});

test("management namespaces stay non-thenable, exclude Object prototype members and create fresh closures", async () => {
  async function run(Class: any) {
    const calls: any[] = [];
    const instance = new Class({
      browserId: "b",
      info: { id: "management", description: "d" },
      documentation: {},
      transport: {
        send: async ({ command }: any) => {
          calls.push(command.toJSON());
          return { value: "result" };
        },
      },
    });
    const namespace = instance.windows;
    const values = [
      namespace.then,
      namespace.toJSON,
      namespace.toString,
      namespace.constructor,
      namespace.hasOwnProperty,
      namespace[Symbol.iterator],
      Object.keys(namespace),
      namespace.get === namespace.get,
      (await Promise.resolve(namespace)) === namespace,
    ];
    values.push(
      await namespace.get(5),
      await instance.bookmarks.create({ title: "t" }),
    );
    return { values, calls };
  }
  assert.deepEqual(
    await run(ManagementBrowserCapability),
    await run(original.Lh),
  );
});

test("browser capability command schemas preserve audit projection, required fields and numeric validation", async () => {
  const pairs = [
    [commands.ManagementCallCommand, original.Ch],
    [commands.ManagementAuditTrailCommand, original.Mh],
    [commands.VisibilityGetCommand, original.Uh],
    [commands.VisibilitySetCommand, original.Jh],
    [commands.ViewportResetCommand, original.am],
    [commands.ViewportSetCommand, original.cm],
  ];
  const inputs: any[] = [
    undefined,
    null,
    {},
    [],
    {
      browser_id: "b",
      args: [1],
      method: "query",
      namespace: "tabs",
      visible: false,
      width: 800,
      height: 600,
      extra: 1,
    },
    { browser_id: "b", width: 0, height: 1.5 },
    { value: 1, visible: true, changes: [] },
    {
      changes: [
        {
          args: [],
          method: "create",
          namespace: "tabs",
          before: {},
          createdAt: 1,
          result: 2,
          extra: 1,
        },
      ],
    },
    {
      changes: [
        {
          args: [],
          method: "update",
          namespace: "tabs",
          before: {
            bookmarks: [{ id: "id", title: "x", extra: 1 }],
            tabLayout: {
              groups: [{ collapsed: false, color: "blue", id: 2, windowId: 1 }],
              tabs: [
                {
                  autoDiscardable: true,
                  groupId: 2,
                  id: 3,
                  index: 0,
                  pinned: false,
                  windowId: 1,
                },
              ],
            },
            windows: [{ focused: true, id: 1, width: 800 }],
          },
          createdAt: 1,
          result: { id: "x" },
        },
      ],
    },
    {
      changes: [
        {
          args: [],
          method: "m",
          namespace: "n",
          before: { windows: [{ id: "bad" }] },
          createdAt: NaN,
        },
      ],
    },
  ];
  for (const [restored, vendor] of pairs)
    for (const input of inputs) {
      assert.deepEqual(
        await outcome(() => restored.create(input).parse()),
        await outcome(() => vendor.create(input).parse()),
      );
      assert.deepEqual(
        await outcome(() => restored.create(input).toJSON()),
        await outcome(() => vendor.create(input).toJSON()),
      );
      assert.deepEqual(
        await outcome(() => restored.ResultSchema.parse(input)),
        await outcome(() => vendor.ResultSchema.parse(input)),
      );
    }
});
