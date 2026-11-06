import {
  TabCapability,
  defineTabCapability,
  type TabCapabilityOptions,
} from "./base";
import {
  SiwcDetect,
  SiwcAuthenticate,
  type SiwcAuthenticateOptions,
} from "../commands/siwc";
/** Current Ih. Capability availability is filtered by the selected browser service. */
export class SiwcTabCapability extends TabCapability {
  constructor({
    browserId,
    documentation,
    info,
    tabId,
    transport,
  }: TabCapabilityOptions) {
    super(transport, browserId, tabId, documentation, info);
  }
  async detect() {
    return await this.transport.send({
      command: SiwcDetect.create({
        browser_id: this.browserId,
        tab_id: this.tabId,
      }),
    });
  }
  async authenticate(options: SiwcAuthenticateOptions = {}) {
    const command = SiwcAuthenticate.create({
      ...options,
      browser_id: this.browserId,
      tab_id: this.tabId,
    });
    command.parse();
    return await this.transport.send({ command });
  }
}
export const siwcTabCapabilityDefinition = defineTabCapability({
  capability: SiwcTabCapability,
  info: {
    id: "siwc",
    description:
      "Detect possible Sign in with ChatGPT controls and authenticate the user. Read its documentation before authenticating with the current account.",
  },
});
