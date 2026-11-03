import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  createTabBotDetectionReportCommand,
  browserUsageMetadata,
  oncePerConversationBackend,
  botReportHostname,
  botDetectionEvent,
} from "../packages/browser/src/service/commands/bot_detection";
import { BotDetectionReport } from "../packages/browser/src/commands/tab_developer";
import { codexTurnMetadata } from "../packages/browser/src/service/preferences/request_context";
const original = originalServiceBindings([
  "Lc",
  "Uc",
  "mF",
  "bne",
  "yne",
  "wne",
]);
test("bot report metadata and hostname projection match original nullish and value semantics", () => {
  for (const metadata of [
    undefined,
    {},
    { session_id: "s" },
    { session_id: 0, thread_id: false, model: 0 },
    { session_id: "s", chatgpt_conversation_id: "  ", thread_id: "child" },
    {
      session_id: "s",
      chatgpt_conversation_id: " conv ",
      thread_source: "subagent",
      turn_id: "t",
    },
  ])
    for (const backend of ["cdp", "chrome", "unknown"])
      assert.deepEqual(
        browserUsageMetadata(backend, metadata),
        original.Uc(backend, metadata),
      );
  for (const url of [
    undefined,
    null,
    "",
    "invalid",
    "https://User:Pass@EXAMPLE.com:8443/path?q=secret#hash",
    "file:///tmp/test",
    "about:blank",
    "https://[::1]:8443/",
  ]) {
    assert.equal(botReportHostname(url), original.wne(url));
    const args = { backend: "cdp", reason: "captcha_failed", url };
    assert.deepEqual(botDetectionEvent(args), original.yne(args));
  }
});
test("conversation backend deduplication preserves emit order and throwing-emitter state", () => {
  for (const failure of [false, true]) {
    const execute = (source: boolean) => {
      const trace: any[] = [];
      const emit = (...args: any[]) => {
        trace.push(args);
        if (failure) throw Error("failed");
      };
      const seen = new Set<string>();
      const fn = (source ? original.mF : oncePerConversationBackend)(
        emit,
        seen,
      );
      for (const [backend, metadata] of [
        ["cdp", { session_id: "s" }],
        ["cdp", { session_id: "s" }],
        ["chrome", { session_id: "s" }],
        ["cdp", { session_id: "s2", chatgpt_conversation_id: "s" }],
      ])
        try {
          fn(backend, metadata, { extra: 1 });
        } catch {}
      return { trace, seen: [...seen] };
    };
    assert.deepEqual(execute(false), execute(true));
    assert.equal(execute(false).trace.length, 2);
  }
});
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  const emit = (...args: any[]) => {
    trace.push(["emit", ...args]);
    if (mode === "emit-error") throw Error("emit failed");
  };
  const ref = originalServiceBindings(
    ["F", "W", "Lc", "Uc", "bne", "yne", "wne", "_ne", "C5", "ro", "fF"],
    { na: { Report: BotDetectionReport }, Me: codexTurnMetadata, dt: emit },
  );
  const context: any = {
    runtime: { requestMeta: { "x-codex-turn-metadata": { session_id: "s" } } },
    clientInfo: { type: mode === "extension" ? "extension" : "cdp" },
    acquireAuthority() {
      trace.push("authority");
      return {
        observeContent(url: string) {
          trace.push(["observe", url]);
          return {
            async assert() {
              trace.push("assert");
              if (mode === "denied") throw Error("denied");
            },
          };
        },
      };
    },
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return "https://fixture.test/";
      },
    },
    cdp: {
      async readDocumentState(id: number) {
        trace.push(["document", id]);
        if (mode === "read-error") throw Error("read failed");
        return mode === "fallback"
          ? null
          : {
              href:
                mode === "empty"
                  ? ""
                  : "https://fixture.test:8443/path?private=fixture",
            };
      },
      currentTopLevelUrl(id: number) {
        trace.push(["fallback", id]);
        return "https://fallback.test/";
      },
    },
  };
  try {
    return {
      value: await (source ? ref.fF : createTabBotDetectionReportCommand(emit))(
        {
          browser_id: "b",
          tab_id:
            mode === "invalid-tab" ? "0" : mode === "schema-tab" ? 7 : "7",
          reason: mode === "invalid-reason" ? "bad" : "captcha_failed",
        },
        context,
      ),
      trace,
    };
  } catch (e) {
    return { error: (e as Error).message, trace };
  }
}
test("bot report command preserves authorization before schema checks and non-awaited emission", async () => {
  for (const mode of [
    "normal",
    "extension",
    "denied",
    "read-error",
    "emit-error",
    "fallback",
    "empty",
    "invalid-tab",
    "schema-tab",
    "invalid-reason",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  const normal = await run(false, "normal");
  assert.deepEqual(normal.value, {
    status: "reported",
    hostname: "fixture.test",
  });
  assert.equal(normal.trace.at(-1)[4].hostname, "fixture.test");
  assert.equal(
    (await run(false, "empty")).trace.some((x) => x[0] === "fallback"),
    false,
  );
  assert.equal(
    (await run(false, "extension")).trace.at(-1)[4].backend,
    "chrome",
  );
});
