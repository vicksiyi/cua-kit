/** Readable reconstruction of embedded hF's O/li/ro/ht/ut/pe.
 * This module is a component of the injected helper, not a replacement for hF.
 */
let whitespaceCache: Map<string, string> | undefined;
export function resetWhitespaceCache() {
  whitespaceCache = new Map();
}
export function normalizeWhitespace(text: string): string {
  let normalized = whitespaceCache?.get(text);
  if (normalized === undefined) {
    normalized = text
      .replace(/[\u200b\u00ad]/g, "")
      .trim()
      .replace(/\s+/g, " ");
    whitespaceCache?.set(text, normalized);
  }
  return normalized;
}
export function visibleWhitespace(text: string) {
  return text.replace(/\n/g, "\u21b5").replace(/\t/g, "\u21c6");
}
export function unquoteTextSelector(text: string) {
  text = text.substring(1, text.length - 1);
  if (!text.includes("\\")) return text;
  const characters: string[] = [];
  let position = 0;
  while (position < text.length) {
    if (text[position] === "\\" && position + 1 < text.length) position++;
    characters.push(text[position++]);
  }
  return characters.join("");
}
export interface ElementText {
  full: string;
  normalized: string;
  immediate: string[];
}
export interface TextMatcher {
  kind: "regex" | "strict" | "lax";
  matcher(text: ElementText): boolean;
}
export function createTextMatcher(
  selector: string,
  internal: boolean,
): TextMatcher {
  if (selector[0] === "/" && selector.lastIndexOf("/") > 0) {
    const closingSlash = selector.lastIndexOf("/");
    const expression = new RegExp(
      selector.substring(1, closingSlash),
      selector.substring(closingSlash + 1),
    );
    return { matcher: (text) => expression.test(text.full), kind: "regex" };
  }
  const unquote = internal ? JSON.parse.bind(JSON) : unquoteTextSelector;
  let strict = false;
  if (
    selector.length > 1 &&
    selector[0] === '"' &&
    selector[selector.length - 1] === '"'
  ) {
    selector = unquote(selector);
    strict = true;
  } else if (
    internal &&
    selector.length > 1 &&
    selector[0] === '"' &&
    selector[selector.length - 2] === '"' &&
    selector[selector.length - 1] === "i"
  ) {
    selector = unquote(selector.substring(0, selector.length - 1));
  } else if (
    internal &&
    selector.length > 1 &&
    selector[0] === '"' &&
    selector[selector.length - 2] === '"' &&
    selector[selector.length - 1] === "s"
  ) {
    selector = unquote(selector.substring(0, selector.length - 1));
    strict = true;
  } else if (
    selector.length > 1 &&
    selector[0] === "'" &&
    selector[selector.length - 1] === "'"
  ) {
    selector = unquote(selector);
    strict = true;
  }
  selector = normalizeWhitespace(selector);
  if (strict) {
    if (internal)
      return {
        kind: "strict",
        matcher: (text) => text.normalized === selector,
      };
    return {
      matcher: (text) =>
        !selector && !text.immediate.length
          ? true
          : text.immediate.some(
              (part) => normalizeWhitespace(part) === selector,
            ),
      kind: "strict",
    };
  }
  selector = selector.toLowerCase();
  return {
    kind: "lax",
    matcher: (text) => text.normalized.toLowerCase().includes(selector),
  };
}
export interface ExpectedText {
  string?: string;
  matchSubstring?: boolean;
  normalizeWhiteSpace?: boolean;
  ignoreCase?: boolean;
  regexSource?: string;
  regexFlags?: string;
}
export class ExpectedTextMatcher {
  private _normalizeWhiteSpace: boolean | undefined;
  private _ignoreCase: boolean | undefined;
  private _string: string | undefined;
  private _substring: string | undefined;
  private _regex: RegExp | undefined;
  constructor(expected: ExpectedText) {
    this._normalizeWhiteSpace = expected.normalizeWhiteSpace;
    this._ignoreCase = expected.ignoreCase;
    this._string = expected.matchSubstring
      ? undefined
      : this.normalize(expected.string);
    this._substring = expected.matchSubstring
      ? this.normalize(expected.string)
      : undefined;
    if (expected.regexSource) {
      const flags = new Set((expected.regexFlags || "").split(""));
      if (expected.ignoreCase === false) flags.delete("i");
      if (expected.ignoreCase === true) flags.add("i");
      this._regex = new RegExp(expected.regexSource, [...flags].join(""));
    }
  }
  matches(text: string) {
    if (!this._regex) text = this.normalize(text)!;
    if (this._string !== undefined) return text === this._string;
    if (this._substring !== undefined) return text.includes(this._substring);
    return this._regex ? !!this._regex.test(text) : false;
  }
  matchesClassList(
    injected: { createStacklessError(message: string): Error },
    classes: Pick<DOMTokenList, "contains" | "toString">,
    partial: boolean,
  ) {
    if (partial) {
      if (this._regex)
        throw injected.createStacklessError(
          "Partial matching does not support regular expressions. Please provide a string value.",
        );
      return this._string!.split(/\s+/g)
        .filter(Boolean)
        .every((name) => classes.contains(name));
    }
    return this.matches(classes.toString());
  }
  normalize(text: string | undefined) {
    if (text) {
      if (this._normalizeWhiteSpace) text = normalizeWhitespace(text);
      if (this._ignoreCase) text = text.toLocaleLowerCase();
    }
    return text;
  }
}
