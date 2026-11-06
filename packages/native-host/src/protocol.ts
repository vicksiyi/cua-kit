/** Core deployment wire contract shared by native host clients and bindings.
 * These limits describe Core policy, not recovered vendor constants. */
export const MAX_FRAME = 1024 * 1024;
export interface NativeHostEndpoint {
  version: 1;
  socketPath: string;
  token: string;
}

export type RpcMessage = Record<string, unknown>;
export function rpcMessage(value: unknown): RpcMessage {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid RPC message");
  const message = value as RpcMessage;
  if (message.jsonrpc !== "2.0") throw Error("Expected JSON-RPC 2.0");
  if (
    "id" in message &&
    typeof message.id !== "string" &&
    typeof message.id !== "number"
  )
    throw Error("Invalid RPC id");
  if ("method" in message && typeof message.method !== "string")
    throw Error("Invalid RPC method");
  return message;
}
