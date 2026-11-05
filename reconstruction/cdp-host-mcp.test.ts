/** Actual installed supervisor + restored CUA/MCP inventory, no model request. */
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startCdpHost } from "../packages/cdp-host/src/host";
const exec = promisify(execFile);
test(
  "restored MCP discovers extension-free CDP through the actual demo entry",
  { timeout: 60000 },
  async () => {
    const host = await startCdpHost({ headless: true });
    try {
      const { stdout, stderr } = await exec(
        "npm",
        ["run", "demo:deepseek", "--", "--check-browser"],
        {
          cwd: process.cwd(),
          timeout: 50000,
          maxBuffer: 1024 * 1024,
          env: {
            ...process.env,
            CORE_CUA_ENDPOINT_FILES: JSON.stringify([host.endpointFile]),
            CUA_MCP_ENV: JSON.stringify({
              NODE_REPL_DISABLE_ANALYTICS: "1",
              CUA_REPL_ENABLED_SURFACES: "browser",
              CUA_REPL_BROWSER_ENV: "codex-app",
              BROWSER_USE_AVAILABLE_BACKENDS: "cdp",
            }),
          },
        },
      );
      assert.match(stdout + stderr, /"type":"cdp"/);
      assert.match(stdout + stderr, /Browser connection verified/);
    } finally {
      await host.close();
    }
  },
);

test(
  "explicit existing-browser CLI endpoint discovers inventory and leaves the external browser alive",
  { timeout: 60000 },
  async () => {
    const { startOwnedCdpBrowser } =
      await import("../packages/cdp-host/src/owned-browser");
    const browser = await startOwnedCdpBrowser({ headless: true });
    try {
      const { stdout, stderr } = await exec(
        "npm",
        [
          "run",
          "demo:deepseek",
          "--",
          "--cdp-endpoint",
          browser.endpoint,
          "--check-browser",
        ],
        {
          cwd: process.cwd(),
          timeout: 50000,
          maxBuffer: 1024 * 1024,
          env: {
            ...process.env,
            CUA_MCP_ENV: JSON.stringify({
              NODE_REPL_DISABLE_ANALYTICS: "1",
              CUA_REPL_ENABLED_SURFACES: "browser",
              CUA_REPL_BROWSER_ENV: "codex-app",
              BROWSER_USE_AVAILABLE_BACKENDS: "cdp",
            }),
          },
        },
      );
      assert.match(stdout + stderr, /Connected Chrome \(CDP\)/);
      assert.match(stdout + stderr, /Browser connection verified/);
      assert.ok(
        (await browser.connection.send("Target.getTargets")).targetInfos
          .length > 0,
      );
    } finally {
      await browser.close();
    }
  },
);
