import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  KernelSessionLifecycle,
  kernelTurnCleanupMetadata,
} from "../packages/browser-extension/src/kernel_session_lifecycle";

function setup(original: boolean, failed = "") {
  const trace: unknown[] = [];
  const signal = new AbortController();
  const chatApi = {
    account: { userId: "user", id: "account" },
    signal: signal.signal,
    dispose() {
      trace.push("chat-dispose");
    },
  };
  const resetKernel = async (id: string) => {
    trace.push(["reset", id]);
    if (failed === "reset") throw Error("reset failed");
  };
  const onTurnEnded = async (id: string, metadata: unknown) => {
    trace.push(["ended", id, metadata]);
    if (failed === "turn") throw Error("turn failed");
  };
  const deletePdf = async (pdf: string) => {
    trace.push(["pdf", pdf]);
    if (pdf === failed) throw Error("pdf failed");
  };
  const warn = (message: string) => trace.push(["warn", message]);
  const errorMetadata = (reason: string) => ({ reason });
  const activity = {
    turnEnded: (id: string) => {
      trace.push(["activity", id]);
    },
  };
  let session: any;
  if (original) {
    class Base {
      tools = new Map<string, Function>();
      registerTool(name: string, _schema: unknown, run: Function) {
        this.tools.set(name, run);
      }
      dispose() {
        trace.push("transport-dispose");
      }
    }
    const { p_ } = extensionBindings(["Pl", "p_"], {
      d_: Base,
      crypto: { randomUUID: () => "generation" },
      Yc: class {
        constructor() {
          return chatApi;
        }
      },
      El: resetKernel,
      Fn: (_api: unknown, pdf: string) => deletePdf(pdf),
      pt: errorMetadata,
      console: { warn },
    });
    session = new p_({}, onTurnEnded, undefined, undefined, activity);
    session.turnEnded = (abort: AbortSignal, context: unknown) =>
      session.tools.get("turn_ended")({}, {}, abort, context);
  } else {
    session = new KernelSessionLifecycle({
      chatApi,
      randomUUID: () => "generation",
      disposeTransport() {
        trace.push("transport-dispose");
      },
      resetKernel,
      onTurnEnded,
      deletePdf,
      errorMetadata,
      activity,
      warn,
    });
  }
  return { session, trace, signal };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("kernel queue matches original ordering, rejection recovery, independent scopes and abort semantics", async () => {
  async function scenario(original: boolean) {
    const { session, trace } = setup(original);
    const first = deferred();
    const signal = new AbortController();
    const one = session.runInScope("same", signal.signal, async () => {
      trace.push("one-start");
      await first.promise;
      trace.push("one-fail");
      throw Error("failure");
    });
    const two = session.runInScope("same", signal.signal, () => {
      trace.push("two");
      return 2;
    });
    const other = session.runInScope("other", signal.signal, () => {
      trace.push("other");
      return 3;
    });
    await other;
    signal.abort(Error("cancelled"));
    await assert.rejects(
      session.runInScope("same", signal.signal, () => trace.push("never")),
      /cancelled/,
    );
    // Original only checks abort at enqueue. The execution callback checks again.
    first.resolve();
    await assert.rejects(one, /failure/);
    assert.equal(await two, 2);
    await Promise.resolve();
    assert.equal(session.scopeOperations.size, 0);
    return trace;
  }
  assert.deepEqual(await scenario(false), await scenario(true));
});

test("kernel channel termination and suspend/dispose match original", async () => {
  for (const mode of ["single", "multiple", "header", "reset"]) {
    async function scenario(original: boolean) {
      const { session, trace } = setup(original, mode);
      const scopes = mode === "multiple" ? ["a", "b"] : ["a"];
      session.scopeIdsByChannel.set("main", new Set(scopes));
      for (const scope of scopes)
        session.browserControlChallenges.set(scope, {
          challenge: "c",
          instanceId: "i",
        });
      try {
        trace.push(
          await session.onSessionTerminated({
            headers: mode === "header" ? { "McP-SeSsIoN-Id": "x" } : {},
          }),
        );
      } catch (error) {
        trace.push((error as Error).message);
      }
      trace.push(
        [...session.scopeIdsByChannel].map(([key, values]: any) => [
          key,
          [...values],
        ]),
        [...session.browserControlChallenges.keys()],
      );
      session.suspend();
      session.dispose();
      await Promise.resolve();
      assert.equal(session.scopeIdsByChannel.size, 0);
      return trace;
    }
    assert.deepEqual(await scenario(false), await scenario(true), mode);
  }
});

test("turn end matches original cancellation and PDF cleanup on success and failure", async () => {
  for (const failed of ["", "turn", "pdf-b"]) {
    async function scenario(original: boolean) {
      const { session, trace } = setup(original, failed);
      const turn = JSON.stringify(["scope", "child", "turn"]);
      const current = new AbortController();
      const unrelated = new AbortController();
      session.jsCalls.set(current, turn);
      session.jsCalls.set(unrelated, "other-turn");
      session.pdfUploadsByTurn.set(turn, new Set(["pdf-a", "pdf-b"]));
      const pending = deferred();
      const running = session.runInScope(
        "scope",
        new AbortController().signal,
        () => pending.promise,
      );
      const ended = session.turnEnded(new AbortController().signal, {
        scopeId: "scope",
        turnMetadata: {
          thread_source: "subagent",
          thread_id: "child",
          session_id: "parent",
          turn_id: "turn",
        },
      });
      assert.equal(current.signal.aborted, true);
      assert.equal(unrelated.signal.aborted, false);
      assert.equal(trace.length, 0); // waits for in-flight execution to finish
      pending.resolve();
      await running;
      try {
        trace.push(await ended);
      } catch (error) {
        trace.push((error as Error).message);
      }
      trace.push(
        [...session.pdfUploadsByTurn].map(([key, values]: any) => [
          key,
          [...values],
        ]),
      );
      return trace;
    }
    assert.deepEqual(await scenario(false), await scenario(true), failed);
  }
});

test("cleanup metadata matches original subagent identity and validation", () => {
  const { Pl } = extensionBindings(["Pl"], {});
  for (const metadata of [
    undefined,
    null,
    {},
    { session_id: "a", turn_id: "b" },
    {
      session_id: "parent",
      thread_source: "subagent",
      thread_id: "child",
      turn_id: "t",
    },
    { thread_source: "subagent", session_id: "a", turn_id: "b" },
    { session_id: 42, turn_id: "t" },
  ]) {
    const capture = (fn: Function) => {
      try {
        return fn(metadata);
      } catch (error) {
        return (error as Error).message;
      }
    };
    assert.deepEqual(capture(kernelTurnCleanupMetadata), capture(Pl));
  }
});
