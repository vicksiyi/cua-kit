import { Agent, type BrowserFactoryOptions } from "../agent";
import { Browser } from "../browser";
import { Tab } from "../tab";
import {
  FunctionAgentTransport,
  type DisplaySideEffect,
  type ExecuteAgentCommand,
} from "./function_agent_transport";
import {
  createApiView,
  getDisabledMemberIds,
  type ApiManifest,
  type ApiView,
} from "./api_view";
import { runtimeTypes } from "./registry";
/** Original jm. These public fields were explicit class fields in the installed source. */
export class BrowserRuntimeFactory {
  apiManifest: ApiManifest;
  disabledMemberIds: Set<string>;
  view: ApiView;
  constructor({
    apiManifest,
    decorateTab,
    disabledMemberIds,
  }: {
    apiManifest: ApiManifest;
    decorateTab?: (tab: Tab) => unknown;
    disabledMemberIds: Set<string>;
  }) {
    this.apiManifest = apiManifest;
    this.disabledMemberIds = disabledMemberIds;
    this.view = createApiView(apiManifest, decorateTab, runtimeTypes, Tab);
  }
  createBrowser = ({
    browserInfo,
    onBrowserUsed,
    transport,
  }: BrowserFactoryOptions) => {
    const disabled = getDisabledMemberIds({
      apiManifest: this.apiManifest,
      browserInfo,
      disabledMemberIds: this.disabledMemberIds,
    });
    return this.view(
      new Browser({
        browserId: browserInfo.id,
        capabilities: browserInfo.capabilities,
        onBrowserUsed,
        transport,
      }),
      disabled,
    );
  };
  wrapAgent<T>(agent: T): T {
    return this.view(agent, this.disabledMemberIds);
  }
  createAgent({
    displaySideEffect,
    executeAgentCommand,
  }: {
    displaySideEffect?: DisplaySideEffect;
    executeAgentCommand?: ExecuteAgentCommand;
  }) {
    return this.wrapAgent(
      new Agent({
        createBrowser: this.createBrowser,
        transport: new FunctionAgentTransport({
          displaySideEffect,
          executeAgentCommand,
        }),
      }),
    );
  }
}
