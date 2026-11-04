import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createExtensionInstanceIdReader,
  parseExtensionInstanceId,
} from "../packages/browser-extension/src/instance_id";
const originalValidator = extensionBindings(["Pp", "gc", "us"], {});
test("extension instance identity preserves original length, whitespace and UTF-16 validation", () => {
  for (const value of [
    undefined,
    null,
    1,
    {},
    "",
    " ",
    "\n",
    " id ",
    "not-a-uuid",
    "x".repeat(128),
    "x".repeat(129),
    "😀".repeat(64),
    "😀".repeat(65),
    "\ud800",
    "\udc00",
    "a\ud800b",
    "\ud800\udc00",
    "\ud800\ud800\udc00",
    "\0id",
  ])
    assert.equal(parseExtensionInstanceId(value), originalValidator.gc(value));
});
function fixture(original: boolean, initial?: any) {
  const trace: any[] = [];
  let stored = initial,
    count = 0;
  const state = { fail: "", hold: false };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chrome: any = {
    storage: {
      local: {
        async get(key: string) {
          trace.push(["get", key]);
          if (state.hold) await gate;
          if (state.fail === "get") throw Error("get failed");
          return { [key]: stored };
        },
        async remove(key: string) {
          trace.push(["local.remove", key]);
          if (state.fail === "local.remove") throw Error("local.remove failed");
        },
        async set(value: any) {
          trace.push(["set", value]);
          if (state.fail === "set") throw Error("set failed");
          stored = value.extensionInstanceId;
        },
      },
      session: {
        async remove(key: string) {
          trace.push(["session.remove", key]);
          if (state.fail === "session.remove")
            throw Error("session.remove failed");
        },
      },
    },
  };
  const crypto: any = {
    randomUUID() {
      const id = `fixture:${++count}`;
      trace.push(["uuid", id]);
      return id;
    },
  };
  const reader = original
    ? extensionBindings(["Be", "Kg", "Pp", "gc", "us"], {
        chrome,
        crypto,
        Ns: undefined,
      }).Be
    : createExtensionInstanceIdReader({ chrome, crypto });
  return { reader, trace, state, release };
}
const outcome = async (run: () => Promise<any>) => {
  try {
    return await run();
  } catch (error: any) {
    return { error: error.message };
  }
};
test("extension instance reader deduplicates concurrent startup and preserves cleanup-before-generation", async () => {
  for (const stored of [" existing ", undefined, "\ud800"]) {
    const run = async (original: boolean) => {
      const f = fixture(original, stored);
      f.state.hold = true;
      const first = f.reader(),
        second = f.reader();
      assert.equal(first, second);
      f.release();
      const values = [await first, await second, await f.reader()];
      return { values, trace: f.trace };
    };
    assert.deepEqual(await run(false), await run(true));
  }
  const f = fixture(false);
  await f.reader();
  assert.deepEqual(
    f.trace.map((entry) => entry[0]),
    ["get", "session.remove", "local.remove", "uuid", "set"],
  );
});
test("extension instance reader clears rejected cache for retry at every storage boundary", async () => {
  for (const failure of ["get", "session.remove", "local.remove", "set"]) {
    const run = async (original: boolean) => {
      const f = fixture(original);
      f.state.fail = failure;
      const first = await outcome(f.reader);
      f.state.fail = "";
      const second = await f.reader();
      return { first, second, trace: f.trace };
    };
    assert.deepEqual(await run(false), await run(true));
  }
});
