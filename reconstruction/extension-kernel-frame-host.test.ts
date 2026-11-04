import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { registerKernelFrameHost } from "../packages/browser-extension/src/kernel_frame_host";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = readFileSync(`${root}/chunks/js-kernel-host-COXQa-ka.js`, "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), "5ea78ade270d71bb6ffcec719207ad02bf63db30d0c16058f24a74a7f9f3682a");
const protocol = readFileSync(`${root}/chunks/protocol-B1wJl0-9.js`, "utf8");
assert.equal(createHash("sha256").update(protocol).digest("hex"), "2e7dec0df5363ad10b2b525b24211a7c02f58c3ab6641255b7e3fc4874a8edf7");
const nodes = (s: string) => (parse(s, { ecmaVersion: "latest", sourceType: "module" }) as any).body;
const protocolFns = nodes(protocol).filter((n: any) => n.type === "FunctionDeclaration").map((n: any) => protocol.slice(n.start, n.end)).join("\n");
const guards = new Function(`${protocolFns};return {Mv:s,Nv:n,ad:i}`)();
const names = new Set(["GU", "KU", "WU", "zU", "VU"]);
const definitions: string[] = [];
for (const n of nodes(source)) {
  if (n.type === "FunctionDeclaration" && names.has(n.id.name)) definitions.push(source.slice(n.start, n.end));
  if (n.type === "VariableDeclaration") for (const d of n.declarations)
    if (names.has(d.id.name)) definitions.push(`const ${source.slice(d.start, d.end)};`);
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test("kernel iframe host matches original sandbox execution, session replacement and teardown", async () => {
  for (const mode of ["normal", "worker-reset", "script-error", "bad-response", "unreadable", "post-throw", "finish-error", "no-session", "replace", "cancel", "cleanup-error", "late-agent"]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = [], listeners: Record<string, any> = {}, pending: any[] = [];
      let registered: any, frame: any;
      function port(label: string) { return {
        start: () => trace.push([label, "start"]), close: () => trace.push([label, "close"]),
        postMessage: (value: any) => {
          if (value.error) { const { stack, ...error } = value.error; value = { ...value, error }; }
          trace.push([label, "post", value]);
        },
      }; }
      class Channel {
        port1: any = { close: () => trace.push("response-close") };
        port2: any = { close: () => trace.push("transfer-close"), reply: (data: any) => this.port1.onmessage({ data }), error: () => this.port1.onmessageerror() };
      }
      const parent = { postMessage: (value: any) => trace.push(["parent", value]) };
      const window: any = { parent, location: { search: "?scopeId=scope" }, addEventListener: (name: string, fn: any) => { listeners[name] = fn; } };
      const document: any = { createElement: () => (frame = {
        hidden: false, src: "", remove: () => trace.push("remove"), contentWindow: {
          postMessage(message: any, origin: string, ports: any[]) {
            trace.push(["sandbox", message, origin]);
            if (mode === "post-throw") throw Error("post");
            pending.push({ message, port: ports[0] });
          },
        },
      }), body: { append: (value: any) => trace.push(["append", value.hidden, value.src]) } };
      const runtime: any = { getURL: (path: string) => path, connect: (options: any) => {
        trace.push(["connect", options]);
        return { onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, disconnect: () => trace.push("disconnect"), postMessage() {} };
      } };
      const bridge = (_transport: any, metadata: any) => {
        trace.push(["bridge", metadata]);
        return {
          browser: Promise.resolve({ apiManifest: "manifest", disabledMemberIds: new Set(["one"]), executeAgentCommand: async (value: any) => { trace.push(["command", value]); return "executed"; } }),
          displayBridge: { displayImage: async (value: any) => trace.push(["image", [...value]]), displayValue: async (value: any) => trace.push(["value", value]) },
          beginExecution: (meta: any) => trace.push(["begin", meta]),
          finishExecution: async () => { trace.push("finish"); if (mode === "finish-error") throw Error("finish"); return { contentItems: ["output"] }; },
        };
      };
      const bind = (_transport: any, handler: any) => { registered = handler; trace.push("bind"); };
      const cleanup = async () => { trace.push("cleanup"); if (mode === "cleanup-error") throw Error("cleanup"); };
      if (restored) registerKernelFrameHost({ window, document, runtime, MessageChannel: Channel as any, createBrowserBridge: bridge, registerAgentPeer: bind, cleanupBrowser: cleanup });
      else new Function("window", "document", "chrome", "MessageChannel", "jU", "HU", "Hb", "Mv", "Nv", "ad", `${definitions.join("\n")};GU();`)(window, document, { runtime }, Channel, bridge, class { constructor(a: any, b: any) { bind(a, b); } }, cleanup, guards.Mv, guards.Nv, guards.ad);
      const emit = (source: any, data: any, ports: any[] = []) => listeners.message({ source, data, ports });
      emit({}, { type: "js-kernel:ready" });
      emit(frame.contentWindow, { type: "js-kernel:ready" });
      const attach = () => emit(frame.contentWindow, { type: "js-kernel:agent-port" }, [port("agent")]);
      if (!["no-session", "late-agent"].includes(mode)) attach();
      if (mode === "replace") attach();
      if (registered) {
        trace.push(["setup", await registered.setup()]);
        trace.push(["execute", await registered.execute({ command: "test" })]);
        await registered.display(new Uint8Array([1, 2])); await registered.display("text");
      }
      emit(parent, { id: "exec", scopeId: "scope", type: "js-kernel:execute", script: "code", requestMeta: { turn: "turn" } }, [port("result")]);
      if (mode === "late-agent") attach();
      if (["cancel", "cleanup-error"].includes(mode)) {
        emit(parent, { id: "exec", scopeId: "scope", type: "js-kernel:cancel" }, [port("cancel")]); await flush();
      }
      if (mode !== "post-throw") {
        if (mode === "unreadable") pending[0].port.error();
        else pending[0].port.reply({ id: mode === "bad-response" ? "other" : "exec", ok: !["worker-reset", "script-error"].includes(mode), error: { name: mode === "worker-reset" ? "JsKernelWorkerResetError" : "Error", message: "script" } });
      }
      await flush(); listeners.pagehide(); await flush();
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
