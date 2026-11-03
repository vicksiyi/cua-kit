export interface PreferenceRuntime {
  requestMeta?: Record<string, any>;
}
export interface PreferenceTurn {
  sessionId: string;
  turnId: string;
}
/** Original Me; malformed serialized metadata does not fall back to interpreting its string. */
export function codexTurnMetadata(
  runtime: PreferenceRuntime,
): Record<string, any> | undefined {
  let value = runtime.requestMeta?.["x-codex-turn-metadata"];
  if (typeof value === "string")
    try {
      value = JSON.parse(value);
    } catch {
      return;
    }
  if (!(value == null || typeof value !== "object" || Array.isArray(value)))
    return value;
}
function metadataSession(meta: Record<string, any> | undefined) {
  if (meta?.thread_source === "subagent" && typeof meta.thread_id === "string")
    return meta.thread_id;
  const session = meta?.session_id;
  return typeof session === "string" ? session : undefined;
}
function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}
function fallbackSession(meta: Record<string, any> | undefined) {
  if (meta != null)
    for (const key of [
      "conversation_id",
      "conversationId",
      "thread_id",
      "threadId",
      "session_id",
      "sessionId",
    ]) {
      const value = meta[key];
      if (typeof value === "string" && value.trim().length > 0) return value;
    }
}
function fallbackTurn(
  meta: Record<string, any> | undefined,
): PreferenceTurn | undefined {
  if (meta == null) return;
  let sessionId, turnId;
  for (const key of ["conversation_id", "thread_id", "session_id"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim().length > 0) {
      sessionId = value;
      break;
    }
  }
  for (const key of ["turn_id", "turnId"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim().length > 0) {
      turnId = value;
      break;
    }
  }
  if (!(sessionId == null || turnId == null)) return { sessionId, turnId };
}
export function preferenceSessionId(runtime: PreferenceRuntime) {
  const meta = codexTurnMetadata(runtime),
    session = metadataSession(meta);
  return typeof session === "string"
    ? session
    : fallbackSession(runtime.requestMeta);
}
export function guardianV2Required(runtime: PreferenceRuntime) {
  return (
    (codexTurnMetadata(runtime)?.node_repl_auto_review_required ??
      runtime.requestMeta?.node_repl_auto_review_required ??
      runtime.requestMeta?.nodeReplAutoReviewRequired) === true
  );
}
export function guardianThreadId(runtime: PreferenceRuntime) {
  const meta = codexTurnMetadata(runtime),
    request = runtime.requestMeta;
  const thread =
    nonEmptyString(meta?.thread_id) ??
    nonEmptyString(request?.thread_id) ??
    nonEmptyString(request?.threadId);
  if (thread != null) return thread;
  const source =
    nonEmptyString(meta?.thread_source) ??
    nonEmptyString(request?.thread_source) ??
    nonEmptyString(request?.threadSource);
  if (!(
    (nonEmptyString(meta?.parent_thread_id) ??
      nonEmptyString(request?.parent_thread_id) ??
      nonEmptyString(request?.parentThreadId)) != null ||
    (source != null && source !== "user")
  ))
    return (
      nonEmptyString(meta?.session_id) ??
      nonEmptyString(request?.conversation_id) ??
      nonEmptyString(request?.conversationId) ??
      nonEmptyString(request?.session_id) ??
      nonEmptyString(request?.sessionId)
    );
}
export function preferenceTurn(
  runtime: PreferenceRuntime,
): PreferenceTurn | undefined {
  const meta = codexTurnMetadata(runtime),
    session = metadataSession(meta);
  return typeof session === "string" && typeof meta?.turn_id === "string"
    ? { sessionId: session, turnId: meta.turn_id }
    : fallbackTurn(runtime.requestMeta);
}
