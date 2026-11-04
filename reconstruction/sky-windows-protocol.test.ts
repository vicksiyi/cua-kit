import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { parse } from "acorn";
import { __awaiter } from "tslib";
import {
  codexTurnMetadataFromRequestMeta,
  APPROVED_APP_META_KEY,
} from "../packages/sky/src/targets/windows/internal/codex_turn_metadata";
import {
  createTurnScopeProtocol,
  scopeKey,
  addApprovedApp,
  addRequestBudget,
  parseApprovalRequest,
  requestAppApproval,
} from "../packages/sky/src/targets/windows/internal/helper_protocol";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const base = `${root}/sky/dist/project/cua/sky_js/src/targets/windows/internal/`;
const originalMetadata = (
  await import(pathToFileURL(base + "codex_turn_metadata.js").href)
).codexTurnMetadataFromRequestMeta;
const source = await readFile(base + "helper_transport.js", "utf8"),
  definitions = new Map<string, any>(),
  expressions: any[] = [];
function visit(node: any) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration") definitions.set(node.id.name, node);
  if (
    node.type === "VariableDeclarator" &&
    node.id.type === "Identifier" &&
    node.init
  )
    definitions.set(node.id.name, node.init);
  if (node.type === "FunctionExpression") expressions.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") visit(value);
  }
}
visit(parse(source, { ecmaVersion: "latest", sourceType: "module" }));
function binding(names: string[], external: any = {}) {
  return new Function(
    ...Object.keys(external),
    names
      .map((name) => {
        const node = definitions.get(name);
        if (!node) throw Error(name);
        return `const ${name}=${source.slice(node.start, node.end)};`;
      })
      .join("\n") + `;return {${names.join(",")}};`,
  )(...Object.values(external));
}
const approvalNode = expressions
  .sort((a, b) => a.end - a.start - (b.end - b.start))
  .find((n) =>
    source
      .slice(n.start, n.end)
      .includes("return{allowPersistentApproval:!1!==Reflect.get"),
  )!;
const originalParse = new Function(
  "return " + source.slice(approvalNode.start, approvalNode.end),
)();
const budgetNode = expressions
  .filter((n) => source.slice(n.start, n.end).includes("return{[P]:e}"))
  .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
