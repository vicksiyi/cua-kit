import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { createKernelBrowserRuntime } from "../packages/browser-extension/src/kernel_browser_bridge";
const root = process.env.CUA_EXTENSION_SOURCE_ROOT ?? `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = readFileSync(`${root}/chunks/js-kernel-host-COXQa-ka.js`, "utf8");
assert.equal(createHash("sha256").update(source).digest("hex"), "5ea78ade270d71bb6ffcec719207ad02bf63db30d0c16058f24a74a7f9f3682a");
const defs: string[] = [];
for (const n of (parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any).body)
  if (n.type === "VariableDeclaration") for (const d of n.declarations)
    if (["TS", "vg", "Pw"].includes(d.id.name)) defs.push(`const ${source.slice(d.start, d.end)};`);
const original = new Function(`${defs.join("\n")};return {errorReporter:TS,commandTiming:vg,performanceSpan:Pw}`)();

test("assembled kernel defaults preserve original callback, rejection and reference behavior without Node instrumentation", async () => {
  const runtime = createKernelBrowserRuntime({ setMessageCallback() {}, sendMessage() {} }, { platform: "linux", locks: { request: async (_name, fn) => fn() } });
  const outputs = [];
  for (const services of [original, runtime]) {
    const trace: any[] = [];
    const { errorReporter, commandTiming, performanceSpan }: any = services;
    const marker = {}, promise = Promise.resolve(marker), failure = Error("callback");
    assert.equal(commandTiming.trackElicitation(promise), promise);
    assert.equal(performanceSpan.currentPlaywrightOperation(marker), marker);
    assert.notEqual(performanceSpan.currentCommandAttrs(), performanceSpan.currentCommandAttrs());
    const command = commandTiming.startCommand("cmd", () => { throw Error("unexpected telemetry"); });
    assert.equal(await command.run(() => { trace.push("command"); return marker; }), marker);
    await assert.rejects(command.run(() => { throw failure; }), error => error === failure);
    await assert.rejects(performanceSpan.withSpan("span", {}, () => Promise.reject(failure)), error => error === failure);
    assert.equal(await performanceSpan.withCommandTelemetry("cmd", {}, () => marker), marker);
    const retry = commandTiming.startLocatorRetry("locator");
    trace.push(command.finish("success"), retry.attemptFailed(failure), retry.finish(), errorReporter.captureException(failure), errorReporter.setUser(marker), errorReporter.setTag("key", "value"));
    outputs.push(trace);
  }
  assert.deepEqual(outputs[1], outputs[0]);
});
