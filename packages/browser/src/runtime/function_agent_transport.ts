import { z } from "../vendor/bundled_zod";

// Structural types inferred from xm's call sites; the original browser declarations
// are absent from the installed bundle. Commands need only toJSON at this layer.
export interface SerializableCommand {
  toJSON(): Record<string, unknown>;
}
// Response types are not asserted here: original consumers decide whether to parse.
export interface ClientTransport {
  send(args: {
    command: SerializableCommand;
    timeoutMs?: number;
  }): Promise<any>;
  display(value: unknown): Promise<unknown>;
}
export type DisplaySideEffect = (value: unknown) => unknown | Promise<unknown>;
export type ExecuteAgentCommand = (
  payload: Record<string, unknown>,
) => unknown | Promise<unknown>;

const sideEffectsSchema = z
  .object({ side_effects: z.array(z.string()) })
  .passthrough();

async function defaultDisplay(value: unknown): Promise<void> {
  const display = (
    globalThis as typeof globalThis & { display?: DisplaySideEffect }
  ).display;
  if (typeof display !== "function") console.log(value);
  else await display(value);
}

async function consumeSideEffects(
  response: unknown,
  display: DisplaySideEffect,
) {
  const parsed = sideEffectsSchema.safeParse(response);
  if (!parsed.success) return response;
  for (const effect of parsed.data.side_effects) await display(effect);
  const { side_effects: _sideEffects, ...result } = parsed.data;
  return result;
}

/** Original xm/km/Sm/Tm. Sends raw toJSON; it deliberately does NOT call parse(). */
export class FunctionAgentTransport implements ClientTransport {
  declare public executeAgentCommand: ExecuteAgentCommand;
  declare public displaySideEffect: DisplaySideEffect;

  constructor({
    executeAgentCommand,
    displaySideEffect,
  }: {
    executeAgentCommand?: ExecuteAgentCommand;
    displaySideEffect?: DisplaySideEffect;
  } = {}) {
    if (typeof executeAgentCommand !== "function") {
      throw new Error(
        "FunctionAgentTransport requires an executeAgentCommand function",
      );
    }
    this.executeAgentCommand = executeAgentCommand;
    this.displaySideEffect = displaySideEffect ?? defaultDisplay;
  }

  async display(value: unknown): Promise<void> {
    await this.displaySideEffect(value);
  }

  async send({
    command,
    timeoutMs,
  }: {
    command: SerializableCommand;
    timeoutMs?: number;
  }) {
    const payload = command.toJSON();
    const response = await this.executeAgentCommand({
      ...payload,
      client_timeout_ms:
        typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : undefined,
    });
    const result = await consumeSideEffects(response, this.displaySideEffect);
    if (result == null)
      throw new Error("transport send returned empty response");
    return result;
  }
}
