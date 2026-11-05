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
      'const ended=[];nodeRepl.addTurnEndedHandler({timeoutMs:1000,run:async(event)=>{await nodeRepl.createElicitation({message:"turn cleanup"});ended.push({event,meta:nodeRepl.requestMeta});}});export async function handleRpc(x){if(x.ended)return ended;if(x.suspend)return await nodeRepl.withSuspendedTimeout(()=>nodeRepl.withSuspendedTimeout(async()=>{await new Promise(r=>setTimeout(r,x.suspend));return "waited";}));if(x.ask)return await nodeRepl.createElicitation({message:"fixture approval"});return {echo:x,meta:nodeRepl.requestMeta};}',
    );
    let launches = 0,
      decision = "decline";
    const requests: Message[] = [];
    let imageAccepted = false;
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
        if (message.type === "emit_image") {
          await new Promise((resolve) => setTimeout(resolve, 20));
          imageAccepted = true;
          return { ok: true };
        }
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
      const imageResult = await session.execute(
        'nodeRepl.emitImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=");nodeRepl.write("emitted")',
      );
      assert.equal(imageResult.ok, true);
      assert.equal(
        imageAccepted,
        true,
        "Unawaited tracked media must settle before completion",
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
      const event = {
        hook_event_name: "turn_ended",
        session_id: "fixture",
        turn_id: "one",
      };
      const ending = session.turnEnded(event, {
        formElicitationSupported: true,
        requestMeta: { cleanup: true },
      });
      assert.equal(
        session.turnEnded({ ...event }),
        ending,
        "Duplicate turn must share completion",
      );
      const afterTurn = session.execute(
        'nodeRepl.write(await nodeRepl.rpc("fixture",{ended:true}))',
      );
      await ending;
      const observed = await afterTurn;
      assert.equal(observed.ok, true);
      assert.match(observed.output, /cleanup/);
      assert.match(observed.output, /turn_ended/);
      assert.equal(
        requests.filter((r) => r.message === "turn cleanup").length,
        1,
      );
      await session.turnEnded({ ...event, hook_event_name: "different" });
      assert.equal(
        requests.filter((r) => r.message === "turn cleanup").length,
        1,
      );
      assert.equal(
        (await session.execute("nodeRepl.write(value)")).output,
        "42",
        "Lifecycle preserves kernel bindings",
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

test("turn-ended rejects forged acknowledgements and retires on missing acknowledgement", async () => {
  for (const side of ["kernel", "trusted", "timeout"] as const) {
    const kernel = fakePort(),
      trusted = fakePort();
    const session = new WorkerSession({
      services: [],
      launch: async () => ({ kernel, trusted }),
    });
    const operation = session.turnEnded(
      { hook_event_name: "turn_ended", session_id: "s", turn_id: "t" },
      { timeoutMs: 30 },
    );
    const rejection = assert.rejects(
      operation,
      /Kernel message|identity mismatch|timed out/,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(kernel.sent.length, 0);
    if (side !== "timeout")
      ({ kernel, trusted })[side].emit({
        type: "turn_ended_result",
        id: side === "trusted" ? "stale" : trusted.sent[0].id,
      });
    await rejection;
    await session.close();
    assert.equal(kernel.closed, true);
    assert.equal(trusted.closed, true);
  }
});

test("host requests reject duplicate IDs without replaying side effects", async () => {
  for (const completed of [false, true]) {
    const kernel = fakePort(),
      trusted = fakePort();
    let calls = 0;
    let signal: AbortSignal | undefined;
    const session = new WorkerSession({
      services: [],
      launch: async () => ({ kernel, trusted }),
      hostRequest: async (_message, context) => {
        calls++;
        signal = context.signal;
        return completed ? { ok: true } : new Promise(() => {});
      },
    });
    const operation = session.execute("ignored");
    const rejected = assert.rejects(operation, /Duplicate host request/);
    await new Promise((resolve) => setImmediate(resolve));
    const message = {
      type: "emit_image",
      id: "image",
      exec_id: kernel.sent[0].id,
      image_url: "data:image/png;base64,AA==",
    };
    kernel.emit(message);
    await new Promise((resolve) => setImmediate(resolve));
    kernel.emit(message);
    await rejected;
    assert.equal(calls, 1);
    assert.equal(signal?.aborted, true);
    await session.close();
  }
});

test("completion with unfinished host effects rejects and discards late response", async () => {
  for (const kind of ["exec", "turn_ended"] as const) {
    const kernel = fakePort(),
      trusted = fakePort();
    let resolveHost!: (result: Message) => void;
    let signal: AbortSignal | undefined;
    const session = new WorkerSession({
      services: [],
      launch: async () => ({ kernel, trusted }),
      hostRequest: async (_message, context) => {
        signal = context.signal;
        return new Promise((resolve) => {
          resolveHost = resolve;
        });
      },
    });
    const operation =
      kind === "exec"
        ? session.execute("ignored")
        : session.turnEnded({
            hook_event_name: "turn_ended",
            session_id: "s",
            turn_id: "t",
          });
    const rejected = assert.rejects(
      operation,
      /outstanding host requests; outcome unknown/,
    );
    await new Promise((resolve) => setImmediate(resolve));
    const worker = kind === "exec" ? kernel : trusted;
    const id = worker.sent[0].id;
    worker.emit({
      type: "emit_image",
      id: "image",
      exec_id: id,
      image_url: "data:image/png;base64,AA==",
    });
    worker.emit({
      type: kind === "exec" ? "exec_result" : "turn_ended_result",
      id,
      ok: true,
    });
    await rejected;
    assert.equal(signal?.aborted, true);
    resolveHost({ ok: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      worker.sent.some((m) => m.id === "image"),
      false,
    );
    await session.close();
    assert.equal(kernel.closed, true);
    assert.equal(trusted.closed, true);
  }
});
