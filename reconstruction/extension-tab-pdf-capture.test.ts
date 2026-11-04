import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import { extensionBindings } from "./extension-source";
import {
  createTabPdfCapture,
  pdfCaptureFileName,
} from "../packages/browser-extension/src/tab_pdf_capture";
const changed = "The selected tab changed while being read";
function event() {
  const listeners = new Set<Function>();
  return {
    addListener(fn: Function) {
      listeners.add(fn);
    },
    removeListener(fn: Function) {
      listeners.delete(fn);
    },
    emit(value?: unknown) {
      for (const fn of [...listeners]) fn(value);
    },
    listeners,
  };
}

test("PDF background capture sender binding, chunk validation and cleanup match original", async () => {
  for (const mode of [
    "ok",
    "signature",
    "wrong-doc",
    "incognito",
    "wrong-frame",
    "wrong-url",
    "wrong-extension",
    "remote-error",
    "chunk",
    "too-large",
    "disconnect",
    "script-failure",
    "result-doc",
  ]) {
    async function scenario(original: boolean) {
      const trace: unknown[] = [];
      const onConnect = event(),
        onMessage = event(),
        onDisconnect = event();
      let disconnected = false;
      const messages =
        mode === "remote-error"
          ? [{ error: "capture failed" }]
          : mode === "chunk"
            ? [{ data: 12 }]
            : mode === "too-large"
              ? [{ data: "A".repeat(349529) }]
              : [
                  {
                    data: btoa(
                      mode === "signature" ? "WRONG!" : "%PDF-fixture",
                    ),
                  },
                  { done: true },
                ];
      let finish!: () => void;
      const completion = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const port = {
        name: "pdf-capture:uuid",
        sender: {
          id: mode === "wrong-extension" ? "other" : "extension",
          tab: { id: 1, incognito: mode === "incognito" },
          frameId: mode === "wrong-frame" ? 1 : 0,
          documentId: mode === "wrong-doc" ? "other" : "doc",
          url:
            mode === "wrong-url"
              ? "https://other.invalid"
              : "https://fixture.invalid/pdf",
        },
        onMessage,
        onDisconnect,
        postMessage(message: string) {
          trace.push(["post", message]);
          queueMicrotask(() => {
            if (disconnected) return;
            const next = messages.shift();
            if (next) onMessage.emit(next);
            else finish();
          });
        },
        disconnect() {
          if (!disconnected) {
            disconnected = true;
            trace.push("disconnect");
            onDisconnect.emit();
            finish();
          }
        },
      };
      const browser: any = {
        runtime: { id: "extension", onConnect },
        scripting: {
          async executeScript(options: any) {
            trace.push(["script", options.target, options.world, options.args]);
            if (mode === "script-failure") throw Error("injection failed");
            queueMicrotask(() => {
              onConnect.emit(port);
              if (mode === "disconnect") port.disconnect();
            });
            await completion;
            return [{ documentId: mode === "result-doc" ? "other" : "doc" }];
          },
        },
      };
      const { gg } = extensionBindings(["gg", "ol"], {
        chrome: browser,
        crypto: { randomUUID: () => "uuid" },
        cl: 134217728,
        ks: 262144,
        ll: 180000,
        xt: changed,
        _g: () => {},
      });
      const capture = original
        ? gg
        : createTabPdfCapture({
            chrome: browser,
            randomUUID: () => "uuid",
            setInterval,
            clearInterval,
          }).captureBytes;
      try {
        const file = await capture(
          1,
          "https://fixture.invalid/pdf",
          "doc",
          "file.pdf",
          new AbortController().signal,
        );
        trace.push(["file", file.name, file.type, await file.text()]);
      } catch (error) {
        trace.push(["error", (error as Error).message]);
      }
      await Promise.resolve();
      assert.equal(onConnect.listeners.size, 0);
      return trace;
    }
    assert.deepEqual(await scenario(false), await scenario(true), mode);
  }
});

test("PDF filename normalization matches original", () => {
  const { vg } = extensionBindings(["vg"], {});
  for (const title of [
    "",
    "   ",
    "x.pdf",
    "X.PDF",
    "a/b\\c\n",
    "界".repeat(200),
  ])
    for (const url of ["https://example.com/", "https://example.com/name"])
      assert.equal(
        pdfCaptureFileName(title, new URL(url)),
        vg(title, new URL(url)),
      );
});

