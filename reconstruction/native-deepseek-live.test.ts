/** Real desktop acceptance: model + restored MCP/CUA + owned app. Never mocks permissions. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import {
  NativeHelper,
  type NativeAppInfo,
} from "../packages/native-macos/src/helper";
import { screenshotDataUrl } from "../packages/native-macos/src/screenshot";
import {
  stageRuntimePackages,
  restoredPackageSources,
} from "../packages/agent-loop/src/runtime-packages";
import { create_launch_environment } from "@core/cua-repl";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";
import { NodeReplTurnClient } from "../packages/agent-loop/src/node-repl-turn";
import { computerPreflight } from "../packages/agent-loop/src/computer-preflight";
import { createDemoModel } from "../packages/agent-loop/src/provider";
import { AgentLoop } from "../packages/agent-loop/src/loop";
import { createTerminalTrace } from "../packages/agent-loop/src/terminal-trace";
import { withHostProxy } from "../packages/agent-loop/src/system-proxy";

test(
  "DeepSeek opens owned native app, enters text, clicks and reads actual saved state",
  {
    skip: process.env.CUA_NATIVE_DEEPSEEK_TEST !== "1",
    timeout: 180000,
  },
  async () => {
    assert.equal(process.platform, "darwin");
    const { helper, hello } = await NativeHelper.connect(
      resolve("native/macos/.build/debug/cua-helper"),
    );
    let root: string | undefined,
      runtime: Awaited<ReturnType<typeof stageRuntimePackages>> | undefined;
    let client: McpToolClient | undefined, turn: NodeReplTurnClient | undefined;
    let identity: { bundleId: string; path: string } | undefined;
    try {
      assert.ok(
        hello.permissions.accessibility && hello.permissions.screenRecording,
        `Desktop acceptance requires both permissions in this launcher; actual=${JSON.stringify(hello.permissions)}. No model request or app launch performed.`,
      );
      root = await mkdtemp("/tmp/core-native-loop-");
      const app = join(root, "CoreLoopFixture.app"),
        contents = join(app, "Contents"),
        bin = join(contents, "MacOS");
      await mkdir(bin, { recursive: true });
      await copyFile(
        resolve("native/macos/.build/debug/CuaFixture"),
        join(bin, "CuaFixture"),
      );
      const bundleId = `dev.core.loopfixture.${randomUUID()}`;
      await writeFile(
        join(contents, "Info.plist"),
        `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>CuaFixture</string><key>CFBundleIdentifier</key><string>${bundleId}</string><key>CFBundleName</key><string>CoreLoopFixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`,
      );
      identity = (
        await helper.request<{ app: NativeAppInfo }>("resolveApp", {
          reference: app,
        })
      ).app;
      assert.equal(
        (await helper.request<{ apps: NativeAppInfo[] }>("listApps")).apps.some(
          (value) => value.bundleId === bundleId,
        ),
        false,
        "Fixture must be initially stopped",
      );
      runtime = await stageRuntimePackages(restoredPackageSources());
      const env = await withHostProxy(
        create_launch_environment({
          env: {
            CUA_REPL_ENABLED_SURFACES: "computer",
            NODE_REPL_DISABLE_ANALYTICS: "1",
            NODE_REPL_NODE_MODULE_DIRS: runtime.root,
            NODE_REPL_TRUSTED_CODE_PATHS: runtime.root,
            CORE_CUA_NATIVE_HELPER_PATH: resolve(
              "native/macos/.build/debug/cua-helper",
            ),
            CUA_NATIVE_SUPERVISOR_PATH:
              "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl",
            NODE_REPL_NODE_PATH:
              "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node",
          },
          instructions_directory: new URL(
            "../instructions/",
            import.meta.resolve("@core/cua-repl"),
          ),
          platform: process.platform,
        }) as Record<string, string>,
      );
      env.NODE_REPL_TRUSTED_SERVICES = JSON.stringify({
        ...JSON.parse(env.NODE_REPL_TRUSTED_SERVICES ?? "{}"),
        sky: "@core/native-macos/service",
      });
      const metadata = { session_id: randomUUID(), turn_id: randomUUID() };
      client = await McpToolClient.connect(
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
            const target = params._meta?.tool_params;
            return params.mode !== "url" &&
              params._meta?.connector_id === "core-native-macos" &&
              target !== null &&
              typeof target === "object" &&
              "app" in target &&
              target.app === bundleId
              ? { action: "accept", content: {} }
              : { action: "decline" };
          },
        },
      );
      turn = new NodeReplTurnClient(
        client,
        { ...metadata, hook_event_name: "turn_ended" },
        { defaultJsTimeoutMs: 60000 },
      );
      const trace = createTerminalTrace();
      const initialMessages = await computerPreflight(turn, {
        onMessage: trace,
      });
      loadEnvFile(resolve(".env"));
      const marker = `native-${randomUUID().slice(0, 8)}`;
      const result = await new AgentLoop(createDemoModel(), turn).run(
        `打开本机应用 ${identity.path}，在 Fixture name 输入框输入 ${marker}，点击 Save fixture，然后读取保存后的文字并截图。只操作这个测试应用。`,
        {
          initialMessages,
          onMessage: trace,
          signal: AbortSignal.timeout(120000),
        },
      );
      const apps = (await helper.request<{ apps: NativeAppInfo[] }>("listApps"))
        .apps;
      const running = apps.find(
        (value) => value.bundleId === bundleId && value.path === identity!.path,
      );
      assert.ok(running, "Model must actually launch the fixture");
      const binding = await helper.request<{ targetId: string }>("bind", {
        pid: running.pid,
      });
      const actual = await helper.request<{
        elements: Array<{ value?: string; name?: string }>;
        screenshot: unknown;
      }>("observeWithScreenshot", { targetId: binding.targetId });
      assert.ok(
        actual.elements.some(
          (element) =>
            element.value === `Saved ${marker}` ||
            element.name === `Saved ${marker}`,
        ),
        "Native AX must confirm the saved text independently of the model answer",
      );
      assert.ok(
        screenshotDataUrl(actual.screenshot).startsWith(
          "data:image/png;base64,",
        ),
      );
      assert.ok(result.answer.includes(`Saved ${marker}`));
      assert.ok(
        result.messages.some(
          (message) =>
            message.role === "tool" &&
            message.result.content.some((item) => item.type === "image"),
        ),
        "Agent must return a real screenshot tool result",
      );
      console.error("NATIVE DEEPSEEK ACCEPTANCE PASSED", result.answer);
    } finally {
      try {
        try {
          await client?.close();
        } finally {
          await runtime?.dispose();
        }
      } finally {
        try {
          if (identity) {
            const apps = (
              await helper.request<{ apps: NativeAppInfo[] }>("listApps")
            ).apps;
            for (const app of apps)
              if (
                app.bundleId === identity.bundleId &&
                app.path === identity.path
              )
                try {
                  process.kill(app.pid, "SIGTERM");
                } catch {}
          }
        } finally {
          await helper.close();
          if (root) await rm(root, { recursive: true, force: true });
        }
      }
    }
  },
);
