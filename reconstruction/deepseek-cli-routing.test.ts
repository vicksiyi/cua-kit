import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("CLI routes deployment flags independently of surface/check flag order", async (t) => {
  const root = await mkdtemp("/tmp/cua-cli-routing-");
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "npm"), '#!/bin/sh\necho BUILD_FIXTURE "$@"\n', {
    mode: 0o700,
  });
  await writeFile(
    join(root, "node"),
    `#!${process.execPath}\nif(process.argv[2]==='--input-type=module'){const child=require('node:child_process').spawnSync(process.execPath,process.argv.slice(2),{stdio:'inherit'});process.exit(child.status??1);}console.log(JSON.stringify({provider:process.env.CUA_MODEL_PROVIDER,autoApprove:process.env.CUA_AUTO_APPROVE,cliParsed:process.env.CUA_DEMO_CLI_PARSED,runtime:process.env.CUA_RUNTIME_SUPERVISOR,native:process.env.CORE_CUA_NATIVE_BACKEND,configuration:process.env.CUA_MCP_ENV,argv:process.argv.slice(2),startChrome:process.env.CUA_DEMO_START_CHROME,endpoint:process.env.CUA_CDP_ENDPOINT}));\n`,
    { mode: 0o700 },
  );
  const run = (args: string[], extra: Record<string, string> = {}) =>
    spawnSync("/bin/bash", [resolve("scripts/run-deepseek.sh"), ...args], {
      encoding: "utf8",
      timeout: 5000,
      env: {
        PATH: root + ":/usr/bin:/bin",
        HOME: process.env.HOME,
        DEEPSEEK_API_KEY: "fixture-not-a-secret",
        CUA_DEMO_START_CHROME: "1",
        ...extra,
      },
    });
  for (const args of [
    ["--cdp-browser", "--browser", "prompt"],
    ["--browser", "--cdp-browser", "prompt"],
    ["--cdp-browser", "--check-browser"],
    ["--check-browser", "--cdp-browser"],
    [
      "--browser",
      "--cdp-endpoint",
      "ws://127.0.0.1:9222/devtools/browser/test",
      "prompt",
    ],
  ]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
    assert.equal(value.argv[2], "packages/agent-loop/src/cdp-demo.ts");
    assert.equal(value.startChrome, undefined);
    assert.ok(!value.argv.slice(3).includes("--cdp-browser"));
  }
  for (const args of [
    ["--auto-approve", "--computer", "prompt"],
    ["--computer", "--auto-approve", "prompt"],
    ["--browser", "--auto-approve", "prompt"],
    ["--cdp-browser", "--auto-approve", "prompt"],
    ["--unified", "--auto-approve", "prompt"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
    assert.equal(value.autoApprove, "1");
    assert.ok(!value.argv.includes("--auto-approve"), "Flag must not become model prompt");
  }
  const literalApprovalFlag = run(["--js", "--", "--auto-approve"]);
  assert.equal(literalApprovalFlag.status, 0, literalApprovalFlag.stderr);
  const literalValue = JSON.parse(literalApprovalFlag.stdout.trim().split("\n").at(-1)!);
  assert.equal(literalValue.autoApprove, undefined);
  assert.equal(literalValue.cliParsed, "1");
  assert.equal(literalValue.argv.at(-1), "--auto-approve");
  for (const args of [
    ["--cdp-browser", "--managed-browser", "prompt"],
    ["--managed-browser", "--cdp-browser", "prompt"],
    ["--browser", "--computer", "prompt"],
    ["--computer", "--cdp-browser", "prompt"],
    ["--swift-computer", "--browser", "prompt"],
    ["--browser", "--swift-computer", "prompt"],
    ["--swift-computer", "--cdp-browser", "prompt"],
    ["--check-browser", "--swift-computer"],
    ["--cdp-endpoint"],
    ["--unknown", "prompt"],
    ["--check-browser", "prompt"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 2, JSON.stringify({ args, ...result }));
    assert.ok(!result.stdout.includes("BUILD_FIXTURE"));
  }
  for (const args of [
    ["--computer", "prompt"],
    ["--check-computer"],
    ["--computer", "--check-computer"],
    ["--swift-computer", "prompt"],
    ["--swift-computer", "--check-computer"],
    ["--check-computer", "--swift-computer"],
  ]) {
    const result = run(args, {
      CUA_RUNTIME_SUPERVISOR: "installed",
      CUA_MCP_ENV: JSON.stringify({
        CUA_REPL_ENABLED_SURFACES: "browser",
        CORE_CUA_NATIVE_BACKEND: "independent",
        NODE_REPL_DISABLE_ANALYTICS: "1",
      }),
    });
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
    assert.match(result.stdout, /BUILD_FIXTURE run build:native/);
    assert.match(result.stdout, /BUILD_FIXTURE run build:rust-runtime/);
    assert.equal(value.runtime, "rust");
    assert.equal(value.native, "swift");
    assert.equal(value.startChrome, undefined);
    const config = JSON.parse(value.configuration);
    assert.equal(config.CUA_REPL_ENABLED_SURFACES, "computer");
    assert.equal(config.CORE_CUA_NATIVE_BACKEND, "swift");
    assert.equal(config.NODE_REPL_DISABLE_ANALYTICS, "1");
    assert.equal(value.argv[2], "packages/agent-loop/src/restored-demo.ts");
  }
  for (const runtime of ["rust", "independent"]) {
    const result = run(["--cdp-browser", "--check-browser"], {
      CUA_RUNTIME_SUPERVISOR: runtime,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /BUILD_FIXTURE run build:rust-runtime/);
  }
  assert.ok(
    !run(["--check-browser"], {
      CUA_RUNTIME_SUPERVISOR: "installed",
    }).stdout.includes("build:rust-runtime"),
  );
  const compatible = run(["--computer", "prompt"], {
    CUA_MODEL_PROVIDER: "openai-compatible",
    CUA_MODEL_API_KEY: "fixture-only",
    DEEPSEEK_API_KEY: "",
  });
  assert.equal(compatible.status, 0, compatible.stderr);
  assert.equal(
    JSON.parse(compatible.stdout.trim().split("\n").at(-1)!).provider,
    "openai-compatible",
  );
  const missing = run(["prompt"], {
    CUA_MODEL_PROVIDER: "openai-compatible",
    DEEPSEEK_API_KEY: "irrelevant-fixture",
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Set CUA_MODEL_API_KEY/);
  const invalid = run(["--check-computer"], {
    CUA_MODEL_PROVIDER: "unsupported",
  });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Unsupported CUA_MODEL_PROVIDER/);
  assert.ok(!invalid.stdout.includes("BUILD_FIXTURE"));
  const normal = JSON.parse(run(["prompt"]).stdout.trim().split("\n").at(-1)!);
  assert.equal(normal.argv[2], "packages/agent-loop/src/restored-demo.ts");
  assert.equal(
    normal.startChrome,
    process.platform === "darwin" ? undefined : "1",
  );
  assert.equal(
    JSON.parse(normal.configuration).CUA_REPL_ENABLED_SURFACES,
    process.platform === "darwin" ? "browser,computer" : "browser",
  );
  for (const args of [
    ["--browser", "prompt"],
    ["--cdp-browser", "prompt"],
    ["--managed-browser", "prompt"],
  ]) {
    const output = run(args, {
      CORE_CUA_NATIVE_BACKEND: "swift",
      CORE_CUA_NATIVE_HELPER_PATH: "/nonexistent/helper",
      CUA_MCP_ENV: JSON.stringify({
        CUA_REPL_ENABLED_SURFACES: "computer",
        CORE_CUA_NATIVE_BACKEND: "swift",
        CORE_CUA_NATIVE_HELPER_PATH: "/nonexistent/helper",
        NODE_REPL_DISABLE_ANALYTICS: "1",
      }),
    });
    assert.equal(output.status, 0, output.stderr);
    const parsed = JSON.parse(output.stdout.trim().split("\n").at(-1)!);
    assert.equal(
      JSON.parse(parsed.configuration).CUA_REPL_ENABLED_SURFACES,
      "browser",
    );
    assert.equal(
      JSON.parse(parsed.configuration).CORE_CUA_NATIVE_BACKEND,
      undefined,
    );
    assert.equal(parsed.native, undefined);
    assert.ok(!output.stdout.includes("BUILD_FIXTURE run build:native"));
  }
  // Only the test PATH supplies this uname stub; production has no platform override.
  await writeFile(join(root, "uname"), '#!/bin/sh\necho "$FIXTURE_KERNEL"\n', {
    mode: 0o700,
  });
  for (const [kernel, surfaces] of [
    ["Darwin", "browser,computer"],
    ["Linux", "browser"],
  ]) {
    const output = run(["prompt"], { FIXTURE_KERNEL: kernel });
    assert.equal(output.status, 0, output.stderr);
    const parsed = JSON.parse(output.stdout.trim().split("\n").at(-1)!);
    assert.equal(
      JSON.parse(parsed.configuration).CUA_REPL_ENABLED_SURFACES,
      surfaces,
    );
    assert.equal(parsed.startChrome, kernel === "Darwin" ? undefined : "1");
  }
  const check = JSON.parse(
    run(["--check-browser"]).stdout.trim().split("\n").at(-1)!,
  );
  assert.equal(check.startChrome, undefined);
  const literal = JSON.parse(
    run(["--", "--literal prompt"]).stdout.trim().split("\n").at(-1)!,
  );
  assert.equal(literal.argv[3], "--literal prompt");
});
