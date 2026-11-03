import test from "node:test";
import assert from "node:assert/strict";
import { serviceExportTable, serviceExpression } from "./service-source";
import {
  createServiceCommandRegistry,
  type HostBoundCommands,
} from "../packages/browser/src/service/command_registry";
import { assembleServiceCommands } from "../packages/browser/src/service/command_assembly";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
import { BrowserUserOpenTabsCommand } from "../packages/browser/src/service/commands/browser_user";
import { TabAXActionCommand } from "../packages/browser/src/service/commands/accessibility";
import { PlaywrightWaitForUrlCommand } from "../packages/browser/src/service/commands/wait";
import { DomCuaGetVisibleDomCommand } from "../packages/browser/src/service/input/visible_dom";
const bound: HostBoundCommands = {
  BrowserAuthHandoffCommand: defineCommand("browser_auth_handoff", () => {}),
  CuaTypeCommand: defineCommand("cua_type", () => {}),
  DomCuaTypeCommand: defineCommand("dom_cua_type", () => {}),
  PlaywrightLocatorFillCommand: defineCommand(
    "playwright_locator_fill",
    () => {},
  ),
  TabBotDetectionReportCommand: defineCommand(
    "tab_bot_detection_report",
    () => {},
  ),
  WebMcpListToolsCommand: defineCommand("webmcp_list_tools", () => {}),
};
test("service command export registry matches all original names, order and getter semantics", () => {
  const expected = serviceExportTable("ug"),
    { registry, commands } = createServiceCommandRegistry({ ...bound });
  assert.equal(Object.keys(expected).length, 75);
  assert.deepEqual(Object.keys(registry), Object.keys(expected));
  for (const [name, symbol] of Object.entries(expected)) {
    const literal = serviceExpression(symbol).match(/^F\(("[^"\n]*")/);
    if (literal)
      assert.equal(
        registry[name as keyof typeof registry].type,
        JSON.parse(literal[1]),
        name,
      );
  }
  assert.deepEqual(commands, Object.values(registry));
  assert.equal(new Set(commands.map((command) => command.type)).size, 75);
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(registry),
  )) {
    assert.equal(typeof descriptor.get, "function");
    assert.equal(descriptor.enumerable, true);
    assert.equal(descriptor.configurable, false);
    assert.equal(descriptor.set, undefined);
  }
  assert.equal(registry.BrowserUserOpenTabsCommand, BrowserUserOpenTabsCommand);
  assert.equal(registry.TabAxActionCommand, TabAXActionCommand);
  assert.equal(
    registry.PlaywrightWaitForURLCommand,
    PlaywrightWaitForUrlCommand,
  );
  assert.equal(registry.DomCuaGetVisibleDomCommand, DomCuaGetVisibleDomCommand);
  const input = { ...bound },
    live = createServiceCommandRegistry(input);
  const replacement = defineCommand("replacement", () => {});
  input.WebMcpListToolsCommand = replacement;
  assert.equal(live.registry.WebMcpListToolsCommand, replacement);
  assert.equal(live.commands.at(-1), bound.WebMcpListToolsCommand);
});
test("assembled registry dispatches restored commands and binds shared typing dependency", async () => {
  const trace: any[] = [];
  const assembly = assembleServiceCommands({
    browserAuthHandoff: bound.BrowserAuthHandoffCommand,
    async typeText(...args: any[]) {
      trace.push(["type", ...args]);
    },
    emitBotDetection() {},
    webMcp: {
      isLocalRuntime() {
        return true;
      },
      async featureFlag() {
        return false;
      },
      config() {},
      emit() {},
    },
  });
  assert.equal(assembly.commands.length, 75);
  const context: any = {
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return "https://fixture.test";
      },
    },
    acquireAuthority() {
      return {
        actInFrame(url: string) {
          return {
            async assert() {
              trace.push(["authority", url]);
            },
          };
        },
      };
    },
    async followSessionTab(id: number) {
      trace.push(["follow", id]);
    },
  };
  const command = assembly.commands.find(
    (command) => command.type === "cua_type",
  )!;
  const payload = { tab_id: "7", text: "hello" };
  await command(payload, context);
  assert.equal(trace.filter((entry) => entry[0] === "type").length, 1);
  assert.equal(trace.find((entry) => entry[0] === "type")[1], payload);
  assert.equal(
    assembly.registry.WebMcpInvokeToolCommand.type,
    "webmcp_invoke_tool",
  );
});
