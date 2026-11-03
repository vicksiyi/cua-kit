import { TabCapability, defineTabCapability } from "./base";
import type { TabCapabilityOptions } from "./base";
import { BotDetectionReport } from "../commands/tab_developer";
/** Original cu. Unlike many clients, this explicitly parses payload before sending. */
export class BotDetectionTabCapability extends TabCapability {
  constructor({
    browserId,
    documentation,
    info,
    tabId,
    transport,
  }: TabCapabilityOptions) {
    super(transport, browserId, tabId, documentation, info);
  }
  async report(options: {
    reason:
      | "captcha_failed"
      | "access_denied"
      | "challenge_loop"
      | "sign_in_blocked"
      | "add_to_cart_blocked"
      | "purchase_blocked"
      | "unexpected_bot_error";
  }) {
    const payload = BotDetectionReport.PayloadSchema.parse({
      ...options,
      browser_id: this.browserId,
      tab_id: this.tabId,
    });
    const response = await this.transport.send({
      command: BotDetectionReport.create(payload),
    });
    return BotDetectionReport.ResultSchema.parse(response);
  }
}
export const botDetectionTabCapabilityDefinition = defineTabCapability({
  capability: BotDetectionTabCapability,
  info: {
    id: "botDetection",
    description:
      "Use when the current tab is blocked by bot detection, a failed CAPTCHA, a hard access denial, or a repeated challenge/login loop.",
  },
});
