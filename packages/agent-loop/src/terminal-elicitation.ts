/** Independently authored demo UI. Validation uses the MCP SDK's upstream AJV provider. */
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type {
  ElicitRequestParams,
  ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";
import { createInterface } from "node:readline/promises";
import { stripVTControlCharacters } from "node:util";
import type { ReadStream, WriteStream } from "node:tty";

export interface ElicitationIO {
  write(text: string): void;
  ask(prompt: string): Promise<string | undefined>;
}
const display = (value: string) =>
  stripVTControlCharacters(value).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
export async function promptElicitation(
  params: ElicitRequestParams,
  io: ElicitationIO,
): Promise<ElicitResult> {
  if (params.mode === "url") {
    io.write(
      "URL elicitation is not supported by this terminal UI. Request cancelled.\n",
    );
    return { action: "cancel" };
  }
  io.write(`\nMCP confirmation request\n${display(params.message)}\n`);
  const schema = params.requestedSchema;
  const validate = new AjvJsonSchemaValidator().getValidator<
    NonNullable<ElicitResult["content"]>
  >(schema);
  const hasFields = Object.keys(schema.properties).length > 0;
  if (hasFields)
    io.write(`Requested form:\n${display(JSON.stringify(schema, null, 2))}\n`);
  for (;;) {
    const answer = (await io.ask("[a] Accept, [d] Decline, [c] Cancel: "))
      ?.trim()
      .toLowerCase();
    if (answer === undefined || answer === "c" || answer === "cancel")
      return { action: "cancel" };
    if (answer === "d" || answer === "decline") return { action: "decline" };
    if (answer !== "a" && answer !== "accept") {
      io.write("Choose accept, decline or cancel explicitly.\n");
      continue;
    }
    for (;;) {
      let content: unknown = {};
      if (hasFields) {
        const line = await io.ask(
          "Enter form values as a JSON object (blank = {}), or cancel/decline: ",
        );
        if (line === undefined || line.trim().toLowerCase() === "cancel")
          return { action: "cancel" };
        if (line.trim().toLowerCase() === "decline")
          return { action: "decline" };
        try {
          content = JSON.parse(line.trim() || "{}");
        } catch {
          io.write("Invalid JSON; enter the form again or cancel.\n");
          continue;
        }
      }
      const result = validate(content);
      if (result.valid) return { action: "accept", content: result.data };
      io.write(`Invalid form: ${display(result.errorMessage)}\n`);
      if (!hasFields) return { action: "cancel" };
    }
  }
}

/** No terminal means no capability. Requests are serialized; EOF/interrupt cancels. */
export function createTerminalElicitation(
  options: {
    input?: ReadStream;
    output?: WriteStream;
    signal?: AbortSignal;
  } = {},
): ((params: ElicitRequestParams) => Promise<ElicitResult>) | undefined {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stderr;
  if (!input.isTTY || !output.isTTY) return undefined;
  let queue: Promise<unknown> = Promise.resolve();
  return (params) => {
    const pending = queue.then(async (): Promise<ElicitResult> => {
      if (options.signal?.aborted) return { action: "cancel" };
      const cancellation = new AbortController();
      const signal = options.signal
        ? AbortSignal.any([options.signal, cancellation.signal])
        : cancellation.signal;
      const rl = createInterface({ input, output, terminal: true });
      const cancel = () => cancellation.abort();
      rl.on("SIGINT", cancel);
      rl.on("close", cancel);
      try {
        return await promptElicitation(params, {
          write: (text) => {
            output.write(text);
          },
          ask: async (prompt) => {
            if (signal.aborted) return undefined;
            try {
              return await rl.question(prompt, { signal });
            } catch (error) {
              if (signal.aborted) return undefined;
              throw error;
            }
          },
        });
      } finally {
        rl.removeListener("SIGINT", cancel);
        rl.removeListener("close", cancel);
        rl.close();
      }
    });
    queue = pending.catch(() => {});
    return pending;
  };
}
