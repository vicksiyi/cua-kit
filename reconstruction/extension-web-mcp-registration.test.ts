import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createWebMcpGate,
  createWebMcpRegistration,
} from "../packages/browser-extension/src/web_mcp_registration";
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
async function scenario(restored: boolean, mode: string) {
  const trace: unknown[] = [];
  let ids =
    mode === "partial"
      ? ["codex-webmcp"]
      : mode === "all"
        ? ["codex-webmcp", "codex-webmcp-bridge"]
        : [];
  let listener!: (enabled: boolean) => void;
  let release: (() => void) | undefined;
  const scripting = {
    async getRegisteredContentScripts(options: unknown) {
      trace.push(["read", options]);
      return ids.map((id) => ({ id }));
    },
    async registerContentScripts(scripts: Array<{ id: string }>) {
      trace.push(["register", structuredClone(scripts)]);
      if (mode === "apply-fail" || mode === "cleanup-fail")
        throw Error("missing asset");
      if (mode === "during-apply")
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      ids.push(...scripts.map((script) => script.id));
    },
    async unregisterContentScripts(options: { ids: string[] }) {
      trace.push(["unregister", options]);
      if (mode === "cleanup-fail") throw Error("unregister");
      ids = ids.filter((id) => !options.ids.includes(id));
    },
  } as any;
  const subscribeGate = async (name: string, fn: typeof listener) => {
    trace.push(["subscribe", name]);
    listener = fn;
    if (mode === "subscription-fail") throw Error("gate");
  };
  const warn = (message: string) => trace.push(["warn", message]);
  const gate = restored
    ? createWebMcpGate({
        subscribeGate,
        apply: createWebMcpRegistration(scripting),
        warn,
      })
    : extensionBindings(["Wf", "zk", "Kf", "Zf", "Vk", "Wk"], {
        chrome: { scripting },
        As: subscribeGate,
        console: { warn },
      }).Wk();
  if (mode === "cleanup-fail") ids = ["codex-webmcp"];
  if (mode === "subscription-fail")
    trace.push(["enabled", await gate.enabled()]);
  else if (mode === "rapid") {
    listener(true);
    listener(false);
    listener(true);
    trace.push(["enabled", await gate.enabled()]);
    listener(true);
    trace.push(["same", await gate.enabled()]);
  } else if (mode === "during-apply") {
    listener(true);
    await flush();
    const waiting = gate.enabled();
    listener(false);
    release!();
    trace.push(["enabled", await waiting]);
  } else {
    listener(true);
    trace.push(["enabled", await gate.enabled()]);
    listener(false);
    trace.push(["disabled", await gate.enabled()]);
  }
  return { trace, ids };
}
test("WebMCP registration and gate queue match installed originals across races and failures", async () => {
  for (const mode of [
    "empty",
    "partial",
    "all",
    "rapid",
    "during-apply",
    "apply-fail",
    "cleanup-fail",
    "subscription-fail",
  ])
    assert.deepEqual(
      await scenario(true, mode),
      await scenario(false, mode),
      mode,
    );
});
