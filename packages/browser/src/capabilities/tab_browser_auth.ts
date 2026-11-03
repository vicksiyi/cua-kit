import {
  TabCapability,
  defineTabCapability,
  type TabCapabilityOptions,
} from "./base";
import { BrowserAuthHandoff } from "../commands/browser_auth";
import { PlaywrightLocator } from "../playwright/locator";

type AuthSelector = string | PlaywrightLocator;
export interface BrowserAuthRequest {
  origin: string;
  account_identifier?: string;
  otpHandle?: string;
  fields: Array<{
    id: string;
    label: string;
    type: string;
    required: boolean;
    selector: AuthSelector;
    autocomplete?: string | null;
  }>;
  qr_code?: boolean;
  options?: Array<{
    id: string;
    label: string;
    field_ids?: string[] | null;
    selector?: AuthSelector | null;
  }> | null;
  submit?: { action: "click" | "press_enter"; selector: AuthSelector } | null;
}
/** Original Vu. Identity check intentionally requires the actual locator class. */
function authSelector(
  selector: AuthSelector,
  target: { browserId: string; tabId: string },
): string {
  if (typeof selector === "string") return selector;
  if (!(selector instanceof PlaywrightLocator))
    throw new Error(
      "browserAuth selector must be a string or PlaywrightLocator",
    );
  const details = PlaywrightLocator.browserAuthSelector(selector);
  if (details.browserId !== target.browserId || details.tabId !== target.tabId)
    throw new Error("browserAuth selector locator must belong to this tab");
  return details.selector;
}
/** Original Uu. Serialization order, nullable option omission and explicit parse-before-send retained. */
export class BrowserAuthTabCapability extends TabCapability {
  constructor({
    browserId,
    documentation,
    info,
    tabId,
    transport,
  }: TabCapabilityOptions) {
    super(transport, browserId, tabId, documentation, info);
  }
  async request(input: BrowserAuthRequest) {
    const target = { browserId: this.browserId, tabId: this.tabId };
    const serialized: Record<string, unknown> = {
      origin: input.origin,
      account_identifier: input.account_identifier,
      otpHandle: input.otpHandle,
      fields: input.fields.map((field) => {
        const result: {
          id: string;
          label: string;
          type: string;
          required: boolean;
          selector: string;
          autocomplete?: string | null;
        } = {
          id: field.id,
          label: field.label,
          type: field.type,
          required: field.required,
          selector: authSelector(field.selector, target),
        };
        if (field.autocomplete !== undefined)
          result.autocomplete = field.autocomplete;
        return result;
      }),
      ...(input.qr_code === true ? { qr_code: true } : {}),
    };
    if (input.options != null)
      serialized.options = input.options.map((option) => ({
        id: option.id,
        label: option.label,
        ...(option.field_ids == null ? {} : { field_ids: option.field_ids }),
        ...(option.selector == null
          ? {}
          : { selector: authSelector(option.selector, target) }),
      }));
    if (input.submit != null)
      serialized.submit = {
        action: input.submit.action,
        selector: authSelector(input.submit.selector, target),
      };
    const command = BrowserAuthHandoff.create({
      ...serialized,
      browser_id: this.browserId,
      tab_id: this.tabId,
    });
    command.parse();
    const result = await this.transport.send({ command });
    return BrowserAuthHandoff.ResultSchema.parse(result);
  }
}
/** Original zu. */
export const browserAuthTabCapabilityDefinition = defineTabCapability({
  capability: BrowserAuthTabCapability,
  info: {
    id: "browserAuth",
    description:
      "MUST read its documentation before the first interaction with any authentication or sign-in flow required for the task. Covers method selection, secure user-provided credentials, and post-authentication verification and recovery.",
  },
});
