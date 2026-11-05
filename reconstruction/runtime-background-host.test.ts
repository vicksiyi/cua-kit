import test from "node:test";
import assert from "node:assert/strict";
import { BackgroundHostRequests } from "../packages/runtime-supervisor/src/background-host";
import type {
  Message,
  HostContext,
} from "../packages/runtime-supervisor/src/session";

test("background requests retain original context and survive history eviction", async () => {
  const replies: Message[] = [];
  let calls = 0;
  let context: HostContext | undefined;
  let release!: (m: Message) => void;
  const host = new BackgroundHostRequests(
    async (_message, current) => {
      calls++;
      context = current;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    (m) => replies.push(m),
  );
  const meta = { turn: "original" };
  host.register("old", meta, false);
  meta.turn = "changed";
  await host.handle({
    type: "authenticated_fetch",
    id: "denied",
    exec_id: "old",
  });
  assert.equal(calls, 0);
  assert.equal(replies[0].ok, false);
  host.allow("old");
  const running = host.handle({
    type: "authenticated_fetch",
    id: "request",
    exec_id: "old",
  });
  assert.deepEqual(context?.requestMeta, { turn: "original" });
  assert.throws(
    () => context!.appendContent({ type: "text", text: "no" }),
    /cannot append/,
  );
  for (let i = 0; i < 256; i++) host.register(`new-${i}`, {}, true);
  await host.handle({
    type: "authenticated_fetch",
    id: "late",
    exec_id: "old",
  });
  assert.equal(calls, 1);
  assert.equal(replies.at(-1)?.ok, false);
  release({ ok: true, response: { status: 200 } });
  await running;
  assert.equal(replies.at(-1)?.id, "request");
  assert.equal(replies.at(-1)?.ok, true);
  host.close();
});

test("background requests cannot replay IDs and retirement suppresses late replies", async () => {
  const replies: Message[] = [];
  let calls = 0;
  let signal: AbortSignal | undefined;
  let release!: (m: Message) => void;
  const host = new BackgroundHostRequests(
    async (_message, context) => {
      calls++;
      signal = context.signal;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    (m) => replies.push(m),
  );
  host.register("cell", {}, true);
  const message = { type: "authenticated_fetch", id: "same", exec_id: "cell" };
  const running = host.handle(message);
  await host.handle(message);
  assert.equal(calls, 1);
  assert.match(replies[0].error, /Duplicate/);
  host.close();
  assert.equal(signal?.aborted, true);
  release({ ok: true });
  await running;
  assert.equal(replies.length, 1);
  await host.handle({ ...message, id: "later" });
  assert.equal(calls, 1);
});
