/** Explicitly opt in: creates and closes one owned tab in an existing daily Chrome. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  loadHostConfig,
  chromeExtensionId,
} from "../packages/native-host/src/installation";
import { checkNativeHostInstallation } from "../packages/native-host/src/installation_check";
import { prepareRestoredRuntime } from "../packages/agent-loop/src/restored-runtime";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";
import { AgentLoop } from "../packages/agent-loop/src/loop";
import { createDemoModel } from "../packages/agent-loop/src/provider";
import type { AgentMessage } from "../packages/agent-loop/src/contracts";
import { NodeReplTurnClient } from "../packages/agent-loop/src/node-repl-turn";

test(
  "existing daily Chrome supports unified MCP observation, click and screenshot on one owned local tab",
  {
    skip:
      process.platform !== "darwin" ||
      process.env.CUA_TEST_DAILY_CHROME !== "1",
    timeout: 180000,
  },
  async () => {
    const liveModel = process.env.CUA_LIVE_DEEPSEEK_TEST === "1";
    // Fail before opening a tab if the explicitly requested provider is not configured.
    const model = liveModel
      ? createDemoModel({ ...process.env, CUA_MODEL_PROVIDER: "deepseek" })
      : undefined;
    const transcript: AgentMessage[] = [];
    const registrationPath = join(
      homedir(),
      "Library/Application Support/Google/Chrome/NativeMessagingHosts/com.core.cua.json",
    );
    const registration = JSON.parse(await readFile(registrationPath, "utf8"));
    const config = await loadHostConfig(
      join(dirname(registration.path), "config.json"),
    );
    const manifest = JSON.parse(
      await readFile("packages/browser-extension/native-manifest.json", "utf8"),
    );
    await checkNativeHostInstallation({
      manifestPath: registrationPath,
      extensionId: chromeExtensionId(manifest.key),
      endpointDirectory: config.endpointParentDirectory,
    });
    const marker = `cua-owned-${randomUUID()}`;
    let clicked = false;
    let recordClick: () => void = () => {};
    const clickObserved = new Promise<void>((resolve) => {
      recordClick = resolve;
    });
    const requests: string[] = [];
    const server = createServer((req, res) => {
      requests.push(`${req.method} ${req.url ?? ""}`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      if (
        new URL(req.url ?? "/", "http://fixture.invalid").pathname === "/done"
      ) {
        // A navigation to /done alone must not satisfy the click oracle.
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          if (
            req.method !== "POST" ||
            new URLSearchParams(body).get("trustedClick") !== "true"
          ) {
            res.statusCode = 400;
            res.end("Expected a browser-generated click on the fixture button");
            return;
          }
          clicked = true;
          recordClick();
          res.end(`<h1>${marker}</h1>`);
        });
      } else {
        res.end(`<!doctype html><h1>Owned CUA acceptance page</h1>
          <form action="/done" method="post">
            <input type="hidden" name="trustedClick" value="false">
            <button type="submit">Verify click</button>
          </form>
          <script>
            document.querySelector('button').addEventListener('click', event => {
              document.querySelector('input').value = String(event.isTrusted);
            });
          </script>`);
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    let runtime: Awaited<ReturnType<typeof prepareRestoredRuntime>> | undefined;
    let client: McpToolClient | undefined;
    let turn: NodeReplTurnClient | undefined;
    let created = false;
    let calls = 0;
    const metadata = { session_id: randomUUID(), turn_id: randomUUID() };
    async function execute(code: string) {
      const call = {
        id: `daily-${++calls}`,
        name: "js",
        arguments: { code, title: "Owned daily Chrome acceptance" },
      };
      const result = await turn!.callTool(call, AbortSignal.timeout(30000));
      transcript.push(
        { role: "assistant", toolCalls: [call] },
        { role: "tool", callId: call.id, name: call.name, result },
      );
      assert.notEqual(
        result.isError,
        true,
        result.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n"),
      );
      return result;
    }
    const text = (result: Awaited<ReturnType<typeof execute>>) =>
      result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
    try {
      // Regression: direct navigation and untrusted/no-click submission cannot reveal the result.
      for (const init of [
        undefined,
        { method: "POST", body: "trustedClick=false" },
      ]) {
        const response = await fetch(`${origin}/done`, init);
        assert.equal(response.status, 400);
        assert(!(await response.text()).includes(marker));
        assert.equal(clicked, false);
      }
      runtime = await prepareRestoredRuntime(
        {
          CUA_REPL_ENABLED_SURFACES: "browser,computer",
          CUA_REPL_BROWSER_ENV: "codex-app",
          CORE_CUA_NATIVE_BACKEND: "swift",
          CORE_CUA_HOST_DIRECTORY: config.endpointParentDirectory,
          BROWSER_USE_AVAILABLE_BACKENDS: "chrome",
          NODE_REPL_DISABLE_ANALYTICS: "1",
        },
        "rust",
        metadata.session_id,
      );
      client = await McpToolClient.connect(
        {
          command: runtime.command,
          args: runtime.args,
          env: runtime.environment,
          stderr: "inherit",
        },
        {
          requestMeta: () => ({ "x-codex-turn-metadata": metadata }),
          elicit: async (params) =>
            params.mode !== "url" &&
            params._meta?.tool_name === "access_browser_origin" &&
            params._meta?.origin === origin
              ? { action: "accept", content: {} }
              : { action: "decline" },
        },
      );
      turn = new NodeReplTurnClient(
        client,
        { ...metadata, hook_event_name: "turn_ended" },
        { defaultJsTimeoutMs: 30000 },
      );
      await execute("await cua.getState();");
      await execute('var dailyBrowser = await cua.getBrowser({id:"chrome"});');
      await execute('await dailyBrowser.nameSession("🧪 CUA 本地验收");');
      await execute("var dailyOwnedTab = await dailyBrowser.tabs.new();");
      created = true;
      await execute(`await dailyOwnedTab.goto(${JSON.stringify(origin)});`);
      assert.match(
        text(await execute("await dailyOwnedTab.getAXState();")),
        /Owned CUA acceptance page/,
      );
      if (model) {
        // The test owns cleanup so post-answer observation and screenshot remain possible.
        const modelTools = {
          getInstructions: () => turn!.getInstructions(),
          listTools: (signal?: AbortSignal) => turn!.listTools(signal),
          callTool: async (
            call: import("../packages/agent-loop/src/contracts").ToolCall,
            signal?: AbortSignal,
          ) => {
            console.log(`DeepSeek tool: ${call.name}`);
            return turn!.callTool(call, signal);
          },
          close: async () => {},
        };
        const result = await new AgentLoop(model, modelTools).run(
          "在已经准备好的本地测试标签 dailyOwnedTab 中点击 Verify click，读取跳转后页面标题中的完整验收标识，并把该标识原样返回。只操作这个测试标签，不操作其它标签或应用，不关闭测试标签。",
          {
            initialMessages: transcript,
            maxSteps: 8,
            signal: AbortSignal.timeout(120000),
            runtimeContext:
              "The host already created dailyOwnedTab in the persistent REPL and loaded the fixture. The preceding tool transcript contains the observed API documentation and page. Operate only that owned tab. The host performs cleanup after your answer.",
          },
        );
        assert.equal(result.status, "completed");
        assert(
          result.messages.some(
            (message) =>
              message.role === "tool" &&
              !transcript.some(
                (old) => old.role === "tool" && old.callId === message.callId,
              ),
          ),
          "The model must execute tools, not only answer from the setup transcript",
        );
        assert(
          result.answer.includes(marker),
          "Model answer must contain the unique marker revealed only after navigation",
        );
        console.log("DeepSeek returned the exact observed fixture marker.");
      } else {
        await execute(
          'await dailyOwnedTab.playwright.getByRole("button",{name:"Verify click"}).click();',
        );
      }
      let navigationTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          clickObserved,
          new Promise<never>((_, reject) => {
            navigationTimer = setTimeout(
              () =>
                reject(
                  Error(
                    `Owned click did not reach the local server; fixture requests: ${JSON.stringify(requests)}`,
                  ),
                ),
              5000,
            );
          }),
        ]);
      } finally {
        if (navigationTimer) clearTimeout(navigationTimer);
      }
      assert.equal(clicked, true);
      let observed = "";
      const deadline = Date.now() + 5000;
      do {
        observed = text(await execute("await dailyOwnedTab.getAXState();"));
        if (observed.includes(marker)) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      } while (Date.now() < deadline);
      assert.match(observed, new RegExp(marker));
      const screenshot = await execute("await dailyOwnedTab.getScreenshot();");
      assert(
        screenshot.content.some(
          (c) => c.type === "image" && c.data.length > 100,
        ),
      );
      await execute("await dailyOwnedTab.close();");
      created = false;
    } finally {
      try {
        if (created && turn) await execute("await dailyOwnedTab.close();");
      } finally {
        try {
          await turn?.endTurn();
        } finally {
          try {
            await client?.close();
          } finally {
            await runtime?.dispose();
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
          }
        }
      }
    }
  },
);
