import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createContentRuntime,
  isFaviconBadgeUrl,
} from "../packages/browser-extension/src/content_runtime";
function fixture(original: boolean, mode: string) {
  const trace: any[] = [],
    timers = new Map<number, () => void>(),
    injected = new Set<number>();
  let nextId = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const host: any = {
    setTimeout(callback: () => void, ms: number) {
      const id = ++nextId;
      trace.push(["timer", id, ms]);
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id: number) {
      trace.push(["clear", id]);
      timers.delete(id);
    },
    chrome: {
      tabs: {
        async sendMessage(tabId: number, body: any) {
          trace.push(["ping", tabId, body]);
          if (mode === "ping-throw") throw Error("no receiver");
          if (mode === "ping-timeout") await gate;
          return { ok: mode === "ready" || injected.has(tabId) };
        },
      },
      scripting: {
        async executeScript(options: any) {
          trace.push(["inject", options]);
          if (mode === "inject-throw") throw Error("injection failed");
          if (mode === "held" || mode === "inject-timeout") await gate;
          if (mode === "inject-null") return null;
          injected.add(options.target.tabId);
          return [];
        },
      },
    },
  };
  const bindings = original
    ? extensionBindings(["Ea", "gy", "Mu", "Ta", "de", "_y"], {
        chrome: host.chrome,
        setTimeout: host.setTimeout,
        clearTimeout: host.clearTimeout,
      })
    : null;
  const restored = original ? null : createContentRuntime(host);
  return {
    ensure: original ? bindings.Mu : restored!.ensureContentScript,
    timeout: original ? bindings.de : restored!.withTimeout,
    trace,
    timers,
    release,
  };
}
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}
test("content readiness preserves initial ping, per-tab injection deduplication and reinjection after failure", async () => {
  async function run(original: boolean, mode: string) {
    const f = fixture(original, mode);
    const first = f.ensure(1),
      second = f.ensure(1),
      other = f.ensure(2);
    await flush();
    f.release();
    const values = await Promise.all([first, second, other]);
    values.push(await f.ensure(1));
    await flush();
    assert.equal(f.timers.size, 0);
    return { values, trace: f.trace };
  }
  for (const mode of [
    "ready",
    "held",
    "inject-throw",
    "inject-null",
    "ping-throw",
  ]) {
    const actual = await run(false, mode);
    assert.deepEqual(actual, await run(true, mode), mode);
    if (mode === "held")
      assert.equal(
        actual.trace.filter((entry) => entry[0] === "inject").length,
        2,
      );
    if (mode === "inject-throw")
      assert.deepEqual(actual.values, [false, false, false, false]);
  }
});
test("bounded content waits resolve null on deadline without cancelling late work and preserve rejection", async () => {
  async function run(original: boolean) {
    const f = fixture(original, "inject-timeout");
    const pending = f.ensure(1);
    await flush();
    assert.equal(f.timers.size, 1);
    [...f.timers.values()][0]();
    assert.equal(await pending, false);
    f.release();
    await flush();
    assert.equal(f.timers.size, 0);
    const value = await f.timeout(Promise.resolve("value"), 250);
    let error;
    try {
      await f.timeout(Promise.reject(Error("failure")));
    } catch (e: any) {
      error = e.message;
    }
    return { trace: f.trace, value, error };
  }
  assert.deepEqual(await run(false), await run(true));
});
test("favicon badge URL recognition matches original prefix, percent decode and exact marker", () => {
  const original = extensionBindings(["rS", "Gu"], {});
  const marker = 'data-codex-favicon-badge="codex-favicon-badge"';
  for (const value of [
    undefined,
    null,
    "",
    `data:image/svg+xml,${encodeURIComponent("<svg " + marker + "/>")}`,
    `data:image/svg+xml,${marker}`,
    `data:image/svg+xml;base64,${btoa(marker)}`,
    "data:image/svg+xml,%invalid",
    "https://example.test/icon",
    'data:image/svg+xml,data-codex-favicon-badge="other"',
  ])
    assert.equal(isFaviconBadgeUrl(value), original.Gu(value));
});
