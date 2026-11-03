import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import { SiteInstructions } from "../packages/browser/dist/service/context/site_instructions.js";
const Original = originalServiceBindings(["WF", "mg"]).mg;
function response(url: string, value: any = "hello%20world", frameId = "f") {
  return {
    request: { url },
    frameId,
    responseHeaders: [
      { name: "X-OpenAI-Site-Instruction", value },
      { name: "x-openai-site-instruction", value: "second" },
      { name: "Other", value: "keep" },
    ],
  };
}
test("site instructions consume headers and retain original URL exclusion predicates", () => {
  function run(Class: any, enabled: boolean, url: string) {
    const o = new Class(enabled),
      r = response(url);
    o.capture(1, r);
    return {
      headers: r.responseHeaders,
      entries: [...o.instructions],
      peek: o.peek(1, url + "#hash"),
      fields: Object.keys(o),
    };
  }
  for (const enabled of [true, false])
    for (const url of [
      "https://example.com/a",
      "http://localhost/",
      "https://a.localhost./",
      "http://loopback/",
      "http://127.0.0.1/",
      "http://169.254.1.1/",
      "http://[::1]/",
      "http://[fe80::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://terminal.local/",
      "file:///tmp/a",
      "invalid",
      "https://example.com/a#fragment",
    ])
      assert.deepEqual(
        run(SiteInstructions, enabled, url),
        run(Original, enabled, url),
      );
});
test("site instruction frame clearing, malformed decoding and take retain deletion timing", () => {
  function run(Class: any) {
    const o = new Class(true),
      values = [];
    o.capture(1, response("https://example.com/a"));
    o.clearFrame(1, "other");
    values.push(o.peek(1, "https://example.com/a#hash"));
    o.capture(1, response("http://localhost/", "ignored", "other"));
    values.push(o.peek(1, "https://example.com/a"));
    o.capture(1, response("https://example.com/b", "%bad", "other"));
    values.push(o.peek(1, "https://example.com/a"));
    o.capture(1, response("https://example.com/a"));
    values.push(
      o.take(1, "https://example.com/wrong"),
      o.peek(1, "https://example.com/a"),
    );
    o.capture(1, response("https://example.com/a"));
    o.capture(1, { request: { url: "https://example.com/b" }, frameId: "f" });
    values.push(o.peek(1, "https://example.com/a"));
    return { values, entries: [...o.instructions] };
  }
  assert.deepEqual(run(SiteInstructions), run(Original));
});
