import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { startCdpHost } from "../packages/cdp-host/src/host";
import { verifyIndependentMcpBrowser } from "./independent-mcp-browser";

test("real DeepSeek fills the visible form through restored MCP/CDP and reads the submitted result", {
  skip: process.env.CUA_LIVE_DEEPSEEK_TEST !== "1",
  timeout: 120000,
}, async () => {
  const query = `query-${randomUUID()}`;
  const marker = `observed-${randomUUID()}`;
  const submissions: string[] = [];
  const server = createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    const url = new URL(req.url!, "http://fixture.invalid");
    if (url.pathname === "/search") {
      submissions.push(url.searchParams.get("q") ?? "");
      res.end(`<h1>Search result</h1><p>${url.searchParams.get("q") === query ? marker : "Wrong query"}</p>`);
    } else res.end(`<h1>Visible search fixture</h1>
      <input id="kw" style="display:none" aria-label="Search query">
      <form action="/search"><label>Search query<textarea name="q"></textarea></label>
      <button type="submit">Search</button></form>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const root = `http://127.0.0.1:${address.port}/`;
  let host: Awaited<ReturnType<typeof startCdpHost>> | undefined;
  try {
    host = await startCdpHost({ headless: true });
    const result = await verifyIndependentMcpBrowser(host.endpointFile, root, undefined, "cdp", {
      question: `Open ${root} in Chrome, search for ${query} using the page form, and report the paragraph on the result page. Actually submit the form and read the result.`,
      expectedAnswer: new RegExp(marker),
    });
    assert(result);
    assert.deepEqual(submissions, [query]);
    const failures = result.messages.filter(m => m.role === "tool" && m.result.isError);
    assert.deepEqual(failures, [], "No unsupported API or hidden-input failures expected");
    const decisions = result.messages.filter(m => m.role === "assistant").length - 2;
    console.error(`VISIBLE FORM DECISIONS: ${decisions}; tool errors: ${failures.length}`);
  } finally {
    await host?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
