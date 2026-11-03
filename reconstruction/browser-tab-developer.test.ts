import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CdpTabCapability,
  cdpTabCapabilityDefinition,
} from "../packages/browser/dist/capabilities/tab_cdp.js";
import {
  BotDetectionTabCapability,
  botDetectionTabCapabilityDefinition,
} from "../packages/browser/dist/capabilities/tab_bot_detection.js";
import {
  BotDetectionReport,
  CdpCall,
  CdpEvents,
} from "../packages/browser/dist/commands/tab_developer.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {Su,Tu,cu,du,uu,gu,tu};").toString("base64")}`
);
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}
async function run(
  Class: any,
  method: string,
  args: any[],
  response: any,
  parse = false,
) {
  const log: any[] = [];
  const api = new Class({
    browserId: "b",
    tabId: "t",
    info: { id: "test", description: "d" },
    documentation: {},
    transport: {
      send: async ({ command, timeoutMs }: any) => {
        log.push({ command: command.toJSON(), timeoutMs });
        if (parse) log.push(command.parse());
        return response;
      },
    },
  });
  return { result: await outcome(() => api[method](...args)), log };
}

test("CDP capability preserves target projection and distinct command/event transport timeouts", async () => {
  assert.deepEqual(cdpTabCapabilityDefinition.info, original.Tu.info);
  for (const timeoutMs of [undefined, null, 0, 1, 50, -1, Infinity, "1"])
    for (const target of [
      undefined,
      null,
      {},
      { sessionId: "s" },
      { targetId: "t" },
      { sessionId: "s", targetId: "t" },
      { sessionId: "" },
    ])
      for (const parse of [false, true]) {
        const options = {
          target,
          timeoutMs,
          afterSequence: 0,
          limit: 10,
          methods: ["Page.loadEventFired"],
        };
        assert.deepEqual(
          await run(
            CdpTabCapability,
            "send",
            ["Page.enable", {}, options],
            { result: 1 },
            parse,
          ),
          await run(
            original.Su,
            "send",
            ["Page.enable", {}, options],
            { result: 1 },
            parse,
          ),
        );
        const response = {
          cursor: 1,
          events: [
            {
              sequence: 1,
              source: { sessionId: "s", tabId: 1 },
              method: "Page.loadEventFired",
              params: { a: 1 },
              extra: 1,
            },
          ],
          hasMore: false,
          truncated: false,
          extra: 1,
        };
        assert.deepEqual(
          await run(CdpTabCapability, "readEvents", [options], response, parse),
          await run(original.Su, "readEvents", [options], response, parse),
        );
      }
  for (const response of [
    null,
    {},
    [],
    { cursor: -1, events: [], hasMore: false, truncated: false },
  ])
    assert.deepEqual(
      await run(CdpTabCapability, "readEvents", [], response),
      await run(original.Su, "readEvents", [], response),
    );
});

test("bot report parses before send, locks target ids, strips extras and parses result", async () => {
  assert.deepEqual(botDetectionTabCapabilityDefinition.info, original.du.info);
  for (const options of [
    undefined,
    null,
    {},
    {
      reason: "captcha_failed",
      browser_id: "override",
      tab_id: "override",
      extra: 1,
    },
    { reason: "challenge_loop" },
    { reason: "invalid" },
  ])
    for (const response of [
      { status: "reported", hostname: null, extra: 1 },
      { status: "reported", hostname: "example.com" },
      {},
      null,
    ])
      assert.deepEqual(
        await run(BotDetectionTabCapability, "report", [options], response),
        await run(original.cu, "report", [options], response),
      );
});

test("CDP and bot command schemas preserve target exclusivity, limits, event validation and unknown results", async () => {
  const inputs = [
    undefined,
    null,
    {},
    [],
    {
      browser_id: "b",
      tab_id: "t",
      reason: "access_denied",
      method: "Page.enable",
      params: {},
      target: { session_id: "s" },
      limit: 1000,
      methods: ["x"],
      after_sequence: 0,
      timeout_ms: 0,
    },
    {
      browser_id: "b",
      tab_id: "t",
      method: "",
      target: {},
      limit: 1001,
      methods: [],
      after_sequence: -1,
      timeout_ms: -1,
    },
    {
      browser_id: "b",
      tab_id: "t",
      method: "m",
      target: { session_id: "s", target_id: "t" },
    },
    { cursor: 0, events: [], hasMore: false, truncated: false },
    {
      cursor: 1,
      events: [
        {
          sequence: 1,
          source: { extensionId: "e", sessionId: "s", targetId: "t", tabId: 1 },
          method: "event",
          params: { value: 3 },
        },
      ],
      hasMore: true,
      truncated: false,
    },
    {
      cursor: 1,
      events: [{ sequence: 0, source: {}, method: "" }],
      hasMore: true,
      truncated: false,
    },
    { status: "reported", hostname: null },
  ];
  for (const [restored, vendor] of [
    [BotDetectionReport, original.tu],
    [CdpCall, original.uu],
    [CdpEvents, original.gu],
  ])
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
