import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { KernelSandbox, isKernelSandboxMessage, registerKernelSandbox } from "../packages/browser-extension/src/kernel_sandbox";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = readFileSync(`${root}/chunks/js-kernel-BMrODGlb.js`, "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), "eb67d89be4d7ec9535ad3f0e4f690bf36f2bec156f3d4e314e4bb7ff7d44a2f6");
const parts: string[] = [];
for (const node of (parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any).body) {
  if (node.type === "FunctionDeclaration" && ["d", "l", "u", "f", "_"].includes(node.id.name)) parts.push(source.slice(node.start, node.end));
  for (const d of node.declarations ?? []) if (d.id.name === "m") parts.push(`const ${source.slice(d.start, d.end)};`);
}
const code = parts.join("\n");
test("sandbox manager preserves original concurrent results, reset errors and synchronous startup failures", async () => {
  for (const mode of ["success", "execution-error", "worker-error", "message-error", "send-error", "construct-error", "port-error"]) {
    const outcomes = [];
    for (const restored of [false, true]) {
      const trace: unknown[] = [], handlers: Record<string, (event: any) => void> = {};
      let channelId = 0;
      class Channel { port1 = { id: ++channelId }; port2 = { id: ++channelId }; }
      class Worker {
        constructor() { trace.push("construct"); if (mode === "construct-error") throw Error("construct"); }
        addEventListener(name: string, fn: any) { handlers[name] = fn; }
        postMessage(message: any, transfer?: any[]) {
          trace.push([message, transfer]);
          if (mode === "port-error" && message.type === "js-kernel:agent-port") throw Error("port");
          if (mode === "send-error" && message.type === "js-kernel:execute") throw Error("send");
        }
        terminate() { trace.push("terminate"); }
      }
      const original = new Function("h", "MessageChannel", `${code};return {Manager:m,guard:d};`)(Worker, Channel);
      const agent = (port: any) => { trace.push(["agent", port]); };
      const manager = restored ? new KernelSandbox(agent, () => new Worker() as any, Channel as any) : new original.Manager(agent);
      const values: unknown[] = [];
      const pending: Promise<void>[] = [];
      for (const script of ["first", "second"]) {
        try { pending.push(manager.executeJs(script).then(() => { values.push("ok"); }, (error: any) => { values.push({ name: error.name, message: error.message }); })); }
        catch (error: any) { values.push({ synchronous: true, message: error.message }); }
      }
      if (mode === "success" || mode === "execution-error") {
        handlers.message({ data: { id: "unknown", ok: true } });
        handlers.message({ data: { id: "0", ok: "invalid" } });
        handlers.message({ data: { id: "1", ok: mode === "success", error: { name: "RangeError", message: "execution", stack: "fixture" } } });
        handlers.message({ data: { id: "0", ok: true } });
      }
      if (mode === "worker-error") handlers.error({ message: "crash" });
      if (mode === "message-error") handlers.messageerror({});
      await Promise.all(pending);
      let sameReset: boolean | undefined;
      if (manager.resetError) try { await manager.executeJs("after-reset"); } catch (error) { sameReset = error === manager.resetError; }
      outcomes.push({ trace, values, sameReset, pending: manager.pending.size, nextRequestId: manager.nextRequestId });
    }
    assert.deepEqual(outcomes[1], outcomes[0], mode);
  }
});
test("sandbox message validation matches original unscoped guards", () => {
  const original = new Function(`${code};return d;`)();
  for (const value of [null, [], {}, {id:"a",type:"js-kernel:reset"}, {id:"a",type:"js-kernel:cancel"}, {id:"a",type:"js-kernel:execute",script:""}, {id:1,type:"js-kernel:execute",script:"x"}, {id:"a",type:"js-kernel:execute"}]) assert.equal(isKernelSandboxMessage(value), original(value));
});

test("sandbox parent entry matches original ready/port routing and serialized execution replies", async () => {
  for (const success of [true, false]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = []; let listener: any, workerListener: any;
      const parent = { postMessage: (message: any, _origin: any, ports?: any) => trace.push(["parent", message, ports]) };
      const window = { parent, addEventListener(_name: string, fn: any) { listener = fn; } };
      class Channel { port1 = "worker-port"; port2 = "agent-port"; }
      class Worker {
        addEventListener(name: string, fn: any) { if (name === "message") workerListener = fn; }
        postMessage(message: any) {
          trace.push(["worker", message]);
          if (message.type === "js-kernel:execute") queueMicrotask(() => workerListener({ data: { id: message.id, ok: success, error: { name: "TypeError", message: "execution", stack: "fixture-stack" } } }));
        }
        terminate() {}
      }
      if (restored) registerKernelSandbox(window as any, () => new Worker() as any, Channel as any);
      else new Function("window", "h", "MessageChannel", `${code}; const p = new m(port => window.parent.postMessage({type:"js-kernel:agent-port"}, "*", [port])); f();`)(window, Worker, Channel);
      const port = { postMessage: (message: any) => trace.push(["response", message]), close: () => trace.push("close") };
      listener({source:{},data:{id:"ignored",type:"js-kernel:execute",script:"ignored"},ports:[port]});
      listener({source:parent,data:{id:"reset",type:"js-kernel:reset"},ports:[port]});
      listener({source:parent,data:{id:"no-port",type:"js-kernel:execute",script:"ignored"},ports:[]});
      listener({source:parent,data:{id:"request",type:"js-kernel:execute",script:"run"},ports:[port]});
      await new Promise(resolve => setImmediate(resolve));
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1], outputs[0]);
  }
});
