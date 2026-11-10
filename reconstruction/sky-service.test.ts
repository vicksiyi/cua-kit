import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "acorn";
import { createHash } from "node:crypto";
import { __awaiter } from "tslib";
import { UnreachableCaseError } from "@core/core/UnreachableCaseError";
import { createSkyService } from "../packages/sky/src/create_service";
import { require_audio_model_support } from "../packages/sky/src/require_audio_model_support";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
async function body(file: string) {
  const source = await readFile(
    `${root}/sky/dist/project/cua/sky_js/src/${file}.js`,
    "utf8",
  );
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  return ast.body
    .filter(
      (n) =>
        n.type !== "ImportDeclaration" && n.type !== "ExportNamedDeclaration",
    )
    .map((n) => source.slice(n.start, n.end))
    .join("\n");
}
const originalPolicy = new Function(
  (await body("require_audio_model_support")) + ";return r",
)();
const originalFactory = new Function(
  "e",
  "t",
  "r",
  "o",
  "n",
  "i",
  (await body("service")) + ";return c;",
);
function original(create: any, dependencies: any = {}) {
  return {
    handleRpc: originalFactory(
      __awaiter,
      UnreachableCaseError,
      create,
      dependencies.loadOptions ?? (() => ({ target: "fixture" })),
      originalPolicy,
      { createDesktopClient: dependencies.createDesktopClient },
    ),
  };
}
async function result(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message, name: e.name };
  }
}
test("Sky audio policy matches original for malformed catalogs and trusted metadata forms", async () => {
  for (const allow of [
    undefined,
    "[]",
    '["audio"]',
    '["audio",1]',
    "null",
    "{}",
    "invalid",
  ])
    for (const meta of [
      undefined,
      {},
      { "x-codex-turn-metadata": { model: "audio" } },
      { "x-codex-turn-metadata": '{"model":"audio"}' },
      { "x-codex-turn-metadata": "bad" },
      { "x-codex-turn-metadata": [] },
      { "x-codex-turn-metadata": { model: "other" } },
    ]) {
      const args = { model_allowlist: allow, request_meta: meta };
      assert.deepEqual(
        await result(() => require_audio_model_support(args)),
        await result(() => originalPolicy(args)),
      );
    }
});
test("Sky dispatcher matches original media encoding, receiver, own-descriptor restrictions and initialization", async () => {
  for (const target of ["mac", "windows", "linux"]) {
    async function run(factory: any) {
      const events: any[] = [];
      let attempts = 0;
      const media = {
        filepath: "/synthetic",
        data_url: "data:image/png;base64,AA==",
        bytes: new Uint8Array([0]),
        extra: "drop",
      };
      const client: any = Object.create({
        inherited() {
          events.push("must-not-run");
        },
      });
      Object.assign(client, {
        target,
        get_screenshot: async () => [media],
        get_window_state: async () => ({
          ax_tree: "tree",
          screenshots: [media],
          other: 3,
        }),
        stop_audio_recording: async () => media,
        echo: function (...args: any[]) {
          events.push(["echo", this === client]);
          return args;
        },
      });
      Object.defineProperty(client, "accessor", {
        enumerable: true,
        get() {
          events.push("get");
          return () => "not callable through RPC";
        },
      });
      Object.defineProperty(client, "hidden", { value: () => 42 });
      const service = factory(() => {
        events.push("create");
        if (++attempts === 1) throw Error("retry construction");
        return client;
      });
      const responses = [];
      for (const request of [
        { type: "setup" },
        { type: "setup" },
        { type: "setup" },
        ...[
          "get_screenshot",
          "get_window_state",
          "stop_audio_recording",
          "echo",
          "inherited",
          "accessor",
          "hidden",
          "missing",
          "constructor",
          "drag_handle",
        ].map((method) => ({ type: "execute", method, args: ["one", 2] })),
        { type: "unknown" },
      ])
        responses.push(await result(() => service.handleRpc(request)));
      return { events, responses };
    }
    assert.deepEqual(await run(createSkyService), await run(original));
  }
});
test("Sky drag handles match current duplicate-start and failure cleanup semantics", async () => {
  for (const target of ["mac", "linux", "windows_desktop"])
    for (const failure of ["none", "start", "move", "end"]) {
      async function run(factory: any) {
        let serial = 0,
          failed = false;
        const events: any[] = [];
        const service = factory(() => ({
          target,
          drag_handle() {
            const id = ++serial;
            events.push(["new", id]);
            const invoke = (kind: string, point?: any) => {
              events.push([kind, id, point]);
              if (kind === failure && !failed) {
                failed = true;
                throw Error(kind);
              }
              return kind;
            };
            return {
              start: async (p: any) => invoke("start", p),
              move_to: async (p: any) => invoke("move", p),
              end: async () => invoke("end"),
            };
          },
        }));
        const responses = [];
        for (const type of [
          "drag_move",
          "drag_end",
          "drag_start",
          "drag_start",
          "drag_move",
          "drag_end",
          "drag_move",
          "drag_end",
          "drag_start",
          "drag_end",
        ])
          responses.push(
            await result(() =>
              service.handleRpc({
                type,
                handle_id: "a",
                point: { x: 1, y: 2 },
              }),
            ),
          );
        return { events, responses };
      }
      assert.deepEqual(await run(createSkyService), await run(original));
    }
});
test("Sky recording rechecks live host metadata on every invocation before calling platform client", async () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl"),
    priorAllow = process.env.SKY_AUDIO_MODEL_ALLOWLIST;
  try {
    process.env.SKY_AUDIO_MODEL_ALLOWLIST = '["audio"]';
    async function run(factory: any) {
      const runtime: any = {
        requestMeta: { "x-codex-turn-metadata": { model: "other" } },
      };
      Object.defineProperty(globalThis, "nodeRepl", {
        configurable: true,
        value: runtime,
      });
      const events: any[] = [];
      const service = factory(() => ({
        target: "mac",
        start_audio_recording() {
          events.push("record");
          return "started";
        },
      }));
      const call = () =>
        result(() =>
          service.handleRpc({
            type: "execute",
            method: "start_audio_recording",
            args: [],
          }),
        );
      const responses = [await call()];
      runtime.requestMeta["x-codex-turn-metadata"] = { model: "audio" };
      responses.push(await call());
      runtime.requestMeta = undefined;
      responses.push(await call());
      return { events, responses };
    }
    assert.deepEqual(await run(createSkyService), await run(original));
  } finally {
    if (prior) Object.defineProperty(globalThis, "nodeRepl", prior);
    else Reflect.deleteProperty(globalThis, "nodeRepl");
    if (priorAllow === undefined) delete process.env.SKY_AUDIO_MODEL_ALLOWLIST;
    else process.env.SKY_AUDIO_MODEL_ALLOWLIST = priorAllow;
  }
});

