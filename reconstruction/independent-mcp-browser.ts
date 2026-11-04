import { loadEnvFile } from "node:process";
import { AgentLoop } from "../packages/agent-loop/src/loop";
import { createDemoModel } from "../packages/agent-loop/src/provider";
import { browserPreflight } from "../packages/agent-loop/src/browser-preflight";
import { createTerminalTrace } from "../packages/agent-loop/src/terminal-trace";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { create_launch_environment } from "@core/cua-repl";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";
import { NodeReplTurnClient } from "../packages/agent-loop/src/node-repl-turn";
import { configureIndependentBrowser } from "../packages/agent-loop/src/independent-browser";
import {
  stageRuntimePackages,
  restoredPackageSources,
} from "../packages/agent-loop/src/runtime-packages";

/** Actual demo MCP/supervisor/workers; no model or business-operation fixture. */
export async function verifyIndependentMcpBrowser(
  endpointFile: string,
  pageUrl: string,
  hostDirectory?: string,
) {
  const baiduSearch =
    process.env.CUA_LIVE_BAIDU_TEST === "1" ||
    process.env.CUA_BROWSER_BAIDU_PROBE === "1";
  const runtime = await stageRuntimePackages(restoredPackageSources());
  try {
    const env = await configureIndependentBrowser(
      create_launch_environment({
        CUA_REPL_ENABLED_SURFACES: "browser",
        CUA_REPL_BROWSER_ENV: "codex-app",
        BROWSER_USE_AVAILABLE_BACKENDS: "chrome",
        ...(hostDirectory
          ? { CORE_CUA_HOST_DIRECTORY: hostDirectory }
          : { CORE_CUA_ENDPOINT_FILES: JSON.stringify([endpointFile]) }),
        NODE_REPL_DISABLE_ANALYTICS: "1",
        NODE_REPL_NODE_MODULE_DIRS: runtime.root,
        NODE_REPL_TRUSTED_CODE_PATHS: runtime.root,
        CUA_NATIVE_SUPERVISOR_PATH:
          "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl",
        NODE_REPL_NODE_PATH:
          "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node",
      }) as Record<string, string>,
    );
    const metadata = { session_id: "mcp-browser-live", turn_id: "mcp-live-1" };
    const client = await McpToolClient.connect(
      {
        command: process.execPath,
        args: [
          "--import",
          import.meta.resolve("tsx"),
          resolve("packages/agent-loop/src/native-supervisor.ts"),
        ],
        env,
        stderr: "inherit",
      },
      {
        requestMeta: () => ({ "x-codex-turn-metadata": metadata }),
        elicit: async (params) => {
          // Test-only authorization: own local page, or the explicitly requested Baidu search origin.

          if (
            params.mode === "url" ||
            params._meta?.tool_name !== "access_browser_origin" ||
            params._meta?.origin !==
              (baiduSearch ? "https://www.baidu.com" : new URL(pageUrl).origin)
          )
            return { action: "decline" };
          return { action: "accept", content: {} };
        },
      },
    );
    const turn = new NodeReplTurnClient(client, {
      ...metadata,
      hook_event_name: "turn_ended",
    });
    let index = 0;
    const execute = async (code: string, expectImage = false) => {
      if (process.env.CUA_BROWSER_BAIDU_PROBE)
        console.error("PROBE CALL", code);
      const result = await turn.callTool(
        {
          id: `live-${++index}`,
          name: "js",
          arguments: { code, title: "Independent browser integration" },
        },
        AbortSignal.timeout(45000),
      );
      const text = result.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n");
      if (process.env.CUA_BROWSER_BAIDU_PROBE)
        console.error("PROBE RESULT", text.slice(-3000));
      assert.equal(result.isError, false, text);
      if (expectImage)
        assert.ok(
          result.content.some(
            (item) => item.type === "image" && item.data.length > 100,
          ),
        );
      return text;
    };
    try {
      if (process.env.CUA_BROWSER_BAIDU_PROBE === "1") {
        await execute("await cua.getState();");
        await execute('var probeBrowser = await cua.getBrowser({id:"1"});');
        await execute(
          'await probeBrowser.nameSession("🔎 百度诊断"); var probeTab = await probeBrowser.tabs.new();',
        );
        await execute('await probeTab.goto("https://www.baidu.com/");');
        const snapshot = await execute(
          "nodeRepl.write(await probeTab.playwright.domSnapshot());",
        );
        assert.ok(
          snapshot.includes("textbox"),
          "Baidu homepage has no observed search field",
        );
        assert.ok(
          snapshot.includes("百度一下"),
          "Baidu homepage search action was not observed",
        );
        return;
      }
      if (process.env.CUA_LIVE_DEEPSEEK_TEST === "1" || baiduSearch) {
        loadEnvFile(resolve(".env"));
        const trace = createTerminalTrace();
        const initialMessages = await browserPreflight(turn, {
          onMessage: trace,
        });
        const result = await new AgentLoop(createDemoModel(), turn).run(
          baiduSearch
            ? "访问百度 搜索 deepseek 给我返回第一条搜索结果"
            : `使用 Chrome 访问 ${pageUrl}next，点击 Run action 按钮，告诉我点击后页面中段落的完整文字。请实际操作并读取结果。`,
          {
            initialMessages,
            onMessage: trace,
            signal: AbortSignal.timeout(90000),
          },
        );
        console.error("DEEPSEEK ANSWER", result.answer);
        if (baiduSearch) {
          const observed = result.messages
            .filter(
              (message) => message.role === "tool" && !message.result.isError,
            )
            .flatMap((message) =>
              message.role === "tool"
                ? message.result.content
                    .filter((item) => item.type === "text")
                    .map((item) => item.text)
                : [],
            )
            .join("\n");
          assert.match(
            observed,
            /heading[^\n]*deepseek/i,
            "No observed DeepSeek search-result heading",
          );
          assert.match(result.answer, /deepseek/i);
          assert.match(
            result.answer,
            /https?:\/\//,
            "No result link in the final answer",
          );
        } else assert.match(result.answer, /action-completed-marker/);
        return;
      }
      await execute("await cua.getState();");
      const inventory = await execute(
        "nodeRepl.write(JSON.stringify({count:(await cua.getState({emit:false})).browsers.length}));",
      );
      assert.match(inventory, /"count":1/);
      const state = await execute(
        `var liveTab = await cua.getTab({url:${JSON.stringify(pageUrl)}}, {browser:"chrome"});`,
      );
      assert.match(state, /Actual browser capture|native-roundtrip-marker/);
      await execute(`await liveTab.goto(${JSON.stringify(pageUrl + "next")});`);
      const navigated = await execute("await liveTab.getAXState();");
      assert.match(navigated, /Navigation target/);
      await execute(
        'await liveTab.playwright.getByRole("button", {name:"Run action"}).click();',
      );
      const clicked = await execute("await liveTab.getAXState();");
      assert.match(clicked, /action-completed-marker/);
      await execute("await liveTab.getScreenshot();", true);
    } finally {
      try {
        await turn.endTurn();
      } finally {
        await client.close();
      }
    }
  } finally {
    await runtime.dispose();
  }
}
