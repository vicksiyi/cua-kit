export interface TabRequestHeaders {
  sessionId: string;
  headers: Array<{ name: string; value: string }>;
}
const firstRuleId = 1000000;
const lastRuleId = firstRuleId + 4999;
/** Original vy. Rule updates report errors as return values for the lease manager to propagate. */
export function createRequestHeaderRulesClass(host: {
  chrome: Pick<typeof chrome, "declarativeNetRequest" | "tabs" | "runtime">;
  error(message: string, context: { operation: string }): void;
}) {
  return class RequestHeaderRules {
    appliedRules: string | undefined;
    failureReported = false;
    async synchronize(
      active: Map<number, TabRequestHeaders>,
      force = false,
    ): Promise<Error | null> {
      const dnr = host.chrome.declarativeNetRequest;
      let operation = "check DNR permission";
      try {
        if (dnr == null) {
          if (active.size > 0)
            throw new Error("The declarativeNetRequest permission is missing");
          return null;
        }
        let existingTabs: Set<number | undefined> | undefined;
        if (force && active.size > 0) {
          operation = "query existing tabs";
          existingTabs = new Set(
            (await host.chrome.tabs.query({})).map((tab) => tab.id),
          );
        }
        const grouped = new Map<
          string,
          { tabIds: number[]; headers: TabRequestHeaders["headers"] }
        >();
        for (const [tabId, configuration] of active) {
          if (
            !Number.isSafeInteger(tabId) ||
            tabId < 0 ||
            (existingTabs != null && !existingTabs.has(tabId))
          )
            continue;
          const key = JSON.stringify(configuration),
            group = grouped.get(key);
          if (group) group.tabIds.push(tabId);
          else
            grouped.set(key, {
              tabIds: [tabId],
              headers: configuration.headers,
            });
        }
        const rules: chrome.declarativeNetRequest.Rule[] = [];
        for (const [, { tabIds, headers }] of [...grouped].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          tabIds.sort((a, b) => a - b);
          rules.push(
            ...[
              {
                tabIds,
                resourceTypes: [
                  dnr.ResourceType.MAIN_FRAME,
                  dnr.ResourceType.SUB_FRAME,
                  dnr.ResourceType.OBJECT,
                ],
              },
              {
                tabIds,
                excludedInitiatorDomains: [host.chrome.runtime.id],
                excludedResourceTypes: [
                  dnr.ResourceType.MAIN_FRAME,
                  dnr.ResourceType.SUB_FRAME,
                  dnr.ResourceType.OBJECT,
                ],
              },
            ].map((condition, offset) => ({
              id: firstRuleId + rules.length + offset,
              priority: 4,
              action: {
                type: dnr.RuleActionType.MODIFY_HEADERS,
                requestHeaders: headers.map(({ name, value }) => ({
                  header: name,
                  value,
                  operation: dnr.HeaderOperation.SET,
                })),
              },
              condition,
            })),
          );
        }
        if (rules.length > lastRuleId - firstRuleId + 1)
          throw new Error("Too many controlled-tab request header rules");
        const serialized = JSON.stringify(rules);
        if (force || this.appliedRules !== serialized) {
          operation =
            rules.length === 0
              ? "remove session rules"
              : "update session rules";
          await dnr.updateSessionRules({
            removeRuleIds: await this.readOwnedRuleIds(),
            addRules: rules,
          });
          this.appliedRules = serialized;
          this.failureReported = false;
        }
        return null;
      } catch {
        this.appliedRules = undefined;
        if (!this.failureReported) {
          host.error(
            "Controlled-tab request headers failed. Check the DNR permission. Retrying on the next lease change or heartbeat.",
            { operation },
          );
          this.failureReported = true;
        }
        return new Error(
          `Unable to ${operation} for agent request headers. Retry the browser command.`,
        );
      }
    }
    async readOwnedRuleIds() {
      return (await host.chrome.declarativeNetRequest.getSessionRules())
        .filter(({ id }) => id >= firstRuleId && id <= lastRuleId)
        .map(({ id }) => id);
    }
  };
}
