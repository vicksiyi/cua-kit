import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import * as tabs from "../packages/browser/src/service/commands/tabs";
import {
  TabGetJsDialogCommand,
  TabHandleJsDialogCommand,
} from "../packages/browser/src/service/commands/dialog";
import { handleJavaScriptDialog } from "../packages/browser/src/service/accessibility/dialog_actions";
const original = originalServiceBindings(
  ["F", "W", "BN", "DN", "Fh", "MN", "NN", "k2", "pF", "L2"],
  { Mv: handleJavaScriptDialog },
);
async function run(command: any, payload: any, mode: string) {
  const trace: any[] = [];
  const tab: any = {
    id: 7,
    providerTabId: "native-7",
    title: "secret title",
    url: "https://fixture.test/",
    sessionControlled: mode === "uncontrolled" ? false : undefined,
  };
  if (mode === "missing-fields") {
    delete tab.title;
    delete tab.url;
  }
  const selected = () => {
    trace.push("selected");
    if (mode === "missing-tab") throw Error("missing");
    return tab;
  };
  const gate = {
    hasManualSavingTab(id: number) {
      trace.push(["gate", id]);
      return mode === "saving";
    },
  };
  const authority = (kind: string) => (url: unknown) => {
    trace.push([kind, url]);
    return {
      async assert() {
        trace.push("assert");
        if (mode === "denied") throw Error("denied");
      },
    };
  };
  const ctx: any = {
    tabs: {
      async create() {
        trace.push("create");
        return selected();
      },
      async get(id: number) {
        trace.push(["get", id]);
        return selected();
      },
      async getActive() {
        return selected();
      },
      async list() {
        trace.push("list");
        return [tab];
      },
    },
    tabLifecycle: {
      recordCreated(id: number) {
        trace.push(["created", id]);
      },
      recordAcquired(id: number) {
        trace.push(["acquired", id]);
        if (mode === "lifecycle-error") throw Error("record failed");
      },
    },
    credentialObservationGate: mode === "no-gate" ? undefined : gate,
    async nameSession(name: string) {
      trace.push(["name", name]);
    },
    acquireAuthority() {
      trace.push("authority");
      return {
        observeContent: authority("observe"),
        actInFrame: authority("act"),
      };
    },
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return tab.url;
      },
    },
    async followSessionTab(id: number) {
      trace.push(["follow", id]);
    },
    cdp: {
      async closeTab(id: number) {
        trace.push(["close", id]);
      },
      getJsDialog(id: number) {
        trace.push(["dialog", id]);
        return mode === "missing-tab"
          ? undefined
          : {
              id: "d",
              type: "prompt",
              message: "hidden",
              defaultPrompt: "hidden",
            };
      },
      activeJsDialog(id: number, dialog: string) {
        trace.push(["active", id, dialog]);
        return { id: dialog, type: "prompt", target: { tabId: id } };
      },
      async callTarget(target: any, method: string, params: any) {
        trace.push(["call", target, method, params]);
      },
      async waitForEvent(id: number, predicate: any, options: any) {
        trace.push([
          "wait",
          id,
          options.timeoutMs,
          predicate({
            method: "Page.javascriptDialogClosed",
            source: { tabId: id },
          }),
        ]);
      },
      deleteJsDialog(id: number, dialog: string) {
        trace.push(["delete", id, dialog]);
      },
    },
  };
  try {
    return { value: await command(payload, ctx), trace };
  } catch (e) {
    return { error: (e as Error).message, trace };
  }
}
test("tab lifecycle and dialog command traces match original projection, gates and validation order", async () => {
  const pairs: any[] = [
    [tabs.CloseTabCommand, original.BN],
    [tabs.CreateTabCommand, original.DN],
    [tabs.GetTabCommand, original.Fh],
    [tabs.ListTabsCommand, original.MN],
    [tabs.NameSessionCommand, original.NN],
    [tabs.SelectedTabCommand, original.k2],
    [TabGetJsDialogCommand, original.pF],
    [TabHandleJsDialogCommand, original.L2],
  ];
  for (const [command, reference] of pairs)
    for (const mode of [
      "normal",
      "uncontrolled",
      "missing-fields",
      "saving",
      "no-gate",
      "missing-tab",
      "lifecycle-error",
      "denied",
    ])
      for (const payload of [
        {
          tab_id: "7",
          name: "  session  ",
          dialog_id: "d",
          action: "accept",
          prompt_text: "answer",
        },
        { tab_id: 0, name: "  ", dialog_id: "d", action: "dismiss" },
      ])
        assert.deepEqual(
          await run(command, payload, mode),
          await run(reference, payload, mode),
        );
  assert.deepEqual(
    (await run(tabs.GetTabCommand, { tab_id: 7 }, "saving")).value,
    { id: "7" },
  );
  assert.deepEqual(
    (await run(tabs.SelectedTabCommand, {}, "lifecycle-error")).value,
    {},
  );
  assert.deepEqual(
    (await run(TabGetJsDialogCommand, { tab_id: 7 }, "normal")).value,
    { dialog: { id: "d", type: "prompt" } },
  );
  const handled = await run(
    TabHandleJsDialogCommand,
    { tab_id: 7, dialog_id: "d", action: "accept", prompt_text: "answer" },
    "normal",
  );
  assert.deepEqual(handled.value, {});
  assert.ok(
    handled.trace.some(
      (row) =>
        Array.isArray(row) &&
        row[0] === "call" &&
        row[3].promptText === "answer",
    ),
  );
});
