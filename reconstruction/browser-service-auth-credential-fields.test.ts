import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  classifyCredentialFields,
  classifyAuthCredentialFields,
  credentialUsernameTypes,
} from "../packages/browser/src/service/browser_auth/credential_fields";
const original = originalServiceBindings(["KT", "Rc"], {
  M8: ["text", "email", "tel", "number", "search", "url"],
});
test("credential classifier matches original field/label/autocomplete matrix and retains identities", () => {
  let count = 0;
  for (const type of [
    ...credentialUsernameTypes,
    "password",
    "hidden",
    "checkbox",
  ])
    for (const label of [
      undefined,
      "Username",
      "user_name",
      "customer—number",
      "rapid rewards no.",
      "Code:",
      "PIN*",
      "token",
      "one-time password",
      "TOTP",
      "verification code",
      "2FA",
      "security code",
      "Account",
      "other",
    ])
      for (const autocomplete of [
        undefined,
        "USERNAME",
        "section-a username",
        "one-time-code",
        "new-password",
        "username one-time-code",
        "current-password",
      ])
        for (const allow of [false, true]) {
          const fields: any[] = [
            { id: "user", type, label, autocomplete },
            { id: "pass", type: "password", label: "Password" },
          ];
          const actual = classifyCredentialFields(fields, allow);
          assert.deepEqual(actual, original.KT(fields, allow));
          if (actual?.username) assert.equal(actual.username, fields[0]);
          if (actual) assert.equal(actual.password, fields[1]);
          count++;
        }
  assert.equal(count, 1890);
});
test("credential classification preserves option ambiguity, duplicate IDs and metadata projection", () => {
  const base: any[] = [
    { id: "u", type: "text", label: "User" },
    { id: "p", type: "password" },
  ];
  const fieldSets = [
    base,
    [base[1]],
    [...base, { id: "u2", type: "email" }],
    [...base, { id: "u2", type: "email", autocomplete: "username" }],
    [...base, { id: "p2", type: "password" }],
    [{ ...base[0], id: "p" }, base[1]],
    [],
  ];
  for (const fields of fieldSets)
    for (const ids of [
      undefined,
      null,
      [],
      [[]],
      [["u", "p"]],
      [["p"]],
      [["u"]],
      [["p"], ["p"]],
      [["u", "p"], ["u2"]],
    ])
      for (const allow of [false, true])
        assert.deepEqual(
          classifyCredentialFields(fields, allow, ids),
          original.KT(fields, allow, ids),
        );
  const fields = base.map((field) => ({
    ...field,
    type: "ignored",
    label: "ignored",
    labelMetadata: {
      input_type: field.type,
      autocomplete: null,
      accessible_name: field.label,
    },
    extra: { keep: true },
  }));
  for (const options of [
    undefined,
    null,
    [],
    [{}],
    [{ field_ids: ["u", "p"] }],
    [{ field_ids: ["p"] }],
    [{ field_ids: null }],
  ])
    for (const allow of [false, true]) {
      const actual = classifyAuthCredentialFields(fields, allow, options);
      assert.deepEqual(actual, original.Rc(fields, allow, options));
      if (actual?.username) {
        assert.notEqual(actual.username, fields[0]);
        assert.equal(actual.username.labelMetadata, fields[0].labelMetadata);
        assert.equal(actual.username.extra, fields[0].extra);
      }
    }
  assert.throws(() => classifyAuthCredentialFields([{ id: "bad" }]));
  assert.throws(() => original.Rc([{ id: "bad" }]));
});
