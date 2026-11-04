import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createKernelControlClass } from "../packages/browser-extension/src/kernel_control";
import { CloudRequirementsClient, CloudBrowserSettingsClient } from "../packages/browser-extension/src/cloud_clients";

test("assembled kernel control matches source policy, storage, cloud identity and PDF cleanup", async () => {
  for (const mode of ["normal", "bad-pages", "feature-error", "abort-config", "bad-session", "abort-storage", "pdf-null", "pdf-abort", "pdf-dispose", "pdf-callback", "pdf-no-cleanup", "pdf-delete-error"]) {
    const results = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      const abort = new AbortController(), disposal = new AbortController();
      const api: any = { signal: abort.signal, account: { structure: "personal" }, request: async (path: string, init: any) => {
        trace.push(["request", path, init?.method ?? null]);
        return { rules: {}, marker: "settings" };
      } };
      const scope: any = { signal: abort.signal, disposalSignal: disposal.signal, chatApi: api, content: [], client: {},
        onPdfUploaded: mode === "pdf-no-cleanup" ? undefined : (pdf: any) => {
          trace.push(["uploaded", pdf]);
          if (mode === "pdf-callback" || mode === "pdf-delete-error") throw new Error("callback");
        } };
      const host: any = {
        getScope: () => { if (abort.signal.aborted) throw abort.signal.reason; return scope; },
        defaultAllowedPages: ["installed"], siteStatusUrl: new URL("https://chatgpt.com/aura/site_status"), fetch,
        getConfig: async (name: string) => {
          trace.push(["config", name]);
          if (mode === "feature-error") throw new Error("config");
          if (mode === "abort-config") abort.abort(new Error("aborted"));
          return { get: (key: string) => key === "allowed_pages" ? (mode === "bad-pages" ? [1] : ["page"]) : true };
        },
        isEnabled: async (name: string) => { trace.push(["gate", name]); if (mode === "feature-error") throw Error("gate"); return true; },
        storage: {
          get: async (key: string) => { trace.push(["get", key]); return { [key]: mode === "bad-session" ? [] : { enabled: true } }; },
          set: async (value: any) => { trace.push(["set", value]); if (mode === "abort-storage") abort.abort(Error("storage-abort")); },
        },
        capturePdf: async (params: any, actualApi: any, signal: AbortSignal) => {
          assert.equal(actualApi, scope.chatApi); trace.push(["capture", params, signal.aborted]);
          if (mode === "pdf-abort") abort.abort(Error("pdf-abort"));
          if (mode === "pdf-dispose") disposal.abort(Error("pdf-dispose"));
          return mode === "pdf-null" ? undefined : { id: "pdf" };
        },
        deletePdf: async (_api: any, pdf: any) => { trace.push(["delete", pdf]); if (mode === "pdf-delete-error") throw Error("delete-error"); },
      };
      const Original = extensionBindings(["Ds", "Dc", "Lt"], {
        Le: host.getScope, Qm: host.getConfig, Is: host.isEnabled, mm: "browser-extension-chatgpt-access",
        Uc: { allowed_pages: host.defaultAllowedPages }, chrome: { storage: { local: host.storage } },
        mg: host.capturePdf, Fn: host.deletePdf, $g: CloudRequirementsClient, jg: CloudBrowserSettingsClient,
      }).Ds;
      const Control = restored ? createKernelControlClass(host) : Original;
      const control = new Control("scope");
      const values: any[] = [];
      async function run(name: string, ...args: any[]) {
        try { values.push([name, await control[name](...args)]); }
        catch (error) { values.push([name, (error as Error).message]); }
      }
      await Control.refreshBrowserSettings(control); // no eager client creation
      await run("getChatGptAccessPolicy");
      await run("isBrowserElicitationEnabled");
      await run("readSessionConfig", "session");
      await run("writeSessionConfig", { sessionId: "session", config: mode === "bad-session" ? [] : {} });
      await run("readRequirements");
      await run("readBrowserSettings");
      await run("readBrowserSettings");
      await run("patchBrowserSettings", { enabled: true });
      if (!abort.signal.aborted) {
        await Control.refreshBrowserSettings(control);
        scope.chatApi = { ...api }; // identity replacement must recreate clients/cache
        await run("readBrowserSettings");
      }
      await run("captureTabPdfToLibrary", { tabId: 1 });
      results.push({ values, trace });
    }
    assert.deepEqual(results[1], results[0], mode);
  }
});

test("kernel control RPC registers prototype methods, forwards turnEnded and aborts fetches on close", async () => {
  const { KernelControlPeer } = await import("../packages/browser-extension/src/kernel_control");
  const Original = extensionBindings(["fc", "qg"], { Ds: { dispose(control: any) {
    for (const controller of control.fetches.values()) controller.abort();
    control.fetches.clear();
  } } }).qg;
  const outputs = [];
  for (const Peer of [Original, KernelControlPeer]) {
    const sent: any[] = [], closes: (() => void)[] = [];
    const abort = new AbortController();
    class Control {
      fetches = new Map([["request", abort]]);
      displayValue(value: unknown) { return { value }; }
    }
    const control = new Control();
    const peer = new Peer({ sendMessage: (message: any) => sent.push(message), setMessageCallback() {}, addCloseListener: (fn: () => void) => closes.push(fn) }, control);
    await peer.handleIncomingMessage({ id: "in", method: "displayValue", params: 42 });
    const pending = peer.sendTurnEnded({ turnId: "turn" });
    const id = sent.at(-1).id;
    await peer.handleIncomingMessage({ id, result: "ended" });
    const result = await pending;
    for (const close of closes) close();
    outputs.push({ sent, result, aborted: abort.signal.aborted, count: control.fetches.size });
  }
  assert.deepEqual(outputs[1], outputs[0]);
  assert.equal(outputs[1].aborted, true);
});
