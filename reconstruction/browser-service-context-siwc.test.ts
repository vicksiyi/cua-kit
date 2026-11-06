import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserContextClass } from "../packages/browser/src/service/context/browser_context";
import { serviceClassMethod, serviceClassWithMethods, serviceSourceSha256 } from "./service-source";

assert.equal(serviceSourceSha256, "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021");
const names = ["cloudSiwcUserId", "getSiwcAccountContext", "issueSiwcBrowserGrant", "installSiwcBrowserGrantCookie"];
const sourceClass = serviceClassWithMethods(names);
const original = new Function("return {" + names.map(n => serviceClassMethod(sourceClass, n)).join(",") + "}")();
// Invoke only these dependency-free methods, not the context constructor or
// any authentication endpoint. No real credential is requested or installed.
const restored = createBrowserContextClass({} as any).prototype;
function subject(prototype: any, type: string, gaas: any, fails = false) {
  const trace: any[] = [];
  const value = Object.create(prototype);
  value.clientInfo = { type };
  value.runtime = { gaas };
  value.api = { sendSessionRequest(method: string, payload: any) {
    trace.push({method, payload});
    return fails ? Promise.reject(new Error("provider rejected grant")) : Promise.resolve({method});
  }};
  return {value, trace};
}
test("context SIWC forwarding matches installed source for backend, identity and payload", async () => {
  for (const type of ["cdp", "extension", "iab"]) {
    for (const gaas of [undefined, {browserConfig:{}}, {browserConfig:{user_id:null}}, {browserConfig:{user_id:""}}, {browserConfig:{user_id:"fixture-user"}}]) {
      const results = [];
      for (const proto of [original, restored]) {
        const {value, trace} = subject(proto, type, gaas);
        const identity = value.cloudSiwcUserId;
        const account = {id:"fixture-account"};
        const grant = {token:"fixture-only-not-a-secret"};
        const calls = await Promise.all([
          value.getSiwcAccountContext(7), value.issueSiwcBrowserGrant(7,account),
          value.installSiwcBrowserGrantCookie(7,account,grant),
        ]);
        assert.equal(trace[1].payload.expectedAccount, account);
        assert.equal(trace[2].payload.grant, grant);
        results.push({identity, calls, trace});
      }
      assert.deepEqual(results[1], results[0]);
    }
  }
});
test("context SIWC provider rejection propagates without swallowing or retry", async () => {
  for (const proto of [original, restored]) {
    const {value, trace} = subject(proto,"extension",undefined,true);
    for (const method of names.slice(1)) await assert.rejects(value[method](9,{},{}), /provider rejected grant/);
    assert.equal(trace.length,3);
  }
});
