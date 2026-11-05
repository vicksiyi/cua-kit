import { prepareIndependentBrowserRuntime } from "../packages/agent-loop/src/independent-runtime";
import type { AgentMessage } from "../packages/agent-loop/src/contracts";
import { BROWSER_INPUT_CONTEXT } from "../packages/agent-loop/src/browser-guidance";
import { CDP_OPERATION_CONTEXT } from "../packages/agent-loop/src/cdp-guidance";
import { observedSearchLinks } from "./search-result-evidence";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withHostProxy } from "../packages/agent-loop/src/system-proxy";
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

/** Actual MCP/supervisor/workers; optional live-model scenarios use controlled pages. */
export async function verifyIndependentMcpBrowser(
  endpointFile: string,
  pageUrl: string,
  hostDirectory?: string,
  backend: "chrome" | "cdp" = "chrome",
  scenario?: { question: string; expectedAnswer: RegExp },
  verifyEvidence?: () => Promise<void>,
) {
  const baiduSearch =
    process.env.CUA_LIVE_BAIDU_TEST === "1" ||
    process.env.CUA_BROWSER_BAIDU_PROBE === "1";
  const genericSearch = process.env.CUA_LIVE_SEARCH_TEST === "1";
  const runtime = await stageRuntimePackages(restoredPackageSources());
  let independent:
    Awaited<ReturnType<typeof prepareIndependentBrowserRuntime>> | undefined;
  const supervisor = process.env.CUA_RUNTIME_SUPERVISOR ?? "installed";
  if (!["installed", "independent", "rust"].includes(supervisor))
    throw Error("Unknown test supervisor");
  const independentSelected = supervisor !== "installed";
  try {
    const env = await configureIndependentBrowser(
      await withHostProxy(
        create_launch_environment({
          env: {
            CUA_REPL_ENABLED_SURFACES: "browser",
            CUA_REPL_BROWSER_ENV: "codex-app",
            BROWSER_USE_AVAILABLE_BACKENDS: backend,
            ...(hostDirectory
              ? { CORE_CUA_HOST_DIRECTORY: hostDirectory }
              : { CORE_CUA_ENDPOINT_FILES: JSON.stringify([endpointFile]) }),
            NODE_REPL_DISABLE_ANALYTICS: "1",
            CORE_CUA_RUNTIME_DIAGNOSTICS:
              process.env.CORE_CUA_RUNTIME_DIAGNOSTICS ?? "0",
            NODE_REPL_NODE_MODULE_DIRS: runtime.root,
            NODE_REPL_TRUSTED_CODE_PATHS: runtime.root,
            CUA_NATIVE_SUPERVISOR_PATH: independentSelected
              ? "/intentionally-not-installed"
              : "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl",
            NODE_REPL_NODE_PATH: independentSelected
              ? "/intentionally-not-installed"
              : "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node",
          },
          instructions_directory: new URL(
            "../instructions/",
            import.meta.resolve("@core/cua-repl"),
          ),
          platform: process.platform,
        }) as Record<string, string>,
      ),
    );
    const metadata = { session_id: "mcp-browser-live", turn_id: "mcp-live-1" };
    if (independentSelected)
      independent = await prepareIndependentBrowserRuntime(
        env,
        runtime.root,
        metadata.session_id,
        supervisor === "rust" ? "rust" : "typescript",
      );
    const client = await McpToolClient.connect(
      {
        command: independent?.command ?? process.execPath,
        args: independent?.args ?? [
          "--import",
          import.meta.resolve("tsx"),
          resolve("packages/agent-loop/src/native-supervisor.ts"),
        ],
        env: independent?.environment ?? env,
        stderr: "inherit",
      },
      {
        requestMeta: () => ({ "x-codex-turn-metadata": metadata }),
        elicit: async (params) => {
          // Test-only authorization for the requested search sites; verification/auth origins stay unapproved.

          if (
            params.mode === "url" ||
            params._meta?.tool_name !== "access_browser_origin" ||
            !(
              genericSearch
                ? [
                    "https://www.google.com",
                    "https://www.bing.com",
                    "https://cn.bing.com",
                  ]
                : [
                    baiduSearch
                      ? "https://www.baidu.com"
                      : new URL(pageUrl).origin,
                  ]
            ).includes(params._meta?.origin)
          )
            return { action: "decline" };
          return { action: "accept", content: {} };
        },
      },
    );
    const turn = new NodeReplTurnClient(
      client,
      {
        ...metadata,
        hook_event_name: "turn_ended",
      },
      { defaultJsTimeoutMs: 60000 },
    );
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
        AbortSignal.timeout(70000),
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
      const bootstrapMessages: AgentMessage[] = [];
      if (independent) {
        const call = {
          id: "bootstrap",
          name: "js",
          arguments: {
            code: 'await import("@core/cua/tinyskyAlt");',
            title: "Initialize independent CUA",
          },
        };
        const result = await turn.callTool(call, AbortSignal.timeout(70000));
        assert.equal(result.isError, false, JSON.stringify(result));
        bootstrapMessages.push(
          { role: "assistant", toolCalls: [call] },
          { role: "tool", callId: call.id, name: call.name, result },
        );
      }
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
      if (
        scenario ||
        process.env.CUA_LIVE_DEEPSEEK_TEST === "1" ||
        baiduSearch ||
        genericSearch
      ) {
        loadEnvFile(resolve(".env"));
        const trace = createTerminalTrace();
        const initialMessages = [
          ...bootstrapMessages,
          ...(await browserPreflight(turn, {
            onMessage: trace,
          })),
        ];
        const result = await new AgentLoop(createDemoModel(), turn).run(
          scenario
            ? scenario.question
            : genericSearch
              ? "打开本地Chrome 搜索 deepseek 给我返回第一条搜索结果"
              : baiduSearch
                ? "访问百度 搜索 deepseek 给我返回第一条搜索结果"
                : `使用 Chrome 访问 ${pageUrl}next，点击 Run action 按钮，告诉我点击后页面中段落的完整文字。请实际操作并读取结果。`,
          {
            initialMessages,
            runtimeContext: [
              BROWSER_INPUT_CONTEXT,
              backend === "cdp" ? CDP_OPERATION_CONTEXT : undefined,
            ]
              .filter(Boolean)
              .join("\n"),
            onMessage: trace,
            // Live search includes repeated upstream site-status checks. Keep enough
            // observation time to distinguish transport delay from page failure.
            signal: AbortSignal.timeout(
              baiduSearch || genericSearch ? 180000 : 90000,
            ),
          },
        );
        console.error("DEEPSEEK ANSWER", result.answer);
        if (scenario) {
          assert.match(result.answer, scenario.expectedAnswer);
          await verifyEvidence?.();
          return result;
        }
        if (baiduSearch || genericSearch) {
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
          const evidence = await mkdtemp(
            join(tmpdir(), "core-search-evidence-"),
          );
          await writeFile(join(evidence, "observed.txt"), observed);
          await writeFile(join(evidence, "answer.txt"), result.answer);
          console.error("SEARCH EVIDENCE DIRECTORY", evidence);
          assert.match(result.answer, /deepseek/i);
          const observedLinks = observedSearchLinks(observed);
          assert.ok(
            observedLinks.some((link) => result.answer.includes(link)),
            "Final answer must preserve an observed result link or its decoded destination, including the full path",
          );
        } else assert.match(result.answer, /action-completed-marker/);
        await verifyEvidence?.();
        return;
      }
      await execute("await cua.getState();");
      const inventory = await execute(
        "nodeRepl.write(JSON.stringify({count:(await cua.getState({emit:false})).browsers.length}));",
      );
      assert.match(inventory, /"count":1/);
      const state = await execute(
        backend === "cdp"
          ? `var liveTab = await cua.createBrowserTab("1",${JSON.stringify(pageUrl)}, {sessionName:"CDP acceptance"});`
          : `var liveTab = await cua.getTab({url:${JSON.stringify(pageUrl)}}, {browser:"chrome"});`,
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
      await verifyEvidence?.();
    } finally {
      try {
        await turn.endTurn();
      } finally {
        await client.close();
      }
    }
  } finally {
    try {
      await independent?.dispose();
    } finally {
      await runtime.dispose();
    }
  }
}
