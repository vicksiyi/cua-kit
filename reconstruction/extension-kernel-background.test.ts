import assert from "node:assert/strict";
import test from "node:test";
import { extensionFunctionLocals, extensionFunctionCalls } from "./extension-source";
import { registerBackgroundKernel } from "../packages/browser-extension/src/kernel_background";

test("background kernel activation and turn-end fallback match original dR", async () => {
  for (const mode of ["normal", "control-error", "fallback-error", "gate-error", "registration-error"]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: unknown[] = [], peers = new Map();
      let gate!: (enabled: boolean) => void, connect!: Function, disconnect!: Function, end!: Function;
      let signal!: AbortSignal;
      const turnEnded = async (metadata: unknown) => {
        trace.push(["fallback", metadata]);
        if (mode === "fallback-error") throw Error("fallback");
      };
      class Control { constructor(public id: string) { trace.push(["control", id]); } }
      class Browser { constructor(transport: unknown, handler: unknown) { trace.push(["browser", transport, handler === implementation]); } }
      class ControlPeer {
        constructor(transport: unknown, control: Control) { trace.push(["control-peer", transport, control.id]); }
        async sendTurnEnded(metadata: unknown) {
          trace.push(["send-turn", metadata]);
          if (mode === "control-error" || mode === "fallback-error") throw Error("control");
        }
      }
      const implementation = { turnEnded };
      const registerConnections = (a: Function, b: Function) => { trace.push(["register", signal.aborted]); connect = a; disconnect = b; };
      const registerTurnEnded = async (callback: Function) => { trace.push(["register-end"]); end = callback; if (mode === "registration-error") throw Error("registration"); };
      const observeGate = async (callback: (enabled: boolean) => void, value: AbortSignal) => { gate = callback; signal = value; if (mode === "gate-error") throw Error("gate"); };
      const reportGateError = (error: any, stage: string) => trace.push(["error", error.message, stage]);
      const warn = (message: string) => trace.push(["warn", message]);
      const reportTurnEndedError = (error: any) => trace.push(["end-error", error.message]);
      if (restored) registerBackgroundKernel({
        peers, createControl: id => new Control(id), createBrowserPeer: transport => new Browser(transport, implementation),
        createControlPeer: (transport, control) => new ControlPeer(transport, control as Control), registerConnections,
        registerTurnEnded, turnEnded, observeGate, reportGateError, warn, reportTurnEndedError,
      });
      else {
        const local = extensionFunctionLocals("dR", ["p", "d"], { AbortController, Wg: registerConnections, s: peers, Ds: Control, pc: Browser, u: implementation, qg: ControlPeer, S_: registerTurnEnded, g_: reportTurnEndedError });
        extensionFunctionCalls("dR", ["As().catch"], { ...local, As: (_name: unknown, callback: any, value: AbortSignal) => observeGate(callback, value), lR: "gate", zi: reportGateError, console: { warn } });
      }
      await Promise.resolve(); await Promise.resolve();
      if (mode !== "gate-error") {
        gate(false); trace.push(["before", signal.aborted]); gate(true); gate(true); gate(false);
        await Promise.resolve();
        connect("scope", "browser-transport", "control-transport"); trace.push(["size", peers.size]);
        for (const id of ["scope", "missing"]) try { await end(id, { turn_id: id }); } catch (error: any) { trace.push(["caught", error.message]); }
        disconnect("scope"); trace.push(["size", peers.size]);
        try { await end("scope", { turn_id: "after-disconnect" }); } catch (error: any) { trace.push(["caught", error.message]); }
      }
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
