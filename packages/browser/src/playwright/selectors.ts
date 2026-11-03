import { isRegExp } from "../runtime/object_utils";

export type TextMatcher = string | RegExp;
export interface ExactOptions {
  exact?: boolean;
}
/** Original Tl. Empty suffix retains the parent; empty combined value becomes undefined. */
export function appendRelativeSelector(
  parent: string | undefined,
  child: string,
): string | undefined {
  return parent
    ? child
      ? `${parent} >> ${child}`
      : parent
    : child || undefined;
}
/** Original jl. Unicode regexes deliberately skip the legacy selector escaping. */
export function escapeRegexForSelector(pattern: RegExp): string {
  return pattern.unicode || pattern.unicodeSets
    ? String(pattern)
    : String(pattern)
        .replace(/(^|[^\\])(\\\\)*(["'`])/g, "$1$2\\\\$3")
        .replace(/>>/g, "\\>\\>");
}
/** Original Il. */
export function escapeTextForSelector(
  text: TextMatcher,
  exact: boolean,
): string {
  return typeof text !== "string"
    ? escapeRegexForSelector(text)
    : `${JSON.stringify(text)}${exact ? "s" : "i"}`;
}
/** Original Cl. Attribute matching uses different escaping from text matching. */
export function escapeAttributeForSelector(
  text: TextMatcher,
  exact: boolean,
): string {
  return typeof text !== "string"
    ? escapeRegexForSelector(text)
    : `"${text.replace(/\\/g, "\\\\").replace(/["]/g, '\\"')}"${exact ? "s" : "i"}`;
}
/** Original Rl. Only name/exact are read; no invented role validation or other filters. */
export function roleSelector(
  role: string,
  options: ExactOptions & { name?: TextMatcher },
): string {
  if (!role) throw new Error("getByRole requires a role");
  const attributes: string[] = [];
  if (options.name !== undefined)
    attributes.push(
      `[name=${escapeAttributeForSelector(options.name, !!options.exact)}]`,
    );
  return `internal:role=${role}${attributes.join("")}`;
}
/** Original Pl. */
export function textSelector(text: TextMatcher, options: ExactOptions): string {
  if (typeof text !== "string" && !isRegExp(text))
    throw new Error("getByText requires a string or RegExp");
  return `internal:text=${escapeTextForSelector(text, !!options.exact)}`;
}
/** Original El. */
export function labelSelector(
  text: TextMatcher,
  options: ExactOptions,
): string {
  if (typeof text !== "string" && !isRegExp(text))
    throw new Error("getByLabel requires a string or RegExp");
  return `internal:label=${escapeTextForSelector(text, !!options.exact)}`;
}
/** Original Al. */
export function placeholderSelector(
  text: TextMatcher,
  options: ExactOptions,
): string {
  if (typeof text !== "string" && !isRegExp(text))
    throw new Error("getByPlaceholder requires a string or RegExp");
  return `internal:attr=[placeholder=${escapeAttributeForSelector(text, !!options.exact)}]`;
}
/** Original Ml. */
export function testIdSelector(testId: TextMatcher): string {
  if (!testId) throw new Error("getByTestId requires a testId");
  return `internal:testid=[data-testid=${escapeAttributeForSelector(testId, true)}]`;
}
