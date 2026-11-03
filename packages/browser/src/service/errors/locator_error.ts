/** Original service Fr. Every instance is classified as locator_timeout regardless of code. */
export class LocatorError extends Error {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
  code: string;
}
