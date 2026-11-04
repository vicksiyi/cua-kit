import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { extensionBindings } from "./extension-source";
import {
  createStatsigLiveNetwork,
  parseLiveOverlayCursor,
} from "../packages/browser-extension/src/statsig_live_network";
const require = createRequire(
  new URL("../packages/browser-extension/package.json", import.meta.url),
);
const core = require("@statsig/client-core");
test("bundled Statsig live-overlay requests and response parsing match restored network delta", async () => {
  const responses = [
    null,
    { code: 500, body: "error" },
    { code: 200, body: null },
    { code: 200, body: "{}" },
    { code: 200, body: '{"response_mode":"other"}' },
    {
      code: 200,
      body: '{"response_mode":"live_overlay","time":3,"feature_gates":{}}',
    },
    { code: 204 },
    ...[
      "",
      " ",
      "42",
      "1.5",
      "0",
      "-1",
      "Infinity",
      "NaN",
      "0x10",
      " 2e3 ",
    ].map((header) => ({
      code: 204,
      headers: new Headers({ "x-statsig-live-overlay-lcut": header }),
    })),
  ];
  for (const response of responses)
    for (const checksum of [undefined, null, "", "abc"]) {
      const outputs = [];
      for (const upstream of [true, false]) {
        const trace: any[] = [];
        const post = async (args: any) => {
          trace.push(args);
          return response;
        };
        let fetch: Function;
        if (upstream) {
          const source = extensionBindings(["Kc"], {
            L: (factory: Function) => () => {
              const exports = {};
              factory(exports);
              return exports;
            },
            ze: () => ({
              ...core,
              NetworkCore: class {
                post = post;
              },
              UrlConfiguration: class {
                path: unknown;
                constructor(...args: unknown[]) {
                  this.path = args;
                }
              },
            }),
            Hm: () => ({}),
          });
          const Network = source.Kc().default;
          const network = new Network({
            networkConfig: {
              api: "https://fixture.invalid",
              initializeHashAlgorithm: "none",
            },
          });
          fetch = network.fetchLiveEvaluations.bind(network);
        } else {
          fetch = createStatsigLiveNetwork({
            hashAlgorithm: "none",
            initializeUrlConfig: {
              path: [
                core.Endpoint._initialize,
                undefined,
                "https://fixture.invalid",
                undefined,
              ],
            },
            post,
          });
        }
        const result = await fetch(
          "fixture-key",
          { userID: "u" },
          100,
          { a: 1 },
          "low",
          checksum,
        );
        outputs.push(JSON.parse(JSON.stringify({ trace, result })));
      }
      assert.deepEqual(outputs[1], outputs[0]);
    }
});
test("live-overlay network retains rejection and cursor boundaries", async () => {
  const fetch = createStatsigLiveNetwork({
    initializeUrlConfig: {},
    async post() {
      throw Error("network rejected");
    },
  });
  await assert.rejects(fetch("fixture", {}, 0, {}), /network rejected/);
  assert.equal(parseLiveOverlayCursor(undefined), null);
  assert.equal(parseLiveOverlayCursor("-0"), -0);
  assert.equal(parseLiveOverlayCursor("1e309"), null);
  assert.equal(require("@statsig/client-core/package.json").version, "3.33.4");
});
