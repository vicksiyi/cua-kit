import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import { readTabContext } from "../packages/browser/dist/service/context/tab_context.js";
import { ServiceBrowserUser } from "../packages/browser/dist/service/context/browser_user.js";
const b = originalServiceBindings([
  "SA",
  "ui",
  "Fc",
  "Yv",
  "Zh",
  "Qh",
  "lS",
  "NF",
  "Kne",
  "FF",
  "Jne",
  "Yne",
  "LF",
  "lg",
]);
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : e };
  }
}
test("tab context preserves page validation, workspace export fallback and YouTube selection/transcript order", async () => {
  async function run(fn: any, mode: string) {
    const trace: any[] = [];
    const expectedUrl = mode.startsWith("workspace")
      ? "https://docs.google.com/document/d/id/edit"
      : mode.startsWith("video")
        ? "https://www.youtube.com/watch?v=abcdefghijk"
        : "https://example.com";
    const read = async (request: any) => {
      trace.push(request);
      switch (request.kind) {
        case "page":
          return {
            url: mode === "wrongurl" ? "wrong" : expectedUrl,
            title: "Title - Google Docs",
            text: "body",
            truncated: false,
          };
        case "googleWorkspaceExport":
          if (mode === "workspacechanged")
            throw Error("The selected tab changed while being read");
          if (mode === "workspacelarge")
            return {
              errorMessage:
                "Google Workspace export is too large for in-memory tab context",
            };
          if (mode === "workspacefallback" && request.format === "md")
            return { redirectUrl: "redirect" };
          return { base64: btoa("# Text\n[a]: <data:x>\n"), truncated: true };
        case "selection":
          return {
            text: mode === "videoselection" ? "chosen" : " body ",
            truncated: false,
          };
        case "youtubeTranscript":
          return {
            pageUrl: mode === "videowrong" ? "wrong" : expectedUrl,
            text: "transcript",
            truncated: true,
          };
      }
    };
    return { result: await outcome(() => fn({ expectedUrl, read })), trace };
  }
  for (const mode of [
    "plain",
    "wrongurl",
    "workspace",
    "workspacefallback",
    "workspacechanged",
    "workspacelarge",
    "video",
    "videoselection",
    "videowrong",
  ])
    assert.deepEqual(await run(readTabContext, mode), await run(b.LF, mode));
});
test("service browser user prioritizes PDF library capture and preserves spread override order", async () => {
  async function run(Class: any, capture: boolean) {
    const trace: any[] = [];
    const api = {
      async getUserTabs() {
        return [1];
      },
      async claimUserTab(id: any) {
        trace.push(["claim", id]);
        return { id };
      },
      async executeTabRead(req: any) {
        trace.push(req);
        return {
          url: req.expectedUrl,
          title: "page",
          text: "body",
          truncated: false,
        };
      },
    };
    const o = new Class(api, async (req: any) => {
      trace.push(["capture", req]);
      return capture
        ? {
            kind: "source-kind",
            mimeType: "wrong",
            url: "wrong",
            fileId: "file",
          }
        : null;
    });
    return {
      tabs: await o.openTabs(),
      claim: await o.claimTab(1),
      context: await o.getTabContext(1, "https://example.com"),
      trace,
      fields: Object.keys(o),
    };
  }
  for (const capture of [true, false])
    assert.deepEqual(
      await run(ServiceBrowserUser, capture),
      await run(b.lg, capture),
    );
});
