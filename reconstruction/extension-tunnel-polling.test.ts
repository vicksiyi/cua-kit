import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createTunnelPollingManager } from "../packages/browser-extension/src/tunnel_polling";
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test("tunnel polling manager matches source identity, listening, stale refresh and recovery", async () => {
  for (const mode of ["normal", "initial-suspend", "null", "read-error", "overlap", "stop-during-read", "suspend-during-read"]) {
    const results = [];
    for (const restored of [false, true]) {
      const trace: any[] = [], pollers: any[] = [];
      let listener: any, pending: ((value: any) => void)[] = [], defer = false;
      let config: any = mode === "null" ? null : { tunnelId: "one", apiKey: "key" };
      const read = async () => { trace.push("read"); if (defer) return new Promise(resolve => pending.push(resolve)); return config; };
      class Poller {
        id = pollers.length;
        constructor(public config: any, turn: any, public invalid: any, public unauthorized: any, hooks: any) {
          assert.equal(turn, "turn"); assert.equal(hooks, "hooks");
          pollers.push(this); trace.push(["create", this.id, config]);
        }
        suspend() { trace.push(["suspend", this.id]); }
        dispose() { trace.push(["dispose", this.id]); }
        async initialize() { trace.push(["initialize", this.id]); }
        async ensurePolling() { trace.push(["ensure", this.id]); }
        setListening(value: boolean) { trace.push(["listening", this.id, value]); }
      }
      const events = { addListener(fn: any) { listener = fn; trace.push("add"); }, removeListener(fn: any) { assert.equal(fn, listener); trace.push("remove"); } };
      const invalid = (c: any, reason: string) => trace.push(["invalid", c, reason]);
      const unauthorized = async (c: any, retry: any) => { trace.push(["unauthorized", c, retry]); return true; };
      const warn = (message: string) => trace.push(["warn", message]);
      let reader = read;
      const original = extensionBindings(["E_"], { Hn: () => reader(), p_: Poller, mt: "nodeReplTunnel", chrome: { storage: { onChanged: events } }, console: { warn } }).E_;
      const manager = restored ? await createTunnelPollingManager({
        readConfiguration: () => reader(), storageChanges: events, warn,
        createPoller: (c, bad, auth) => new Poller(c, "turn", bad, auth, "hooks"),
      }, invalid, mode === "initial-suspend", unauthorized) : await original("turn", invalid, mode === "initial-suspend", unauthorized, "hooks");
      await manager.setListening(false);
      await manager.resume();
      const old = pollers[0];
      if (old) { old.invalid("invalid_tunnel"); assert.equal(await old.unauthorized("retry"), true); }
      listener({ nodeReplTunnel: {} }, "local");
      listener({ unrelated: {} }, "session");
      if (mode === "read-error") reader = async () => { throw Error("read"); };
      if (["overlap", "stop-during-read", "suspend-during-read"].includes(mode)) defer = true;
      config = { tunnelId: "two", apiKey: "new" };
      listener({ nodeReplTunnel: {} }, "session");
      await manager.ensurePolling();
      if (defer) {
        if (old) assert.equal(await old.unauthorized("stale"), false);
        if (mode === "overlap") {
          listener({ nodeReplTunnel: {} }, "session");
          pending[1](config); await flush(); pending[0]({ tunnelId: "stale" });
        } else {
          if (mode === "stop-during-read") manager.stop(); else manager.suspend();
          pending[0](config);
        }
      }
      await flush();
      if (old) { old.invalid("late"); await old.unauthorized("late"); }
      await manager.ensurePolling();
      manager.stop();
      await manager.setListening(true);
      results.push(trace);
    }
    assert.deepEqual(results[1], results[0], mode);
  }
});

test("stored tunnel configuration matches original validation and storage error boundary", async () => {
  const { readTunnelConfiguration } = await import("../packages/browser-extension/src/tunnel_polling");
  const valid = { baseUrl: "", apiKey: " key ", tunnelId: " tunnel ", account: { id: " id ", userId: " user ", structure: "personal" }, ignored: true };
  const fixtures = [undefined, null, [], {}, valid, { ...valid, account: { ...valid.account, structure: "workspace" } }];
  for (const key of ["baseUrl", "apiKey", "tunnelId", "account"])
    for (const value of [null, 42, "", "  ", {}]) fixtures.push({ ...valid, [key]: value });
  for (const value of fixtures) {
    const storage = { get: async (key: string) => { assert.equal(key, "nodeReplTunnel"); return { [key]: value }; } };
    const original = extensionBindings(["Hn", "Qc"], { chrome: { storage: { session: storage } }, mt: "nodeReplTunnel" }).Hn;
    assert.deepEqual(await readTunnelConfiguration(storage), await original());
  }
  const failure = new Error("storage failed");
  const storage = { get: async () => { throw failure; } };
  const original = extensionBindings(["Hn", "Qc"], { chrome: { storage: { session: storage } }, mt: "nodeReplTunnel" }).Hn;
  await assert.rejects(readTunnelConfiguration(storage), error => error === failure);
  await assert.rejects(original(), error => error === failure);
});
