/** Original extension Fp/Bp/jp: bounded intersection of UTF-8 hostname globs. */
export interface HostnamePattern {
  hostnamePattern: string;
  kind: "exact" | "apex-and-subdomains" | "subdomains-only";
}
export interface IntersectionBudget {
  states: number;
  bytes: number;
}
export type HostnameKind = "dns" | "ipv6";
const ANY = 256,
  STAR = 257,
  NON_DOT = 258;
function complexityExceeded(): never {
  throw new Error(
    "Network policy hostname intersection exceeds the complexity budget",
  );
}
function charge(regex: string, budget: IntersectionBudget): string {
  budget.bytes -= regex.length;
  if (budget.bytes < 0) complexityExceeded();
  return regex;
}
function alphabet(kind: HostnameKind): string {
  return kind === "ipv6"
    ? "[0-9a-f:.]"
    : "[^/?#@:\\[\\]\\x00-\\x20\\x7f-\\xff]";
}
function nonDotAlphabet(kind: HostnameKind): string {
  return kind === "ipv6"
    ? "[0-9a-f:]"
    : "[^./?#@:\\[\\]\\x00-\\x20\\x7f-\\xff]";
}
function validLiteral(byte: number, kind: HostnameKind): boolean {
  return kind === "ipv6"
    ? "0123456789abcdef:.".includes(String.fromCharCode(byte))
    : byte > 32 && byte < 127 && !"/?#@:[]".includes(String.fromCharCode(byte));
}
function escapeByte(byte: number): string {
  const character = String.fromCharCode(byte);
  return ".\\+*?[]^$(){}|".includes(character) ? `\\${character}` : character;
}
function repeat(regex: string, min: number, max: number): string {
  if (max === 0) return "";
  if (min === 1 && max === 1) return regex;
  if (max === Infinity && min <= 1) return `${regex}${min === 0 ? "*" : "+"}`;
  return `${regex}{${min}${max === min ? "" : `,${max === Infinity ? "" : max}`}}`;
}
function matchesLiteral(
  tokens: number[],
  literal: number[],
  budget: IntersectionBudget,
): boolean {
  const positions = new Set([0]);
  for (let index = 0; index <= literal.length; index++) {
    for (const position of positions) {
      if (--budget.states < 0) complexityExceeded();
      if (tokens[position] === STAR) positions.add(position + 1);
    }
    if (index === literal.length) return positions.has(tokens.length);
    const next = new Set<number>();
    for (const position of positions) {
      const token = tokens[position];
      if (token === STAR) next.add(position);
      else if (
        token === ANY ||
        (token === NON_DOT && literal[index] !== 46) ||
        token === literal[index]
      )
        next.add(position + 1);
    }
    positions.clear();
    for (const position of next) positions.add(position);
  }
  return false;
}
function intersectTokens(
  inputs: number[][],
  kind: HostnameKind,
  budget: IntersectionBudget,
): string[] {
  if (--budget.states < 0) complexityExceeded();
  if (
    inputs.some((pattern) =>
      pattern.some((token) => token < ANY && !validLiteral(token, kind)),
    )
  )
    return [];
  const literal = inputs.find((pattern) =>
    pattern.every((token) => token < ANY),
  );
  if (literal != null)
    return (kind !== "dns" || literal.at(-1) !== 46) &&
      inputs.every((pattern) => matchesLiteral(pattern, literal, budget))
      ? [charge(literal.map(escapeByte).join(""), budget)]
      : [];
  const patterns = [
    ...new Map(inputs.map((pattern) => [pattern.join(","), pattern])).values(),
  ].filter((pattern) => pattern.some((token) => token !== STAR));
  if (patterns.reduce((total, pattern) => total + pattern.length, 0) > 512)
    complexityExceeded();
  if (
    patterns.every((pattern) =>
      pattern.every((token) => token === STAR || token === ANY),
    )
  ) {
    let min = 0,
      max = Infinity;
    for (const pattern of patterns) {
      const required = pattern.filter((token) => token === ANY).length;
      min = Math.max(min, required);
      if (!pattern.includes(STAR)) max = Math.min(max, required);
    }
    if (max < min) return [];
    if (kind === "ipv6") {
      min = Math.max(min, 1);
      return max < min
        ? []
        : [charge(repeat(alphabet(kind), min, max), budget)];
    }
    const result = min === 0 ? [""] : [];
    if (max > 0)
      result.push(
        charge(
          repeat(alphabet(kind), Math.max(min, 1) - 1, max - 1) +
            nonDotAlphabet(kind),
          budget,
        ),
      );
    return result;
  }
  if (kind === "dns") {
    if (patterns.some((pattern) => pattern.at(-1) === 46)) return [];
    if (
      !patterns.some((pattern) => {
        const last = pattern.at(-1);
        return last != null && last < ANY;
      })
    )
      patterns.push([STAR, NON_DOT]);
  }
  const memo = new Map<string, string[]>();
  let visitedStates = 0;
  function visit(offsets: number[]): string[] {
    const key = offsets.join(","),
      cached = memo.get(key);
    if (cached != null) return cached;
    if (++visitedStates > 4096 || --budget.states < 0) complexityExceeded();
    const symbols = patterns.map(
      (pattern, index) => pattern[offsets[index] ?? 0],
    );
    if (symbols.every((symbol) => symbol == null)) return [""];
    const allStars = symbols.every((symbol) => symbol === STAR);
    const loop = allStars ? `${alphabet(kind)}*` : "";
    const result = new Set<string>();
    function append(prefix: string, suffixes: string[]) {
      for (const suffix of suffixes) {
        result.add(charge(prefix + suffix, budget));
        if (result.size > 999) complexityExceeded();
      }
    }
    for (const [index, symbol] of symbols.entries())
      if (symbol === STAR)
        append(
          loop,
          visit(
            offsets.map((offset, position) => offset + +(position === index)),
          ),
        );
    const literal = symbols.find((symbol) => symbol != null && symbol < ANY);
    const needsNonDot = symbols.includes(NON_DOT);
    if (
      !allStars &&
      symbols.every((symbol) => symbol != null) &&
      symbols.every(
        (symbol) => symbol == null || symbol >= ANY || symbol === literal,
      ) &&
      !(needsNonDot && literal === 46)
    ) {
      const next = offsets.map(
        (offset, index) => offset + +(symbols[index] !== STAR),
      );
      append(
        literal != null
          ? escapeByte(literal)
          : needsNonDot
            ? nonDotAlphabet(kind)
            : alphabet(kind),
        visit(next),
      );
    }
    const sorted = [...result].sort();
    memo.set(key, sorted);
    return sorted;
  }
  return visit(patterns.map(() => 0));
}
export function intersectHostnames(
  patterns: HostnamePattern[],
  kind: HostnameKind,
  budget: IntersectionBudget,
): string[] {
  const alternatives = patterns.map((pattern) => {
    const tokens = [
      ...new TextEncoder().encode(pattern.hostnamePattern.replace(/\*+/g, "*")),
    ].map((byte) => (byte === 42 ? STAR : byte === 63 ? ANY : byte));
    switch (pattern.kind) {
      case "exact":
        return [tokens];
      case "apex-and-subdomains":
        return [tokens, [ANY, STAR, 46, ...tokens]];
      case "subdomains-only":
        return [[ANY, STAR, 46, ...tokens]];
    }
  });
  const results = new Set<string>();
  function combine(index: number, selected: number[][]) {
    const choices = alternatives[index];
    if (choices != null) {
      for (const choice of choices) combine(index + 1, [...selected, choice]);
      return;
    }
    for (const regex of intersectTokens(selected, kind, budget)) {
      results.add(regex);
      if (results.size > 999) complexityExceeded();
    }
  }
  combine(0, []);
  return [...results].sort();
}
