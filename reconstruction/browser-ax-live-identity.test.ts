import { StateResultSchema } from "../packages/browser/src/commands/ax";
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chromium } from "playwright";
import {
  AccessibilityCaptureManager,
  initializeAccessibilityCore,
} from "../packages/browser/src/service/accessibility/capture_manager";
import { StaleAccessibilityCaptureError } from "../packages/browser/src/service/accessibility/state_store";
import { TabAXGetStateCommand } from "../packages/browser/src/service/commands/accessibility";
import { playwrightInstallation } from "../packages/browser/src/service/playwright/injection";
import { upstreamPlaywrightSource } from "../packages/browser/src/service/playwright/upstream_source";

test("real Chromium and AX WASM capture preserve SIWC identity and reject superseded targets", async () => {
  await initializeAccessibilityCore(
    new URL(
      "../packages/browser/dist/service/accessibility/browser-accessibility.wasm.br",
      import.meta.url,
    ),
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<title>AX identity fixture</title><button data-oai-siwc-button>Continue with ChatGPT</button><iframe srcdoc="<button>Child action</button>"></iframe>',
    );
    await page.frameLocator("iframe").locator("button").waitFor();
    await page.evaluate(
      playwrightInstallation(upstreamPlaywrightSource()).expression,
    );
    const session = await page.context().newCDPSession(page);
    const cdp: any = new EventEmitter();
    cdp.getJsDialog = () => undefined;
    cdp.addTabCleanupHandler = () => () => {};
    cdp.call = (_tab: any, method: any, params: any) =>
      session.send(method, params);
    cdp.callTarget = (_target: any, method: any, params: any) =>
      session.send(method, params);
    cdp.targetForFrameOrAttach = async () => undefined;
    cdp.targetIdForFrame = () => undefined;
    cdp.readDocumentState = async () =>
      page.evaluate(() => ({
        href: location.href,
        readyState: document.readyState,
        painted: true,
      }));
    cdp.evaluateJavascript = (_tab: any, expression: string) =>
      page.evaluate(expression);
    const manager = new AccessibilityCaptureManager(
      cdp,
      () => "session",
      { perform: async () => {} },
      {
        getTab: () => ({
          id: 7,
          title: "AX identity fixture",
          url: page.url(),
          active: true,
        }),
      },
    );
    try {
      const context: any = {
        ax: manager,
        cdp,
        getCurrentSessionId: () => "session",
        supportsTabCapability: async () => true,
        security: { currentTabUrl: async () => page.url() },
        acquireAuthority: () => ({
          observeContent: () => ({ assert: async () => {} }),
        }),
        playwright: {
          evaluateOnPlaywrightPage: async (_tab: any, fn: any) =>
            page.evaluate(
              `(${fn.toString()})(window.__codexPlaywrightInjected)`,
            ),
        },
      };
      const first: any = await TabAXGetStateCommand(
        { tab_id: "7", content: "axState" },
        context,
      );
      assert.deepEqual(StateResultSchema.parse(first), first);
      assert(first.snapshotId);
      assert.equal(first.siwc.status, "possible_matches");
      assert.match(first.state, /Continue with ChatGPT/);
      assert.match(first.state, /Child action/);
      assert(
        first.state.includes(
          `SIWC snapshotId: ${JSON.stringify(first.snapshotId)}`,
        ),
      );
      const targets = [];
      for (let index = 0; index < 40; index++)
        try {
          targets.push({ index, ...manager.targetForElement(7, index) });
        } catch {}
      const root = targets.find(
        (t) => t.frameId === manager.currentState(7).mainFrameId,
      );
      assert(root);
      assert.equal(
        manager.targetForSnapshot(7, first.snapshotId, root.index)
          .backendNodeId,
        root.backendNodeId,
      );
      const child = targets.find(
        (t) => t.frameId !== manager.currentState(7).mainFrameId,
      );
      assert(child);
      assert.throws(
        () => manager.targetForSnapshot(7, first.snapshotId, child.index),
        StaleAccessibilityCaptureError,
      );
      const second: any = await TabAXGetStateCommand(
        { tab_id: "7", content: "axState", disable_diffing: true },
        context,
      );
      assert.notEqual(first.snapshotId, second.snapshotId);
      assert.throws(
        () => manager.targetForSnapshot(7, first.snapshotId, root.index),
        StaleAccessibilityCaptureError,
      );
      manager.discardCapture(7, first);
      assert.equal(manager.currentState(7).snapshotId, second.snapshotId);
      manager.discardCapture(7, second);
      assert.equal(manager.currentState(7).targets.size, 0);
    } finally {
      manager.dispose();
    }
  } finally {
    await browser.close();
  }
});
