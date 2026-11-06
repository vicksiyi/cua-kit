import test from "node:test";
import assert from "node:assert/strict";
import { createAccessibilityCoreLoading } from "../packages/browser/src/service/accessibility/core_loading";
import { serviceExpression, serviceSourceSha256 } from "./service-source";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
function setup(original: boolean, mode: string) {
  const trace: any[] = [];
  let resolve: any,
    reject: any,
    loads = 0;
  const read = (signal: AbortSignal) => {
    trace.push("read");
    signal.addEventListener("abort", () => trace.push("abort"));
    return new Promise<Uint8Array>((a, b) => {
      resolve = a;
      reject = b;
    });
  };
  const load = async (source: any, options: any) => {
    trace.push([
      "load",
      source instanceof Uint8Array ? "bytes" : source,
      options?.env?.label,
    ]);
    if (mode === "load-fails" && ++loads === 1) throw Error("load failed");
    return "core";
  };
  const install = (core: any) => {
    trace.push(["install", core]);
  };
  const api = original
    ? new Function(
        "dF",
        "Wre",
        `let Uc,Ct;${serviceExpression("Jh")};${serviceExpression("lF")};${serviceExpression("cF")};return {initialize:lF,preload:cF,cancel:Jh}`,
      )(load, install)
    : createAccessibilityCoreLoading(load, install);
  return {
    api,
    trace,
    read,
    resolve: () => resolve(new Uint8Array([1])),
    reject: () => reject(Error("read failed")),
  };
}
async function run(original: boolean, mode: string) {
  const f = setup(original, mode);
  const env = Object.freeze({ label: "one" }),
    other = Object.freeze({ label: "two" });
  const lease = f.api.preload(
    mode === "mutable"
      ? { label: "one" }
      : mode === "override"
        ? Object.freeze({
            BROWSER_USE_ACCESSIBILITY_CORE_WASM_PATH: " /tmp/core ",
          })
        : env,
    f.read,
  );
  if (mode === "mutable" || mode === "override") return f.trace;
  if (mode === "leases") {
    const second = f.api.preload(env, f.read);
    lease();
    f.trace.push("first released");
    second();
    f.resolve();
    await new Promise((r) => setTimeout(r, 0));
    return f.trace;
  }
  if (mode === "other-env") {
    assert.equal(f.api.preload(other, f.read), undefined);
  }
  if (mode === "read-fails") f.reject();
  else f.resolve();
  const promise = f.api.initialize(
    mode === "explicit" ? "explicit" : undefined,
    { env: mode === "other-env" ? other : env },
  );
  await promise;
  lease();
  assert.equal(f.api.initialize(undefined, { env }), promise);
  assert.equal(f.api.preload(env, f.read), undefined);
  await new Promise((r) => setTimeout(r, 0));
  return f.trace;
}
test("AX speculative loading matches current source leases, environment identity, fallback and explicit-source takeover", async () => {
  for (const mode of [
    "normal",
    "mutable",
    "override",
    "leases",
    "other-env",
    "explicit",
    "read-fails",
    "load-fails",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
});
