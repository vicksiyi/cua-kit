import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { createKernelExecutionRuntime, assertKernelBrowserUrlAllowed } from "../packages/browser-extension/src/kernel_execution_runtime";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = readFileSync(`${root}/chunks/js-kernel-host-COXQa-ka.js`, "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), "5ea78ade270d71bb6ffcec719207ad02bf63db30d0c16058f24a74a7f9f3682a");
const names = new Set(["AU", "IU", "EU", "Df", "CU", "kU"]), definitions: string[] = [];
for (const n of (parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any).body) {
  if (n.type === "FunctionDeclaration" && names.has(n.id.name)) definitions.push(source.slice(n.start, n.end));
  if (n.type === "VariableDeclaration") for (const d of n.declarations) if (names.has(d.id.name)) definitions.push(`const ${source.slice(d.start, d.end)};`);
}
const original = new Function(`const SU="/work/extension/installed",TU="darwin",vU="https://chatgpt.com/backend-api";${definitions.join("\n")};return {AU,IU}`)();
const settled = async (fn: () => any) => { try { return { value: await fn() }; } catch (error: any) { return { error: error.message, name: error.name }; } };

test("kernel runtime matches source per-execution output, policy caching, hooks and permanent timeout failure", async () => {
  for (const mode of ["normal", "enabled", "gate-failure", "hook-error", "hook-timeout", "policy-failure", "clone-failure"]) {
    const results = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      const control: any = {
        isBrowserElicitationEnabled: async () => { if (mode === "gate-failure") throw Error("gate"); return mode === "enabled"; },
        getChatGptAccessPolicy: async () => { trace.push("policy"); if (mode === "policy-failure") throw Error("policy"); return { allow_all_chatgpt_pages: false, allowed_pages: ["https://chatgpt.com/work/extension/installed"] }; },
        fetch() {}, createElicitation() {}, captureTabPdfToLibrary() {},
      };
      const runtime = restored ? createKernelExecutionRuntime(control, "darwin") : original.AU(control);
      const outcomes: any[] = [await settled(() => runtime.initialize())];
      outcomes.push(await settled(() => runtime.emitContentItem("before")));
      const meta = runtime.requestMeta;
      runtime.beginExecution({ turn: "one" });
      assert.equal(runtime.requestMeta, meta);
      outcomes.push(await settled(() => runtime.beginExecution({ turn: "duplicate" })));
      runtime.emitContentItem("item");
      const responseMeta = { nested: { value: 1 } };
      runtime.setResponseMeta(responseMeta); responseMeta.nested.value = 2;
      runtime.setResponseMeta({ other: true });
      if (mode === "clone-failure") outcomes.push(await settled(() => runtime.setResponseMeta({ bad() {} })));
      outcomes.push(await settled(() => runtime.assertBrowserUrlAllowed("https://example.test")));
      outcomes.push(await settled(() => runtime.assertBrowserUrlAllowed("https://chatgpt.com/work/extension/installed")));
      outcomes.push(await settled(() => runtime.assertBrowserUrlAllowed("https://chatgpt.com/work/extension/installed?again")));
      runtime.addAfterSubmittedCodeHook({ timeoutMs: mode === "hook-timeout" ? 0 : 1000, run: () => {
        trace.push("hook1");
        runtime.addAfterSubmittedCodeHook({ timeoutMs: 1000, run: () => trace.push("later-hook") });
        if (mode === "hook-timeout") return new Promise(() => {});
        if (mode === "hook-error") throw Error("hook");
        runtime.emitContentItem("hook-output");
      } });
      runtime.addAfterSubmittedCodeHook({ timeoutMs: 1000, run: () => trace.push("hook2") });
      outcomes.push(await settled(() => runtime.finishExecution()));
      assert.deepEqual(meta, {});
      outcomes.push(await settled(() => runtime.beginExecution({ turn: "two" })));
      outcomes.push(await settled(() => runtime.assertBrowserUrlAllowed("https://chatgpt.com/work/extension/installed")));
      outcomes.push(await settled(() => runtime.finishExecution()));
      outcomes.push(await settled(() => runtime.emitContentItem("after")));
      results.push({ outcomes, trace, env: runtime.env, platform: runtime.platform });
    }
    assert.deepEqual(results[1], results[0], mode);
  }
});

test("kernel page policy matches source protected domains, localized paths, blobs and allow-all", async () => {
  const urls = ["https://example.test", "https://evilchatgpt.com", "https://chatgpt.com.evil.test", "https://chatgpt.com", "https://sub.chatgpt.com", "https://chatgpt.com./work/extension/installed", "https://chat.com/work/extension/installed", "https://chatgpt.com/work/extension/installed/", "https://chatgpt.com/zh-CN/work/extension/installed?q=1#x", "https://chatgpt.com/en/WORK/extension/installed", "http://chatgpt.com/work/extension/installed", "blob:https://chatgpt.com/id", "blob:null/id", "not-url"];
  for (const allow of [false, true]) for (const url of urls) {
    const outcomes = [];
    for (const fn of [original.IU, assertKernelBrowserUrlAllowed]) {
      let calls = 0;
      const result = await settled(() => fn(url, async () => { calls++; return { allow_all_chatgpt_pages: allow, allowed_pages: ["bad", "https://chatgpt.com/work/extension/installed"] }; }));
      outcomes.push({ result, calls });
    }
    assert.deepEqual(outcomes[1], outcomes[0], url);
  }
});
