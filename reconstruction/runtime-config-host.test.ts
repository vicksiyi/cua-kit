import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createReadonlyConfigHost } from "../packages/runtime-supervisor/src/config-host";

test("explicit TOML sources preserve restrictions, refresh reads, reject writes and unauthorized scopes", async t => {
  const root = await mkdtemp(join(tmpdir(), "core-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configFile = join(root, "config.toml"), requirementsFile = join(root, "requirements.toml"), preferences = join(root, "browser.toml");
  await writeFile(configFile, '[browser_use]\nallow_history_access = false\n');
  await writeFile(requirementsFile, '[featureRequirements]\nbrowser_use_full_cdp_access = false\n');
  await writeFile(preferences, 'full_cdp_access_enabled = false\n');
  const host = createReadonlyConfigHost({ configFile, requirementsFile, workingDirectories: [root], tomlFiles: { "browser/config.toml": preferences } });
  const request = (action: string, fields = {}) => host({ type: "config_action", action, ...fields });
  assert.equal((await request("read_config", { cwd: root, include_layers: false })).value.config.browser_use.allow_history_access, false);
  assert.equal((await request("read_config_requirements")).value.requirements.featureRequirements.browser_use_full_cdp_access, false);
  assert.equal((await request("read_toml", { path: "browser/config.toml" })).value.full_cdp_access_enabled, false);
  await writeFile(preferences, 'full_cdp_access_enabled = false\nmarker = "updated"\n');
  assert.equal((await request("read_toml", { path: "browser/config.toml" })).value.marker, "updated");
  for (const action of ["write_toml", "write_config_value", "batch_write_config"])
    await assert.rejects(request(action), /read-only/);
  await assert.rejects(request("read_toml", { path: "../config.toml" }), /not authorized/);
  await assert.rejects(request("read_config", { cwd: "/", include_layers: false }), /scope/);
  await assert.rejects(request("read_config", { cwd: root, include_layers: true }), /layer/);
  await writeFile(preferences, 'secret = "PRIVATE_SENTINEL\n');
  await assert.rejects(request("read_toml", { path: "browser/config.toml" }), error => error instanceof Error && !error.message.includes("PRIVATE_SENTINEL") && /invalid/.test(error.message));
  await writeFile(preferences, "value = inf\n");
  await assert.rejects(request("read_toml", { path: "browser/config.toml" }), /invalid/);
  await rm(preferences);
  await assert.rejects(request("read_toml", { path: "browser/config.toml" }), /unavailable/);
  await symlink(configFile, preferences);
  await assert.rejects(request("read_toml", { path: "browser/config.toml" }), /unavailable/);
  await rm(preferences);
  await writeFile(preferences, "x".repeat(1024 * 1024 + 1));
  await assert.rejects(request("read_toml", { path: "browser/config.toml" }), /size limit/);
});
