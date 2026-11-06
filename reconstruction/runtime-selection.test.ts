import test from "node:test";
import assert from "node:assert/strict";
import { selectRuntime } from "../packages/agent-loop/src/runtime-selection";

test("desktop entry selects original Sky Swift route and migrates legacy name without mutating input", () => {
  for (const backend of [undefined, "independent", "swift"]) {
    const input: Record<string, string> = {
      CUA_REPL_ENABLED_SURFACES: " computer ",
    };
    if (backend) input.CORE_CUA_NATIVE_BACKEND = backend;
    const before = { ...input };
    for (const supervisor of [undefined, "rust", "independent"]) {
      const result = selectRuntime(input, supervisor);
      assert.equal(result.supervisor, "rust");
      assert.equal(result.environment.CORE_CUA_NATIVE_BACKEND, "swift");
      assert.equal(result.environment.NODE_REPL_TRUSTED_SERVICES, undefined);
      assert.deepEqual(input, before);
    }
  }
});
test("browser defaults to reconstructed Rust; generic JS and explicit vendor comparisons retain installed", () => {
  assert.equal(selectRuntime({}).supervisor, "installed");
  assert.equal(selectRuntime({CUA_REPL_ENABLED_SURFACES:" browser "}).supervisor,"rust");
  assert.equal(selectRuntime({CUA_REPL_ENABLED_SURFACES:"browser"},"installed").supervisor,"installed");
  assert.equal(selectRuntime({CUA_REPL_ENABLED_SURFACES:"browser,computer",CORE_CUA_NATIVE_BACKEND:"vendor"}).supervisor,"installed");
  assert.equal(
    selectRuntime({
      CUA_REPL_ENABLED_SURFACES: "computer",
      CORE_CUA_NATIVE_BACKEND: "vendor",
    }).supervisor,
    "installed",
  );
  assert.equal(
    selectRuntime({ CUA_REPL_ENABLED_SURFACES: "browser" }, "independent")
      .supervisor,
    "rust",
  );
});
test("incompatible selections fail before supervisor launch instead of silently swapping services", () => {
  assert.throws(
    () => selectRuntime({ CUA_REPL_ENABLED_SURFACES: "computer" }, "installed"),
    /requires CUA_RUNTIME_SUPERVISOR=rust/,
  );
  assert.throws(
    () => selectRuntime({ CORE_CUA_NATIVE_BACKEND: "independent" }),
    /requires computer surface/,
  );
  assert.throws(
    () =>
      selectRuntime(
        {
          CUA_REPL_ENABLED_SURFACES: "computer",
          CORE_CUA_NATIVE_BACKEND: "vendor",
        },
        "rust",
      ),
    /requires CUA_RUNTIME_SUPERVISOR=installed/,
  );
  assert.throws(
    () => selectRuntime({}, "typescript"),
    /CUA_RUNTIME_SUPERVISOR must/,
  );
  assert.throws(
    () => selectRuntime({ CORE_CUA_NATIVE_BACKEND: "unknown" }),
    /CORE_CUA_NATIVE_BACKEND must/,
  );
  assert.throws(
    () =>
      selectRuntime({
        CUA_REPL_ENABLED_SURFACES: "computer",
        NODE_REPL_TRUSTED_SERVICES: '{"sky":"@core/native-macos/service"}',
      }),
    /original @core\/sky\/service/,
  );
});

test(
  "direct legacy backend selector reaches Rust native inventory without installed supervisor",
  {
    skip:
      process.platform !== "darwin" ||
      process.env.CUA_TEST_NATIVE_SKY_IPC !== "1",
    timeout: 30000,
  },
  async () => {
    const { spawn } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "packages/agent-loop/src/restored-demo.ts",
        "--check-computer",
      ],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          CUA_DEBUG: "0",
          CUA_NATIVE_SUPERVISOR_PATH: "/nonexistent/installed-supervisor",
          CUA_MCP_ENV: JSON.stringify({
            CUA_REPL_ENABLED_SURFACES: "computer",
            CORE_CUA_NATIVE_BACKEND: "independent",
            NODE_REPL_DISABLE_ANALYTICS: "1",
          }),
        },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 25000,
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(code, 0, output);
    assert.match(
      output,
      /Rust independent sandboxed runtime supervisor selected/,
    );
    assert.match(output, /Native computer service verified by app inventory/);
    assert.match(output, /No model request or app action was performed/);
  },
);
