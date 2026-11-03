/** Original Oe. Separate class identity from client/security errors. */
export class AuthorityGateError extends Error {
  gate: string;
  reason: string;
  context: Record<string, unknown>;
  constructor(
    gate: string,
    reason: string,
    message: string,
    context: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.gate = gate;
    this.reason = reason;
    this.context = context;
    this.name = "AuthorityGateError";
  }
}
