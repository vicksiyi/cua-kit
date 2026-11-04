/** Embedded hF M/ve/ss. Parsing preserves original offsets, coercion and errors. */
export class InvalidSelectorError extends Error {}
export type AttributeOperator =
  "<truthy>" | "=" | "*=" | "^=" | "$=" | "|=" | "~=";
export interface SelectorAttribute {
  name: string;
  jsonPath: string[];
  op: AttributeOperator;
  value: string | number | boolean | RegExp | null;
  caseSensitive: boolean;
}
export interface AttributeSelector {
  name: string;
  attributes: SelectorAttribute[];
}
export function parseAttributeSelector(
  selector: string,
  allowUnquotedStrings: boolean,
): AttributeSelector {
  let position = 0;
  let eof = selector.length === 0;
  const peek = () => selector[position] || "";
  const read = () => {
    const character = peek();
    ++position;
    eof = position >= selector.length;
    return character;
  };
  const fail = (context?: string): never => {
    throw eof
      ? new InvalidSelectorError(
          `Unexpected end of selector while parsing selector \`${selector}\``,
        )
      : new InvalidSelectorError(
          `Error while parsing selector \`${selector}\` - unexpected symbol "${peek()}" at position ${position}` +
            (context ? " during " + context : ""),
        );
  };
  function skipWhitespace() {
    while (!eof && /\s/.test(peek())) read();
  }
  function isIdentifier(character: string) {
    return (
      character >= "\x80" ||
      (character >= "0" && character <= "9") ||
      (character >= "A" && character <= "Z") ||
      (character >= "a" && character <= "z") ||
      (character >= "0" && character <= "9") ||
      character === "_" ||
      character === "-"
    );
  }
  function readIdentifier() {
    let value = "";
    skipWhitespace();
    while (!eof && isIdentifier(peek())) value += read();
    return value;
  }
  function readQuoted(quote: string) {
    let value = read();
    if (value !== quote) fail("parsing quoted string");
    while (!eof && peek() !== quote) {
      if (peek() === "\\") read();
      value += read();
    }
    if (peek() !== quote) fail("parsing quoted string");
    value += read();
    return value;
  }
  function readRegex() {
    if (read() !== "/") fail("parsing regular expression");
    let pattern = "",
      inClass = false;
    while (!eof) {
      if (peek() === "\\") {
        pattern += read();
        if (eof) fail("parsing regular expression");
      } else if (inClass && peek() === "]") inClass = false;
      else if (!inClass && peek() === "[") inClass = true;
      else if (!inClass && peek() === "/") break;
      pattern += read();
    }
    if (read() !== "/") fail("parsing regular expression");
    let flags = "";
    while (!eof && peek().match(/[dgimsuy]/)) flags += read();
    try {
      return new RegExp(pattern, flags);
    } catch (error) {
      throw new InvalidSelectorError(
        `Error while parsing selector \`${selector}\`: ${(error as Error).message}`,
      );
    }
  }
  function readProperty() {
    skipWhitespace();
    const property =
      peek() === "'" || peek() === '"'
        ? readQuoted(peek()).slice(1, -1)
        : readIdentifier();
    if (!property) fail("parsing property path");
    return property;
  }
  function readOperator(): Exclude<AttributeOperator, "<truthy>"> {
    skipWhitespace();
    let operator = "";
    if (!eof) operator += read();
    if (!eof && operator !== "=") operator += read();
    if (!["=", "*=", "^=", "$=", "|=", "~="].includes(operator))
      fail("parsing operator");
    return operator as Exclude<AttributeOperator, "<truthy>">;
  }
  function readAttribute(): SelectorAttribute {
    read();
    const path = [readProperty()];
    skipWhitespace();
    while (peek() === ".") {
      read();
      path.push(readProperty());
      skipWhitespace();
    }
    if (peek() === "]") {
      read();
      return {
        name: path.join("."),
        jsonPath: path,
        op: "<truthy>",
        value: null,
        caseSensitive: false,
      };
    }
    const operator = readOperator();
    let value: SelectorAttribute["value"];
    let caseSensitive = true;
    skipWhitespace();
    if (peek() === "/") {
      if (operator !== "=")
        throw new InvalidSelectorError(
          `Error while parsing selector \`${selector}\` - cannot use ${operator} in attribute with regular expression`,
        );
      value = readRegex();
    } else if (peek() === "'" || peek() === '"') {
      value = readQuoted(peek()).slice(1, -1);
      skipWhitespace();
      if (peek() === "i" || peek() === "I") {
        caseSensitive = false;
        read();
      } else if (peek() === "s" || peek() === "S") {
        caseSensitive = true;
        read();
      }
    } else {
      value = "";
      while (!eof && (isIdentifier(peek()) || peek() === "+" || peek() === "."))
        value += read();
      if (value === "true") value = true;
      else if (value === "false") value = false;
      else if (!allowUnquotedStrings) {
        value = +value;
        if (Number.isNaN(value)) fail("parsing attribute value");
      }
    }
    skipWhitespace();
    if (peek() !== "]") fail("parsing attribute value");
    read();
    if (operator !== "=" && typeof value !== "string")
      throw new InvalidSelectorError(
        `Error while parsing selector \`${selector}\` - cannot use ${operator} in attribute with non-string matching value - ${value}`,
      );
    return {
      name: path.join("."),
      jsonPath: path,
      op: operator,
      value,
      caseSensitive,
    };
  }
  const result: AttributeSelector = { name: "", attributes: [] };
  result.name = readIdentifier();
  skipWhitespace();
  while (peek() === "[") {
    result.attributes.push(readAttribute());
    skipWhitespace();
  }
  if (!eof) fail();
  if (!result.name && !result.attributes.length)
    throw new InvalidSelectorError(
      `Error while parsing selector \`${selector}\` - selector cannot be empty`,
    );
  return result;
}
export function matchesAttribute(
  value: unknown,
  attribute: Pick<SelectorAttribute, "op" | "value" | "caseSensitive">,
): boolean {
  const actual =
    typeof value === "string" && !attribute.caseSensitive
      ? value.toUpperCase()
      : value;
  const expected =
    typeof attribute.value === "string" && !attribute.caseSensitive
      ? attribute.value.toUpperCase()
      : attribute.value;
  if (attribute.op === "<truthy>") return !!actual;
  if (attribute.op === "=")
    return expected instanceof RegExp
      ? typeof actual === "string" && !!actual.match(expected)
      : actual === expected;
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  switch (attribute.op) {
    case "*=":
      return actual.includes(expected);
    case "^=":
      return actual.startsWith(expected);
    case "$=":
      return actual.endsWith(expected);
    case "|=":
      return actual === expected || actual.startsWith(expected + "-");
    case "~=":
      return actual.split(" ").includes(expected);
    default:
      return false;
  }
}
