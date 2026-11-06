import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
import { SiwcAuthenticateCommand } from "../packages/browser/src/service/commands/siwc";
import { SiwcAuthenticate } from "../packages/browser/src/commands/siwc";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
import { positiveTabId } from "../packages/browser/src/service/tab_id";
import { inputTimeout } from "../packages/browser/src/service/input/input";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
const source = originalServiceBindings(
  ["gN", "bN", "Pv", "Co", "Dc", "uw", "mte"],
  {
    O: defineCommand,
    ee: { SiwcAuthenticate },
    H: positiveTabId,
    Oe: inputTimeout,
    Ye: (options: any) => options?.elicitationDisplayName ?? "Browser use",
  },
);
const modes = [
  "ok",
  "ax",
  "automatic",
  "unsupported",
  "denied-authority",
  "no-page",
  "stale-target",
  "bad-ref",
  "no-candidate",
  "multiple",
  "bind-stale",
  "not-ready",
  "account-fails",
  "origin-mismatch",
  "stored-deny",
  "stored-approve",
  "decline",
  "cancel",
  "unknown-action",
  "prompt-fails",
  "changed-account",
  "grant-fails",
  "cookie-fails",
  "follow-fails",
  "click-fails",
  "changed-before-cookie",
  "changed-before-click",
];
test("SIWC authenticate matches original outcomes and ordered effects across success and failure stages", async () => {
  for (const mode of modes) {
    const outcomes = [];
    for (const command of [source.gN, SiwcAuthenticateCommand]) {
      const trace: any[] = [];
      let frames = 0,
        accounts = 0,
        phase = "start";
      const record = (name: string, ...args: any[]) =>
        trace.push([name, ...args]);
      const account = {
        accountKey: "fixture",
        authLifetimeId: "life",
        authOrigin: "https://auth.test",
        pageOrigin: "https://site.test",
      };
      const injected = {
        siwcDocumentId: () => (mode === "stale-target" ? "new" : "generation"),
        siwcDetect: () =>
          mode === "no-candidate"
            ? []
            : Array.from({ length: mode === "multiple" ? 2 : 1 }, (_, i) => ({
                ref: `s${i + 1}`,
                evidence: "siwc_marker_detected",
                visibility: "rendered",
              })),
      };
      const context: any = {
        supportsTabCapability: async (id: any) => {
          record("supports", id);
          return mode !== "unsupported";
        },
        security: {
          currentTabUrl: async (id: any) => {
            record("url", id);
            return "https://site.test";
          },
        },
        acquireAuthority: () => {
          const gate = {
            observeContent: (url: any) => {
              record("observeAuthority", url);
              return gate;
            },
            actInFrame: (url: any) => {
              record("actAuthority", url);
              return gate;
            },
            assert: async () => {
              record("assert");
              if (mode === "denied-authority") throw Error("denied");
            },
          };
          return gate;
        },
        getCurrentSessionId: () => "session",
        cdp: {
          call: async (id: any, method: any) => {
            record("cdp", id, method);
            frames++;
            if (mode === "no-page") throw Error("no frame");
            return {
              frameTree: {
                frame: {
                  id: "frame",
                  loaderId:
                    (mode === "changed-before-cookie" && phase === "grant") ||
                    (mode === "changed-before-click" && phase === "follow")
                      ? "new"
                      : "loader",
                  url: "https://site.test",
                  securityOrigin: "https://site.test",
                },
              },
            };
          },
        },
        ax: {
          targetForSnapshot: (...args: any[]) => {
            record("ax", ...args);
            return { target: { tabId: 7 }, backendNodeId: 42 };
          },
        },
        playwright: {
          evaluateOnPlaywrightPage: async (tab: any, fn: any, opts: any) => {
            record("page", tab, opts);
            return fn(injected);
          },
          evaluateOnPlaywrightNode: async (node: any, fn: any, opts: any) => {
            record("node", node, opts);
            return { result: fn({}, { siwcRef: () => "s1" }) };
          },
          withBoundPlaywrightSelector: async (
            tab: any,
            selector: any,
            validate: any,
            run: any,
            opts: any,
          ) => {
            record("bind", tab, selector, opts);
            if (!(await validate()) || mode === "bind-stale") return;
            return run({
              evaluateOnPlaywrightSelector: async (
                tab: any,
                selector: any,
                _fn: any,
                opts: any,
              ) => {
                record("ready", tab, selector, opts);
                return mode !== "not-ready";
              },
              clickLocator: async (...args: any[]) => {
                record("click", ...args);
                if (mode === "click-fails") throw Error("click failed");
              },
            });
          },
        },
        getSiwcAccountContext: async (id: any) => {
          record("account", id);
          accounts++;
          if (mode === "account-fails") throw Error("account failed");
          return {
            ...account,
            accountKey:
              mode === "changed-account" && accounts > 1 ? "other" : "fixture",
            pageOrigin:
              mode === "origin-mismatch"
                ? "https://other.test"
                : account.pageOrigin,
          };
        },
        preferences: {
          getSiwcPermission: async (key: any) => {
            record("permission", key);
            return mode === "stored-deny"
              ? { decision: "deny" }
              : mode === "stored-approve"
                ? { decision: "approve" }
                : null;
          },
          isPersistentApprovalAllowed: async (origin: any) => {
            record("persistent", origin);
            return true;
          },
          handleSiwcPromptResult: async (...args: any[]) => {
            record("remember", ...args);
          },
        },
        commandTiming: { trackElicitation: (fn: any) => fn },
        runtime: {
          createElicitation: async (request: any) => {
            record("prompt", request);
            if (mode === "prompt-fails") throw Error("prompt failed");
            return {
              action: ["decline", "cancel"].includes(mode)
                ? mode
                : mode === "unknown-action"
                  ? "unknown"
                  : "accept",
            };
          },
          otel: { log: (...args: any[]) => record("log", ...args) },
        },
        issueSiwcBrowserGrant: async (...args: any[]) => {
          record("grant", ...args);
          phase = "grant";
          if (mode === "grant-fails") throw Error("grant failed");
          return { fixtureGrant: true };
        },
        installSiwcBrowserGrantCookie: async (...args: any[]) => {
          record("cookie", ...args);
          if (mode === "cookie-fails") throw Error("cookie failed");
        },
        followSessionTab: async (id: any) => {
          record("follow", id);
          phase = "follow";
          if (mode === "follow-fails") throw Error("follow failed");
        },
      };
      const payload: any = {
        tab_id: "7",
        target:
          mode === "ax"
            ? { kind: "ax", snapshotId: "snapshot", elementIndex: 0 }
            : {
                kind: "dom",
                snapshotId: JSON.stringify(["session", "7", "generation"]),
                ref: mode === "bad-ref" ? "invalid selector" : "s1",
              },
      };
      if (["automatic", "no-candidate", "multiple"].includes(mode))
        delete payload.target;
      let result;
      try {
        result = await command(payload, context);
      } catch (error) {
        result = { error: (error as Error).message };
      }
      outcomes.push({ result, trace });
    }
    assert.deepEqual(outcomes[1], outcomes[0], mode);
    if (["ok", "ax", "automatic", "stored-approve"].includes(mode))
      assert.equal(outcomes[1].result.status, "initiated");
    else
      assert(
        !outcomes[1].trace.some((entry) => entry[0] === "click") ||
          mode === "click-fails",
        mode,
      );
  }
});
