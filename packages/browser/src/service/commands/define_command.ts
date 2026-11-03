/** Original F. No validation or async wrapper is inserted at registration time. */
export function defineCommand<P, C, R>(
  definition: string | { commandType: string },
  handler: (payload: P, context: C) => R,
) {
  const type =
    typeof definition === "string" ? definition : definition.commandType;
  const command = (payload: P, context: C) => handler(payload, context);
  command.type = type;
  return command;
}
