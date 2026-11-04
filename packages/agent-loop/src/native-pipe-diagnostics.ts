/** Observes native transport metadata; does not print paths, payloads or raw errors. */
export function createNativePipeDiagnostics(emit: (line: string) => void) {
  const requests = new Map<string, string>();
  const connections = new Map<string, { number: number; bytes: Buffer | null }>();
  let sequence = 0;
  function observe(message: any, direction: "request" | "response") {
    if (direction === "request" && message?.type === "native_pipe_request") {
      if (typeof message.id !== "string" || requests.size >= 1024) return;
      if (message.op === "connect") requests.set(message.id, "connect");
      return;
    }
    if (direction !== "response") return;
    if (message?.type === "native_pipe_response" && requests.has(message.id)) {
      requests.delete(message.id);
      const id = message.result?.connection_id;
      if (message.ok === true && typeof id === "string" && connections.size < 1024) {
        const number = ++sequence;
        connections.set(id, { number, bytes: Buffer.alloc(0) });
        emit(`native pipe #${number} connected`);
      } else emit("native pipe connect failed");
      return;
    }
    const connection = connections.get(message?.connection_id);
    if (!connection) return;
    if (message.type === "native_pipe_closed") {
      emit(`native pipe #${connection.number} closed${message.error ? " with transport error" : ""}`);
      connections.delete(message.connection_id);
    } else if (message.type === "native_pipe_data" && typeof message.data_base64 === "string" && connection.bytes !== null) {
      // Handshake replies fit in 4 KiB. Stop inspection if larger data arrives;
      // the actual worker still receives all original bytes unchanged.
      if (message.data_base64.length > 8192) { connection.bytes = null; return; }
      connection.bytes = Buffer.concat([connection.bytes, Buffer.from(message.data_base64, "base64")]);
      while (connection.bytes.length >= 4) {
        const size = connection.bytes.readUInt32LE();
        if (size > 4096) { connection.bytes = null; break; }
        if (connection.bytes.length < size + 4) break;
        const frame = connection.bytes.subarray(4, size + 4);
        connection.bytes = connection.bytes.subarray(size + 4);
        try {
          const value = JSON.parse(frame.toString("utf8"));
          if (value?.jsonrpc !== "2.0") continue;
          if (Number.isSafeInteger(value.error?.code))
            emit(`native pipe #${connection.number} JSON-RPC error code ${value.error.code}`);
          else if (typeof value.result?.serverApiVersion === "string")
            emit(`native pipe #${connection.number} handshake response received`);
        } catch { /* Malformed frames remain the worker's responsibility. */ }
      }
    }
  }
  return { observe, close() { requests.clear(); connections.clear(); } };
}
