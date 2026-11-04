import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { extensionBindings } from "./extension-source";
import {
  createTabReader,
  dispatchTabRead,
  captureTabSelection,
} from "../packages/browser-extension/src/tab_read";
const original = extensionBindings(
  [
    "my",
    "hg",
    "ig",
    "sg",
    "ag",
    "am",
    "om",
    "cm",
    "lm",
    "um",
    "fg",
    "og",
    "al",
    "xn",
    "ms",
  ],
  {
    chrome: {},
    ug: 80000,
    lg: 32 * 1024 * 1024,
    cg: "Google Workspace export is too large for in-memory tab context",
    xt: "The selected tab changed while being read",
  },
);
const settle = async (fn: () => unknown) => {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { name: error.name, message: error.message };
  }
};
const plain = (value: any) => JSON.parse(JSON.stringify(value));

test("tab read dispatcher matches original branch validation, arguments and execution worlds", async () => {
  const cases: any[] = [
    ["https://page.test/", { kind: "page" }],
    ["https://page.test/", { kind: "selection" }],
    [
      "https://docs.google.com/document/d/abc/edit?tab=one#section",
      { kind: "googleWorkspaceExport", format: "md" },
    ],
    [
      "https://docs.google.com/presentation/d/abc/edit",
      { kind: "googleWorkspaceExport", format: "pdf" },
    ],
    [
      "https://docs.google.com/spreadsheets/d/abc/edit",
      { kind: "googleWorkspaceExport", format: "xlsx" },
    ],
    [
      "https://docs.google.com/presentation/d/abc/edit",
      { kind: "googleWorkspaceExport", format: "md" },
    ],
    ["https://page.test/", { kind: "googleWorkspaceExport", format: "pdf" }],
    [
      "https://www.youtube.com/watch?v=abcdefghijk",
      { kind: "youtubeTranscript" },
    ],
    ["https://youtu.be/abcdefghijk", { kind: "youtubeTranscript" }],
    ["https://page.test/", { kind: "other" }],
  ];
  for (const [url, read] of cases) {
    const outputs = [];
    for (const restored of [false, true]) {
      const calls: any[] = [];
      const result = await settle(() =>
        (restored ? dispatchTabRead : original.hg)(
          url,
          read,
          async (_fn: any, args: any, world: any) => {
            calls.push({ args, world });
            return read.kind === "youtubeTranscript"
              ? {
                  body: JSON.stringify({
                    events: [
                      {
                        tStartMs: 1234,
                        segs: [{ utf8: "Example transcript" }],
                      },
                    ],
                  }),
                  captionKind: null,
                  captionLanguage: "en",
                  pageUrl: url,
                }
              : { value: "page-result" };
          },
        ),
      );
      outputs.push({ result, calls });
    }
    assert.deepEqual(outputs[1], outputs[0]);
  }
});

test("tab reader retains HTTP-only, pre/post navigation and incognito guards", async () => {
  for (const mode of [
    "normal",
    "before-url",
    "after-url",
    "before-private",
    "after-private",
    "before-error",
    "after-error",
    "script-error",
    "no-result",
    "null-result",
    "unsupported-url",
  ]) {
    const outputs = [];
    for (const restored of [false, true]) {
      let gets = 0;
      const trace: any[] = [];
      const expectedUrl =
        mode === "unsupported-url" ? "file:///local" : "https://page.test/";
      const chrome: any = {
        tabs: {
          get: async (id: number) => {
            trace.push(["get", id]);
            gets++;
            if (mode === (gets === 1 ? "before-error" : "after-error"))
              throw Error("get failed");
            return {
              url:
                mode === (gets === 1 ? "before-url" : "after-url")
                  ? "https://changed.test/"
                  : expectedUrl,
              incognito:
                mode === (gets === 1 ? "before-private" : "after-private"),
            };
          },
        },
        scripting: {
          executeScript: async ({ func: _fn, ...args }: any) => {
            trace.push(["execute", args]);
            if (mode === "script-error") throw Error("script");
            return mode === "no-result"
              ? []
              : [{ result: mode === "null-result" ? null : "read-result" }];
          },
        },
      };
      const read = restored
        ? createTabReader(chrome)
        : extensionBindings(["my"], {
            chrome,
            xt: "The selected tab changed while being read",
            hg: original.hg,
          }).my;
      outputs.push({
        result: await settle(() =>
          read({ expectedUrl, tabId: 7, read: { kind: "page" } }),
        ),
        trace,
      });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

test("serialized Workspace export matches original streaming, limits, redirects and UTF-8 truncation", async () => {
  const built = await build({
    entryPoints: ["packages/browser-extension/src/tab_read.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "TabRead",
    platform: "browser",
  });
  for (const mode of [
    "normal",
    "origin",
    "http",
    "redirect",
    "invalid-url",
    "header-large",
    "header-large-text",
    "blob",
    "blob-truncate",
    "stream-binary-overflow",
    "stream-text-overflow",
    "cancel-error",
    "fetch-error",
    "empty",
  ]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      const bytes = new TextEncoder().encode(mode === "empty" ? "" : "ab🧪cd");
      let read = 0;
      const truncated = [
        "header-large-text",
        "blob-truncate",
        "stream-text-overflow",
      ].includes(mode);
      const limit = [
        "blob-truncate",
        "stream-binary-overflow",
        "stream-text-overflow",
        "cancel-error",
      ].includes(mode)
        ? 4
        : 50;
      const globals = {
        URL,
        Uint8Array,
        Number,
        String,
        Error,
        btoa,
        location: {
          origin:
            mode === "origin"
              ? "https://other.test"
              : "https://docs.google.com",
        },
        fetch: async (url: string, options: any) => {
          trace.push(["fetch", url, options]);
          if (mode === "fetch-error") throw Error("fetch");
          return {
            ok: mode !== "http",
            status: 403,
            url:
              mode === "redirect"
                ? "https://other.test/export"
                : mode === "invalid-url"
                  ? "bad"
                  : "https://docs.google.com/export",
            headers: {
              get: () => (mode.startsWith("header-large") ? "100" : null),
            },
            body: mode.startsWith("blob")
              ? null
              : {
                  cancel: async () => {
                    trace.push("body-cancel");
                  },
                  getReader: () => ({
                    read: async () => {
                      trace.push("read");
                      return read++ === 0
                        ? { done: false, value: bytes }
                        : { done: true };
                    },
                    cancel: async () => {
                      trace.push("reader-cancel");
                      if (mode === "cancel-error") throw Error("cancel");
                    },
                  }),
                },
            blob: async () => new Blob([bytes]),
          };
        },
      };
      const capture = vm.runInNewContext(
        restored
          ? `${built.outputFiles[0].text};TabRead.captureWorkspaceExport`
          : `(${original.og.toString()})`,
        globals,
      );
      const result = await settle(() =>
        capture(
          "https://docs.google.com",
          "https://docs.google.com/export",
          limit,
          "too large",
          truncated,
        ),
      );
      outputs.push(plain({ result, trace }));
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

test("selection capture matches original URL guard, whitespace and truncation", () => {
  for (const selected of [null, "", "  ", " selected text ", "🧪text"])
    for (const max of [0, 1, 5, 80000])
      for (const same of [true, false]) {
        const results = [original.fg, captureTabSelection].map((fn) =>
          vm.runInNewContext(
            `(${fn.toString()})('https://page.test/',${max})`,
            {
              location: {
                href: same ? "https://page.test/" : "https://other.test/",
              },
              getSelection: () =>
                selected == null ? null : { toString: () => selected },
            },
          ),
        );
        assert.deepEqual(plain(results[1]), plain(results[0]));
      }
});
