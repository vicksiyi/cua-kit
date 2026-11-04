import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { z } from "../packages/browser/src/vendor/bundled_zod";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const { original } = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {v as original};").toString("base64")}`
);
function outcome(schema: any, value: any) {
  const result = schema.safeParse(value);
  return result.success
    ? { data: result.data }
    : {
        name: result.error.name,
        message: result.error.message,
        // Union issues embed realm-specific ZodError instances; compare their wire data.
        issues: JSON.parse(JSON.stringify(result.error.issues)),
        flattened: result.error.flatten(),
        formatted: result.error.format(),
      };
}
function standardOutcome(schema: any, value: any) {
  const result = schema["~standard"].validate(value);
  return "issues" in result
    ? { issues: JSON.parse(JSON.stringify(result.issues)) }
    : result;
}
test("upstream Zod v3 preserves original parsing, structured errors and standard-schema results", () => {
  const builders: ((v: any) => any)[] = [
    (v) => v.string().trim().min(1).max(5),
    (v) => v.string().regex(/^[a-z_-]+$/),
    (v) => v.string().email(),
    (v) => v.string().url(),
    (v) => v.string().uuid(),
    (v) => v.number().int().min(0).max(10),
    (v) => v.number().finite(),
    (v) => v.coerce.number(),
    (v) => v.boolean(),
    (v) => v.date(),
    (v) => v.enum(["click", "press_enter"]),
    (v) => v.literal("tab"),
    (v) => v.union([v.string(), v.number()]),
    (v) => v.array(v.string()).min(1).max(3),
    (v) => v.object({ id: v.string(), count: v.number().optional() }),
    (v) => v.object({ id: v.string() }).strict(),
    (v) => v.record(v.boolean()),
    (v) => v.tuple([v.string(), v.number()]),
    (v) => v.string().nullable().optional(),
    (v) => v.string().default("fallback"),
    (v) => v.string().catch("fallback"),
    (v) => v.string().refine((s: string) => s.length > 2, "too short"),
    (v) => v.string().transform((s: string) => s.length),
    (v) =>
      v.intersection(v.object({ a: v.string() }), v.object({ b: v.number() })),
    (v) =>
      v.discriminatedUnion("kind", [
        v.object({ kind: v.literal("text"), text: v.string() }),
        v.object({ kind: v.literal("number"), number: v.number() }),
      ]),
  ];
  const values = [
    undefined,
    null,
    true,
    false,
    0,
    1,
    -1,
    10,
    11,
    1.5,
    NaN,
    Infinity,
    "",
    "  ",
    " abc ",
    "abc",
    "a_b",
    "click",
    "press_enter",
    "a@example.test",
    "https://example.test",
    "550e8400-e29b-41d4-a716-446655440000",
    [],
    ["a"],
    ["a", 2],
    ["a", "b", "c", "d"],
    {},
    { id: "tab", count: 1 },
    { id: 42, count: "1" },
    { id: "tab", extra: true },
    { a: true, b: false },
    { a: "x", b: 2 },
    { kind: "text", text: "ok" },
    { kind: "number", number: "bad" },
    new Date(0),
    new Date(NaN),
  ];
  for (const [index, build] of builders.entries()) {
    const expected = build(original),
      actual = build(z);
    for (const value of values) {
      assert.deepEqual(
        outcome(actual, value),
        outcome(expected, value),
        `schema ${index}`,
      );
      assert.deepEqual(
        standardOutcome(actual, value),
        standardOutcome(expected, value),
        `standard schema ${index}`,
      );
    }
  }
});
test("upstream Zod v3 preserves async refinement issues and nested error paths", async () => {
  const build = (v: any) =>
    v.object({
      items: v.array(
        v
          .string()
          .refine(async (s: string) => s === "valid", "invalid fixture"),
      ),
    });
  for (const value of [
    { items: ["valid"] },
    { items: ["bad", "valid", "bad"] },
    {},
  ]) {
    const outcomes = [];
    for (const library of [original, z]) {
      const result = await build(library).safeParseAsync(value);
      outcomes.push(
        result.success
          ? { data: result.data }
          : {
              issues: result.error.issues,
              message: result.error.message,
              formatted: result.error.format(),
            },
      );
    }
    assert.deepEqual(outcomes[1], outcomes[0]);
  }
});
