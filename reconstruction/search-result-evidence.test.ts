import test from "node:test";
import assert from "node:assert/strict";
import { observedSearchLinks } from "./search-result-evidence";
test("search evidence preserves destination paths and ignores clipped redirects", () => {
  const destination = "https://chat.deepseek.com/sign_in";
  const redirect =
    "https://www.bing.com/ck/a?u=a1" +
    Buffer.from(destination).toString("base64url");
  const snapshot = (url: string) =>
    `- heading "DeepSeek - Into the Unknown" [level=2]:\n  - link "DeepSeek - Into the Unknown":\n    - /url: ${url}`;
  assert.deepEqual(observedSearchLinks(snapshot(redirect)), [
    destination,
    redirect,
  ]);
  assert.deepEqual(
    observedSearchLinks(snapshot("https://www.bing.com/ck/a?p=clipped")),
    [],
  );
  assert.equal(
    observedSearchLinks(snapshot(redirect)).some((link) =>
      "https://chat.deepseek.com".includes(link),
    ),
    false,
  );
  assert.deepEqual(observedSearchLinks(snapshot(destination)), [destination]);
});

test("structured DOM evidence requires both a result title and complete destination", () => {
  assert.deepEqual(
    observedSearchLinks(
      JSON.stringify([
        {
          title: "DeepSeek - Into the Unknown",
          dest: "https://chat.deepseek.com/sign_in",
        },
      ]),
    ),
    ["https://chat.deepseek.com/sign_in"],
  );
  assert.deepEqual(
    observedSearchLinks(
      JSON.stringify([{ dest: "https://chat.deepseek.com/sign_in" }]),
    ),
    [],
  );
});
