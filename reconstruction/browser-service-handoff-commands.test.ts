import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  ManualHandoffCommand,
  createMarkTabCommand,
} from "../packages/browser/src/service/commands/handoff";
import { ManualHandoff } from "../packages/browser/src/commands/tab_control";
import { availableCapabilities } from "../packages/browser/src/service/capability_filter";
import { codexTurnMetadata } from "../packages/browser/src/service/preferences/request_context";
async function run(kind: string, source: boolean, mode: string) {
  const trace: any[] = [];
  const family = (info: any) => {
    trace.push(["family", info]);
    return { displayName: "Fixture Browser" };
  };
  const original = originalServiceBindings(["F", "W", "ai", "Ic", "ON"], {
    oe: { ManualHandoff },
    yp: availableCapabilities,
    Me: codexTurnMetadata,
    On: { id: "browserAuth" },
    ks: family,
  });
  const type =
    mode === "extension" ? "extension" : mode === "iab" ? "iab" : "cdp";
  const payload = {
    tab_id: mode === "invalid-tab" ? 0 : "7",
    status: "handoff",
  };
  const ctx: any = {
    runtime: {
      env: {
        ...(mode === "disabled"
          ? { BROWSER_USE_DISABLE_TAB_CAPABILITIES: "browserAuth" }
          : {}),
      },
      requestMeta: {
        "x-codex-turn-metadata":
          mode === "malformed"
            ? "invalid"
            : {
                browser_auth_client_unsupported:
                  mode === "unsupported"
                    ? "true"
                    : mode === "boolean-flag"
                      ? true
                      : "false",
              },
      },
    },
    clientInfo: {
      type,
      name: "Fixture Browser",
      family: "fixture",
      capabilities:
        mode === "missing"
          ? undefined
          : {
              tab: [
                { id: mode === "wrong-capability" ? "other" : "browserAuth" },
              ],
            },
    },
    acquireAuthority() {
      trace.push("authority");
      return {
        actInFrame(url: string) {
          trace.push(["act", url]);
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
    tabs: {
      async get(id: number) {
        trace.push(["get", id]);
        if (mode === "get-error") throw Error("get failed");
        return { id };
      },
      async mark(id: number, status: string) {
        trace.push(["mark", id, status]);
        if (["mark-error", "extension"].includes(mode))
          throw Error("mark failed");
      },
    },
  };
  try {
    return {
      value: await (
        kind === "manual"
          ? source
            ? original.Ic
            : ManualHandoffCommand
          : source
            ? original.ON
            : createMarkTabCommand(family)
      )(payload, ctx),
      trace,
    };
  } catch (e) {
    return {
      error: (e as Error).message,
      cause:
        (e as Error).cause instanceof Error
          ? ((e as Error).cause as Error).message
          : undefined,
      trace,
    };
  }
}
test("manual handoff and marking match original capability, client, validation and error ordering", async () => {
  for (const kind of ["manual", "mark"])
    for (const mode of [
      "normal",
      "extension",
      "iab",
      "invalid-tab",
      "disabled",
      "malformed",
      "unsupported",
      "boolean-flag",
      "missing",
      "wrong-capability",
      "denied",
      "get-error",
      "mark-error",
    ])
      assert.deepEqual(
        await run(kind, false, mode),
        await run(kind, true, mode),
        `${kind}/${mode}`,
      );
  assert.deepEqual((await run("manual", false, "normal")).trace.slice(-2), [
    ["get", 7],
    ["mark", 7, "handoff"],
  ]);
  assert.equal(
    (await run("manual", false, "disabled")).error,
    'Fixture Browser does not support command "tab_manual_handoff_request".',
  );
  assert.deepEqual((await run("manual", false, "boolean-flag")).value, {});
  assert.equal((await run("mark", false, "extension")).cause, "mark failed");
  assert.equal((await run("mark", false, "invalid-tab")).trace.length, 0);
  assert.equal(
    (await run("manual", false, "get-error")).trace.some(
      (x) => x[0] === "mark",
    ),
    false,
  );
});
