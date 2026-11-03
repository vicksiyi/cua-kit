/** Original hl/ml: the intrinsic getter recognizes cross-realm RegExp without relying on instanceof. */
const regexpSourceGetter = Object.getOwnPropertyDescriptor(
  RegExp.prototype,
  "source",
)?.get;
export function isRegExp(value: unknown): boolean {
  if (value == null || typeof value !== "object" || !regexpSourceGetter)
    return false;
  try {
    Reflect.apply(regexpSourceGetter, value, []);
    return true;
  } catch {
    return false;
  }
}
/** Original pl. */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (value == null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}
/** Original bl: accessor/proxy failures are intentionally swallowed. */
export function hasErrorMessage(value: unknown, message: string): boolean {
  if (value == null || typeof value !== "object") return false;
  try {
    return "message" in value && value.message === message;
  } catch {
    return false;
  }
}
