import test from "node:test";
import assert from "node:assert/strict";
import { injectedExpression } from "./injected-source";
import { parseAttributeSelector } from "../packages/browser/src/service/playwright/injected/attribute_selector";
import {
  validateRoleOptions,
  selectedRoles,
  checkedRoles,
  pressedRoles,
  expandedRoles,
  levelRoles,
} from "../packages/browser/src/service/playwright/injected/role_options";
const original = new Function(
  `${["kt", "Ct", "It", "$t", "Lt", "pn", "Be", "ce", "ue", "os"].map((name) => `const ${name} = ${injectedExpression(name)};`).join("\n")} pn.sort(); return {validate:os,tables:[kt,Ct,It,$t,Lt]};`,
)();
function run(fn: any, attributes: any[], role: string) {
  try {
    return { value: fn(attributes, role), attributes };
  } catch (error: any) {
    return { error: error.name, message: error.message, attributes };
  }
}
test("role option validation preserves source tables, failure ordering, level mutation and repeated attributes", () => {
  assert.deepEqual(
    [selectedRoles, checkedRoles, pressedRoles, expandedRoles, levelRoles],
    original.tables,
  );
  for (const role of [
    "button",
    "checkbox",
    "heading",
    "row",
    "option",
    "treeitem",
    "generic",
    "",
    "BUTTON",
  ])
    for (const name of [
      "checked",
      "pressed",
      "selected",
      "expanded",
      "level",
      "disabled",
      "name",
      "include-hidden",
      "unknown",
    ])
      for (const op of ["<truthy>", "=", "*=", "~="])
        for (const value of [
          null,
          true,
          false,
          "mixed",
          "3",
          "",
          "no",
          0,
          -1,
          NaN,
          Infinity,
          /Hello/i,
        ]) {
          const attribute = {
            name,
            jsonPath: [name],
            op,
            value,
            caseSensitive: false,
          };
          assert.deepEqual(
            run(validateRoleOptions, [{ ...attribute }], role),
            run(original.validate, [{ ...attribute }], role),
            JSON.stringify({ role, name, op, value: String(value) }),
          );
        }
  for (const selector of [
    'button[name="Hello"i][pressed=mixed]',
    'heading[level="2"][level=3]',
    "button[disabled][include-hidden=false]",
    "option[selected=true][name=/hello/i]",
    'heading[level="bad"]',
    'button[level="2"]',
  ]) {
    const a = parseAttributeSelector(selector, true),
      b = parseAttributeSelector(selector, true);
    assert.deepEqual(
      run(validateRoleOptions, a.attributes, a.name),
      run(original.validate, b.attributes, b.name),
    );
  }
  const input = parseAttributeSelector('heading[level="-2"]', true);
  assert.equal(validateRoleOptions(input.attributes, input.name).level, -2);
  assert.equal(input.attributes[0].value, -2);
  const wrongRole = parseAttributeSelector('button[level="2"]', true);
  assert.throws(
    () => validateRoleOptions(wrongRole.attributes, wrongRole.name),
    /only supported for roles/,
  );
  assert.equal(wrongRole.attributes[0].value, "2");
  assert.equal(
    validateRoleOptions(
      parseAttributeSelector("heading[level=+Infinity]", true).attributes,
      "heading",
    ).level,
    Infinity,
  );
});
