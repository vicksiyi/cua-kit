import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { bind_mac_app } from "../packages/cua/src/tinysky_alt/bind_mac_app";
import { get_app_state } from "../packages/sky/src/targets/mac/get_app_state";
import { MacNativePipeTransport } from "../packages/sky/src/targets/mac/native-pipe";

const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const vendor = (file: string) => import(pathToFileURL(`${root}/${file}`).href);
const originalBinder = await vendor(
  "cua/dist/lib/js/oai_js_cua/src/tinysky_alt/bind_mac_app.js",
);
const originalAdapter = await vendor(
  "sky/dist/project/cua/sky_js/src/targets/mac/get_app_state.js",
);
const originalPipe = await vendor(
  "sky/dist/project/cua/sky_js/src/targets/mac/native-pipe.js",
);

// Exercise real binder, policy, adapter and client together. Only the native
// transport endpoint is a fixture; this does not prove native diff behavior.
async function exercise(bind: any, getState: any, Transport: any) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  const create = Transport.create;
  const requests: any[] = [],
    approvals: any[] = [],
    results: any[] = [];
  let accept = true;
  const target = {
    appPath: "/fixture/Approved.app",
    bundleIdentifier: "fixture.app",
    displayName: "Fixture",
    risk: "low",
  };
  Object.defineProperty(globalThis, "nodeRepl", {
    configurable: true,
    value: {
      createElicitation: async (args: any) => {
        approvals.push(args);
        return { action: accept ? "accept" : "decline" };
      },
      setResponseMeta() {},
    },
  });
  Transport.create = async () => ({
    isClosed: false,
    request: async (args: any) => {
      requests.push(structuredClone(args));
      if (args.requestType === "ComputerUseIPCAppPolicyRequest")
        return { decision: "allowed", allowPersistentApproval: false, target };
      assert.equal(args.requestType, "ComputerUseIPCAppGetSkyshotRequest");
      return {
        app: target,
        skyshot: {
          text: "native text",
          screenshot: { url: "data:image/png;base64,AQID" },
        },
      };
    },
  });
  try {
    const app = bind(
      { get_app_state: (args: any) => getState(args, new Set()) },
      "Fixture",
    );
    for (const method of [
      "getAXState",
      "getAXStateAndScreenshot",
      "getScreenshot",
    ]) {
      for (const disableDiffing of [undefined, false, true]) {
        const before = requests.length;
        results.push(
          await app[method]({
            emit: false,
            ...(disableDiffing === undefined ? {} : { disableDiffing }),
          }),
        );
        const batch = requests.slice(before);
        assert.equal(batch.length, 2);
        assert.equal(batch[0].request.app, "Fixture");
        assert.deepEqual(batch[1].request, {
          app: target.appPath,
          ...(method === "getScreenshot" || disableDiffing === undefined
            ? {}
            : { disableDiff: disableDiffing }),
        });
      }
    }
    accept = false;
    const before = requests.length;
    await assert.rejects(
      app.getAXState({ emit: false, disableDiffing: true }),
      /not approved/,
    );
    assert.equal(
      requests.length,
      before + 1,
      "declined observation must not reach the skyshot endpoint",
    );
    return { requests, approvals, results };
  } finally {
    Transport.create = create;
    if (previous) Object.defineProperty(globalThis, "nodeRepl", previous);
    else delete (globalThis as any).nodeRepl;
  }
}

test("Mac observation chain preserves diff flags, approved target and declined policy like installed JS", async () => {
  assert.deepEqual(
    await exercise(bind_mac_app, get_app_state, MacNativePipeTransport),
    await exercise(
      originalBinder.bind_mac_app,
      originalAdapter.get_app_state,
      originalPipe.MacNativePipeTransport,
    ),
  );
});
