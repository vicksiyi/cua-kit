import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BrowserAuthHandoff } from "../packages/browser/dist/commands/browser_auth.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {Ru};").toString("base64")}`
);
function outcome(fn: () => any) {
  try {
    return { value: fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}
const field = {
  id: "password",
  label: "Password",
  type: "password",
  required: true,
  selector: "#p",
};
const base = {
  browser_id: "b",
  tab_id: "t",
  origin: "https://example.test",
  fields: [field],
};

test("auth payload schema preserves password-only, option exclusivity, identifier and request bounds", () => {
  const inputs: any[] = [
    null,
    undefined,
    {},
    base,
    { ...base, fields: [] },
    { ...base, fields: [], qr_code: true },
    { ...base, fields: [], qr_code: false },
    { ...base, account_identifier: "alice" },
    { ...base, account_identifier: " " },
    { ...base, account_identifier: "alice", otpHandle: "otp" },
    {
      ...base,
      fields: [{ ...field, type: "text" }],
      account_identifier: "alice",
    },
    { ...base, fields: Array(7).fill(field) },
    { ...base, otpHandle: "" },
    { ...base, otpHandle: "x".repeat(16385) },
    {
      ...base,
      options: [
        { id: "a", label: " A ", selector: "#a" },
        { id: "b", label: "B", field_ids: ["password"] },
      ],
      submit: { selector: "#submit", action: "press_enter" },
    },
  ];
  for (const id of [
    "",
    "constructor",
    "__proto__",
    "prototype",
    "a-b_C9",
    "x".repeat(49),
    "中文",
  ]) {
    inputs.push({ ...base, fields: [{ ...field, id }] });
  }
  for (const option of [
    { id: "a", label: "" },
    { id: "a", label: " A ", selector: "#a", field_ids: ["password"] },
    { id: "a", label: "A", field_ids: [] },
    { id: "a", label: "A", selector: "" },
    { id: "a", label: "A", field_ids: Array(7).fill("p") },
  ])
    inputs.push({
      ...base,
      options: [option, { id: "b", label: "B", selector: "#b" }],
    });
  for (const input of inputs) {
    assert.deepEqual(
      outcome(() => BrowserAuthHandoff.create(input).parse()),
      outcome(() => original.Ru.create(input).parse()),
    );
    assert.deepEqual(
      outcome(() => BrowserAuthHandoff.create(input).toJSON()),
      outcome(() => original.Ru.create(input).toJSON()),
    );
  }
});

test("auth result and diagnostic schemas retain exact statuses, event bounds and field projection", () => {
  const rejection = {
    outcome: "submission_failed",
    reason: "request_origin",
    request_class: "background",
    submission_phase: "settled",
    extra: 1,
  };
  const event = {
    sequence: 0,
    kind: "prompt_completed",
    phase: "prompt",
    field_index: 0,
    reinspection: 1,
    outcome: "submitted",
    request_class: "main_document",
    method: "post",
    origin_relation: "same",
    extra: 1,
  };
  const diagnostics = {
    schema_version: 1,
    request_id: "123e4567-e89b-12d3-a456-426614174000",
    submission_mode: "private",
    first_rejection: rejection,
    terminal_rejection: rejection,
    attempt_events: [event],
    dropped_attempt_events: 0,
    extra: 1,
  };
  const inputs = [
    null,
    undefined,
    {},
    rejection,
    event,
    diagnostics,
    {
      status: "submitted",
      selected_option: "a",
      reason: "user_took_over",
      locator_error: { field_id: "p", reason: "not_user_visible" },
      submission_diagnostics: diagnostics,
      extra: 1,
    },
    { status: "unknown" },
    { ...event, sequence: 65536, field_index: 64, reinspection: 4 },
    {
      ...diagnostics,
      request_id: "bad",
      attempt_events: Array(65).fill(event),
    },
  ];
  for (const key of [
    "ResultSchema",
    "SubmissionRejectionSchema",
    "SubmissionAttemptEventSchema",
    "SubmissionDiagnosticsSchema",
  ])
    for (const input of inputs)
      assert.deepEqual(
        outcome(() => BrowserAuthHandoff[key].parse(input)),
        outcome(() => original.Ru[key].parse(input)),
      );
});
