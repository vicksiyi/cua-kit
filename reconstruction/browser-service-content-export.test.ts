import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { originalServiceBindings } from "./service-source";
import {
  TabContentExportGSuiteCommand as command,
  workspaceExportUrl,
  workspaceExportBytes,
  cleanExportMarkdown,
} from "../packages/browser/src/service/commands/content_export";
import { googleWorkspaceDocument } from "../packages/browser/src/service/context/tab_context";
const original = originalServiceBindings(
  [
    "F",
    "W",
    "Fc",
    "Jv",
    "Zh",
    "Qh",
    "uF",
    "lne",
    "cne",
    "dne",
    "pne",
    "mne",
    "lF",
    "fne",
    "hne",
    "gne",
  ],
  { crypto },
);
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  const ctx: any = {
    acquireAuthority() {
      trace.push("authority");
      return {
        observeContent(url: string) {
          trace.push(["observe", url]);
          return {
            async assert() {
              trace.push("assert");
              if (mode === "denied") throw Error("denied");
            },
          };
        },
      };
    },
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return "https://docs.google.com/document/d/fixture/edit";
      },
    },
    tabs: {
      async get(id: number) {
        trace.push(["get", id]);
        return {
          url:
            mode === "not-document"
              ? "https://fixture.test/"
              : mode === "unsupported-format"
                ? "https://docs.google.com/presentation/d/fixture/edit"
                : "https://docs.google.com/document/d/fixture/edit?tab=t.1&extra=discard#section",
          title: "A/B - Google Docs",
        };
      },
    },
    cdp: {
      async evaluateJavascript(id: number, expression: string, options: any) {
        trace.push(["evaluate", id, options]);
        if (mode === "no-result") return null;
        if (mode === "invalid-base64") return { base64: "!" };
        return await vm.runInNewContext(expression, {
          Uint8Array,
          btoa,
          fetch: async (url: string, options: any) => {
            trace.push(["fetch", url, options]);
            return {
              ok: mode !== "http-error",
              status: 403,
              arrayBuffer: async () =>
                new TextEncoder().encode(
                  mode === "empty"
                    ? ""
                    : mode === "cleaned-empty"
                      ? "[img]: <data:image/png;base64,AAAA>"
                      : "# Fixture\n\n[img]: <data:image/png;base64,AAAA>\n\nBody",
                ).buffer,
            };
          },
        });
      },
    },
    filesystem: {
      tmpDir: "/tmp/fixture",
      async mkdir(...args: any[]) {
        trace.push(["mkdir", ...args]);
        if (mode === "mkdir-error") throw Error("mkdir failed");
      },
      async writeFile(path: string, bytes: Uint8Array) {
        trace.push(["write", path, [...bytes]]);
        if (mode === "write-error") throw Error("write failed");
      },
    },
  };
  let result;
  try {
    result = {
      value: await (source ? original.lF : command)(
        {
          tab_id: mode === "invalid-tab" ? 0 : "7",
          format:
            mode === "invalid-format" ? "MD" : mode === "binary" ? "pdf" : "md",
        },
        ctx,
      ),
      trace,
    };
  } catch (e) {
    result = {
      error: (e as Error).message,
      cause: ((e as Error).cause as Error)?.message,
      trace,
    };
  }
  return JSON.parse(
    JSON.stringify(result).replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
      "UUID",
    ),
  );
}
test("workspace export command preserves original authorization, page fetch, decode and disk-write ordering", async () => {
  for (const mode of [
    "normal",
    "denied",
    "not-document",
    "unsupported-format",
    "no-result",
    "invalid-base64",
    "http-error",
    "empty",
    "cleaned-empty",
    "mkdir-error",
    "write-error",
    "invalid-tab",
    "invalid-format",
    "binary",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  const normal = await run(false, "normal");
  assert.equal(
    normal.value.path,
    "/tmp/fixture/browser-use/exports/A_B-UUID.md",
  );
  assert.equal(
    new TextDecoder().decode(Uint8Array.from(normal.trace.at(-1)[2])),
    "# Fixture\nBody",
  );
  assert.equal((await run(false, "write-error")).cause, "write failed");
  assert.equal(
    (await run(false, "invalid-format")).trace.some((x: any) => x[0] === "get"),
    false,
  );
  assert.equal((await run(false, "empty")).trace.at(-1)[0], "mkdir");
});
test("workspace URL and markdown transformations match original without broadening formats", () => {
  for (const url of [
    "https://docs.google.com/document/d/a/edit?tab=&x=y#s",
    "https://docs.google.com/spreadsheets/u/0/d/a/edit?tab=t.2",
    "https://docs.google.com/presentation/d/a/edit",
  ])
    for (const format of ["md", "pdf", "xlsx", "csv", "docx", "pptx"])
      assert.equal(
        workspaceExportUrl(googleWorkspaceDocument(url)!, format),
        original.Jv(original.Fc(url), format),
      );
  for (const text of [
    " x ",
    "[x]: <data:image/png;base64,AAAA>\nText",
    "[x]: https://fixture.test/\nText",
    "![x](data:image/png;base64,AAAA)",
    "\n [x]: <data:text/plain,hello>\n",
  ])
    assert.equal(cleanExportMarkdown(text), original.Qh(text));
  const bytes = Uint8Array.from({ length: 70000 }, (_, i) => i % 256);
  const base64 = Buffer.from(bytes).toString("base64");
  assert.deepEqual(workspaceExportBytes({ base64 }, "pdf"), bytes);
});
test("workspace page fetch exports real Chromium response bytes to a temporary file", async () => {
  const { chromium } = await import("playwright");
  const fs = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await fs.mkdtemp(join(tmpdir(), "cua-export-")),
    browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const bytes = Buffer.from(
      Uint8Array.from({ length: 70000 }, (_, i) => i % 256),
    );
    const requests: string[] = [];
    await page.route("https://docs.google.com/**", async (route) => {
      requests.push(route.request().url());
      await route.fulfill(
        route.request().url().includes("/export?")
          ? { status: 200, contentType: "application/pdf", body: bytes }
          : {
              status: 200,
              contentType: "text/html",
              body: "<title>Fixture - Google Docs</title>",
            },
      );
    });
    await page.goto(
      "https://docs.google.com/document/d/fixture/edit?tab=t.1#section",
    );
    const context: any = {
      acquireAuthority: () => ({
        observeContent: () => ({ assert: async () => {} }),
      }),
      security: { currentTabUrl: async () => page.url() },
      tabs: {
        get: async () => ({ url: page.url(), title: await page.title() }),
      },
      cdp: {
        evaluateJavascript: (_id: number, expression: string) =>
          page.evaluate(expression),
      },
      filesystem: {
        tmpDir: directory,
        mkdir: fs.mkdir,
        writeFile: fs.writeFile,
      },
    };
    const result = await command({ tab_id: 7, format: "pdf" }, context);
    assert.deepEqual(await fs.readFile(result.path), bytes);
    assert.match(result.path, /Fixture-[0-9a-f-]+\.pdf$/);
    assert.equal(
      requests.filter((url) => url.includes("/export?format=pdf&tab=t.1"))
        .length,
      1,
    );
  } finally {
    await browser.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
