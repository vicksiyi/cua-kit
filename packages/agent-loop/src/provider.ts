import { ChatCompletionsModel, type ModelRetry } from "./chat-model";
/** Demo configuration is separate from CUA and MCP. Credentials are never tool arguments. */
export function createDemoModel(
  env: Record<string, string | undefined> = process.env,
  options: { onRetry?: (event: ModelRetry) => void } = {},
) {
  const provider = env.CUA_MODEL_PROVIDER ?? "deepseek";
  if (provider !== "deepseek" && provider !== "openai-compatible")
    throw new Error("Unsupported CUA_MODEL_PROVIDER");
  const apiKey =
    provider === "deepseek" ? env.DEEPSEEK_API_KEY : env.CUA_MODEL_API_KEY;
  if (!apiKey?.trim())
    throw new Error(
      provider === "deepseek"
        ? "Set DEEPSEEK_API_KEY in the local environment."
        : "Set CUA_MODEL_API_KEY.",
    );
  const model =
    env.CUA_MODEL ?? (provider === "deepseek" ? "deepseek-flash" : undefined);
  if (!model) throw new Error("Set CUA_MODEL.");
  const endpoint =
    env.CUA_MODEL_ENDPOINT ??
    (provider === "deepseek"
      ? "https://api.deepseek.com/chat/completions"
      : undefined);
  if (!endpoint) throw new Error("Set CUA_MODEL_ENDPOINT.");
  return new ChatCompletionsModel({
    onRetry: options.onRetry,
    apiKey,
    model,
    endpoint,
    ...(provider === "deepseek" ? { thinking: "disabled" } : {}),
  });
}
