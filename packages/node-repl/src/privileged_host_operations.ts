import { Buffer } from "node:buffer";
import { isPlainObject } from "./worker_values";
import {
  makeRejectedThenable,
  trackExecBackgroundOperation,
} from "./background_operations";
import type { createWorkerRuntime } from "./worker_runtime";
type Runtime = ReturnType<typeof createWorkerRuntime>;
export type HostOperationOptions = Pick<Runtime, "execContext" | "send"> & {
  pendingRequests: Map<unknown, (response: any) => void>;
};
export function createPrivilegedHostOperations({
  execContext,
  pendingRequests,
  send,
}: HostOperationOptions) {
  let elicitationCounter = 0;
  let authenticatedFetchCounter = 0;

  function createElicitation(request: unknown) {
    let execState;
    try {
      execState = execContext.getCurrent();
      if (!execState.formElicitationSupported) {
        throw new Error(
          "nodeRepl.createElicitation is unavailable because the MCP client does not support form elicitation",
        );
      }
    } catch (error) {
      return makeRejectedThenable(error);
    }
    const operation = (async () => {
      const value = await request;
      if (!isPlainObject(value)) {
        throw new Error("nodeRepl.createElicitation expected a request object");
      }
      if (
        Object.keys(value).some(
          (key) =>
            key !== "message" && key !== "meta" && key !== "requestedSchema",
        )
      ) {
        throw new Error(
          "nodeRepl.createElicitation received an unsupported value",
        );
      }
      if (
        typeof value.message !== "string" ||
        value.message.trim().length === 0
      ) {
        throw new Error(
          "nodeRepl.createElicitation expected a non-empty message",
        );
      }
      if (value.meta != null && !isPlainObject(value.meta)) {
        throw new Error("nodeRepl.createElicitation meta must be an object");
      }
      const id = `${execState.id}-elicitation-${elicitationCounter++}`;
      send({
        type: "elicit",
        id,
        exec_id: execState.id,
        message: value.message,
        requested_schema:
          value.requestedSchema == null
            ? { type: "object", properties: {} }
            : structuredClone(value.requestedSchema),
        meta: value.meta == null ? null : structuredClone(value.meta),
      });
      return new Promise((resolve, reject) => {
        pendingRequests.set(id, (response) => {
          if (!response.ok) {
            reject(new Error(response.error || "createElicitation failed"));
            return;
          }
          resolve({
            action: response.action,
            content: response.content ?? null,
            _meta: response._meta ?? null,
          });
        });
      });
    })();
    return trackExecBackgroundOperation(execState, operation);
  }

  function authenticatedFetch(
    input: RequestInfo | URL | PromiseLike<RequestInfo | URL>,
    init?: RequestInit,
  ) {
    let execState;
    try {
      execState = execContext.getAsync();
    } catch (error) {
      return makeRejectedThenable(error);
    }
    const operation = (async () => {
      if (typeof Request !== "function" || typeof Response !== "function") {
        throw new Error("nodeRepl.fetch requires Request and Response globals");
      }
      const request = new Request(await input, init);
      const body = Buffer.from(await request.arrayBuffer());
      const id = `${execState.id}-authenticated-fetch-${authenticatedFetchCounter++}`;
      const payload: {
        method: string;
        url: string;
        headers: { name: string; value: string }[];
        body_base64?: string;
      } = {
        method: request.method,
        url: request.url,
        headers: Array.from(request.headers.entries()).map(([name, value]) => ({
          name,
          value,
        })),
      };
      if (body.length > 0) {
        payload.body_base64 = body.toString("base64");
      }
      send({
        type: "authenticated_fetch",
        id,
        exec_id: execState.id,
        request: payload,
      });
      return new Promise<Response>((resolve, reject) => {
        pendingRequests.set(id, (result) => {
          if (!result.ok) {
            reject(new Error(result.error || "nodeRepl.fetch failed"));
            return;
          }
          if (!result.response) {
            reject(new Error("nodeRepl.fetch did not return a response"));
            return;
          }
          const status = Number(result.response.status);
          const responseBody =
            result.response.body_base64 && ![204, 205, 304].includes(status)
              ? Buffer.from(result.response.body_base64, "base64")
              : null;
          resolve(
            new Response(responseBody, {
              headers: (result.response.headers ?? []).map(
                (header: { name: string; value: string }) => [
                  header.name,
                  header.value,
                ],
              ),
              status,
              statusText: result.response.status_text ?? "",
            }),
          );
        });
      });
    })();
    // Trusted libraries issue best-effort background fetches without awaiting
    // them, so fetches must not extend the current exec's drain set.
    void operation.catch(() => {});
    return operation;
  }

  return { authenticatedFetch, createElicitation };
}
