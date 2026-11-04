import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { extensionBindings } from "./extension-source";
import {
  createTunnelResponseDelivery,
  tunnelRetryAfter,
} from "../packages/browser-extension/src/tunnel_response_delivery";

async function scenario(original: boolean, mode: string) {
  const trace: unknown[] = [];
  let time = 0,
    next = 0,
    attempts = 0,
    done = false;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const controller = new AbortController();
  const requests = new Set<any>();
  const setTimer = (callback: () => void, ms: number) => {
    const id = ++next;
    timers.set(id, { at: time + ms, callback });
    return id;
  };
  const clearTimer = (id: number) => {
    timers.delete(id);
  };
  const fetchFixture = async (_url: unknown, options: any) => {
    trace.push([
      "fetch",
      ++attempts,
      time,
      options.credentials,
      options.headers,
      JSON.parse(options.body),
    ]);
    assert.equal(requests.size, 1);
    if (mode === "network") throw Error("network");
    if (mode === "timeout" || mode === "notify-timeout")
      await new Promise<void>((_resolve, reject) =>
        options.signal.addEventListener(
          "abort",
          () => reject(Error("timeout")),
          { once: true },
        ),
      );
    if (mode === "abort") {
      controller.abort();
      throw Error("aborted");
    }
    const status =
      mode === "retry"
        ? attempts === 1
          ? 503
          : 200
        : mode === "rate"
          ? 429
          : mode === "gone"
            ? 404
            : mode === "bad"
              ? 400
              : ["recover", "recover-fails", "notify-401"].includes(mode)
                ? attempts === 1 || mode !== "recover"
                  ? 401
                  : 200
                : 200;
    return new Response(null, {
      status,
      headers: mode === "rate" ? { "Retry-After": "4" } : undefined,
    });
  };
  const env: any = {
    fetch: fetchFixture,
    now: () => time,
    wallNow: () => 100000 + time,
    random: () => 0.5,
    setTimeout: setTimer,
    clearTimeout: clearTimer,
  };
  const source = extensionBindings(["Bs", "js", "Cl", "kl"], {
    Il: 25000,
    Al: 25000,
    Fs: 3,
    fetch: fetchFixture,
    performance: { now: env.now },
    Date: { now: env.wallNow, parse: Date.parse },
    Math: {
      min: Math.min,
      max: Math.max,
      floor: Math.floor,
      random: env.random,
    },
    setTimeout: setTimer,
    clearTimeout: clearTimer,
  });
  const post = original
    ? source.Bs
    : createTunnelResponseDelivery(env).postResponse;
  const response = {
    resp_type: mode.startsWith("notify")
      ? "jsonrpc_notify"
      : "jsonrpc_response",
    value: 1,
  };
  const deadline = mode === "deadline" ? 0 : mode === "rate" ? 3500 : undefined;
  const recover = async (retry: Function) => {
    trace.push("recover");
    return await retry("fixture-token", controller.signal);
  };
  const pending = post(
    "https://fixture.invalid/response",
    {},
    response,
    deadline,
    controller.signal,
    requests,
    recover,
    (...args: unknown[]) => trace.push(["report", ...args]),
  ).then((result: boolean) => {
    done = true;
    trace.push(["result", result]);
  });
  for (let step = 0; !done && step < 40; step++) {
    for (let tick = 0; tick < 15; tick++) await Promise.resolve();
    if (done) break;
    const first = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
    assert.ok(first, mode);
    timers.delete(first[0]);
    time = first[1].at;
    first[1].callback();
  }
  assert.equal(done, true, mode);
  await pending;
  assert.equal(requests.size, 0);
  assert.equal(timers.size, 0);
  return trace;
}
test("response retry, deadline, failure and one-shot 401 recovery match installed originals", async () => {
  for (const mode of [
    "success",
    "retry",
    "rate",
    "gone",
    "bad",
    "network",
    "timeout",
    "notify-timeout",
    "abort",
    "recover",
    "recover-fails",
    "notify-401",
    "deadline",
  ])
    assert.deepEqual(
      await scenario(false, mode),
      await scenario(true, mode),
      mode,
    );
});
test("Retry-After parsing matches original caps and date behavior", () => {
  const { Cl } = extensionBindings(["Cl"], { Al: 25000 });
  for (const value of [
    null,
    "0",
    "1",
    "999999",
    "bad",
    "-1",
    "1.5",
    " 2 ",
    "Thu, 01 Jan 1970 00:00:10 GMT",
  ]) {
    const response = { headers: { get: () => value } } as any;
    assert.equal(tunnelRetryAfter(response, 1000), Cl(response, 1000));
  }
});
test("default response delivery posts actual JSON to a local HTTP server", async (t) => {
  const received: unknown[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    received.push([req.method, req.headers["content-type"], JSON.parse(body)]);
    res.writeHead(200);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address() as { port: number };
  const requests = new Set<any>();
  const payload = {
    resp_type: "jsonrpc_notify",
    resp_json: { method: "elicitation/create", params: { mode: "form" } },
  };
  assert.equal(
    await createTunnelResponseDelivery().postResponse(
      `http://127.0.0.1:${address.port}/response`,
      {},
      payload,
      undefined,
      new AbortController().signal,
      requests,
    ),
    true,
  );
  assert.deepEqual(received, [["POST", "application/json", payload]]);
  assert.equal(requests.size, 0);
});
