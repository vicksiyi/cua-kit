import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createFaviconResourceReader } from "../packages/browser-extension/src/favicon_resource";
async function run(
  original: boolean,
  mode: string,
  size: number,
  fallback: string | undefined = "image/bmp",
) {
  const trace: any[] = [];
  let timeout!: () => void;
  const timer = (fn: () => void, ms: number) => {
    trace.push(["timer", ms]);
    timeout = fn;
    return 1;
  };
  const clear = (id: number) => trace.push(["clear", id]);
  const chrome: any = {
    runtime: {
      getURL(path: string) {
        trace.push(["getURL", path]);
        return `chrome-extension://fixture${path}`;
      },
    },
  };
  const fetch = async (url: string, options: any) => {
    trace.push(["fetch", url, options.credentials, options.signal.aborted]);
    if (mode === "throw") throw Error("fetch failed");
    if (mode === "abort") {
      const pending = new Promise<never>((_, reject) =>
        options.signal.addEventListener("abort", () => {
          trace.push(["aborted"]);
          reject(Error("aborted"));
        }),
      );
      timeout();
      return await pending;
    }
    const headers = new Map<string, string>();
    if (mode !== "missing-type" && mode !== "missing-no-fallback")
      headers.set(
        "content-type",
        mode === "bad-type"
          ? "text/html"
          : mode === "uppercase-type"
            ? "Image/PNG"
            : "image/png",
      );
    if (mode === "declared" || mode === "cancel-fail")
      headers.set("content-length", String(size));
    if (mode === "invalid-length") headers.set("content-length", "invalid");
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 256);
    let offset = 0;
    const cancel = async () => {
      trace.push(["cancel"]);
      if (mode === "cancel-fail") throw Error("cancel failed");
    };
    return {
      ok: mode !== "not-ok",
      headers: { get: (key: string) => headers.get(key) ?? null },
      body:
        mode === "no-body"
          ? null
          : {
              cancel,
              getReader() {
                return {
                  cancel,
                  async read() {
                    trace.push(["read", offset]);
                    if (mode === "read-fail") throw Error("read failed");
                    if (offset >= size) return { done: true };
                    const value = bytes.slice(offset, offset + 20000);
                    offset += value.length;
                    return { done: false, value };
                  },
                };
              },
            },
      async arrayBuffer() {
        trace.push(["arrayBuffer"]);
        return bytes.buffer;
      },
    };
  };
  const api = original
    ? extensionBindings(["dS", "xa", "pS", "mS", "gS", "_S"], {
        chrome,
        fetch,
        setTimeout: timer,
        clearTimeout: clear,
      })
    : createFaviconResourceReader({
        chrome,
        fetch: fetch as any,
        setTimeout: timer as any,
        clearTimeout: clear as any,
      });
  const value =
    mode === "page"
      ? await (original ? api.pS : api.readPageFavicon)(
          "https://example.test/path?q=a&b=中#fragment",
        )
      : await (original ? api.mS : api.readImage)(
          "https://fixture/favicon",
          mode === "missing-no-fallback" ? undefined : fallback,
        );
  return { value, trace };
}
test("favicon resource reader preserves original URL, MIME, bounded streaming and base64 behavior", async () => {
  for (const mode of [
    "stream",
    "declared",
    "invalid-length",
    "no-body",
    "missing-type",
    "missing-no-fallback",
    "bad-type",
    "uppercase-type",
    "not-ok",
    "read-fail",
    "cancel-fail",
    "throw",
    "page",
  ])
    for (const size of [0, 1, 32769, 65536, 65537])
      assert.deepEqual(
        await run(false, mode, size),
        await run(true, mode, size),
        `${mode}:${size}`,
      );
  assert.equal(
    (await run(false, "stream", 1)).value,
    "data:image/png;base64,AA==",
  );
  assert.equal((await run(false, "declared", 65537)).value, null);
  assert.equal(
    (await run(false, "missing-type", 1)).value,
    "data:image/bmp;base64,AA==",
  );
  assert.deepEqual(
    await run(false, "missing-type", 1, undefined),
    await run(true, "missing-type", 1, undefined),
  );
});
test("favicon fetch deadline aborts and clears timer with original null result", async () => {
  const actual = await run(false, "abort", 1);
  assert.deepEqual(actual, await run(true, "abort", 1));
  assert.equal(actual.value, null);
  assert.ok(actual.trace.some((entry) => entry[0] === "aborted"));
  assert.deepEqual(actual.trace.at(-1), ["clear", 1]);
});
