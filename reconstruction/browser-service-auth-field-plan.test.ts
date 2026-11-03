import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import * as plan from "../packages/browser/src/service/browser_auth/field_plan";
const original = originalServiceBindings(
  [
    "ote",
    "Sv",
    "ite",
    "ate",
    "aN",
    "ste",
    "nN",
    "tN",
    "dte",
    "hte",
    "fte",
    "Th",
  ],
  { Ga: "otp", Vee: 16384 },
);
const field = (id: string, extra: any = {}): plan.AuthField => ({
  id,
  selector: "#" + id,
  label: id,
  type: "text",
  required: true,
  labelMetadata: { input_mode: "numeric", accessible_name: id },
  ...extra,
});
test("auth prompt plans preserve original OTP grouping, metadata projection and reference identity", () => {
  for (const count of [0, 1, 3, 4, 6])
    for (const mode of [
      "numeric",
      "plain",
      "autocomplete",
      "metadata",
      "mixed-type",
      "metadata-id",
    ]) {
      const fields = Array.from({ length: count }, (_, i) =>
        field(
          "f" + i,
          mode === "plain"
            ? { labelMetadata: {} }
            : mode === "autocomplete"
              ? { autocomplete: "ONE-TIME-CODE", labelMetadata: {} }
              : mode === "metadata"
                ? { labelMetadata: { autocomplete: "one-time-code" } }
                : mode === "mixed-type" && i === 0
                  ? { type: "password" }
                  : mode === "metadata-id"
                    ? {
                        labelMetadata: {
                          id: "override",
                          input_mode: "numeric",
                        },
                      }
                    : {},
        ),
      );
      const actual = plan.createAuthFieldPlan(fields),
        expected = original.aN(fields);
      assert.deepEqual(actual, expected, `${count}/${mode}`);
      assert.equal(plan.isSplitOtp(fields), original.ate(fields));
      if (fields.length)
        assert.equal(actual.fillFields[0].fields[0], fields[0]);
      if (plan.isSplitOtp(fields))
        assert.equal(actual.fillFields[0].fields, fields);
      else if (fields.length)
        assert.equal(
          actual.promptFields[0].label_metadata,
          fields[0].labelMetadata,
        );
    }
});
test("auth locator layouts and QR-only requests preserve original uniqueness boundaries", () => {
  const base = { fields: [field("a"), field("b")] };
  const cases: any[] = [
    base,
    { fields: [] },
    { fields: [field("a"), field("a")] },
    { fields: [field("a"), field("b", { selector: "#a" })] },
  ];
  for (const options of [
    undefined,
    [],
    [{ id: "a", field_ids: ["a"] }],
    [{ id: "x", field_ids: ["a", "a"] }],
    [{ id: "x", field_ids: ["missing"] }],
    [{ id: "x", selector: "#a" }],
    [
      { id: "x", selector: "#x" },
      { id: "y", selector: "#x" },
    ],
    [{ id: "x" }, { id: "x" }],
  ])
    for (const submit of [
      undefined,
      { action: "click", selector: "#a" },
      { action: "press_enter", selector: "#a" },
      { action: "click", selector: "#x" },
    ])
      cases.push({ ...base, options, submit });
  for (const request of cases)
    assert.equal(plan.validAuthLocatorLayout(request), original.ote(request));
  for (const qr_code of [true, false, undefined])
    for (const options of [undefined, null, []])
      for (const submit of [undefined, null, { action: "click" }]) {
        const request = { fields: [], qr_code, options, submit };
        assert.equal(plan.isQrOnlyAuth(request), original.Sv(request));
      }
  for (const selector of [
    "html",
    "iframe >> internal:control=enter-frame >> input",
    "iframe>>internal:control=enter-frame>>input",
  ])
    assert.equal(plan.isAuthFrameSelector(selector), original.ite(selector));
});
test("auth options preserve full OTP groups, original field order and ordinary credential constraints", () => {
  for (const split of [false, true]) {
    const fields = Array.from({ length: 4 }, (_, i) =>
      field("f" + i, split ? {} : { labelMetadata: {} }),
    );
    const actualPlan = plan.createAuthFieldPlan(fields),
      sourcePlan = original.aN(fields);
    for (const field_ids of [
      undefined,
      [],
      ["f0"],
      ["f3", "f2", "f1", "f0"],
      ["missing"],
      ["f0", "f0"],
    ]) {
      const options = [{ id: "choice", field_ids }];
      assert.deepEqual(
        plan.mapAuthOptions(options, actualPlan),
        original.ste(options, sourcePlan),
      );
      assert.equal(plan.findAuthOption("choice", options), options[0]);
      for (const values of [
        {},
        { f0: "" },
        { f0: "value" },
        { otp: "1234" },
        { f0: null },
      ])
        assert.equal(
          plan.validAuthOptionValues(values, options[0], actualPlan),
          original.dte(values, options[0], sourcePlan),
        );
    }
  }
  const fields = [field("user"), field("pass"), field("extra")];
  for (const options of [
    undefined,
    [],
    [{ id: "a", field_ids: ["user", "pass"] }],
    [{ id: "a", field_ids: ["user", "pass", "extra"] }],
  ])
    for (const username of [undefined, "user"])
      for (const version of [undefined, "1", "2"])
        assert.equal(
          plan.allowsOrdinaryCredentialOption(
            options,
            fields,
            username,
            "pass",
            version,
          ),
          original.nN(options, fields, username, "pass", version),
        );
});
test("credential submission values preserve original length, null-prototype and required-field checks", async () => {
  const fields = [
    { id: "a", required: true },
    { id: "b", required: false },
    { id: "__proto__", required: false },
  ];
  for (const value of [
    null,
    [],
    "x",
    {},
    { a: "" },
    { a: " " },
    { a: 1 },
    { a: "x", unknown: "x" },
    { a: "x".repeat(16384) },
    { a: "x".repeat(16385) },
    { a: "😀".repeat(8192) },
    Object.assign(Object.create({ b: "inherited" }), { a: "x" }),
    JSON.parse('{"a":"x","__proto__":"literal"}'),
  ]) {
    const actual = plan.validateAuthValues(value, fields);
    assert.deepEqual(actual, original.fte(value, fields));
    if (actual) assert.equal(Object.getPrototypeOf(actual), null);
  }
  for (const fails of [false, true]) {
    const challenge = {
      async complete(value: unknown) {
        if (fails) throw new Error("fixture");
        return value;
      },
    };
    assert.equal(
      await plan.completeAuthChallenge(challenge, "submitted"),
      await original.Th(challenge, "submitted"),
    );
  }
});
