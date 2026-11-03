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

/** Optional demo adapter. The SDK, MCP server and loop do not import this provider. */
export class ChatCompletionsModel implements ModelAdapter {
  constructor(
    private config: {
      endpoint: string;
      apiKey: string;
      model: string;
      thinking?: "disabled";
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
    const response = await fetch(this.config.endpoint, {
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
        tools: input.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        })),
      }),
    });
    // Never log response bodies/headers on HTTP errors: providers may echo credentials or content.
    if (!response.ok)
      throw new Error(`Model request failed: HTTP ${response.status}`);
    const message = responseSchema.parse(await response.json()).choices[0]!
      .message;
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
