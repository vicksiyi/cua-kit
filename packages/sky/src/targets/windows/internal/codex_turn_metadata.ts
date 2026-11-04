export const ENV_NODE_REPL_REQUEST_META = "NODE_REPL_REQUEST_META";
export const APPROVED_APP_META_KEY = "x-oai-cua-approved-app";
const TURN_METADATA = "x-codex-turn-metadata";
function record(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof value === "string")
    try {
      parsed = JSON.parse(value);
    } catch {}
  return parsed != null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}
export function codexTurnMetadataFromRequestMeta(): Record<string, unknown> {
  const host = globalThis as any,
    merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    record(host.process?.env?.[ENV_NODE_REPL_REQUEST_META]),
  ))
    merged[key] = value;
  for (const [key, value] of Object.entries(record(host.nodeRepl?.requestMeta)))
    merged[key] = value;
  const approved = merged[APPROVED_APP_META_KEY],
    turn = record(merged[TURN_METADATA]);
  delete merged[TURN_METADATA];
  for (const [key, value] of Object.entries(turn)) merged[key] = value;
  if (typeof approved === "string" && approved.trim())
    merged[APPROVED_APP_META_KEY] = approved;
  return merged;
}
