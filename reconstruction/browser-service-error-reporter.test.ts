import test from "node:test";
import assert from "node:assert/strict";
import * as sentry from "@sentry/node-core/light";
import {
  createErrorReporterFactory,
  errorReporterUserId,
} from "../packages/browser/src/service/runtime/error_reporter";
import { serviceExpression, originalServiceBindings } from "./service-source";

function original(sdk: any) {
  const helpers = originalServiceBindings(
    ["dl", "Zt", "zr", "Qt", "Ar", "_p"],
    {
      mC: "BROWSER_USE_DISABLE_AMBIENT_NETWORK",
      ii: "BROWSER_USE_SECURITY_MODE",
      y5: ["gaas-browser-environment"],
      SC: "normal",
    },
  );
  return new Function(
    "Ar",
    "_p",
    "lT",
    "Po",
    "ys",
    "_n",
    "Cd",
    "Mb",
    `let cH=false; return (${serviceExpression("dH")});`,
  )(
    helpers.Ar,
    helpers._p,
    sdk.init,
    () => "production",
    sdk.createTransport,
    sdk.captureException,
    sdk.setUser,
    sdk.setTag,
  );
}
async function scenario(factory: typeof createErrorReporterFactory) {
  const trace: any[] = [];
  let initOptions: any, makeRequest: any;
  let failInit = true;
  const sdk: any = {
    init(options: any) {
      const { transport, ...rest } = options;
      trace.push(["init", rest]);
      if (failInit) {
        failInit = false;
        throw Error("initialization failure");
      }
      initOptions = options;
    },
    createTransport(options: any, executor: any) {
      trace.push(["transport", options]);
      makeRequest = executor;
      return "transport-instance";
    },
    captureException: (...args: any[]) => trace.push(["capture", ...args]),
    setUser: (...args: any[]) => trace.push(["user", ...args]),
    setTag: (...args: any[]) => trace.push(["tag", ...args]),
  };
  const create = factory(sdk);
  const runtime: any = {
    env: {
      BROWSER_USE_DISABLE_AMBIENT_NETWORK: "1",
      NODE_REPL_SENTRY_USER_ID: " first-user ",
    },
    async fetch(...args: any[]) {
      assert.equal(this, runtime);
      trace.push(["fetch", ...args]);
      return {
        status: 429,
        headers: new Headers({
          "X-Sentry-Rate-Limits": "20:error",
          "Retry-After": "10",
        }),
      };
    },
  };
  const disabled = create(runtime);
  assert.equal(trace.length, 0);
  assert.equal(
    disabled.captureException("disabled error", { tags: { x: "y" } }),
    undefined,
  );
  assert.equal(disabled.setUser(null), undefined);
  assert.equal(disabled.setTag("disabled", "yes"), undefined);
  // Only literal "1" disables; initialization failure must not set the lifetime flag.
  runtime.env.BROWSER_USE_DISABLE_AMBIENT_NETWORK = " 1 ";
  assert.throws(() => create(runtime), /initialization failure/);
  const reporter = create(runtime);
  reporter.captureException("enabled error");
  reporter.setUser({ id: "replacement" });
  reporter.setTag("backend", "fixture");
  create({
    ...runtime,
    env: { NODE_REPL_SENTRY_USER_ID: "ignored-second-user" },
  });
  const options = {
    url: "https://telemetry.invalid/envelope",
    headers: { "X-Test": "fixture" },
    keepAlive: true,
  };
  assert.equal(initOptions.transport(options), "transport-instance");
  trace.push(["response", await makeRequest({ body: new Uint8Array([1, 2]) })]);
  const failure = Error("host fetch failed");
  runtime.fetch = async () => {
    throw failure;
  };
  await assert.rejects(makeRequest({ body: "body" }), (e) => e === failure);
  return trace;
}
test("Sentry host adapter matches original one-time init, ambient switch, forwarding and transport", async () => {
  assert.deepEqual(
    await scenario(createErrorReporterFactory),
    await scenario(original),
  );
});
test("Sentry user selection matches GAAS and non-GAAS source without fallback", () => {
  const { _p } = originalServiceBindings(["dl", "Zt", "Qt", "_p"], {
    ii: "BROWSER_USE_SECURITY_MODE",
    y5: ["gaas-browser-environment"],
    SC: "normal",
  });
  for (const mode of [
    undefined,
    "normal",
    "gaas-browser-environment",
    " gaas-browser-environment ",
    1,
  ])
    for (const user of [undefined, "", " ", " user "])
      for (const gaas of [
        undefined,
        { browserConfig: {} },
        { browserConfig: { user_id: user } },
      ]) {
        const runtime: any = {
          env: {
            BROWSER_USE_SECURITY_MODE: mode,
            NODE_REPL_SENTRY_USER_ID: user,
          },
          gaas,
        };
        assert.equal(errorReporterUserId(runtime), _p(runtime));
      }
});
test("real Sentry light SDK serializes errors through host fetch with no external request", async () => {
  const requests: any[] = [];
  const create = createErrorReporterFactory();
  const reporter = create({
    env: { NODE_REPL_SENTRY_USER_ID: "synthetic-user" },
    async fetch(url, options) {
      requests.push({ url, options });
      return { status: 200, headers: new Headers() };
    },
  });
  try {
    const client = sentry.getClient()!;
    assert.equal(client.getOptions().sendDefaultPii, false);
    assert.equal(client.getOptions().release, "0.1.1");
    assert.equal(client.getSdkMetadata()?.sdk?.version, "10.48.0");
    reporter.setTag("cua-test", "synthetic");
    reporter.captureException(new Error("synthetic reporter exception"));
    assert.equal(await sentry.flush(5000), true);
    const events = requests.flatMap(({ options }) => {
      const body =
        typeof options.body === "string"
          ? options.body
          : new TextDecoder().decode(options.body);
      return body.split("\n").flatMap((line: string) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
    });
    const event = events.find(
      (event: any) =>
        event.exception?.values?.[0]?.value === "synthetic reporter exception",
    );
    assert.ok(event);
    assert.equal(event.user.id, "synthetic-user");
    assert.equal(event.tags["cua-test"], "synthetic");
    assert.ok(
      requests.every(
        ({ options }) =>
          options.method === "POST" && options.referrerPolicy === "origin",
      ),
    );
  } finally {
    await sentry.close(5000);
    sentry.getCurrentScope().setClient(undefined);
  }
});
