/** Original Lt/yl/Sl. This is the bundled envelope guard, not full JSON Schema validation. */
export function isKernelRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
export function isKernelObjectSchema(
  value: unknown,
): value is Record<string, any> {
  if (
    !isKernelRecord(value) ||
    value.type !== "object" ||
    !isKernelRecord(value.properties) ||
    (value.additionalProperties !== undefined &&
      typeof value.additionalProperties !== "boolean") ||
    (value.required !== undefined &&
      (!Array.isArray(value.required) ||
        value.required.some((item) => typeof item !== "string")))
  )
    return false;
  return Object.values(value.properties).every(isKernelPropertySchema);
}
export function isKernelPropertySchema(value: unknown): boolean {
  if (!isKernelRecord(value)) return false;
  switch (value.type) {
    case "boolean":
    case "integer":
    case "number":
    case "string":
      return (
        value.enum === undefined ||
        (Array.isArray(value.enum) &&
          value.enum.every(
            (item) =>
              typeof item ===
              (value.type === "integer" ? "number" : value.type),
          ))
      );
    case "null":
      return true;
    case "array":
      return isKernelPropertySchema(value.items);
    case "object":
      return isKernelObjectSchema(value);
    default:
      return false;
  }
}
export interface KernelElicitationScope {
  signal: AbortSignal;
  client: {
    createElicitation(
      request: {
        message: string;
        requestedSchema: Record<string, any>;
        _meta?: unknown;
      },
      signal: AbortSignal,
    ): Promise<{ action: string; content?: unknown; _meta?: unknown }>;
  };
}
/** Ds.createElicitation: host client owns the actual UI and user decision. */
export function createKernelElicitation(
  scopeId: string,
  getScope: (id: string) => KernelElicitationScope,
) {
  return async (request: {
    message: string;
    requestedSchema?: unknown;
    meta?: unknown;
  }) => {
    const { client, signal } = getScope(scopeId);
    const schema = request.requestedSchema ?? {
      additionalProperties: false,
      properties: {},
      type: "object",
    };
    if (!isKernelObjectSchema(schema))
      throw new Error("MCP elicitation requires a valid object schema");
    const result = await client.createElicitation(
      {
        message: request.message,
        requestedSchema: schema,
        ...(request.meta == null ? {} : { _meta: request.meta }),
      },
      signal,
    );
    const content = result.content,
      metadata = result._meta;
    if (
      (content != null && !isKernelRecord(content)) ||
      (metadata != null && !isKernelRecord(metadata))
    )
      throw new Error("MCP elicitation returned an invalid response");
    return {
      action: result.action,
      ...(content === undefined ? {} : { content }),
      ...(metadata === undefined ? {} : { _meta: metadata }),
    };
  };
}