test("Sky desktop session ownership, failed-close retention and recreation match current source", async () => {
  async function run(factory: any) {
    const events: unknown[] = [], responses: unknown[] = [];
    let created = 0, failClose = true, loads = 0;
    const service = factory(() => { throw Error("must not create ordinary client"); }, {
      loadOptions: () => { loads++; return { target: "windows", api: "desktop" }; },
      createDesktopClient: () => {
        const number = ++created;
        return {
          target: "windows_desktop",
          echo: function (...args: unknown[]) { events.push([number, "echo", this.target]); return args; },
          close: async () => { events.push([number, "close"]); if (failClose) { failClose = false; throw Error("cleanup failed"); } },
          drag_handle: () => ({ start: async () => {}, move_to: async () => {}, end: async () => {} }),
        };
      },
    });
    const call = async (q: any) => responses.push(await result(() => service.handleRpc(q)));
    await call({ type: "setup" });
    await call({ type: "create", options: { api: "other" } });
    await call({ type: "create", options: { api: "desktop", target: "mac" } });
    const first = await service.handleRpc({ type: "create", options: { api: "desktop" } });
    assert.equal(first.target, "windows_desktop");
    const id = first.client_id;
    await call({ type: "create", options: { api: "desktop" } });
    await call({ type: "setup", client_id: "unknown" });
    await call({ type: "execute", client_id: id, method: "echo", args: [1, 2] });
    await call({ type: "drag_start", client_id: id, handle_id: "drag", point: {x: 1,y: 2} });
    await call({ type: "execute", client_id: id, method: "close", args: [] });
    // Failed close retains session ownership but clears its drag handles.
    await call({ type: "drag_move", client_id: id, handle_id: "drag", point: {x: 1,y: 2} });
    await call({ type: "create", options: { api: "desktop" } });
    await call({ type: "execute", client_id: id, method: "close", args: [] });
    await call({ type: "setup", client_id: id });
    const second = await service.handleRpc({ type: "create", options: { api: "desktop" } });
    assert.notEqual(second.client_id, id);
    await service.handleRpc({ type: "execute", client_id: second.client_id, method: "close", args: [] });
    return { events, responses, loads, created };
  }
  assert.deepEqual(await run(createSkyService), await run(original));
});

test("Sky pending drag start rejects concurrent duplicate/move/end and close clears ownership", async () => {
  async function run(factory: any) {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const service = factory(() => ({ target: "linux", drag_handle: () => ({
      start: () => gate, move_to: async () => "move", end: async () => "end",
    }) }));
    const point = { x: 1, y: 2 };
    const pending = service.handleRpc({ type: "drag_start", handle_id: "h", point });
    const responses = [];
    for (const type of ["drag_start", "drag_move", "drag_end"]) {
      responses.push(await result(() => service.handleRpc({ type, handle_id: "h", point })));
    }
    release(); await pending;
    responses.push(await result(() => service.handleRpc({ type: "drag_move", handle_id: "h", point })));
    responses.push(await result(() => service.handleRpc({ type: "drag_end", handle_id: "h" })));
    return responses;
  }
  assert.deepEqual(await run(createSkyService), await run(original));
});


test("Sky service oracle is current-version SHA256 pinned", async () => {
  assert.equal(createHash("sha256").update(await readFile(`${root}/sky/dist/project/cua/sky_js/src/service.js`)).digest("hex"), "efd97700bc9d87fc6c2e7ef262d49eb638123c52fff92ff680ebd1bbb0e7cb81");
});
