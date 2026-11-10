/** Opt-in fixed MCP/Swift reproduction; no model calls, owned fixture only. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { connectNativeAcceptanceRuntime } from "./native-deepseek-runtime";
import { NativeHelper, type NativeAppInfo } from "../packages/native-macos/src/helper";

test("fixed MCP native app bind and sequential actions", { skip: process.env.CUA_NATIVE_FIXED_TEST !== "1", timeout: 60000 }, async () => {
 const root = await mkdtemp("/tmp/core-fixed-native-");
 const app = join(root, "FixedFixture.app"), contents = join(app, "Contents");
 const bundleId = `dev.core.fixed.${randomUUID()}`;
 await mkdir(join(contents, "MacOS"), { recursive: true });
 await copyFile(resolve("native/macos/.build/debug/CuaFixture"), join(contents, "MacOS/CuaFixture"));
 await writeFile(join(contents, "Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>CuaFixture</string><key>CFBundleIdentifier</key><string>${bundleId}</string><key>CFBundleName</key><string>FixedFixture</string><key>CFBundlePackageType</key><string>APPL</string>${process.env.CUA_FIXED_DYNAMIC === "1" ? "<key>CoreFixtureDynamicUpdates</key><true/>" : ""}</dict></plist>`);
 await mkdir(resolve("artifacts/debug"), { recursive: true });
 const log = resolve(`artifacts/debug/fixed-native-${randomUUID()}.jsonl`);
 const runtime = await connectNativeAcceptanceRuntime(bundleId, { inputLogPath: log });
 const signal = AbortSignal.timeout(30000);
 const execute = async (code: string) => {
  const result = await runtime.turn.callTool({ id: randomUUID(), name: "js", arguments: { code, title: "Owned fixture verification", timeout_ms: 15000 } }, signal);
  console.error(JSON.stringify({ code, result }));
  return result;
 };
 try {
  assert.ok(!(await execute(`let fixedApp = await cua.getApp(${JSON.stringify(app)});`)).isError, `bind failed; ${log}`);
  const combined = await execute('await fixedApp.setValue(1, "fixed-marker"); await fixedApp.click(2);');
  // Preserve this failure as reproduction evidence; do not silently retry input.
  assert.ok(!combined.isError, `sequential actions failed; ${log}`);
  const state = await execute('await fixedApp.getAXState();');
  assert.ok(JSON.stringify(state).includes("Saved fixed-marker"));
  if (process.env.CUA_FIXED_DYNAMIC === "1") {
   assert.ok(JSON.stringify(state).includes("app updated during capture"), "Dynamic capture must disclose refreshed AX/image timing");
   assert.ok((await execute('await fixedApp.click([0, 0]);')).isError, "Changed screenshot must not authorize coordinates");
   assert.ok(!(await execute('await fixedApp.getAXState();')).isError);
  }
  const priorLog = process.env.CUA_NATIVE_INPUT_LOG;
  process.env.CUA_NATIVE_INPUT_LOG = `${log}.verifier.jsonl`;
  const { helper: verifier } = await NativeHelper.connect(resolve("native/macos/.build/debug/cua-helper"));
  if (priorLog === undefined) delete process.env.CUA_NATIVE_INPUT_LOG; else process.env.CUA_NATIVE_INPUT_LOG = priorLog;
  try {
   const { apps } = await verifier.request<{ apps: NativeAppInfo[] }>("listApps");
   const running = apps.find(value => value.bundleId === bundleId);
   assert.ok(running);
   console.error("VERIFIER_BIND_BEGIN", running.pid, `${log}.verifier.jsonl`);
   const bound = await verifier.request<{targetId: string}>("bind", { pid: running.pid }, 5000);
   console.error("VERIFIER_BIND_END");
   const observed = await verifier.request(process.env.CUA_VERIFY_SECOND_CAPTURE === "1" ? "observeWithScreenshot" : "observe", { targetId: bound.targetId }, 10000);
   assert.ok(JSON.stringify(observed).includes("Saved fixed-marker"));
  } finally { await verifier.close(); }
  const rejected = await execute('await fixedApp.click(999999);');
  assert.ok(rejected.isError, "Unknown element must be rejected");
  const withoutObservation = await execute('await fixedApp.click(2);');
  assert.ok(withoutObservation.isError, "Failed action must not grant a continuation");
 } finally {
  await runtime.close();
  const { helper } = await NativeHelper.connect(resolve("native/macos/.build/debug/cua-helper"));
  try {
   const { apps } = await helper.request<{ apps: NativeAppInfo[] }>("listApps");
   for (const owned of apps.filter(value => value.bundleId === bundleId)) process.kill(owned.pid, "SIGTERM");
  } finally { await helper.close(); await rm(root, { recursive: true, force: true }); }
 }
});
