/** Original bundle symbol _: retains raw payload for toJSON and parses only on parse(). */
export class Command<T extends Record<string, unknown>> {
  declare type: string;
  declare schema: { parse(value: unknown): T };
  declare payload: T;
  constructor(type: string, schema: { parse(value: unknown): T }, payload: T) {
    this.type = type;
    this.schema = schema;
    this.payload = payload;
  }
  parse(): T {
    return this.schema.parse(this.payload);
  }
  toJSON() {
    return { type: this.type, ...this.payload };
  }
}
