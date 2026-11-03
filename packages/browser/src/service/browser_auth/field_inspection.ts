import { authFieldPage } from "./field_page";
import {
  distinctAuthElements,
  type AuthBindingContext,
  type AuthBindingRequest,
} from "./bindings";
import type { AuthField } from "./field_plan";
interface InspectionRequest extends AuthBindingRequest {
  browser_id: string;
  fields: Omit<AuthField, "labelMetadata">[];
  submit?: { selector: string; action: string } | null;
}
interface InspectionContext extends AuthBindingContext {
  playwright: AuthBindingContext["playwright"] & {
    evaluateOnPlaywrightSelector(
      tabId: string,
      selector: string,
      callback: (...args: any[]) => any,
      options: any,
    ): Promise<any>;
    countLocator(payload: any): Promise<number>;
    readElementState(payload: any, state: string): Promise<boolean>;
  };
}
/** Original oN/rte/nte. Only explicit false produces not-user-visible; null is inconclusive. */
export async function authFieldVisibility(
  field: { selector: string; type: string },
  request: InspectionRequest,
  context: InspectionContext,
  strict = false,
) {
  try {
    return await context.playwright.evaluateOnPlaywrightSelector(
      request.tab_id,
      field.selector,
      authFieldPage,
      {
        arg: {
          operation: "browser-auth-user-visibility",
          expectedType: field.type,
        },
        isolatedWorld: true,
        strict,
        timeoutMs: request.timeout_ms,
      },
    );
  } catch {
    return null;
  }
}
export async function firstInvisibleAuthField(
  request: InspectionRequest,
  context: InspectionContext,
) {
  for (const field of request.fields)
    if ((await authFieldVisibility(field, request, context)) === false)
      return field.id;
  return null;
}
/** Original vv. Click submit allows a disabled control; option checks do not. */
export async function validAuthControl(
  selector: string,
  request: InspectionRequest,
  context: InspectionContext,
  allowDisabled = false,
) {
  try {
    const payload = {
      browser_id: request.browser_id,
      tab_id: request.tab_id,
      selector,
      timeout_ms: request.timeout_ms,
    };
    const [count, visible, enabled] = await Promise.all([
      context.playwright.countLocator(payload),
      context.playwright.readElementState(payload, "visible"),
      context.playwright.readElementState(payload, "enabled"),
    ]);
    return (
      count === 1 && visible === true && (enabled === true || allowDisabled)
    );
  } catch {
    return false;
  }
}
/** Original Ah/Ph/QM. */
export async function validAuthFields(
  request: InspectionRequest,
  context: InspectionContext,
) {
  try {
    const selectors = request.fields.map((field) => field.selector);
    for (const field of request.fields)
      if ((await authFieldVisibility(field, request, context, true)) !== true)
        return false;
    if (
      !(await distinctAuthElements(request.tab_id, selectors, request, context))
    )
      return false;
    if (request.submit == null) return true;
    if (
      !(await validAuthControl(
        request.submit.selector,
        request,
        context,
        request.submit.action === "click",
      ))
    )
      return false;
    return request.submit.action === "press_enter"
      ? true
      : await distinctAuthElements(
          request.tab_id,
          [...selectors, request.submit.selector],
          request,
          context,
        );
  } catch {
    return false;
  }
}
export async function validAuthOptions(
  request: InspectionRequest,
  context: InspectionContext,
) {
  try {
    if (request.options == null) return true;
    for (const option of request.options)
      if (
        option.selector != null &&
        !(await validAuthControl(option.selector, request, context))
      )
        return false;
    return await distinctAuthElements(
      request.tab_id,
      [
        ...request.fields.map(({ selector }) => selector),
        ...(request.submit?.action === "click"
          ? [request.submit.selector]
          : []),
        ...request.options.flatMap(({ selector }) =>
          selector == null ? [] : [selector],
        ),
      ],
      request,
      context,
    );
  } catch {
    return false;
  }
}
export async function revalidateAuthLocators(
  request: InspectionRequest,
  context: InspectionContext,
) {
  return !(await validAuthFields(request, context)) ||
    !(await validAuthOptions(request, context))
    ? "locator_invalid"
    : null;
}
/** Original tte. Callback remains self-contained for serialization. */
export async function authFieldMetadata(
  field: { selector: string; type: string },
  request: InspectionRequest,
  context: InspectionContext,
  isolatedWorld = false,
) {
  try {
    return await context.playwright.evaluateOnPlaywrightSelector(
      request.tab_id,
      field.selector,
      (element, injected, arg) => {
        if (element.tagName !== "INPUT" || element.type !== arg.expectedType)
          return null;
        const text = {
          clean(value: string | null | undefined) {
            const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
            return normalized.length === 0
              ? null
              : normalized.length <= 80
                ? normalized
                : `${normalized.slice(0, 79)}…`;
          },
        };
        return {
          accessible_name: text.clean(
            injected.utils.getElementAccessibleName(element, false),
          ),
          autocomplete: text.clean(element.autocomplete.toLowerCase()),
          input_type: element.type,
          input_mode: text.clean(element.inputMode.toLowerCase()),
          input_name: text.clean(element.name),
          required: element.required === true,
        };
      },
      {
        arg: {
          operation: "browser-auth-field-label-metadata",
          expectedType: field.type,
        },
        ...(isolatedWorld ? { isolatedWorld: true } : {}),
        timeoutMs: request.timeout_ms,
      },
    );
  } catch {
    return null;
  }
}
/** Original za. Metadata required state can strengthen but never weaken request required state. */
export async function inspectAuthFields(
  request: InspectionRequest,
  context: InspectionContext,
  isolatedWorld = false,
  skipValidation = false,
) {
  try {
    if (!skipValidation && !(await validAuthFields(request, context)))
      return null;
    const fields: AuthField[] = [];
    for (const field of request.fields) {
      const metadata = await authFieldMetadata(
        field,
        request,
        context,
        isolatedWorld,
      );
      if (metadata == null) return null;
      const { required, ...labelMetadata } = metadata;
      fields.push({
        ...field,
        required: field.required || required,
        labelMetadata,
      });
    }
    return fields;
  } catch {
    return null;
  }
}
