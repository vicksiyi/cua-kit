import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { z } from "../packages/browser/src/vendor/bundled_zod";
import {
  extensionBrowserProtocol,
  dispatchExtensionCommand,
} from "../packages/browser-extension/src/browser_protocol";
const source = extensionBindings(
  [
    "Np",
    "bc",
    "ey",
    "ly",
    "cE",
    "Kw",
    "hu",
    "ai",
    "oi",
    "ci",
    "li",
    "Gr",
    "pa",
    "ma",
    "_u",
    "ga",
    "ya",
    "Sa",
    "ba",
    "wa",
  ],
  {
    y: z.object,
    U: z.array,
    Ze: z.unknown,
    _: z.string,
    C: z.number,
    ie: z.boolean,
    Gl: z.union,
  },
);
const settle = async (fn: () => unknown) => {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { name: error.name, message: error.message };
  }
};

test("extension protocol reuses exact original capability information, command names and schemas", () => {
  assert.deepEqual(extensionBrowserProtocol.capabilities, {
    browser: source.ly,
    management: source.ey,
    pageAssets: source.cE,
    tab: source.Kw,
    webMcp: source.hu,
  });
  assert.deepEqual(extensionBrowserProtocol.commandNames, {
    management: source.ai,
    audit: source.oi,
    setViewport: source.li,
    resetViewport: source.ci,
  });
  assert.deepEqual(
    extensionBrowserProtocol.commandSets.map((set) =>
      Object.keys(set.commands),
    ),
    [
      [source.ci, source.li],
      [source.ai, source.oi],
    ],
  );
  const shapes: any = {
    managementInput: source.Gr,
    managementOutput: source.pa,
    auditInput: source.ma,
    auditOutput: source.ga,
    viewportInput: source.ya,
    viewportOutput: source.Sa,
    resetInput: source.ba,
    resetOutput: source.wa,
  };
  const cases = [
    null,
    {},
    [],
    { browser_id: "browser", extra: 1 },
    { browser_id: 7 },
    { browser_id: "browser", height: 800, width: 1200 },
    { browser_id: "browser", height: 0, width: 1.2 },
    { browser_id: "browser", height: Infinity, width: NaN },
    {
      browser_id: "browser",
      args: [1, null, { x: 2 }],
      namespace: "tabs",
      method: "query",
      extra: 1,
    },
    { value: undefined },
    { value: { x: 1 } },
    { changes: [] },
    {
      changes: [
        {
          args: [],
          namespace: "tabs",
          method: "move",
          before: {},
          createdAt: 1,
        },
      ],
    },
    {
      changes: [
        {
          args: [],
          namespace: "tabs",
          method: "move",
          before: { windows: [{ id: 1, focused: true }] },
          createdAt: 2,
          result: { id: "x" },
        },
      ],
    },
  ];
  for (const [name, schema] of Object.entries(extensionBrowserProtocol.schemas))
    for (const input of cases) {
      const normalize = (validator: any) => {
        const value = validator.safeParse(input);
        return value.success
          ? { data: value.data }
          : { issues: value.error.issues };
      };
      assert.deepEqual(normalize(schema), normalize(shapes[name]), name);
    }
});

test("extension command dispatch preserves declaration checks, inherited handler lookup and failures", async () => {
  for (const mode of [
    "known",
    "unsupported",
    "inherited-command",
    "missing-handler",
    "inherited-handler",
    "sync-error",
    "async-error",
  ]) {
    const results = [];
    for (const restored of [false, true]) {
      const calls: any[] = [];
      const handler = (payload: any) => {
        calls.push(payload);
        if (mode === "sync-error") throw Error("sync");
        if (mode === "async-error") return Promise.reject(Error("async"));
        return { ok: true };
      };
      const commands =
        mode === "inherited-command"
          ? Object.create({ command: {} })
          : { command: {} };
      const handlers =
        mode === "inherited-handler"
          ? Object.create({ command: handler })
          : mode === "missing-handler"
            ? {}
            : { command: handler };
      const payload = {
        type: mode === "unsupported" ? "other" : "command",
        value: 1,
      };
      results.push({
        result: await settle(() =>
          (restored ? dispatchExtensionCommand : source.Np)({
            backendName: "Chrome",
            commandSets: [{ commands }],
            handlers,
            payload,
          }),
        ),
        calls,
      });
    }
    assert.deepEqual(results[1], results[0], mode);
  }
});
