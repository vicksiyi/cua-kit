import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { WindowsComputerUseClient } from "../packages/sky/src/targets/windows/internal/computer_use_client";
import { create_client } from "../packages/sky/src/targets/windows/create_client";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const Original = (
  await import(
    pathToFileURL(
      `${root}/sky/dist/project/cua/sky_js/src/targets/windows/internal/computer_use_client.js`,
    ).href
  )
).WindowsComputerUseClient;
const frame = (data: unknown) => {
  const payload = Buffer.from(JSON.stringify(data)),
    result = Buffer.alloc(payload.length + 4);
  result.writeUInt32LE(payload.length);
  payload.copy(result, 4);
  return result;
};
class Pipe extends EventEmitter {
  ended = 0;
  messages: any[] = [];
  constructor(private respond: (message: any, pipe: Pipe) => void) {
    super();
  }
  write(value: Uint8Array) {
    const bytes = Buffer.from(value),
      message = JSON.parse(bytes.subarray(4).toString());
    assert.equal(bytes.readUInt32LE(0), bytes.length - 4);
    this.messages.push(message);
    queueMicrotask(() => this.respond(message, this));
  }
  end() {
    this.ended++;
    queueMicrotask(() => this.emit("close"));
  }
  reply(value: unknown) {
    const bytes = frame(value);
    this.emit("data", bytes.subarray(0, 2));
    this.emit("data", bytes.subarray(2, 7));
    this.emit("data", bytes.subarray(7));
  }
}
function host(pipe: Pipe, extras: any = {}) {
  return {
    config: {},
    env: {
      SKY_CUA_NATIVE_PIPE: "1",
      SKY_CUA_NATIVE_PIPE_DIRECTORY: " fixture-pipe ",
    },
    nativePipe: {
      createConnection: async (directory: string) => {
        assert.equal(directory, "fixture-pipe");
        return pipe;
      },
    },
    requestMeta: { session_id: "fixture", turn_id: "turn" },
    ...extras,
  };
}
async function withHost(run: () => Promise<void>) {
  const globals = globalThis as any,
    previous = globals.nodeRepl;
  try {
    await run();
  } finally {
    globals.nodeRepl = previous;
  }
}
test("Windows native pipe preserves framing, serialization and caller-context approval timeout suspension", async () =>
  withHost(async () => {
    const traces: any[] = [];
    for (const C of [Original, WindowsComputerUseClient]) {
      const storage = new AsyncLocalStorage<string>(),
        approvalContexts: any[] = [];
      let first: any;
      const pipe = new Pipe((message, p) => {
        if (message.method === "request") {
          if (first == null) {
            first = message;
            p.reply({
              id: "approval",
              method: "requestComputerUseApproval",
              params: { message: "fixture" },
            });
          } else
            p.reply({ id: message.id, result: [{ app: "fixture", id: 2 }] });
        } else if (message.id === "approval") {
          assert.equal(message.result.action, "accept");
          p.reply({ id: first.id, result: [{ app: "fixture", id: 1 }] });
        }
      });
      (globalThis as any).nodeRepl = host(pipe, {
        createElicitation: async () => {
          approvalContexts.push(storage.getStore());
          await new Promise((r) => setTimeout(r, 80));
          assert.equal(
            pipe.messages.filter((m) => m.method === "request").length,
            1,
          );
          return { action: "accept" };
        },
      });
      const client = new C({ timeoutMs: 50 });
      const a = storage.run("first", () => client.list_windows()),
        b = storage.run("second", () => client.list_windows());
      assert.deepEqual(await a, [{ app: "fixture", id: 1 }]);
      assert.deepEqual(await b, [{ app: "fixture", id: 2 }]);
      await client.close();
      assert.equal(pipe.ended, 1);
      assert.deepEqual(approvalContexts, ["first"]);
      traces.push(pipe.messages);
    }
    assert.deepEqual(traces[1], traces[0]);
  }));
test("Windows native pipe approvals fail closed without host UI and report original RPC errors", async () =>
  withHost(async () => {
    for (const C of [Original, WindowsComputerUseClient]) {
      const pipe = new Pipe((message, p) => {
        if (message.method === "request")
          p.reply({
            id: "approval",
            method: "requestComputerUseApproval",
            params: {},
          });
        else {
          assert.equal(message.error.code, -32000);
          assert.match(message.error.message, /outside trusted node_repl/);
          p.reply({ id: 1, error: { message: "fixture approval rejected" } });
        }
      });
      (globalThis as any).nodeRepl = host(pipe);
      const client = new C({ timeoutMs: 500 });
      await assert.rejects(client.list_windows(), /fixture approval rejected/);
      await client.close();
      (globalThis as any).nodeRepl = host(pipe, { config: null });
      assert.throws(() => new C(), /native pipe is unavailable/);
      (globalThis as any).nodeRepl = host(pipe, {
        env: { SKY_CUA_NATIVE_PIPE: "1" },
      });
      assert.throws(() => new C(), /path is unavailable/);
      const custom = { close: async () => {}, request: async () => [] };
      const direct = new C({ transport: custom });
      assert.deepEqual(await direct.list_windows(), []);
      await direct.close();
    }
  }));
