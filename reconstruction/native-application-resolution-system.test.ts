import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NativeHelper } from "../packages/native-macos/src/helper";

test("production helper resolves canonical native bundle paths without launching", {
  skip: process.platform !== "darwin", timeout: 30_000,
}, async () => {
  const root = await mkdtemp("/tmp/core-resolve-");
  const app = join(root, "Path Fixture.bundle");
  const contents = join(app, "Contents");
  await mkdir(contents, { recursive: true });
  await writeFile(join(contents, "Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>dev.core.resolve.fixture</string><key>CFBundleDisplayName</key><string>Path Fixture</string><key>CFBundlePackageType</key><string>BNDL</string></dict></plist>`);
  const alias = join(root, "alias.bundle");
  await symlink(app, alias);
  const { helper } = await NativeHelper.connect(resolve("native/macos/.build/debug/cua-helper"));
  try {
    const direct = await helper.request<{ app: { pid: number; path: string; bundleId: string; name: string } }>("resolveApp", { reference: app });
    const indirect = await helper.request<typeof direct>("resolveApp", { reference: alias });
    assert.deepEqual(indirect, direct);
    assert.equal(direct.app.pid, 0);
    assert.equal(direct.app.name, "Path Fixture");
    assert.equal(direct.app.bundleId, "dev.core.resolve.fixture");
    assert.ok(direct.app.path.endsWith("/Path Fixture.bundle"));
    await assert.rejects(helper.request("resolveApp", { reference: join(root, "missing.app") }), /Invalid app:/);
  } finally {
    await helper.close();
    await rm(root, { recursive: true, force: true });
  }
});
