import test from "node:test";
import assert from "node:assert/strict";
import { createServer, createConnection } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createNativeAuthBroker } from "../packages/browser/src/service/runtime/auth_broker";
import { assembleBrowserHost } from "../packages/browser/src/service/runtime/host_assembly";
import { NativePipeTransport } from "../packages/browser/src/service/runtime/native_pipe";
import { originalServiceBindings } from "./service-source";
const id = "A".repeat(32);
function original(connect: any) {
  const { lb, b6 } = originalServiceBindings(
    ["Bx", "sle", "ale", "Dx", "lb", "b6"],
    {
      ub: connect,
      g6: "BROWSER_AUTH_BROKER_SOCKET_PATH",
      nle: /^[A-Za-z0-9_-]{32,128}$/,
      ole: /^[A-Za-z0-9_-]{1,48}$/,
      ile: 128 * 1024,
    },
  );
  return { BrowserAuthChallenge: lb, getNativeCredentialObservationStatus: b6 };
}
function transport(
  trace: any[] = [],
  onSend?: (message: any, callback: (value: any) => void) => void,
) {
  let receive!: (value: any) => void, closed!: (error?: Error) => void;
  return {
    setMessageCallback(callback: any) {
      receive = callback;
    },
    addCloseListener(callback: any) {
      closed = callback;
    },
    sendMessage(message: any) {
      trace.push(["send", message]);
      onSend?.(message, receive);
    },
    close(error?: Error) {
      trace.push(["close", error?.message]);
      closed?.(error);
    },
    receive(message: any) {
      receive(message);
    },
    terminate(error?: Error) {
      closed(error);
    },
  };
}
async function lifecycle(factory: typeof createNativeAuthBroker) {
  const trace: any[] = [];
  let connection: any;
  const api = factory(async (path, options, message) => {
    const { decodeMessage, ...rest } = options;
    trace.push(["connect", path, rest, message, decodeMessage(null)]);
    connection = transport(trace, (message, receive) => {
      if (message.type === "register")
        receive({
          type: "registered",
          challenge_id: id,
          password_submission_metadata: true,
        });
      if (message.type === "result")
        receive({
          type: "completed",
          challenge_id: id,
          status: message.status,
        });
    });
    return connection;
  });
  const runtime = {
    env: { BROWSER_AUTH_BROKER_SOCKET_PATH: " /synthetic.sock " },
  };
  const challenge = await api.BrowserAuthChallenge.create(
    runtime,
    [{ id: "username" }],
    [{ id: "account" }],
    {
      qrCode: true,
      origins: ["https://fixture.invalid"],
      accountUsername: "fixture",
      manualSaveFields: ["username"],
      manualSaveSessionId: "session",
      credentialBinding: { session_id: "session" },
      emailOtpSessionId: "otp-session",
    },
  );
  assert.equal(challenge.id, id);
  assert.equal(challenge.hasSubmission, false);
  const values = JSON.parse('{"username":"synthetic","__proto__":"literal"}');
  connection.receive({
    type: "submission",
    challenge_id: id,
    fields: values,
    selected_option: "account",
    ordinary_credential_delivery: true,
    native_observation_predecessor: null,
  });
  const submission = await challenge.waitForSubmission();
  assert.equal(Object.getPrototypeOf(submission.fields), null);
  assert.equal(submission.fields.__proto__, "literal");
  trace.push(["submission", submission, challenge.hasSubmission]);
  challenge.publishQrCodePayload("synthetic-qr", true);
  assert.throws(
    () => challenge.publishQrCodePayload(""),
    /invalid browser auth QR/,
  );
  assert.equal(await challenge.complete("submitted", true), "submitted");
  assert.equal(await challenge.complete("declined", false), "submitted");
  connection.receive({ type: "submission", challenge_id: id, fields: null }); // Ignored after result.
  challenge.close();
  challenge.close();
  assert.throws(() => challenge.send({}), /broker is closed/);
  await assert.rejects(
    api.BrowserAuthChallenge.create({ env: {} }, []),
    /broker is unavailable/,
  );
  return trace;
}
test("broker challenge lifecycle and registration payload match original", async () => {
  assert.deepEqual(
    await lifecycle(createNativeAuthBroker),
    await lifecycle(original),
  );
});
test("broker validates all delivery combinations, challenge IDs, fields and terminal outcomes like source", async () => {
  const messages: any[] = [
    null,
    [],
    {},
    { type: "other" },
    { type: "registered", challenge_id: "short" },
    { type: "completed", challenge_id: id, status: "bad" },
  ];
  for (const status of [
    "submitted",
    "declined",
    "cancelled",
    "unavailable",
    "expired",
    "origin_changed",
    "page_changed",
    "locator_invalid",
    "submission_failed",
  ])
    messages.push({ type: "completed", challenge_id: id, status });
  for (const fieldValues of [undefined, null, [], { a: 1 }, { a: "text" }, {}])
    messages.push({
      type: "submission",
      challenge_id: id,
      fields: fieldValues,
    });
  for (const native of [undefined, true, false])
    for (const ordinary of [undefined, true, false])
      for (const manual of [undefined, true, false])
        for (const email of [undefined, true, false])
          messages.push({
            type: "submission",
            challenge_id: id,
            fields: { a: "synthetic" },
            native_credential_delivery: native,
            ordinary_credential_delivery: ordinary,
            manual_credential_save: manual,
            email_otp_delivery: email,
          });
  for (const value of [null, "", 1, "bad option", "x".repeat(49), "valid"])
    messages.push({
      type: "submission",
      challenge_id: id,
      fields: {},
      selected_option: value,
    });
  for (const value of [null, undefined, "receipt", 1, {}])
    messages.push({
      type: "submission",
      challenge_id: id,
      fields: {},
      native_observation_predecessor: value,
    });
  async function run(factory: typeof createNativeAuthBroker, message: any) {
    const { BrowserAuthChallenge } = factory(async () => {
      throw Error("unexpected connect");
    });
    const trace: any[] = [];
    const channel = transport(trace),
      challenge = new BrowserAuthChallenge(channel);
    assert.throws(() => challenge.id, /not registered/);
    challenge.handleMessage({ type: "registered", challenge_id: id });
    let error;
    try {
      challenge.handleMessage(message);
    } catch (cause) {
      error = (cause as Error).message;
    }
    const result = {
      error,
      submitted: challenge.hasSubmission,
      submission: challenge.submission.settled
        ? await challenge.submission.promise
        : undefined,
      completed: challenge.completed.settled
        ? await challenge.completed.promise
        : undefined,
    };
    const closed = Error("synthetic disconnect");
    challenge.fail(closed);
    challenge.fail(closed);
    if (!challenge.completed.settled)
      assert.fail("completion must settle on failure");
    await challenge.completed.promise.catch((actual) =>
      assert.equal(actual, closed),
    );
    challenge.close();
    return { result, trace };
  }
  for (const message of messages)
    assert.deepEqual(
      await run(createNativeAuthBroker, message),
      await run(original, message),
    );
});
test("native observation status preserves strict response, close, send and timeout behavior", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  async function run(factory: typeof createNativeAuthBroker, mode: any) {
    const trace: any[] = [];
    const api = factory(async (path, options, unavailable) => {
      const { decodeMessage, ...rest } = options;
      trace.push([path, rest, unavailable, decodeMessage(null)]);
      const connection = transport(trace, (_message, receive) => {
        if (mode === "throw") throw Error("write failed");
        if (mode === "close") connection.terminate();
        else if (mode !== "timeout" && mode !== "throw") receive(mode);
      });
      return connection;
    });
    const pending = api.getNativeCredentialObservationStatus(
      { env: { BROWSER_AUTH_BROKER_SOCKET_PATH: " /fixture " } },
      "session",
      "expected",
    );
    const observed = pending.then(
      (value) => ({ value }),
      (error) => ({ error: error.message }),
    );
    if (mode === "timeout") {
      await Promise.resolve();
      await Promise.resolve();
      t.mock.timers.tick(3000);
    }
    return { result: await observed, trace };
  }
  for (const mode of [
    { type: "native_observation_status", used: true },
    { type: "native_observation_status", used: false },
    { type: "native_observation_status", used: false, extra: 1 },
    { type: "native_observation_status", used: "false" },
    null,
    [],
    "throw",
    "close",
    "timeout",
  ])
    assert.deepEqual(
      await run(createNativeAuthBroker, mode),
      await run(original, mode),
    );
});
test("assembled GAAS host uses restored broker over a real isolated Unix socket", async () => {
  const root = await mkdtemp(join(tmpdir(), "cua-broker-")),
    path = join(root, "broker.sock");
  const transports: NativePipeTransport[] = [],
    messages: any[] = [];
  const server = createServer((socket) => {
    const channel = new NativePipeTransport(socket, {
      decodeMessage: (value) => value,
    });
    transports.push(channel);
    channel.setMessageCallback((message) => {
      messages.push(message);
      if (message.type === "native_observation_status") {
        channel.sendMessage({ type: "native_observation_status", used: false });
        channel.close();
      } else if (message.type === "register") {
        channel.sendMessage({
          type: "registered",
          challenge_id: id,
          password_submission_metadata: true,
        });
        channel.sendMessage({
          type: "submission",
          challenge_id: id,
          fields: { username: "synthetic" },
        });
      } else if (message.type === "result")
        channel.sendMessage({
          type: "completed",
          challenge_id: id,
          status: message.status,
        });
    });
  });
  await new Promise<void>((resolve) => server.listen(path, resolve));
  try {
    const runtime: any = {
      env: {
        BROWSER_USE_SECURITY_MODE: "gaas-browser-environment",
        BROWSER_AUTH_BROKER_SOCKET_PATH: path,
        BROWSER_USE_CONFIG_PATH: join(root, "missing.json"),
      },
    };
    const host = assembleBrowserHost({
      getNativePipeBridge: () => ({
        createConnection: (path: string) =>
          new Promise((resolve, reject) => {
            const socket = createConnection(path);
            socket.once("connect", () => resolve(socket));
            socket.once("error", reject);
          }),
      }),
    });
    const gaas = await host.loadGaas(runtime, runtime);
    assert.equal(
      await gaas!.getNativeCredentialObservationStatus(
        "fixture-session",
        "fixture-predecessor",
      ),
      false,
    );
    const challenge = await gaas!.getBrowserAuthBrokerChallenge(
      [{ id: "username" }],
      undefined,
      {},
    );
    assert.equal(
      (await challenge.waitForSubmission()).fields.username,
      "synthetic",
    );
    assert.equal(await challenge.complete("submitted", true), "submitted");
    challenge.close();
    assert.equal(messages[0].expected_challenge_id, "fixture-predecessor");
    assert.equal(messages.at(-1).password_submitted, true);
  } finally {
    for (const channel of transports) channel.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
