import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { UnixNativePipeHost } from "../packages/runtime-supervisor/src/native-pipe-host";
import type { Message } from "../packages/runtime-supervisor/src/session";

test(
  "Unix native pipe enforces endpoint policy, bounded writes and terminal cleanup",
  { skip: process.platform === "win32", timeout: 5000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "pipe-host-"));
    const path = join(root, "fixture.sock");
    let peer: Socket | undefined;
    const server = createServer((socket) => {
      peer = socket;
    });
    server.listen(path);
    await once(server, "listening");
    const events: Message[] = [];
    let observed!: (message: Message) => void;
    const host = new UnixNativePipeHost([path], (message) => {
      events.push(message);
      observed?.(message);
    });
    try {
      await assert.rejects(
        host.request({ op: "connect", path: path + "-other" }),
        /not authorized/,
      );
      const connection = (await host.request({ op: "connect", path })) as {
        connection_id: string;
      };
      const id = connection.connection_id;
      const received = once(peer!, "data");
      await host.request({
        op: "write",
        connection_id: id,
        data_base64: Buffer.from("hello").toString("base64"),
      });
      assert.equal((await received)[0].toString(), "hello");
      await assert.rejects(
        host.request({ op: "write", connection_id: id, data_base64: "!!!!" }),
        /Invalid/,
      );
      await assert.rejects(
        host.request({
          op: "write",
          connection_id: id,
          data_base64: Buffer.alloc(1024 * 1024 + 5).toString("base64"),
        }),
        /oversized|limit/,
      );
      // A complete maximum-sized browser frame must fit, including its header.
      const large = Buffer.alloc(1024 * 1024 + 4, 0x61);
      const largeRead = new Promise<Buffer>(resolve => {
        const chunks: Buffer[] = [];
        let size = 0;
        const receive = (chunk: Buffer) => {
          chunks.push(chunk); size += chunk.length;
          if (size >= large.length) {
            peer!.off("data", receive);
            resolve(Buffer.concat(chunks));
          }
        };
        peer!.on("data", receive);
      });
      await host.request({ op: "write", connection_id: id, data_base64: large.toString("base64") });
      assert.deepEqual(await largeRead, large);
      const data = new Promise<Message>((resolve) => {
        observed = (m) => {
          if (m.type === "native_pipe_data") resolve(m);
        };
      });
      peer!.write("reply");
      assert.equal(
        Buffer.from((await data).data_base64, "base64").toString(),
        "reply",
      );
      const peerClosed = once(peer!, "close");
      await host.request({ op: "close", connection_id: id });
      await peerClosed;
      assert.equal(
        events.filter((m) => m.type === "native_pipe_closed").length,
        1,
      );
      await assert.rejects(
        host.request({ op: "write", connection_id: id, data_base64: "" }),
        /Unknown/,
      );
      await host.close();
      await host.close();
      await assert.rejects(host.request({ op: "connect", path }), /closed/);
    } finally {
      await host.close();
      peer?.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  },
);
