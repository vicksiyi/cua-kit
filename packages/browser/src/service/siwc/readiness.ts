/** Runs inside the page; keep this function self-contained for serialization. */
export async function isSiwcControlReady(
  element: Element,
  injected: any,
  options: { scroll: boolean; automatic: boolean },
): Promise<boolean> {
  const valid = () =>
    injected.isSiwcControl(element) &&
    injected.elementState(element, "visible").matches &&
    injected.elementState(element, "enabled").matches;
  if (!valid()) return false;
  if (options.scroll) {
    element.scrollIntoView({ block: "center", inline: "center" });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (!valid()) return false;
    const rect = element.getBoundingClientRect();
    if (
      injected.expectHitTarget(
        { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        element,
      ) !== "done"
    )
      return false;
  }
  if (!options.automatic) return true;
  const candidates = injected.siwcDetect();
  return (
    candidates.length === 1 && candidates[0]?.ref === injected.siwcRef(element)
  );
}
interface SiwcAccountIdentity {
  accountKey: unknown;
  authLifetimeId: unknown;
  authOrigin: unknown;
  pageOrigin: unknown;
}
export function isSameSiwcAccount(
  expected: SiwcAccountIdentity,
  actual: SiwcAccountIdentity,
): boolean {
  return (
    actual.accountKey === expected.accountKey &&
    actual.authLifetimeId === expected.authLifetimeId &&
    actual.authOrigin === expected.authOrigin &&
    actual.pageOrigin === expected.pageOrigin
  );
}
