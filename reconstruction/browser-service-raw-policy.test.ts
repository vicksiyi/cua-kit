import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  prepareRawCdpParams,
  rawCdpAuthorityUrls,
  documentResponsePattern,
} from "../packages/browser/src/service/cdp/raw_policy";
import {
  allowedRawDomains,
  blockedRawDomains,
  blockedRawMethods,
  rawMethodGuidance,
} from "../packages/browser/src/service/cdp/raw_policy_data";
const original = originalServiceBindings([
  "Jre",
  "Zre",
  "Qre",
  "ene",
  "tne",
  "nF",
  "oF",
  "Yh",
  "rne",
  "nne",
  "tF",
  "one",
  "Kv",
  "ine",
  "sne",
  "Xv",
  "iF",
  "ane",
  "une",
  "Nc",
  "Mc",
  "rF",
]);
const outcome = (fn: () => unknown) => {
  try {
    return { value: fn() };
  } catch (e) {
    return { error: (e as Error).message };
  }
};
test("raw CDP domain/method catalogs preserve every original entry and guidance string", () => {
  assert.deepEqual([...allowedRawDomains], [...original.Jre]);
  assert.deepEqual([...blockedRawDomains], [...original.Zre]);
  assert.deepEqual([...blockedRawMethods], [...original.Qre]);
  assert.deepEqual([...rawMethodGuidance], [...original.ene]);
});
test("raw CDP admission and URL policy match original across domains, methods and parameter-sensitive restrictions", () => {
  const methods = new Set<string>([
    ...[...allowedRawDomains].map((domain) => `${domain}.fixture`),
    ...[...blockedRawMethods],
    ...[...rawMethodGuidance.keys()],
    ...[...original.rF.keys()],
    "Fetch.disable",
    "Fetch.enable",
    "Network.configureDurableMessages",
    "Network.enable",
    "Page.createIsolatedWorld",
    "Tracing.start",
    "Browser.getVersion",
    "bad",
    ".bad",
  ]);
  const params: any[] = [
    undefined,
    {},
    { patterns: [] },
    { patterns: [{ resourceType: "Script" }] },
    { patterns: [{ resourceType: "Document" }] },
    { patterns: [{}] },
    { url: "https://fixture.test/" },
    { urls: ["https://fixture.test/"] },
    { domain: "fixture.test", url: "https://fixture.test/" },
    { enableDurableMessages: true },
    { grantUniveralAccess: true },
    { binaryResponseHeaders: "" },
    { scriptToEvaluateOnLoad: "" },
    { traceConfig: { enableSystrace: true } },
  ];
  for (const method of methods)
    for (const input of params) {
      for (const preserveDocumentInterception of [false, true])
        assert.deepEqual(
          outcome(() =>
            prepareRawCdpParams(method, input, {
              preserveDocumentInterception,
            }),
          ),
          outcome(() =>
            original.nF(method, input, { preserveDocumentInterception }),
          ),
          method,
        );
      assert.deepEqual(
        outcome(() => rawCdpAuthorityUrls(method, input)),
        outcome(() => original.oF(method, input)),
        method,
      );
    }
  const input = { patterns: [{ resourceType: "Script" }] };
  const prepared = prepareRawCdpParams("Fetch.enable", input, {
    preserveDocumentInterception: true,
  })!;
  assert.equal((prepared.patterns as any[]).at(-1), documentResponsePattern);
  assert.equal(input.patterns.length, 1);
  assert.equal(
    prepareRawCdpParams("Fetch.enable", input, {
      preserveDocumentInterception: false,
    }),
    input,
  );
  assert.throws(
    () =>
      prepareRawCdpParams(
        "Page.navigate",
        { url: "https://fixture.test/" },
        { preserveDocumentInterception: false },
      ),
    /Use tab.goto/,
  );
});
