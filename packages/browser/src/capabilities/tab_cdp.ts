import { TabCapability, defineTabCapability } from "./base";
import type { TabCapabilityOptions } from "./base";
import { CdpCall, CdpEvents } from "../commands/tab_developer";
type CdpTarget = { sessionId?: string; targetId?: string };
/** Original Su/ju/Iu. */
export class CdpTabCapability extends TabCapability {
  constructor({
    browserId,
    documentation,
    info,
    tabId,
    transport,
  }: TabCapabilityOptions) {
    super(transport, browserId, tabId, documentation, info);
  }
  async send(
    method: string,
    params?: Record<string, unknown>,
    options?: { target?: CdpTarget; timeoutMs?: number },
  ) {
    const response = await this.transport.send({
      command: CdpCall.create({
        browser_id: this.browserId,
        method,
        params,
        tab_id: this.tabId,
        target: mapTarget(options?.target),
        timeout_ms: options?.timeoutMs,
      }),
      timeoutMs: options?.timeoutMs,
    });
    return CdpCall.ResultSchema.parse(response);
  }
  async readEvents(options?: {
    afterSequence?: number;
    limit?: number;
    methods?: string[];
    target?: CdpTarget;
    timeoutMs?: number;
  }) {
    const response = await this.transport.send({
      command: CdpEvents.create({
        after_sequence: options?.afterSequence,
        browser_id: this.browserId,
        limit: options?.limit,
        methods: options?.methods,
        tab_id: this.tabId,
        target: mapTarget(options?.target),
        timeout_ms: options?.timeoutMs,
      }),
      timeoutMs: eventClientTimeout(options?.timeoutMs),
    });
    return CdpEvents.ResultSchema.parse(response);
  }
}
function mapTarget(target?: CdpTarget) {
  if (target != null)
    return { session_id: target.sessionId, target_id: target.targetId };
}
function eventClientTimeout(timeoutMs?: number) {
  return timeoutMs != null && timeoutMs > 0 ? timeoutMs + 2e3 : undefined;
}
export const cdpTabCapabilityDefinition = defineTabCapability({
  capability: CdpTabCapability,
  info: {
    id: "cdp",
    description:
      "Send raw Chrome DevTools Protocol commands and read debugger events through a supported tab for developer use cases.",
  },
});
