import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareIndependentRuntime } from "../packages/agent-loop/src/independent-runtime";
test(
  "independent deployment passes the explicit AX setting only to the trusted browser worker",
  { skip: process.platform !== "darwin" },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "core-ax-env-test-"));
    try {
      const endpoint = join(root, "fixture-endpoint.json");
      await writeFile(endpoint, "{}");
      for (const value of [undefined, "0", "1"]) {
        const runtime = await prepareIndependentRuntime(
          {
            CUA_REPL_ENABLED_SURFACES: "browser",
            CORE_CUA_ENDPOINT_FILES: JSON.stringify([endpoint]),
            BROWSER_USE_BACKEND_PATHS: join(root, "fixture.sock"),
            ...(value === undefined
              ? {}
              : { BROWSER_USE_TINYSKY_ENABLED: value }),
            DEEPSEEK_API_KEY: "fixture-never-forward",
          },
          root,
          "fixture-session",
        );
        try {
          const spec = JSON.parse(await readFile(runtime.args[0], "utf8"));
          assert.equal(
            spec.trusted.sandbox.worker_environment.BROWSER_USE_TINYSKY_ENABLED,
            value,
          );
          assert.equal(
            spec.kernel.sandbox.worker_environment.BROWSER_USE_TINYSKY_ENABLED,
            undefined,
          );
          assert(!JSON.stringify(spec).includes("fixture-never-forward"));
          assert.equal(
            spec.trusted.sandbox.worker_environment
              .NODE_REPL_UNTRUSTED_ENV_ALLOWLIST,
            "CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV",
          );
        } finally {
          await runtime.dispose();
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