const originalBudget = new Function(
  "P",
  "return " + source.slice(budgetNode.start, budgetNode.end),
)("x-oai-cua-request-budget-ms");
const originalApproval = binding(["D"], { i: __awaiter }).D;
const originalMerge = binding(["Z"], { f: APPROVED_APP_META_KEY }).Z;
async function result(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message, name: e.name };
  }
}
async function host<T>(value: any, run: () => Promise<T>) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  Object.defineProperty(globalThis, "nodeRepl", { configurable: true, value });
  try {
    return await run();
  } finally {
    if (prior) Object.defineProperty(globalThis, "nodeRepl", prior);
    else Reflect.deleteProperty(globalThis, "nodeRepl");
  }
}
test("Windows turn metadata preserves environment/host/nested precedence and outer approved identity", async () => {
  const prior = process.env.NODE_REPL_REQUEST_META;
  try {
    for (const env of [
      "invalid",
      "[]",
      '{"outer":1,"x-oai-cua-approved-app":" outer "}',
    ])
      for (const requestMeta of [
        undefined,
        [],
        {
          outer: 2,
          "x-codex-turn-metadata": {
            session_id: "s",
            "x-oai-cua-approved-app": "inner",
          },
        },
        JSON.stringify({
          "x-oai-cua-approved-app": "host",
          "x-codex-turn-metadata": '{"turn_id":"t"}',
        }),
      ]) {
        process.env.NODE_REPL_REQUEST_META = env;
        await host({ requestMeta }, async () =>
          assert.deepEqual(
            codexTurnMetadataFromRequestMeta(),
            originalMetadata(),
          ),
        );
      }
  } finally {
    if (prior === undefined) delete process.env.NODE_REPL_REQUEST_META;
    else process.env.NODE_REPL_REQUEST_META = prior;
  }
});
test("Windows approval parsing and prompts match original persistence restrictions", async () => {
  for (const value of [
    null,
    [],
    {},
    { app: " " },
    {
      app: " app ",
      displayName: " Name ",
      riskLevel: "bad",
      allowPersistentApproval: 0,
    },
    {
      app: "computer-audio",
      riskLevel: "high",
      allowPersistentApproval: false,
    },
  ])
    assert.deepEqual(parseApprovalRequest(value), originalParse(value));
  for (const app of ["fixture", "computer-audio"])
    for (const persistent of [true, false])
      for (const response of [
        { action: "accept" },
        { action: "decline" },
        { action: "accept", _meta: { persist: "always" } },
        { action: "accept", content: { persist: "always" } },
        {
          action: "accept",
          content: { source: "computer-use-persisted-state", scope: "global" },
        },
      ]) {
        const request = {
          app,
          displayName: "Fixture",
          allowPersistentApproval: persistent,
          riskLevel: undefined,
        };
        async function run(fn: any) {
          const calls: any[] = [];
          return {
            response: await result(() =>
              fn(
                request,
                { call_id: " ", item_id: " item " },
                async (args: any) => {
                  calls.push(args);
                  return response;
                },
              ),
            ),
            calls,
          };
        }
        assert.deepEqual(
          await run(requestAppApproval),
          await run(originalApproval),
        );
      }
  await host(
    { createElicitation: async () => ({ action: "accept" }) },
    async () =>
      assert.deepEqual(
        await result(() =>
          requestAppApproval(
            {
              app: "a",
              displayName: "A",
              allowPersistentApproval: true,
              riskLevel: undefined,
            },
            {},
          ),
        ),
        await result(() =>
          originalApproval(
            { app: "a", displayName: "A", allowPersistentApproval: true },
            {},
          ),
        ),
      ),
  );
  for (const metadata of [undefined, null, [], { a: 1 }, "text"])
    assert.deepEqual(
      addApprovedApp(metadata, "app"),
      originalMerge(metadata, "app"),
    );
  for (const metadata of [undefined, null, [], { a: 1 }, "text"])
    assert.deepEqual(
      addRequestBudget(metadata, 42),
      originalBudget(metadata, 42),
    );
});
test("Windows turn scopes preserve home normalization, WSL fallback, marker sanitization and whitespace", () => {
  const prior = process.env.WSL_DISTRO_NAME;
  process.env.WSL_DISTRO_NAME = " fixture ";
  try {
    for (const home of [
      undefined,
      " C:/Users/test ",
      "\\\\server\\share",
      "/mnt/c/user/home",
      "mnt/d",
      "/linux/home",
      "relative",
    ])
      for (const status of [0, 1]) {
        const proc: any = {
            env: { CODEX_HOME: home, USERPROFILE: "C:\\Users\\fallback" },
            platform: "win32",
          },
          calls: any[] = [];
        const spawn: any = (...args: any[]) => {
          calls.push(args);
          return { status, stdout: " C:/mapped/home " };
        };
        const deps: any = {
          process: () => proc,
          spawnSync: spawn,
          homedir: () => "/home/fixture",
          existsSync: () => true,
          mkdirSync() {},
          writeFileSync() {},
        };
        const restored = createTurnScopeProtocol(deps);
        const original = binding(["G", "B", "X", "V", "K", "Q", "Y", "F"], {
          a: path,
          u: { homedir: deps.homedir },
          J: deps.process,
          n: spawn,
        });
        assert.equal(restored.resolveHome(), original.X());
        for (const metadata of [
          undefined,
          [],
          {},
          { session_id: " session/one ", turn_id: "turn:two" },
          { session_id: " ", turn_id: "t" },
        ]) {
          const a = restored.readScope(metadata),
            b = original.K(metadata);
          assert.deepEqual(a, b);
          assert.equal(scopeKey(a), original.Q(b));
          if (a)
            assert.equal(
              restored.markerPath(a),
              original.F(path.join("cache", "computer-use", "interrupts"), b),
            );
        }
        assert.equal(
          calls
            .filter((call) => call[0] === "wsl.exe")
            .every((call) => call[1][1] === "fixture"),
          true,
        );
      }
  } finally {
    if (prior === undefined) delete process.env.WSL_DISTRO_NAME;
    else process.env.WSL_DISTRO_NAME = prior;
  }
});
test("Windows interrupt marker helpers use isolated paths and preserve swallowed write failures", () => {
  const calls: any[] = [];
  const protocol = createTurnScopeProtocol({
    process: () => process,
    spawnSync: () => {
      throw Error("unexpected");
    },
    homedir: () => "/synthetic",
    existsSync: (file: any) => {
      calls.push(["exists", file]);
      return true;
    },
    mkdirSync: (...args: any[]) => {
      calls.push(["mkdir", ...args]);
      return undefined;
    },
    writeFileSync: (...args: any[]) => {
      calls.push(["write", ...args]);
      throw Error("fixture denied");
    },
  } as any);
  const scope = {
    codexHome: "/synthetic",
    conversationId: "s/1",
    turnId: "t:2",
  };
  assert.equal(protocol.interrupted(scope), true);
  protocol.markInterrupted(scope);
  protocol.markInterrupted(null);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["exists", "mkdir", "write"],
  );
  assert.equal(calls[0][1], "/synthetic/cache/computer-use/interrupts/s_1/t_2");
});