test("serialized page capture matches original GET, backpressure, bounds and error handling", async () => {
  const input = await readFile(
    new URL(
      "../packages/browser-extension/src/pdf_capture_page.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const compiled = await transform(input, {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  });
  const module = { exports: {} as any };
  new Function("module", "exports", compiled.code)(module, module.exports);
  const serialized = module.exports.capturePdfPage.toString();
  for (const mode of [
    "ok",
    "navigation",
    "content-type",
    "http",
    "empty",
    "response-type",
    "length",
    "stream-size",
    "network",
  ]) {
    async function scenario(original: boolean) {
      const trace: unknown[] = [];
      const onMessage = event(),
        onDisconnect = event();
      const port = {
        onMessage,
        onDisconnect,
        postMessage(message: unknown) {
          trace.push(["message", message]);
          queueMicrotask(() => onMessage.emit("next"));
        },
        disconnect() {
          trace.push("disconnect");
          onDisconnect.emit();
        },
      };
      const globals = {
        chrome: {
          runtime: {
            connect(options: unknown) {
              trace.push(["connect", options]);
              queueMicrotask(() => onMessage.emit("next"));
              return port;
            },
          },
        },
        location: {
          href:
            mode === "navigation"
              ? "https://other.invalid"
              : "https://fixture.invalid/pdf",
        },
        document: {
          contentType:
            mode === "content-type" ? "text/html" : "application/pdf",
        },
        fetch: async (url: unknown, init: any) => {
          trace.push(["fetch", url, init.credentials, init.redirect]);
          if (mode === "network") throw Error("network");
          return new Response(
            mode === "empty"
              ? null
              : mode === "stream-size"
                ? "%PDF-" + "x".repeat(40)
                : "%PDF-fixture",
            {
              status: mode === "http" ? 500 : 200,
              headers: {
                "content-type":
                  mode === "response-type"
                    ? "text/html"
                    : "application/pdf; version=1",
                "content-length": mode === "length" ? "99" : "12",
              },
            },
          );
        },
      };
      const { _g } = extensionBindings(["_g"], globals);
      const restored = new Function(
        ...Object.keys(globals),
        `return (${serialized});`,
      )(...Object.values(globals));
      await (original ? _g : restored)(
        "https://fixture.invalid/pdf",
        "port",
        32,
        4,
        1000,
      );
      return trace;
    }
    assert.deepEqual(await scenario(false), await scenario(true), mode);
  }
});

test("PDF capture-to-Library orchestration matches original navigation recheck and post-upload deletion", async () => {
  for (const mode of [
    "ok",
    "html",
    "before-upload-change",
    "after-upload-change",
  ]) {
    async function scenario(original: boolean) {
      const trace: unknown[] = [];
      const onConnect = event(),
        onMessage = event(),
        onDisconnect = event();
      let tabReads = 0,
        disconnected = false;
      let finish!: () => void;
      const complete = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const chunks = [{ data: btoa("%PDF-fixture") }, { done: true }];
      const port = {
        name: "pdf-capture:uuid",
        sender: {
          id: "extension",
          tab: { id: 1 },
          frameId: 0,
          documentId: "doc",
          url: "https://fixture.invalid/pdf",
        },
        onMessage,
        onDisconnect,
        postMessage() {
          queueMicrotask(() => {
            if (disconnected) return;
            const message = chunks.shift();
            if (message) onMessage.emit(message);
            else finish();
          });
        },
        disconnect() {
          disconnected = true;
          onDisconnect.emit();
          finish();
        },
      };
      const browser: any = {
        tabs: {
          async get() {
            tabReads++;
            trace.push(["tab", tabReads]);
            return {
              url:
                (mode === "before-upload-change" && tabReads === 2) ||
                (mode === "after-upload-change" && tabReads === 3)
                  ? "https://other.invalid"
                  : "https://fixture.invalid/pdf",
            };
          },
        },
        runtime: { id: "extension", onConnect, async getPlatformInfo() {} },
        scripting: {
          async executeScript(options: any) {
            if (options.args) {
              queueMicrotask(() => onConnect.emit(port));
              await complete;
              return [{ documentId: "doc" }];
            }
            if (options.func.toString().includes("contentType"))
              return [
                {
                  documentId: "doc",
                  result: {
                    contentType:
                      mode === "html" ? "text/html" : "application/pdf",
                    title: "Title",
                    url: "https://fixture.invalid/pdf",
                  },
                },
              ];
            return [
              { documentId: "doc", result: "https://fixture.invalid/pdf" },
            ];
          },
        },
      };
      const api: any = {
        signal: new AbortController().signal,
        async request(path: string, init: any, options: any = {}) {
          trace.push(["api", path, init.method]);
          if (path === "/files")
            return {
              status: "success",
              file_id: "file",
              upload_url: "/api/estuary/upload_content_bytes",
            };
          if (path.includes("/estuary/"))
            return await options.readResponse(new Response("uploaded"));
          if (path === "/files/process_upload_stream")
            return await options.readResponse(
              new Response('{"event":"file.processing.completed"}'),
            );
          if (init.method === "DELETE")
            return await options.readResponse(new Response("deleted"));
          return {
            file_id: "file",
            is_library_file: true,
            library_file_id: "library",
          };
        },
      };
      const setHeartbeat: any = (_fn: Function, ms: number) => {
        trace.push(["heartbeat", ms]);
        return 1;
      };
      const clearHeartbeat: any = (id: number) => trace.push(["clear", id]);
      const { mg } = extensionBindings(
        [
          "mg",
          "gg",
          "Rs",
          "ul",
          "vg",
          "ol",
          "rg",
          "il",
          "Lr",
          "sl",
          "ng",
          "Fn",
        ],
        {
          chrome: browser,
          crypto: { randomUUID: () => "uuid" },
          cl: 134217728,
          ks: 262144,
          ll: 180000,
          xt: changed,
          Xt: "https://chatgpt.com",
          _g: () => {},
          setInterval: setHeartbeat,
          clearInterval: clearHeartbeat,
        },
      );
      const restored = createTabPdfCapture({
        chrome: browser,
        randomUUID: () => "uuid",
        setInterval: setHeartbeat,
        clearInterval: clearHeartbeat,
      });
      try {
        trace.push([
          "result",
          await (original ? mg : restored.captureToLibrary)(
            { tabId: 1, expectedUrl: "https://fixture.invalid/pdf" },
            api,
            new AbortController().signal,
          ),
        ]);
      } catch (error) {
        trace.push(["error", (error as Error).message]);
      }
      return trace;
    }
    assert.deepEqual(await scenario(false), await scenario(true), mode);
  }
});
