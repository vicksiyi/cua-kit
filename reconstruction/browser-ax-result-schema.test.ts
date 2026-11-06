import test from "node:test";
import assert from "node:assert/strict";
import { z } from "../packages/browser/src/vendor/bundled_zod";
import { SiwcDetectionSchema } from "../packages/browser/src/commands/siwc";
import { StateResultSchema } from "../packages/browser/src/commands/ax";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
const original = originalServiceBindings(["x9"], {
  p: z,
  yi: SiwcDetectionSchema,
}).x9;
test("AX result schema preserves snapshot and SIWC metadata exactly as source", () => {
  for (const input of [
    {},
    {
      state: "fixture",
      snapshotId: "snapshot",
      siwc: { status: "no_deterministic_matches", candidates: [] },
    },
    {
      data: "image",
      snapshotId: "",
      siwc: { status: "unavailable", reason: "page_changed" },
    },
    { snapshotId: 123 },
    { siwc: { status: "possible_matches", candidates: [] } },
    { state: 123 },
    { state: "ok", unknown: "stripped" },
  ]) {
    const expected = original.safeParse(input),
      actual = StateResultSchema.safeParse(input);
    assert.equal(actual.success, expected.success);
    if (actual.success && expected.success)
      assert.deepEqual(actual.data, expected.data);
  }
});
