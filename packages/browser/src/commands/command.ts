/** Original bundle symbol _: retains raw payload for toJSON and parses only on parse(). */
export class Command<T extends Record<string, unknown>> {
  constructor(
    public type: string,
    public schema: { parse(value: unknown): T },
    public payload: T,
  ) {}
  parse(): T {
    return this.schema.parse(this.payload);
  }
  toJSON() {
    return { type: this.type, ...this.payload };
  }
}
