import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeDiagnostics } from "../packages/agent-loop/src/runtime-diagnostics";

function record(stream: NodeJS.ReadWriteStream) {
  const chunks: Buffer[] = [];
  stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  return () => Buffer.concat(chunks);
}
const line = (value: unknown) => Buffer.from(JSON.stringify(value) + "\n");
test("runtime diagnostics preserve fragmented protocol bytes and never expose payloads", () => {
  const logs: string[] = [];
  let clock = 0;
  const d = createRuntimeDiagnostics(
    (text) => logs.push(text),
    () => clock,
  );
  const outbound = record(d.requests),
    inbound = record(d.responses);
  const request = line({
    type: "authenticated_fetch",
    id: "secret-id",
    request: {
      url: "https://chatgpt.com/backend-api/aura/site_status?site_url=secret-url",
      headers: [{ name: "Authorization", value: "secret-token" }],
      body_base64: "secret-body",
    },
  });
  for (const byte of request) d.requests.write(Buffer.from([byte]));
  clock = 123;
  const response = line({
    type: "authenticated_fetch_result",
    id: "secret-id",
    ok: true,
    response: { status: 403, body_base64: "secret-result" },
  });
  d.responses.write(response);
  d.close();
  assert.deepEqual(outbound(), request);
  assert.deepEqual(inbound(), response);
  assert.deepEqual(logs, [
    "[CUA runtime] fetch #1 site-status started",
    "[CUA runtime] fetch #1 site-status HTTP 403 (123 ms)",
  ]);
  assert.ok(!logs.join().includes("secret"));
  d.requests.destroy();
  d.responses.destroy();
});
test("oversize and malformed lines remain intact and diagnostics recover at newline", () => {
  const logs: string[] = [],
    d = createRuntimeDiagnostics((text) => logs.push(text));
  const bytes = record(d.requests);
  const huge = Buffer.from("x".repeat(70000) + "\nnot-json\n");
  const valid = line({
    type: "authenticated_fetch",
    id: "r",
    request: { url: "https://example.test/private" },
  });
  d.requests.write(huge.subarray(0, 100));
  d.requests.write(Buffer.concat([huge.subarray(100), valid]));
  assert.deepEqual(bytes(), Buffer.concat([huge, valid]));
  d.close();
  assert.equal(logs.length, 2);
  assert.match(logs[1], /unresolved at worker exit/);
  assert.ok(!logs.join().includes("example.test"));
  d.requests.destroy();
  d.responses.destroy();
});
test("transport errors and unresolved work are distinguished without raw error text", () => {
  const logs: string[] = [],
    d = createRuntimeDiagnostics(
      (text) => logs.push(text),
      () => 0,
    );
  record(d.requests);
  record(d.responses);
  for (const id of ["a", "b"])
    d.requests.write(
      line({ type: "authenticated_fetch", id, request: { url: "invalid" } }),
    );
  d.responses.write(
    line({
      type: "authenticated_fetch_result",
      id: "a",
      ok: false,
      error: "credential-secret",
    }),
  );
  d.close();
  d.close();
  assert.equal(logs.length, 4);
  assert.match(logs[2], /transport error/);
  assert.match(logs[3], /unresolved/);
  assert.ok(!logs.join().includes("credential-secret"));
  d.requests.destroy();
  d.responses.destroy();
});
