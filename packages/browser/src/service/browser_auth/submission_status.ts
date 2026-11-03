import { readAuthPageBinding, type AuthBindingContext } from "./bindings";
interface SubmissionLocator {
  tab_id: string;
  selector: string;
  [key: string]: unknown;
}
interface SubmissionContext extends AuthBindingContext {
  playwright: AuthBindingContext["playwright"] & {
    countLocator(locator: SubmissionLocator): Promise<number>;
    readElementState(
      locator: SubmissionLocator,
      state: string,
    ): Promise<unknown>;
  };
}
/** Original cte. Locator failures are inconclusive; count zero is sufficient even without state checks. */
export async function authSubmissionControlChanged(
  locator: SubmissionLocator,
  context: SubmissionContext,
  checkState: boolean,
) {
  try {
    if ((await context.playwright.countLocator(locator)) === 0) return true;
    if (!checkState) return false;
    const [visible, enabled] = await Promise.all([
      context.playwright.readElementState(locator, "visible"),
      context.playwright.readElementState(locator, "enabled"),
    ]);
    return !visible || !enabled;
  } catch {
    return false;
  }
}
/** Original lte/zee/Kee. Recheck page origin after the control changes and before reporting submitted. */
export async function waitForAuthSubmission(
  locator: SubmissionLocator,
  origin: string,
  context: SubmissionContext,
  checkState: boolean,
) {
  const deadline = Date.now() + 1000;
  for (;;) {
    const before = await readAuthPageBinding(locator.tab_id, origin, context);
    if (typeof before === "string") return before;
    if (await authSubmissionControlChanged(locator, context, checkState)) {
      const after = await readAuthPageBinding(locator.tab_id, origin, context);
      return typeof after === "string" ? after : "submitted";
    }
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
