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
// Legacy NDJSON bindings are an independent verification/cleanup client only;
// the AgentLoop executes through Rust + original Sky + Swift IPC.
import { connectNativeAcceptanceRuntime } from "./native-deepseek-runtime";
import { computerPreflight } from "../packages/agent-loop/src/computer-preflight";
import { createDemoModel } from "../packages/agent-loop/src/provider";
import { AgentLoop } from "../packages/agent-loop/src/loop";
import { createTerminalTrace } from "../packages/agent-loop/src/terminal-trace";

test(
  "DeepSeek through Rust and original Sky opens owned native app, enters text, clicks and reads saved state",
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
      runtime:
        Awaited<ReturnType<typeof connectNativeAcceptanceRuntime>> | undefined;
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
      runtime = await connectNativeAcceptanceRuntime(bundleId);
      const { turn } = runtime;
      const trace = createTerminalTrace();
      const initialMessages = await computerPreflight(turn, {
        onMessage: trace,
      });
      loadEnvFile(resolve(".env"));
      const marker = `native-${randomUUID().slice(0, 8)}`;
      const result = await new AgentLoop(
        createDemoModel({
          ...process.env,
          CUA_MODEL_PROVIDER: "deepseek",
          CUA_MODEL_ENDPOINT: "https://api.deepseek.com/chat/completions",
        }),
        turn,
      ).run(
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
      const images = result.messages
        .flatMap((message) =>
          message.role === "tool" ? message.result.content : [],
        )
        .filter((item) => item.type === "image");
      assert.ok(
        images.length > 0,
        "Agent must return a screenshot tool result",
      );
      for (const image of images) {
        assert.ok(image.type === "image");
        assert.equal(image.mimeType, "image/png");
        const bytes = Buffer.from(image.data, "base64");
        assert.ok(bytes.length >= 33);
        assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
        assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
      }
      assert.ok(
        runtime.approvalCount() > 0,
        "Original Sky must obtain approval for the owned fixture",
      );
      const summaries = result.messages
        .flatMap((message) =>
          message.role === "assistant" ? (message.toolCalls ?? []) : [],
        )
        .filter(
          (call) =>
            call.name === "js" &&
            Object.hasOwn(call.arguments, "completion_summary"),
        );
      assert.equal(
        summaries.length,
        1,
        "Follow original completion-report guidance exactly once",
      );
      assert.deepEqual(Object.keys(summaries[0].arguments), [
        "completion_summary",
      ]);
      console.error("RUST SKY SWIFT DEEPSEEK ACCEPTANCE PASSED", result.answer);
    } finally {
      try {
        await runtime?.close();
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
                } catch (error: any) {
                  if (error.code !== "ESRCH") throw error;
                }
            for (const app of apps.filter(
              (value) =>
                value.bundleId === identity!.bundleId &&
                value.path === identity!.path,
            )) {
              const deadline = Date.now() + 5000;
              for (;;) {
                try {
                  process.kill(app.pid, 0);
                } catch (error: any) {
                  assert.equal(error.code, "ESRCH");
                  break;
                }
                assert.ok(
                  Date.now() < deadline,
                  "Owned fixture did not retire",
                );
                await new Promise((resolve) => setTimeout(resolve, 25));
              }
            }
          }
        } finally {
          await helper.close();
          if (root) await rm(root, { recursive: true, force: true });
        }
      }
    }
  },
);
