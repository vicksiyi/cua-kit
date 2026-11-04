import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  intersectHostnames,
  type HostnamePattern,
  type IntersectionBudget,
} from "../packages/browser-extension/src/hostname_intersection";
const original = extensionBindings(
  [
    "$e",
    "Me",
    "hs",
    "Up",
    "$p",
    "wc",
    "Fp",
    "Bp",
    "jp",
    "qp",
    "kn",
    "yc",
    "Sc",
    "Ec",
    "Rn",
    "kt",
  ],
  {},
);
function outcome(
  fn: Function,
  patterns: HostnamePattern[],
  kind: string,
  initial: IntersectionBudget,
) {
  const budget = { ...initial };
  try {
    return { result: fn(patterns, kind, budget), budget };
  } catch (error: any) {
    return { error: error.message, budget };
  }
}
const exact = (hostnamePattern: string): HostnamePattern => ({
  hostnamePattern,
  kind: "exact",
});
test("hostname intersections match original regex branches and exact shared budget consumption", () => {
  const values = [
    "",
    "*",
    "**",
    "?",
    "??",
    "a",
    "a*",
    "*b",
    "a?b",
    "*.com",
    "example.com",
    "a.example.com",
    "a.",
    "*.*",
    "2001:db8::1",
    "[::1]",
    "é",
    "a/b",
    "a+b",
    "a?*b*",
  ];
  const patterns: HostnamePattern[] = values.map(exact);
  patterns.push(
    { hostnamePattern: "example.com", kind: "apex-and-subdomains" },
    { hostnamePattern: "example.com", kind: "subdomains-only" },
  );
  for (const kind of ["dns", "ipv6"])
    for (const first of patterns)
      for (const second of patterns) {
        const input = [first, second];
        const budget = { states: 65536, bytes: 4194304 };
        assert.deepEqual(
          outcome(intersectHostnames, input, kind, budget),
          outcome(original.Fp, input, kind, budget),
          JSON.stringify({ input, kind }),
        );
      }
  assert.deepEqual(
    intersectHostnames([exact("a*"), exact("ab")], "dns", {
      states: 100,
      bytes: 100,
    }),
    ["ab"],
  );
  assert.deepEqual(
    intersectHostnames([exact("a"), exact("b")], "dns", {
      states: 100,
      bytes: 100,
    }),
    [],
  );
});
test("intersection budgets and multi-pattern recursion preserve original failure boundaries", () => {
  const samples = [
    [],
    [exact("*")],
    [exact("?".repeat(513))],
    [exact("a*b*c*"), exact("*a*b*c"), exact("?*?")],
    [exact("abc"), exact("a*c")],
  ];
  for (const patterns of samples)
    for (const kind of ["dns", "ipv6"])
      for (const budget of [
        { states: 0, bytes: 100 },
        { states: 1, bytes: 100 },
        { states: 30, bytes: 0 },
        { states: 65536, bytes: 4194304 },
      ]) {
        assert.deepEqual(
          outcome(intersectHostnames, patterns, kind, budget),
          outcome(original.Fp, patterns, kind, budget),
        );
      }
});
