import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "acorn";
import { serviceExpression } from "./service-source";
import { markdownTextPaste } from "../packages/browser/src/service/input/markdown_paste";
import { preserveMarkdownWhitespace } from "../packages/browser/src/service/input/text_paste";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-service.mjs`,
  "utf8",
);
const ast = parse(source, {
  ecmaVersion: "latest",
  sourceType: "module",
}) as any;
const statement = (name: string) =>
  ast.body.find(
    (s: any) =>
      s.type === "VariableDeclaration" &&
      s.declarations.some((d: any) => d.id.name === name),
  );
const start = statement("aw"),
  end = statement("N9");
assert.ok(start && end && start.start < end.end);
// Evaluate only the contiguous bundled Markdown libraries, not service bootstrap.
// l/de initialize unrelated manifest/environment state; renderer code does not use it.
const prelude = ["P8", "Zd", "R8", "I8", "k8", "B8", "G", "H", "HT", "ep", "JP"]
  .map((name) => `const ${name}=${serviceExpression(name)};`)
  .join("\n");
const original = new Function(
  "l",
  "de",
  prelude + source.slice(start.start, end.end) + ";return N9;",
)(
  () => {},
  () => {},
);

test("upstream markdown-it preserves original rich clipboard HTML and whitespace", () => {
  const values = [
    "",
    " \t\r\n",
    " hello ",
    "**bold** and *italic*",
    "a\nb",
    "# Heading\n\nparagraph",
    "- one\n- two",
    "1. first\n2. second",
    "> quote",
    "`<inline>`",
    "```ts\nconst x = 1;\n```",
    "<script>alert(1)</script>",
    "[link](https://example.test/a?q=1&b=2)",
    "[bad](javascript:alert(1))",
    "![alt](https://example.test/a.png)",
    "<https://example.test>",
    "https://example.test",
    "a &amp; b &#x1f600;",
    "| a | b |\n|---|---|\n|1|2|",
    "~~delete~~",
    "[x][id]\n\n[id]: https://example.test",
    "[中文](https://例子.测试/路径)",
    "\u00a0中文😀\u2028",
    "***\n\nnext",
    "  **bold**  ",
  ];
  for (const text of values) {
    const items = markdownTextPaste.clipboardItems(text, true);
    assert.equal(items[0].entries[0].text, text);
    assert.equal(
      items[0].entries[1].text,
      preserveMarkdownWhitespace(original.render(text), text),
      JSON.stringify(text),
    );
    assert.equal(
      markdownTextPaste.clipboardItems(text, false)[0].entries.length,
      1,
    );
  }
  assert.equal(
    markdownTextPaste.clipboardItems("**bold**", true)[0].entries[1].text,
    "<strong>bold</strong>",
  );
});
