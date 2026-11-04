/** Enforce the original host audio catalog against trusted per-request metadata. */
export function require_audio_model_support(args: {
  model_allowlist: string | undefined;
  request_meta: Record<string, unknown> | undefined;
}): void {
  if (args.model_allowlist === undefined) return;
  const allowed: unknown = JSON.parse(args.model_allowlist);
  if (
    !Array.isArray(allowed) ||
    !allowed.every((model) => typeof model === "string")
  )
    throw new Error(
      "SKY_AUDIO_MODEL_ALLOWLIST must be a JSON array of model names",
    );
  let metadata = args.request_meta?.["x-codex-turn-metadata"];
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = undefined;
    }
  }
  const model =
    metadata == null || typeof metadata !== "object" || Array.isArray(metadata)
      ? undefined
      : Reflect.get(metadata, "model");
  if (typeof model !== "string" || !allowed.includes(model))
    throw new Error(
      "Computer audio recording requires a model that supports audio input",
    );
}
