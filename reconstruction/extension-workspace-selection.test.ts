import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { runInNewContext } from "node:vm";
import {
  captureWorkspaceSelection,
  googleWorkspaceDocument,
  googleWorkspaceExportFormats,
  googleWorkspaceExportUrl,
  exportFileStem,
  stripWorkspaceInlineDataReferences,
} from "../packages/browser-extension/src/google_workspace";
import { createSidePanelSelectionCapture } from "../packages/browser-extension/src/side_panel_selection_capture";
const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
async function bindings(file: string, hash: string) {
  const source = await readFile(`${root}/chunks/${file}`, "utf8");
  assert.equal(createHash("sha256").update(source).digest("hex"), hash);
  const body: any = (
    parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any
  ).body;
  return (name: string) => {
    const n = body.find(
      (n: any) => n.type === "FunctionDeclaration" && n.id.name === name,
    );
    return source.slice(n.start, n.end);
  };
}
const workspace = await bindings(
  "google-workspace-B6IvXzEl.js",
  "a3fabfffeec68d0dceb204c9ad0efe244e93f3b99edcce0a8edb170266ff7dc0",
);
const sidepanel = await bindings(
  "codex-work-sidepanel-Cy6MdlEo.js",
  "3c34166181949c77a2123425bb7dc95d913af693b319c5559cc02416e965ad7b",
);
const original = (name: string) =>
  new Function(`return (${workspace(name)})`)();
test("Workspace shared helpers match installed chunk", () => {
  for (const value of [
    null,
    "invalid",
    "https://docs.google.com/document/d/a/edit?tab=t#h",
    "http://docs.google.com/spreadsheets/u/0/d/b/edit",
    "https://docs.google.com/presentation/d/c/pub",
    "https://docs.google.com:8443/document/d/a/edit",
  ]) {
    assert.deepEqual(googleWorkspaceDocument(value), original("i")(value));
    const doc = googleWorkspaceDocument(value);
    if (doc)
      for (const format of googleWorkspaceExportFormats(doc.docType)!)
        assert.equal(
          googleWorkspaceExportUrl(doc, format),
          original("p")(doc, format),
        );
  }
  for (const type of ["document", "presentation", "spreadsheets"] as const)
    assert.deepEqual(googleWorkspaceExportFormats(type), original("u")(type));
  for (const title of [
    null,
    " - Google Docs",
    "A/B - Google Sheets",
    "  ",
    "a - b",
  ])
    assert.equal(exportFileStem(title), original("d")(title));
  for (const text of [
    " [a]: <data:image/png;abc>\nHello",
    "[link]: <https://example.com>\n",
    "  plain  ",
  ])
    assert.equal(stripWorkspaceInlineDataReferences(text), original("f")(text));
});
test("serialized Workspace copy capture preserves frame realm, checks and truncation", () => {
  for (const mode of [
    "normal",
    "iframe",
    "cross-origin-frame",
    "missing-api",
    "wrong-origin",
    "wrong-url",
    "empty",
  ]) {
    function scenario(restored: boolean) {
      const trace: any[] = [];
      class DataTransfer {
        getData(type: string) {
          trace.push(type);
          return mode === "empty" ? "" : "selected text";
        }
      }
      class ClipboardEvent {
        constructor(
          public type: string,
          public options: any,
        ) {}
      }
      const view: any = { DataTransfer, ClipboardEvent };
      if (mode === "missing-api") delete view.DataTransfer;
      const target: any = {
        ownerDocument: { defaultView: view },
        dispatchEvent(event: any) {
          trace.push([
            event.type,
            event.options.bubbles,
            event.options.cancelable,
            event.options.composed,
          ]);
        },
      };
      class HTMLIFrameElement {
        get contentDocument(): any {
          if (mode === "cross-origin-frame") throw Error("cross origin");
          return { activeElement: target };
        }
        ownerDocument = target.ownerDocument;
        dispatchEvent = target.dispatchEvent;
      }
      const active = mode.includes("frame") ? new HTMLIFrameElement() : target;
      const context = {
        location: {
          origin: "https://docs.google.com",
          href: "https://docs.google.com/document/d/x/edit",
        },
        document: { activeElement: active, body: target },
        window: view,
        HTMLIFrameElement,
        __name: (fn: Function) => fn,
      };
      const fn = runInNewContext(
        `(${restored ? captureWorkspaceSelection.toString() : workspace("m")})`,
        context,
      );
      const result = fn(
        mode === "wrong-origin"
          ? "https://other.invalid"
          : context.location.origin,
        mode === "wrong-url"
          ? "https://docs.google.com/other"
          : context.location.href,
        8,
      );
      return JSON.parse(JSON.stringify({ result, trace }));
    }
    assert.deepEqual(scenario(true), scenario(false), mode);
  }
});
test("selection recovery orchestration pins document and respects stale generations", async () => {
  for (const mode of [
    "normal",
    "sheets",
    "plain",
    "no-recovery",
    "no-document",
    "stale-before",
    "stale-initial",
    "stale-recovery",
    "empty",
    "throw",
  ]) {
    async function scenario(restored: boolean) {
      let calls = 0;
      const trace: any[] = [];
      const browser: any = {
        scripting: {
          async executeScript(input: any) {
            calls++;
            trace.push({
              args: input.args,
              target: input.target,
              world: input.world,
            });
            if (mode === "throw" && calls === 2) throw Error("script failed");
            return [
              {
                documentId: mode === "no-document" ? undefined : "doc",
                result:
                  calls === 1
                    ? {
                        needsRecovery: mode !== "no-recovery",
                        captureGeneration: 4,
                      }
                    : calls === 2
                      ? { selectedText: mode === "empty" ? "  " : " restored " }
                      : { selectedText: "final" },
              },
            ];
          },
        },
      };
      const current = () =>
        !(
          mode === "stale-before" ||
          (mode === "stale-initial" && calls === 1) ||
          (mode === "stale-recovery" && calls === 2)
        );
      const fn = restored
        ? createSidePanelSelectionCapture(browser)
        : new Function(
            "chrome",
            "_e",
            "Ee",
            "Ke",
            `return (${sidepanel("pe")})`,
          )(
            browser,
            original("i"),
            () => {},
            () => {},
          );
      let result;
      try {
        result = await fn(
          7,
          mode === "plain"
            ? "https://example.com/"
            : `https://docs.google.com/${mode === "sheets" ? "spreadsheets" : "document"}/d/x/edit`,
          "observer",
          current,
        );
      } catch (e) {
        result = (e as Error).message;
      }
      return JSON.parse(JSON.stringify({ trace, result }));
    }
    assert.deepEqual(await scenario(true), await scenario(false), mode);
  }
});
