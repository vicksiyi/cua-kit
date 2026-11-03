import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  createCredentialRequestMatcher,
  createUnsafeOrdinaryRequest,
} from "../packages/browser/src/service/credentials/request_matching";
import { createCredentialLeaseRegistry } from "../packages/browser/src/service/credentials/lease_registry";
const original = originalServiceBindings(["uJ", "aJ"]);
test("credential form matching preserves original parsing, duplicate rejection and value hashing", async () => {
  const fields = [
    { name: "user", value: "测试" },
    { name: "pass", value: "a+b secret" },
  ];
  const a = await createCredentialRequestMatcher(fields),
    b = await original.uJ(fields);
  const bodies = [
    "user=%E6%B5%8B%E8%AF%95&pass=a%2Bb+secret",
    "user=wrong&pass=a%2Bb+secret",
    "user=%E6%B5%8B%E8%AF%95&pass=a%2Bb+secret&pass=a%2Bb+secret",
    "user=%E6%B5%8B%E8%AF%95",
    "x".repeat(128 * 1024 + 1),
    undefined,
  ];
  for (const postData of bodies)
    for (const mime of [
      "application/x-www-form-urlencoded",
      "APPLICATION/X-WWW-FORM-URLENCODED; charset=utf-8",
      "application/json",
      "multipart/form-data; boundary=boundary",
    ]) {
      const request: any = {
        url: "https://fixture.test/",
        headers: { "Content-Type": mime },
        postData,
      };
      assert.equal(await a(request), await b(request));
    }
  const valid = {
    url: "",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    postData: bodies[0],
  };
  assert.equal(await a(valid), true);
  const multipart = {
    url: "",
    headers: { "content-type": "multipart/form-data; boundary=test" },
    postData:
      '--test\r\nContent-Disposition: form-data; name="user"\r\n\r\n测试\r\n--test\r\nContent-Disposition: form-data; name="pass"\r\n\r\na+b secret\r\n--test--\r\n',
  };
  assert.equal(await a(multipart), true);
  assert.equal(await b(multipart), true);
  await assert.rejects(
    () => createCredentialRequestMatcher([{ name: "missing" }]),
    /missing a required value/,
  );
});
test("ordinary request checks preserve repeated decoding, referrer filtering and conservative length cap", async () => {
  const a = await createUnsafeOrdinaryRequest("s e+c"),
    b = await original.aJ("s e+c");
  for (const value of [
    "https://safe.test/",
    "https://x/s e+c",
    "https://x/s%20e%2Bc",
    "https://x/s%2520e%252Bc",
    "https://x/s+e%2Bc",
    "%ZZ",
    "x".repeat(8193),
  ])
    for (const field of ["url", "Referer", "Other"]) {
      const request = {
        url: field === "url" ? value : "https://safe.test/",
        headers: field === "url" ? {} : { [field]: value },
      };
      assert.equal(await a(request), await b(request));
    }
  assert.equal(await a({ url: "https://x/s%2520e%252Bc", headers: {} }), true);
  assert.equal(
    await a({ url: "https://safe.test/", headers: { Other: "s e+c" } }),
    false,
  );
  await assert.rejects(
    () => createUnsafeOrdinaryRequest(""),
    /missing its password/,
  );
});
async function registryScenario(useOriginal: boolean, mode: string) {
  const trace: any[] = [];
  let next = 0;
  class Lease {
    id = ++next;
    constructor(
      _cdp: any,
      _requests: any,
      public tabId: number,
      _frame: any,
      target: any,
      matches: any,
      unsafe: any,
      public active: Map<number, Lease>,
    ) {
      trace.push(["new", this.id, target, typeof matches, typeof unsafe]);
    }
    async start() {
      trace.push(["start", this.id]);
      if (mode === "start-failure" && this.id === 2)
        throw Error("start failed");
    }
    async close() {
      trace.push(["close", this.id]);
      if (mode === "close-failure" && this.id === 1)
        throw Error("close failed");
      if (this.active.get(this.tabId) === this) this.active.delete(this.tabId);
    }
    async navigateToBrowserBlank() {
      trace.push(["blank", this.id]);
      if (mode === "blank-failure") throw Error("blank failed");
    }
  }
  const ref = useOriginal
    ? originalServiceBindings(["VD", "GD", "$D"], {
        Tf: new WeakMap(),
        Z_: Lease,
        ...original,
      })
    : undefined;
  const registry = ref
    ? { start: ref.VD, close: ref.$D, resetBeforeNavigation: ref.GD }
    : createCredentialLeaseRegistry(Lease);
  const requests = {};
  const input = {
    cdp: {},
    requests,
    tabId: 7,
    frameId: "root",
    target: {
      origin: "https://fixture.test",
      url: "https://fixture.test/login",
    },
    credentialFields: [{ name: "pass", value: "test-only" }],
    ...(mode === "ordinary"
      ? { ordinary: { origin: "https://fixture.test", password: "test-only" } }
      : {}),
  };
  const outcomes = [];
  for (const task of [
    () => registry.close(requests, 7),
    () => registry.start(input),
    () => registry.start(input),
    () => registry.resetBeforeNavigation(requests, 7),
    () => registry.close(requests, 7),
  ])
    try {
      await task();
      outcomes.push("ok");
    } catch (e) {
      outcomes.push((e as Error).message);
    }
  return { trace, outcomes };
}
test("lease registry preserves original replacement, rollback, owner lookup and blank-before-close order", async () => {
  for (const mode of [
    "normal",
    "ordinary",
    "start-failure",
    "close-failure",
    "blank-failure",
  ])
    assert.deepEqual(
      await registryScenario(false, mode),
      await registryScenario(true, mode),
    );
  const result = await registryScenario(false, "start-failure");
  assert.ok(result.trace.some((row) => row[0] === "blank" && row[1] === 1));
});
