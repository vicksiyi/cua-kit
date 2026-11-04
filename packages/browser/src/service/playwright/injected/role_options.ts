import type {
  SelectorAttribute,
  AttributeOperator,
} from "./attribute_selector";
/** Embedded hF role tables and pn/Be/ce/ue/os; lists retain original order/duplicates. */
export const selectedRoles = [
  "gridcell",
  "option",
  "row",
  "tab",
  "rowheader",
  "columnheader",
  "treeitem",
];
export const checkedRoles = [
  "checkbox",
  "menuitemcheckbox",
  "option",
  "radio",
  "switch",
  "menuitemradio",
  "treeitem",
];
export const pressedRoles = ["button"];
export const expandedRoles = [
  "application",
  "button",
  "checkbox",
  "combobox",
  "gridcell",
  "link",
  "listbox",
  "menuitem",
  "row",
  "rowheader",
  "tab",
  "treeitem",
  "columnheader",
  "menuitemcheckbox",
  "menuitemradio",
  "rowheader",
  "switch",
];
export const levelRoles = ["heading", "listitem", "row", "treeitem"];
const supportedAttributes = [
  "selected",
  "checked",
  "pressed",
  "expanded",
  "level",
  "disabled",
  "name",
  "include-hidden",
].sort();
export interface RoleOptions {
  role: string;
  checked?: boolean | "mixed";
  pressed?: boolean | "mixed";
  selected?: boolean;
  expanded?: boolean;
  level?: number;
  disabled?: boolean;
  name?: string | RegExp;
  nameOp?: AttributeOperator;
  exact?: boolean;
  includeHidden?: boolean;
}
function requireRole(name: string, roles: string[], role: string) {
  if (!roles.includes(role))
    throw new Error(
      `"${name}" attribute is only supported for roles: ${roles
        .slice()
        .sort()
        .map((value) => `"${value}"`)
        .join(", ")}`,
    );
}
function requireValue(attribute: SelectorAttribute, values: unknown[]) {
  if (attribute.op !== "<truthy>" && !values.includes(attribute.value))
    throw new Error(
      `"${attribute.name}" must be one of ${values.map((value) => JSON.stringify(value)).join(", ")}`,
    );
}
function requireOperator(attribute: SelectorAttribute, operators: string[]) {
  if (!operators.includes(attribute.op))
    throw new Error(
      `"${attribute.name}" does not support "${attribute.op}" matcher`,
    );
}
export function validateRoleOptions(
  attributes: SelectorAttribute[],
  role: string,
): RoleOptions {
  const result: RoleOptions = { role };
  for (const attribute of attributes) {
    switch (attribute.name) {
      case "checked":
        requireRole(attribute.name, checkedRoles, role);
        requireValue(attribute, [true, false, "mixed"]);
        requireOperator(attribute, ["<truthy>", "="]);
        result.checked =
          attribute.op === "<truthy>"
            ? true
            : (attribute.value as boolean | "mixed");
        break;
      case "pressed":
        requireRole(attribute.name, pressedRoles, role);
        requireValue(attribute, [true, false, "mixed"]);
        requireOperator(attribute, ["<truthy>", "="]);
        result.pressed =
          attribute.op === "<truthy>"
            ? true
            : (attribute.value as boolean | "mixed");
        break;
      case "selected":
        requireRole(attribute.name, selectedRoles, role);
        requireValue(attribute, [true, false]);
        requireOperator(attribute, ["<truthy>", "="]);
        result.selected =
          attribute.op === "<truthy>" ? true : (attribute.value as boolean);
        break;
      case "expanded":
        requireRole(attribute.name, expandedRoles, role);
        requireValue(attribute, [true, false]);
        requireOperator(attribute, ["<truthy>", "="]);
        result.expanded =
          attribute.op === "<truthy>" ? true : (attribute.value as boolean);
        break;
      case "level":
        requireRole(attribute.name, levelRoles, role);
        if (typeof attribute.value === "string")
          attribute.value = +attribute.value;
        if (
          attribute.op !== "=" ||
          typeof attribute.value !== "number" ||
          Number.isNaN(attribute.value)
        )
          throw new Error('"level" attribute must be compared to a number');
        result.level = attribute.value;
        break;
      case "disabled":
        requireValue(attribute, [true, false]);
        requireOperator(attribute, ["<truthy>", "="]);
        result.disabled =
          attribute.op === "<truthy>" ? true : (attribute.value as boolean);
        break;
      case "name":
        if (attribute.op === "<truthy>")
          throw new Error('"name" attribute must have a value');
        if (
          typeof attribute.value !== "string" &&
          !(attribute.value instanceof RegExp)
        )
          throw new Error(
            '"name" attribute must be a string or a regular expression',
          );
        result.name = attribute.value;
        result.nameOp = attribute.op;
        result.exact = attribute.caseSensitive;
        break;
      case "include-hidden":
        requireValue(attribute, [true, false]);
        requireOperator(attribute, ["<truthy>", "="]);
        result.includeHidden =
          attribute.op === "<truthy>" ? true : (attribute.value as boolean);
        break;
      default:
        throw new Error(
          `Unknown attribute "${attribute.name}", must be one of ${supportedAttributes.map((name) => `"${name}"`).join(", ")}.`,
        );
    }
  }
  return result;
}
