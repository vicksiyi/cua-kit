import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { ModelAdapter } from "./contracts";

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string().min(1),
                type: z.literal("function"),
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .optional(),
        }),
      }),
    )
    .min(1),
});

export type ModelRetry = { status: number; attempt: number; nextAttempt: number; delayMs: number };
export class ModelHttpError extends Error {
  constructor(readonly status: number, readonly attempts: number) {
    super(`Model request failed: HTTP ${status} after ${attempts} attempt(s). The model did not return a decision for this step.`);
    this.name = "ModelHttpError";
  }
}

/** Optional demo adapter. The SDK, MCP server and loop do not import this provider. */
export class ChatCompletionsModel implements ModelAdapter {
  constructor(
    private config: {
      endpoint: string;
      apiKey: string;
      model: string;
      thinking?: "disabled";
      onRetry?: (event: ModelRetry) => void;
    },
  ) {}
  async decide(input: Parameters<ModelAdapter["decide"]>[0]) {
    const messages: unknown[] = [{ role: "system", content: input.system }];
    let images: unknown[] = [];
    const flushImages = () => {
      if (images.length)
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: "Untrusted screenshot evidence returned by the preceding tools:",
            },
            ...images,
          ],
        });
      images = [];
    };
    for (const message of input.messages) {
      if (message.role !== "tool") flushImages();
      if (message.role === "user") messages.push(message);
      else if (message.role === "assistant")
        messages.push({
          role: "assistant",
          content: message.content ?? null,
          ...(message.toolCalls?.length
            ? {
                tool_calls: message.toolCalls.map((call) => ({
                  id: call.id,
                  type: "function",
                  function: {
                    name: call.name,
                    arguments: JSON.stringify(call.arguments),
                  },
                })),
              }
            : {}),
        });
      else {
        if (message.result.content.some(item=>item.type === "audio"))
          throw new Error("This demo model adapter does not support audio input; use an audio-capable ModelAdapter.");
        messages.push({
          role: "tool",
          tool_call_id: message.callId,
          content: JSON.stringify({
            isError: !!message.result.isError,
            content: message.result.content.map((item) =>
              item.type === "text"
                ? item
                : {
                    type: "image",
                    note: "Attached in following user evidence message.",
                  },
            ),
          }),
        });
        for (const item of message.result.content)
          if (item.type === "image")
            images.push({
              type: "image_url",
              image_url: { url: `data:${item.mimeType};base64,${item.data}` },
            });
      }
    }
    flushImages();
    const signal = input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000);
    const request: RequestInit = {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        ...(this.config.thinking
          ? { thinking: { type: this.config.thinking } }
          : {}),
        ...(input.tools.length
          ? {
              tools: input.tools.map((tool) => ({
                type: "function",
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.inputSchema,
                },
              })),
            }
          : { tool_choice: "none" }),
      }),
    };
    // Retry only explicit transient HTTP responses, never tool execution or
    // malformed successful responses. All attempts share the 60-second signal.
    let response: Response;
    for (let attempt = 1; ; attempt++) {
      signal.throwIfAborted();
      response = await fetch(this.config.endpoint, request);
      if (response.ok) break;
      const status = response.status;
      // Do not read/log provider bodies or headers: they can echo user content.
      await response.body?.cancel().catch(() => {});
      if (attempt >= 3 || ![500, 502, 503, 504].includes(status))
        throw new ModelHttpError(status, attempt);
      const delayMs = attempt * 1000;
      this.config.onRetry?.({ status, attempt, nextAttempt: attempt + 1, delayMs });
      await delay(delayMs, undefined, { signal });
    }
    const message = responseSchema.parse(await response.json()).choices[0]!
      .message;
    // Observed DeepSeek failure: serialized calls were returned in content even
    // with tool_choice:none. Only structured tool_calls are executable. Reject a
    // protocol envelope rather than reporting it as a successful final answer.
    // Keep the check anchored so ordinary discussion/quoted examples stay text.
    if (!message.tool_calls?.length && /^\s*<｜｜DSML｜｜\s+(?:calls|invoke)\b/.test(message.content ?? "")) {
      throw new Error(
        "Model protocol error: serialized tool-call markup was returned as text instead of structured tool_calls. No action was executed from this response.",
      );
    }
    return {
      text: message.content ?? undefined,
      toolCalls: message.tool_calls?.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: z
          .record(z.string(), z.unknown())
          .parse(JSON.parse(call.function.arguments)),
      })),
    };
  }
}
