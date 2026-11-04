import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  readLibraryProcessingStatus,
  uploadLibraryPdf,
} from "../packages/browser-extension/src/library_pdf_upload";

function statusResponse(text: string, chunk = 7) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + chunk));
        offset = Math.min(bytes.length, offset + chunk);
      },
    }),
  );
}
test("Library processing stream matches original completion, errors, chunk boundaries and byte cap", async () => {
  const { ng } = extensionBindings(["Lr", "ng"], {});
  const capture = async (run: Function, response: Response) => {
    try {
      await run(response);
      return "ok";
    } catch (error) {
      return (error as Error).message;
    }
  };
  for (const text of [
    "",
    " \n",
    "{}",
    "not-json",
    '{"event":"file.processing.completed"}',
    '{"event":"file.indexing.completed","extra":{"label":"中文"}}\n',
    '{"event":"file.indexing.started","extra":{"retrieval_indexing_deferred":true}}',
    '{"event":"file.indexing.started"}',
    '{"event":"file.processing.completed","extra":{"library_persistence_result":"temporary"}}',
    '{"event":"file.processing.completed"}\n{"event":"file.error"}',
    " ".repeat(1048577),
  ]) {
    assert.equal(
      await capture(
        readLibraryProcessingStatus,
        statusResponse(text, text.length > 10000 ? 65536 : 7),
      ),
      await capture(ng, statusResponse(text, text.length > 10000 ? 65536 : 7)),
    );
  }
  assert.equal(
    await capture(readLibraryProcessingStatus, new Response(null)),
    await capture(ng, new Response(null)),
  );
});

test("PDF create/upload/process/cleanup matches actual source and destination credential boundaries", async () => {
  for (const mode of [
    "azure",
    "s3",
    "estuary",
    "estuary-relative",
    "wrong-estuary",
    "http",
    "port",
    "auth-url",
    "fragment",
    "wrong-host",
    "forbidden-header",
    "bad-header",
    "bad-headers",
    "put-error",
    "processing-error",
    "temporary",
    "bad-create",
    "bad-file",
    "abort",
  ]) {
    async function scenario(original: boolean) {
      const trace: unknown[] = [];
      const abort = new AbortController();
      const uploadUrl =
        mode === "s3"
          ? "https://bucket.s3.us-east-1.amazonaws.com/file?X-Amz-Algorithm=fixture"
          : mode === "estuary"
            ? "https://chatgpt.com/backend-api/estuary/upload_content_bytes?upload_url=destination"
            : mode === "estuary-relative"
              ? "/api/estuary/upload_content_bytes"
              : mode === "wrong-estuary"
                ? "https://bucket.oaiusercontent.com/api/estuary/upload_content_bytes"
                : mode === "http"
                  ? "http://bucket.oaiusercontent.com/file"
                  : mode === "port"
                    ? "https://bucket.oaiusercontent.com:444/file"
                    : mode === "auth-url"
                      ? "https://user:pass@bucket.oaiusercontent.com/file"
                      : mode === "fragment"
                        ? "https://bucket.oaiusercontent.com/file#fragment"
                        : mode === "wrong-host"
                          ? "https://oaiusercontent.com.attacker.invalid/file"
                          : "https://bucket.blob.core.windows.net/file";
      const normalizeBody = (body: any) =>
        body instanceof FormData
          ? [...body].map(([key, value]) => [
              key,
              typeof value === "string"
                ? value
                : { name: value.name, type: value.type, size: value.size },
            ])
          : typeof body === "string"
            ? JSON.parse(body)
            : undefined;
      const api: any = {
        signal: new AbortController().signal,
        async request(path: string, init: any = {}, options: any = {}) {
          trace.push([
            "api",
            path,
            init.method,
            normalizeBody(init.body),
            Boolean(init.signal),
            init.signal?.aborted,
            options.timeoutMs,
          ]);
          if (path === "/files")
            return mode === "bad-create"
              ? {}
              : {
                  status: "success",
                  file_id: "file /",
                  upload_url: uploadUrl,
                  upload_headers:
                    mode === "forbidden-header"
                      ? { Authorization: "fixture-secret" }
                      : mode === "bad-header"
                        ? { number: 1 }
                        : mode === "bad-headers"
                          ? []
                          : { "x-test": "value" },
                };
          if (path === "/files/process_upload_stream")
            return await options.readResponse(
              statusResponse(
                JSON.stringify({
                  event:
                    mode === "processing-error"
                      ? "file.failed"
                      : "file.processing.completed",
                  extra:
                    mode === "temporary"
                      ? { library_persistence_result: "temporary" }
                      : {},
                }),
              ),
            );
          if (path.includes("/estuary/"))
            return await options.readResponse({
              body: {
                async cancel() {
                  trace.push("cancel-estuary");
                },
              },
            });
          if (init.method === "DELETE")
            return await options.readResponse({
              body: {
                async cancel() {
                  trace.push("cancel-delete");
                },
              },
            });
          if (mode === "bad-file") return { file_id: "different" };
          return {
            file_id: "file /",
            is_library_file: true,
            library_file_id: "library /",
          };
        },
      };
      const fetchBytes: any = async (url: URL, init: any) => {
        trace.push([
          "put",
          url.href,
          init.method,
          [...init.headers],
          init.credentials,
          init.redirect,
          init.body.name,
        ]);
        assert.equal(init.headers.has("Authorization"), false);
        assert.equal(init.headers.has("Cookie"), false);
        if (mode === "abort") abort.abort(Error("cancelled"));
        return {
          ok: mode !== "put-error",
          status: 500,
          body: {
            async cancel() {
              trace.push("cancel-put");
            },
          },
        };
      };
      const { rg } = extensionBindings(["il", "Lr", "rg", "sl", "ng", "Fn"], {
        Xt: "https://chatgpt.com",
        fetch: fetchBytes,
      });
      const file = new File(["%PDF-fixture"], "file.pdf", {
        type: "application/pdf",
      });
      try {
        trace.push([
          "result",
          await (original
            ? rg(api, file, abort.signal)
            : uploadLibraryPdf(api, file, abort.signal, fetchBytes)),
        ]);
      } catch (error) {
        trace.push(["error", (error as Error).message]);
      }
      return trace;
    }
    assert.deepEqual(await scenario(false), await scenario(true), mode);
  }
});
