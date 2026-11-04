import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { createKernelBrowserBridge } from "../packages/browser-extension/src/kernel_browser_bridge";
import { validateRequestHeaders } from "../packages/browser/src/service/runtime/request_headers";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0/chunks`;
const source = readFileSync(`${root}/js-kernel-host-COXQa-ka.js`, "utf8"), shared = readFileSync(`${root}/src-BsTzWBmo.js`, "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), "5ea78ade270d71bb6ffcec719207ad02bf63db30d0c16058f24a74a7f9f3682a");
assert.equal(createHash("sha256").update(shared).digest("hex"), "2284e7e24f4fc756e5af9e00d652914415a238128e5dcf4ab02bb0388c130dd0");
function extract(text: string, names: string[]) {
  const parts: string[] = [];
  for (const n of (parse(text, { ecmaVersion: "latest", sourceType: "module" }) as any).body) {
    if (n.type === "FunctionDeclaration" && names.includes(n.id.name)) parts.push(text.slice(n.start, n.end));
    if (n.type === "VariableDeclaration") for (const d of n.declarations) if (names.includes(d.id.name)) parts.push(`const ${text.slice(d.start, d.end)};`);
  }
  return parts.join("\n");
}
const code = extract(shared, ["Mt"]) + ";const Ql=Mt;" + extract(source, ["qU", "jU", "MU", "OU", "AU", "DU", "RU", "xU", "st", "yr", "Fb", "zS", "Wb", "PU", "BU", "NU", "FU", "Ps", "UU", "$U", "zb", "LU", "IU", "EU", "Df", "CU", "kU", "Yl", "Pf"]);

test("assembled kernel browser bridge matches original multiplexed RPC, browser context and execution lifecycle", async () => {
  for (const mode of ["normal", "init-failure", "service-failure"]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      let receive: any, runtime: any;
      const transport = {
        setMessageCallback(fn: any) { receive = fn; },
        async close() { trace.push("close"); },
        addCloseListener() { return () => {}; },
        sendMessage(message: any) {
          trace.push(message);
          if (!message.method) return;
          let result: any = null;
          if (message.method === "isBrowserElicitationEnabled") result = true;
          if (message.method === "getInfo") result = { family: "chromium", name: "Chrome", type: "extension", requestHeadersVersion: 1, metadata: { extensionInstanceId: "instance", profileName: "profile" } };
          if (message.method === "getTabs") result = [{ id: 1, url: "https://example.test" }];
          if (message.method === "readRequirements") result = { requirements: { browserUse: { extension: { requestHeaders: [{ name: "x-test", value: "yes" }] } } } };
          if (message.method === "readSessionConfig") result = { key: "value" };
          if (message.method === "getChatGptAccessPolicy") result = { allow_all_chatgpt_pages: true, allowed_pages: [] };
          queueMicrotask(() => receive({ id: message.id, ...(message.type ? { type: message.type } : {}), ...(mode === "init-failure" && message.method === "isBrowserElicitationEnabled" ? { error: { message: "init" } } : { result }) }));
        },
      };
      const service = async (value: any) => {
        trace.push("service"); runtime = value;
        if (mode === "service-failure") throw Error("service");
        return { apiManifest: "manifest", disabledMemberIds: new Set<string>(), executeAgentCommand: async () => "executed" };
      };
      const locks = { request: async (_name: string, fn: any) => fn() };
      const metadata = { "x-codex-turn-metadata": { session_id: "session", turn_id: "turn" } };
      const bridge = restored ? createKernelBrowserBridge(transport, metadata, { platform: "darwin", locks, commandTiming: "timing", errorReporter: "reporter", performanceSpan: "span", createBrowserService: service }) : new Function("navigator", "gU", "dv", `${code};const TU="darwin",vU="https://chatgpt.com/backend-api",SU="/work/extension/installed",vg="timing",TS="reporter",Pw="span";return jU;`)({ locks }, (_options: any, value: any) => service(value), validateRequestHeaders)(transport, metadata);
      const values: any[] = [];
      const run = async (fn: () => any) => { try { values.push(await fn()); } catch (e: any) { values.push({ error: e?.message ?? e }); } };
      await run(() => bridge.browser.then(() => "ready"));
      if (mode === "normal") {
        assert.equal(runtime.env.BROWSER_USE_SECURITY_MODE, undefined);
        const first = await runtime.browserContext.get("extension");
        assert.equal(first, await runtime.browserContext.getDefault());
        await run(() => runtime.browserContext.list());
        await run(() => runtime.browserContext.get("missing"));
        await run(() => first.api.getTabs());
        await run(() => runtime.config.session("session").get("key"));
        await run(() => runtime.config.session("session").set("new", 1));
        await run(() => runtime.assertBrowserUrlAllowed("https://chatgpt.com"));
        await run(() => bridge.displayBridge.displayImage(new Uint8Array([1, 2, 255])));
        runtime.emitContentItem({ type: "text", text: "done" });
        await run(() => bridge.finishExecution());
        bridge.beginExecution({ "x-codex-turn-metadata": { session_id: "session", turn_id: "next" } });
        await run(() => first.api.getTabs());
        await run(() => runtime.filesystem.readBytes());
        await run(() => runtime.filesystem.readFile());
        await run(() => runtime.config.readAll());
        await run(() => bridge.finishExecution());
        await run(() => runtime.browserContext.dispose());
      } else await run(() => bridge.finishExecution());
      outputs.push({ trace, values });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
