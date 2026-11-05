/** Local demo diagnostics. No network transport and no raw environment/header dump. */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ModelAdapter, ToolClient } from "./contracts";

export function createDebugLog(directory: string, secrets: string[] = []) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(
    directory,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.jsonl`,
  );
  writeFileSync(file, "", { flag: "wx", mode: 0o600 });
  const started = Date.now();
  let sequence = 0;
  const cleanString = (value: string) => {
    for (const secret of secrets
      .filter(Boolean)
      .sort((a, b) => b.length - a.length))
      value = value.split(secret).join("[REDACTED]");
    return value
      .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "[REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]");
  };
  function clean(value: unknown, key = ""): unknown {
    if (
      /^(authorization|cookie|set-cookie|api[_-]?key|password|secret|token|access[_-]?token|refresh[_-]?token)$/i.test(
        key,
      )
    )
      return "[REDACTED]";
    if (typeof value === "string") return cleanString(value);
    if (value instanceof Error)
      return {
        name: value.name,
        message: cleanString(value.message),
        stack: cleanString(value.stack ?? ""),
        ...(value instanceof AggregateError
          ? { errors: value.errors.map((e) => clean(e)) }
          : {}),
      };
    if (Array.isArray(value)) return value.map((item) => clean(item));
    if (value && typeof value === "object") {
      const item = value as Record<string, unknown>;
      if ((item.type === "image" || item.type === "audio") && typeof item.data === "string")
        return {
          type: item.type,
          mimeType: item.mimeType,
          base64Length: item.data.length,
          omitted: true,
        };
      return Object.fromEntries(
        Object.entries(item)
          .filter(([name]) => name !== "signal")
          .map(([name, entry]) => [name, clean(entry, name)]),
      );
    }
    return value;
  }
  const write = (event: string, data: unknown = {}) => {
    appendFileSync(
      file,
      JSON.stringify({
        version: 1,
        sequence: ++sequence,
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - started,
        event,
        data: clean(data),
      }) + "\n",
    );
  };
  let step = 0;
  async function operation<T>(
    kind: string,
    input: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    const id = randomUUID(),
      begin = Date.now();
    write(`${kind}.request`, { id, step, input });
    try {
      const result = await run();
      write(`${kind}.result`, {
        id,
        step,
        durationMs: Date.now() - begin,
        result,
      });
      return result;
    } catch (error) {
      write(`${kind}.error`, {
        id,
        step,
        durationMs: Date.now() - begin,
        error,
      });
      throw error;
    }
  }
  return {
    file,
    write,
    model(model: ModelAdapter): ModelAdapter {
      return {
        decide(input) {
          step++;
          return operation("model", input, () => model.decide(input));
        },
      };
    },
    tools(tools: ToolClient): ToolClient {
      return {
        listTools: (signal) =>
          operation("tools.list", {}, () => tools.listTools(signal)),
        callTool: (call, signal) =>
          operation("tool", call, () => tools.callTool(call, signal)),
        ...(tools.endTurn
          ? { endTurn: () => operation("turn.end", {}, () => tools.endTurn!()) }
          : {}),
        close: () => operation("client.close", {}, () => tools.close()),
      };
    },
  };
}
