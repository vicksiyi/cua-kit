/** Original W. Numeric coercion and integer (not safe-integer) validation are intentional. */
export function positiveTabId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0)
    throw new Error("Expected a positive integer");
  return id;
}
