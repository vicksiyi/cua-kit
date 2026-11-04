import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { registerKernelOffscreen } from "../packages/browser-extension/src/kernel_offscreen";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const chunk = readFileSync(`${root}/chunks/js-kernel-offscreen-BKf7ozmV.js`, "utf8");
assert.equal(createHash("sha256").update(chunk).digest("hex"), "76924170a112af8217bd42a76d0102501d1cd521ae5d0578499bf1674d785a61");
const protocol = readFileSync(`${root}/chunks/protocol-B1wJl0-9.js`, "utf8");
assert.equal(createHash("sha256").update(protocol).digest("hex"), "2e7dec0df5363ad10b2b525b24211a7c02f58c3ab6641255b7e3fc4874a8edf7");
const functions = (source: string) => (parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any).body.filter((n: any) => n.type === "FunctionDeclaration").map((n: any) => source.slice(n.start, n.end)).join("\n");
const predicates = new Function(`${functions(protocol)};return {m:s,y:n,E:i}`)();
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test("offscreen iframe routing matches original admission, readiness, execution, cancellation and cleanup", async () => {
  for (const mode of ["success", "bad-result", "unreadable", "reset-required", "init-timeout", "cancel-before-ready", "cancel-running", "cleanup-timeout", "cleanup-failure", "reset-idle", "busy"]) {
    const outputs = [];
    for (const restored of [false, true]) {
      let listener: any, timerId = 0;
      const trace: any[] = [], timers = new Map<number, () => void>(), messages = new Set<any>(), frames: any[] = [];
      const replies: any[] = [], pending: any[] = [];
      const window: any = {
        setTimeout(fn: () => void, ms: number) { assert.equal(ms, 5000); timers.set(++timerId, fn); return timerId; },
        clearTimeout(id: number) { timers.delete(id); },
        addEventListener(_type: string, fn: any) { messages.add(fn); },
        removeEventListener(_type: string, fn: any) { messages.delete(fn); },
      };
      class Channel {
        port1: any = { close: () => trace.push("close1") };
        port2: any = { close: () => trace.push("close2"), reply: (value: any) => this.port1.onmessage({ data: value }), unreadable: () => this.port1.onmessageerror() };
      }
      const document: any = {
        createElement(tag: string) {
          assert.equal(tag, "iframe");
          const frame = { hidden: false, src: "", remove: () => trace.push("remove"), contentWindow: {
            postMessage(message: any, origin: string, ports: any[]) { trace.push(["dispatch", message.type, message.id, origin]); pending.push({ message, port: ports[0] }); },
          } }; frames.push(frame); return frame;
        },
        body: { append(frame: any) { trace.push(["append", frame.hidden, frame.src]); } },
      };
      const runtime = { id: "own", getURL: (path: string) => `chrome-extension://own/${path}`, onMessage: { addListener(fn: any) { listener = fn; } } };
      if (restored) registerKernelOffscreen({ runtime, document, window, MessageChannel: Channel as any });
      else new Function("chrome", "document", "window", "MessageChannel", "m", "y", "E", `${functions(chunk)};x();`)({ runtime }, document, window, Channel, predicates.m, predicates.y, predicates.E);
      const message = { id: "exec", scopeId: "scope /", type: "js-kernel:execute", script: "code", requestMeta: {} };
      const send = (value: any, sender: any = { id: "own" }) => listener(value, sender, (reply: any) => {
        if (reply.error) { const { stack, ...error } = reply.error; reply = { ...reply, error }; }
        replies.push(reply);
      });
      const admissions = [send(message, { id: "other" }), send(message, { id: "own", tab: {} }), send(message, { id: "own", url: "bad" }), send(message, { id: "own", url: "https://own/" }), send({ ...message, requestMeta: undefined, scopeId: "" })];
      assert.deepEqual(admissions, [false, false, false, false, false]);
      assert.equal(send(message, { id: "own", url: "chrome-extension://own/background.js" }), true);
      if (mode === "busy") send({ ...message, id: "second" });
      if (mode === "init-timeout") { for (const fn of [...timers.values()]) fn(); }
      else if (mode === "cancel-before-ready") send({ ...message, type: "js-kernel:cancel" });
      else {
        for (const receive of messages) receive({ source: {}, data: { type: "js-kernel:host-ready", scopeId: message.scopeId } });
        assert.equal(pending.length, 0);
        for (const receive of [...messages]) receive({ source: frames[0].contentWindow, data: { type: "js-kernel:host-ready", scopeId: message.scopeId } });
        await flush();
        if (["cancel-running", "cleanup-timeout", "cleanup-failure"].includes(mode)) {
          send({ ...message, type: "js-kernel:cancel" }); await flush();
          if (mode === "cleanup-timeout") { for (const fn of [...timers.values()]) fn(); }
          else pending[1].port.reply({ id: "exec", ok: mode !== "cleanup-failure", error: { message: "cleanup" } });
        } else {
          if (mode === "unreadable") pending[0].port.unreadable();
          else pending[0].port.reply({ id: mode === "bad-result" ? "wrong" : "exec", ok: true, output: { text: "done" }, resetRequired: mode === "reset-required" });
          await flush();
          if (mode === "reset-idle") {
            send({ id: "reset", scopeId: message.scopeId, type: "js-kernel:reset" }); await flush();
            pending[1].port.reply({ id: "reset", ok: true });
          }
        }
      }
      await flush();
      send({ id: "absent", scopeId: "absent", type: "js-kernel:cancel" }); await flush();
      outputs.push({ trace, replies, timers: timers.size, listeners: messages.size });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