test("Windows native pipe resets after invalid frames and request timeout; reconnects for queued work", async () =>
  withHost(async () => {
    for (const C of [Original, WindowsComputerUseClient])
      for (const mode of ["timeout", "oversize", "json"]) {
        let attempts = 0;
        const broken = new Pipe((_message, p) => {
          if (mode === "oversize") {
            const prefix = Buffer.alloc(4);
            prefix.writeUInt32LE(67108865);
            p.emit("data", prefix);
          }
          if (mode === "json") {
            const bytes = Buffer.from([1, 0, 0, 0, 123]);
            p.emit("data", bytes);
          }
        });
        const healthy = new Pipe((message, p) =>
          p.reply({ id: message.id, result: [] }),
        );
        (globalThis as any).nodeRepl = host(broken, {
          nativePipe: {
            createConnection: async () => (++attempts === 1 ? broken : healthy),
          },
        });
        const client = new C({ timeoutMs: 40 });
        const first = client.list_windows();
        const second = client.list_windows();
        await assert.rejects(
          first,
          mode === "timeout"
            ? /timed out: list_windows/
            : mode === "oversize"
              ? /frame is too large: 67108865/
              : /JSON|property name|Expected/,
        );
        assert.deepEqual(await second, []);
        assert.equal(broken.ended, 1);
        assert.equal(attempts, 2);
        await client.close();
      }
  }));
test("Windows connection timeout closes late pipes and intrinsic Promise.then ignores overrides", async () =>
  withHost(async () => {
    for (const C of [Original, WindowsComputerUseClient]) {
      let resolve!: (p: Pipe) => void;
      const pipe = new Pipe((message, p) =>
        p.reply({ id: message.id, result: [] }),
      );
      const pending = new Promise<Pipe>((r) => {
        resolve = r;
      });
      (pending as any).then = () => {
        throw new Error("must use intrinsic then");
      };
      (globalThis as any).nodeRepl = host(pipe, {
        nativePipe: { createConnection: () => pending },
      });
      const client = new C({ timeoutMs: 20 });
      await assert.rejects(
        client.list_windows(),
        /unavailable: Computer Use native pipe connection timed out/,
      );
      resolve(pipe);
      await new Promise((r) => setImmediate(r));
      assert.equal(pipe.ended, 1);
      await client.close();
    }
  }));
test("Windows clients share identical subprocess settings, release last reference and preserve factory shape", async () =>
  withHost(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cua-win-client-"));
    const script = path.join(dir, "helper.cjs");
    await writeFile(
      script,
      `const readline=require('node:readline');let calls=0;readline.createInterface({input:process.stdin}).on('line',s=>{const q=JSON.parse(s);const result=[{app:'fixture',id:process.pid,title:String(++calls)}];process.stdout.write(JSON.stringify({id:q.id,ok:true,result})+'\\n');if(q.method==='close')process.exit(0);});`,
    );
    const oldHome = process.env.CODEX_HOME;
    (globalThis as any).nodeRepl = {};
    process.env.CODEX_HOME = path.relative(process.cwd(), dir);
    try {
      for (const C of [Original, WindowsComputerUseClient]) {
        const settings = {
          helperCommand: process.execPath,
          helperArgs: [script],
          timeoutMs: 1000,
        };
        const a = new C(settings),
          b = new C(settings);
        try {
          const [one] = await a.list_windows(),
            [two] = await b.list_windows();
          assert.equal(one.id, two.id);
          assert.equal(one.title, "1");
          assert.equal(two.title, "2");
          await a.close();
          const [three] = await b.list_windows();
          assert.equal(three.id, two.id);
          assert.equal(three.title, "3");
        } finally {
          await a.close();
          await b.close();
        }
        assert.ok(Object.isFrozen(C));
      }
      const pipe = new Pipe((message, p) =>
        p.reply({ id: message.id, result: [] }),
      );
      (globalThis as any).nodeRepl = host(pipe);
      const factory = create_client({} as any);
      assert.equal(factory.target, "windows");
      assert.deepEqual(await factory.list_windows(), []);
      await factory.close();
    } finally {
      if (oldHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = oldHome;
      await rm(dir, { recursive: true, force: true });
    }
  }));

test("Windows native pipe enforces outgoing size and closes pending connections without replay", async () =>
  withHost(async () => {
    for (const C of [Original, WindowsComputerUseClient]) {
      const pipe = new Pipe((message, p) =>
        p.reply({ id: message.id, result: [] }),
      );
      (globalThis as any).nodeRepl = host(pipe);
      const client = new C({ timeoutMs: 1000 });
      await assert.rejects(
        client.type_text({
          window: { app: "fixture", id: 1 },
          text: "x".repeat(8388608),
        }),
        /frame is too large/,
      );
      assert.equal(pipe.messages.length, 0);
      assert.deepEqual(await client.list_windows(), []);
      await client.close();
      let resolve!: (pipe: Pipe) => void;
      let started!: () => void;
      const entered = new Promise<void>((r) => {
        started = r;
      });
      (globalThis as any).nodeRepl = host(pipe, {
        nativePipe: {
          createConnection: () => {
            started();
            return new Promise<Pipe>((r) => {
              resolve = r;
            });
          },
        },
      });
      const waiting = new C({ timeoutMs: 1000 });
      const request = waiting.list_windows();
      const rejection = assert.rejects(
        request,
        /native pipe is unavailable: Computer Use native pipe is closed/,
      );
      await entered;
      const closing = waiting.close();
      const late = new Pipe(() => {
        throw new Error("must not send after close");
      });
      resolve(late);
      await closing;
      await rejection;
      assert.equal(late.ended, 1);
      assert.equal(late.messages.length, 0);
    }
  }));
