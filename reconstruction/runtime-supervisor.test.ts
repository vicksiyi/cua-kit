import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import {
  WorkerSession,
  type WorkerPort,
  type Message,
} from "../packages/runtime-supervisor/src/session";
import { ProcessWorkerPort } from "../packages/runtime-supervisor/src/process-port";
function port(
  entry: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): Promise<WorkerPort> {
  // Network-deny remains test-only; the transport is now the package implementation.
  return ProcessWorkerPort.start({
    command: "/usr/bin/sandbox-exec",
    args: [
      "-p",
      "(version 1)(allow default)(deny network*)",
      process.execPath,
      "--experimental-vm-modules",
      entry,
      ...args,
    ],
    cwd,
    env,
    terminateGraceMs: 20,
  });
}
test(
  "independent supervisor drives actual restored workers, RPC, approval, reset and timeout",
  { skip: process.platform !== "darwin", timeout: 20000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "core-supervisor-"));
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      join(root, "service.mjs"),
      'export async function handleRpc(x){if(x.suspend)return await nodeRepl.withSuspendedTimeout(()=>nodeRepl.withSuspendedTimeout(async()=>{await new Promise(r=>setTimeout(r,x.suspend));return "waited";}));if(x.ask)return await nodeRepl.createElicitation({message:"fixture approval"});return {echo:x,meta:nodeRepl.requestMeta};}',
    );
    let launches = 0,
      decision = "decline";
    const requests: Message[] = [];
    const session = new WorkerSession({
      services: ["fixture"],
      launch: async () => {
        launches++;
        const env = {
          NODE_REPL_TRUSTED_RPC_ENABLED: "1",
          NODE_REPL_TRUSTED_SERVICES: JSON.stringify({
            fixture: join(root, "service.mjs"),
          }),
          NODE_REPL_TRUSTED_CODE_PATHS: root,
          HOME: root,
          TMPDIR: root,
        };
        const kernel = await port(
          resolve("packages/node-repl/dist/kernel.js"),
          ["--session-id", "fixture", "--working-dir", root],
          root,
          env,
        );
        try {
          return {
            kernel,
            trusted: await port(
              resolve("packages/node-repl/dist/trusted_worker.js"),
              [root],
              root,
              env,
            ),
          };
        } catch (error) {
          await kernel.close();
          throw error;
        }
      },
      hostRequest: async (message, context) => {
        assert.equal(message.type, "elicit");
        requests.push({ ...message, hostMeta: context.requestMeta });
        return { ok: true, action: decision, content: {} };
      },
    });
    try {
      assert.equal(
        (await session.execute("let value=40;nodeRepl.write(value)")).output,
        "40",
      );
      assert.equal(
        (await session.execute("value+=2;nodeRepl.write(value)")).output,
        "42",
      );
      const rpc = await session.execute(
        'nodeRepl.write(JSON.stringify(await nodeRepl.rpc("fixture",{n:7})))',
        { requestMeta: { turn: "test" } },
      );
      assert.equal(rpc.ok, true);
      assert.match(rpc.output, /"n":7/);
      assert.match(rpc.output, /"turn":"test"/);
      for (decision of ["decline", "accept"]) {
        const approval = await session.execute(
          'nodeRepl.write(await nodeRepl.rpc("fixture",{ask:true}))',
          { formElicitationSupported: true, requestMeta: { turn: decision } },
        );
        assert.equal(approval.ok, true);
        assert.match(approval.output, new RegExp(decision));
      }
      assert.deepEqual(
        requests.map((r) => r.hostMeta),
        [{ turn: "decline" }, { turn: "accept" }],
      );
      const suspended = await session.execute(
        'nodeRepl.write(await nodeRepl.rpc("fixture",{suspend:300}))',
        { timeoutMs: 150 },
      );
      assert.equal(suspended.ok, true);
      assert.equal(suspended.output, "waited");
      const missing = await session.execute(
        'await nodeRepl.rpc("not-configured",{})',
      );
      assert.equal(missing.ok, false);
      assert.match(missing.error, /not configured/);
      await session.reset();
      assert.equal(
        (await session.execute("nodeRepl.write(typeof value)")).output,
        "undefined",
      );
      const beforeTimeout = performance.now();
      await assert.rejects(
        session.execute(
          'let timed=1;await nodeRepl.rpc("fixture",{suspend:300});await new Promise(()=>{})',
          { timeoutMs: 150 },
        ),
        /timed out/,
      );
      assert.ok(
        performance.now() - beforeTimeout >= 300,
        "Suspended wait incorrectly exhausted execution time",
      );
      assert.equal(
        (await session.execute("nodeRepl.write(typeof timed)")).output,
        "undefined",
      );
      const controller = new AbortController();
      const before = requests.length;
      const running = session.execute(
        'let cancelled=1;await nodeRepl.rpc("fixture",{ask:true});await new Promise(()=>{})',
        { signal: controller.signal, formElicitationSupported: true },
      );
      const startedDeadline = Date.now() + 2000;
      while (requests.length === before) {
        assert.ok(
          Date.now() < startedDeadline,
          "Cancelled cell never reached the real trusted worker",
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      controller.abort();
      await assert.rejects(running, /cancelled/);
      assert.equal(
        (await session.execute("nodeRepl.write(typeof cancelled)")).output,
        "undefined",
      );
      assert.equal(launches, 4);
    } finally {
      await session.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);

function fakePort() {
  const listeners = new Set<(m: Message) => void>();
  const sent: Message[] = [];
  let closed = false;
  return {
    sent,
    get closed() {
      return closed;
    },
    emit: (m: Message) => {
      for (const f of listeners) f(m);
    },
    send: (m: Message) => {
      sent.push(m);
    },
    onMessage: (f: (m: Message) => void) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    onExit: () => () => {},
    close: async () => {
      closed = true;
    },
  };
}
test("kernel cannot invoke privileged host operations directly", async () => {
  const kernel = fakePort(),
    trusted = fakePort();
  let calls = 0;
  const session = new WorkerSession({
    services: ["fixture"],
    launch: async () => ({ kernel, trusted }),
    hostRequest: async () => {
      calls++;
      return { ok: true };
    },
  });
  const pending = session.execute("ignored");
  const rejected = assert.rejects(pending, /Unsupported kernel/);
  await new Promise((resolve) => setImmediate(resolve));
  kernel.emit({ type: "elicit", id: "forged", exec_id: kernel.sent[0].id });
  await rejected;
  await session.close();
  assert.equal(calls, 0);
  assert.equal(kernel.closed, true);
  assert.equal(trusted.closed, true);
});
test("reset aborts host work and discards its late reply", async () => {
  const kernel = fakePort(),
    trusted = fakePort();
  let release!: (m: Message) => void;
  let signal: AbortSignal | undefined;
  const session = new WorkerSession({
    services: ["fixture"],
    launch: async () => ({ kernel, trusted }),
    hostRequest: async (_message, context) => {
      signal = context.signal;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const pending = session.execute("ignored", {
    formElicitationSupported: true,
  });
  const rejected = assert.rejects(pending, /reset/);
  await new Promise((resolve) => setImmediate(resolve));
  const id = kernel.sent[0].id;
  kernel.emit({
    type: "trusted_service_request",
    id: "rpc",
    exec_id: id,
    service: "fixture",
    request: {},
  });
  trusted.emit({ type: "elicit", id: "ask", exec_id: id, message: "fixture" });
  await session.reset();
  await rejected;
  assert.equal(signal?.aborted, true);
  release({ ok: true, action: "accept" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    trusted.sent.some((m) => m.id === "ask"),
    false,
  );
  await session.close();
});

test("close waits for an in-flight launch and retires the eventual pair", async () => {
  const kernel = fakePort(),
    trusted = fakePort();
  let launch!: (p: { kernel: WorkerPort; trusted: WorkerPort }) => void;
  const session = new WorkerSession({
    services: [],
    launch: () =>
      new Promise((resolve) => {
        launch = resolve;
      }),
  });
  const pending = session.execute("ignored");
  const rejected = assert.rejects(pending, /changed during worker launch/);
  await new Promise((resolve) => setImmediate(resolve));
  let closed = false;
  const closing = session.close().then(() => {
    closed = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed, false);
  launch({ kernel, trusted });
  await closing;
  await rejected;
  assert.equal(kernel.closed, true);
  assert.equal(trusted.closed, true);
  assert.equal(kernel.sent.length, 0);
});

test("timeout controls require trusted current RPC and balanced resume", async () => {
  for (const scenario of ["kernel", "stale", "resume", "leak"]) {
    const kernel = fakePort(),
      trusted = fakePort();
    const session = new WorkerSession({
      services: ["fixture"],
      launch: async () => ({ kernel, trusted }),
    });
    const pending = session.execute("ignored");
    const rejected = assert.rejects(
      pending,
      /Unsupported kernel|Uncorrelated timeout|Unbalanced|still suspended/,
    );
    await new Promise((resolve) => setImmediate(resolve));
    const id = kernel.sent[0].id;
    if (scenario !== "kernel")
      kernel.emit({
        type: "trusted_service_request",
        id: "rpc",
        exec_id: id,
        service: "fixture",
        request: {},
      });
    if (scenario === "kernel")
      kernel.emit({ type: "suspend_timeout", exec_id: id });
    else if (scenario === "stale")
      trusted.emit({ type: "suspend_timeout", exec_id: "old" });
    else if (scenario === "resume")
      trusted.emit({ type: "resume_timeout", exec_id: id });
    else {
      trusted.emit({ type: "suspend_timeout", exec_id: id });
      trusted.emit({
        type: "trusted_service_response",
        id: "rpc",
        ok: true,
        value: null,
      });
    }
    await rejected;
    await session.close();
  }
});
