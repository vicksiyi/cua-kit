import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  tabCapabilityFactories,
  tabCapabilityDefinitions,
} from "../packages/browser/src/capabilities/tab";
import { SiwcTabCapability } from "../packages/browser/src/capabilities/tab_siwc";
import { Commands } from "../packages/browser/src/commands/index";
import { assembleServiceCommands } from "../packages/browser/src/service/command_assembly";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
import { FunctionAgentTransport } from "../packages/browser/src/runtime/function_agent_transport";
import { playwrightInstallation } from "../packages/browser/src/service/playwright/injection";
import { upstreamPlaywrightSource } from "../packages/browser/src/service/playwright/upstream_source";
import { effectiveBrowserCapabilities } from "../packages/browser/src/service/effective_capabilities";
import { serviceExportTable } from "./service-source";
test("SIWC public factory and serialized transport dispatch registered detection against real DOM", async () => {
  assert.deepEqual(
    Object.keys(Commands),
    Object.keys(serviceExportTable("ee")),
  );
  assert.equal(tabCapabilityDefinitions.at(-1)?.id, "siwc");
  const assembly = assembleServiceCommands({
    browserAuthHandoff: defineCommand("browser_auth_handoff", () => {}),
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<button>Continue with ChatGPT</button>");
    await page.evaluate(
      playwrightInstallation(upstreamPlaywrightSource()).expression,
    );
    let enabled = true;
    const authorized: string[] = [];
    const calls: string[] = [];
    const runtime = { env: {} };
    const info = { type: "extension", capabilities: { tab: [{ id: "siwc" }] } };
    const context = {
      supportsTabCapability: async (id: string) =>
        effectiveBrowserCapabilities(runtime, info, () => enabled).tab.some(
          (item: any) => item.id === id,
        ),
      getCurrentSessionId: () => "fixture-session",
      security: { currentTabUrl: async () => "https://fixture.test" },
      acquireAuthority: () => ({
        observeContent: (url: string) => ({
          assert: async () => {
            authorized.push(url);
          },
        }),
      }),
      playwright: {
        evaluateOnPlaywrightPage: async (_tab: string, fn: any) =>
          page.evaluate(`(${fn.toString()})(window.__codexPlaywrightInjected)`),
      },
    };
    const transport = new FunctionAgentTransport({
      executeAgentCommand: async (payload) => {
        calls.push(String(payload.type));
        const command = assembly.commands.find(
          (item) => item.type === payload.type,
        );
        assert(command);
        return command(payload, context);
      },
    });
    const capability = tabCapabilityFactories.get("siwc")!({
      browserId: "fixture",
      tabId: "7",
      info: { id: "siwc", description: "" },
      documentation: { get: async () => "fixture" },
      transport,
    }) as SiwcTabCapability;
    const result = await capability.detect();
    assert.equal(result.status, "possible_matches");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].target.kind, "dom");
    assert.equal(authorized.length, 2);
    enabled = false;
    assert.deepEqual(await capability.detect(), {
      status: "unavailable",
      reason: "observation_unavailable",
    });
    assert.deepEqual(await capability.authenticate(), {
      status: "unsupported",
    });
    assert.equal(
      authorized.length,
      2,
      "disabled gate exits before observations or auth",
    );
    assert.deepEqual(calls, [
      "tab_siwc_detect",
      "tab_siwc_detect",
      "tab_siwc_authenticate",
    ]);
  } finally {
    await browser.close();
  }
});
