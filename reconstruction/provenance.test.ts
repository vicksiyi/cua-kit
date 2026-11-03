import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { relative, join } from "node:path";

test("installed source hashes match the recorded reconstruction baseline", async () => {
  const manifest = JSON.parse(
    await readFile("reconstruction/source-map.json", "utf8"),
  );
  const root = process.env.CUA_VENDOR_ROOT ?? manifest.sourceRoot;
  for (const [output, entry] of Object.entries(manifest.modules) as Array<
    [string, { source: string; sha256: string }]
  >) {
    const original = join(root, relative(manifest.sourceRoot, entry.source));
    assert.equal(
      createHash("sha256")
        .update(await readFile(original))
        .digest("hex"),
      entry.sha256,
      `${output}: installed source changed; re-review before comparing`,
    );
  }
});
