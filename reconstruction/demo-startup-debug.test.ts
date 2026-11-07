import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
test("runtime configuration failure is logged before model or MCP startup", () => {
  const child = spawnSync(process.execPath, ["--import", "tsx",
    "packages/agent-loop/src/restored-demo.ts", "fixture"], {
    cwd: root, encoding: "utf8", timeout: 20_000,
    env: { ...process.env, CUA_DEBUG: "1", CUA_MCP_ENV: "[]" },
  });
  assert.equal(child.status, 1, child.stderr);
  const match = /Local debug log: (.+)/.exec(child.stderr);
  assert.ok(match, child.stderr);
  try {
    const rows = readFileSync(match[1], "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(rows.map(row => row.event), ["entry.start", "entry.error", "entry.closed"]);
    assert.match(rows[1].data.error.message, /CUA_MCP_ENV must be a JSON string map/);
    assert.equal(rows[2].data.failed, true);
    assert.equal((child.stderr.match(/Local debug log:/g) ?? []).length, 1);
  } finally { unlinkSync(match[1]); }
});

test("startup logging respects CUA_DEBUG=0 without suppressing original failure", () => {
  const child = spawnSync(process.execPath, ["--import", "tsx",
    "packages/agent-loop/src/restored-demo.ts", "fixture"], {
    cwd: root, encoding: "utf8", timeout: 20_000,
    env: { ...process.env, CUA_DEBUG: "0", CUA_MCP_ENV: "[]" },
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /CUA_MCP_ENV must be a JSON string map/);
  assert.doesNotMatch(child.stderr, /Local debug log:/);
});
