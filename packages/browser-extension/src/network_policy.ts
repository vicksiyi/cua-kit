import {
  compileNetworkPolicy,
  createNetworkPolicyPredicate,
} from "./network_policy_compiler";
export interface CompiledNetworkPolicy {
  defaultAction: "allow" | "block";
  rules: Array<{ action: "allow" | "block"; regex: string }>;
}
export interface NetworkPolicyRequest {
  timeoutMs?: number;
  constraints: any[];
}
const firstRuleId = 2000000,
  lastRuleId = 2999999;
const owned = (rule: { id: number }) =>
  rule.id >= firstRuleId && rule.id <= lastRuleId;
function requireTabId(tabId: number) {
  if (!Number.isSafeInteger(tabId) || tabId <= 0)
    throw new Error(
      "Browser Use network policy requires a positive integer tabId",
    );
}
function rulesMatch(actual: any, expected: any) {
  return (
    Object.keys(actual).length === 4 &&
    Object.keys(actual.action).length === 1 &&
    Object.keys(actual.condition).length === 4 &&
    actual.id === expected.id &&
    actual.priority === expected.priority &&
    actual.action.type === expected.action.type &&
    actual.condition.regexFilter === expected.condition.regexFilter &&
    actual.condition.isUrlFilterCaseSensitive === true &&
    JSON.stringify(actual.condition.tabIds) ===
      JSON.stringify(expected.condition.tabIds) &&
    JSON.stringify(actual.condition.resourceTypes?.slice().sort()) ===
      JSON.stringify(expected.condition.resourceTypes?.slice().sort())
  );
}
/** Original ar/op. Compiler/predicate default to restored implementations; active-page enforcement remains required. */
export function createNetworkPolicyManagerClass(host: {
  chrome: typeof chrome;
  now(): number;
  compile?(constraints: any[]): CompiledNetworkPolicy;
  predicate?(constraints: any[]): (url: string) => boolean;
  enforceActivePage(
    tabId: number,
    deadline: number,
    allowed: (url: string) => boolean,
  ): Promise<void>;
}) {
  let instance: NetworkPolicyManager | undefined;
  class NetworkPolicyManager {
    queue: Promise<unknown> = Promise.resolve();
    attaching = new Map<number, { cancelled: boolean; ruleIds: number[] }>();
    attachedPolicies = new Map<number, CompiledNetworkPolicy>();
    constructor() {
      host.chrome.tabs.onRemoved.addListener((tabId) => {
        this.detach(tabId).catch(() => {});
      });
    }
    static getInstance() {
      return (instance ??= new NetworkPolicyManager());
    }
    async attach(tabId: number, request: NetworkPolicyRequest) {
      requireTabId(tabId);
      if (
        request.timeoutMs !== undefined &&
        (!Number.isInteger(request.timeoutMs) ||
          request.timeoutMs < 1 ||
          request.timeoutMs > 30000)
      )
        throw new Error(
          "Browser Use network policy timeout must be 1..30000 milliseconds",
        );
      const policy = (host.compile ?? compileNetworkPolicy)(
        request.constraints,
      );
      if (this.attaching.has(tabId))
        throw new Error("Browser Use network policy is already attaching");
      const previous = this.attachedPolicies.get(tabId);
      if (previous !== undefined) {
        if (JSON.stringify(previous) === JSON.stringify(policy)) return;
        throw new Error(
          "Browser Use network policy is already attached; detach it first",
        );
      }
      if (policy.defaultAction === "allow" && policy.rules.length === 0) return;
      const allowed = (host.predicate ?? createNetworkPolicyPredicate)(
          request.constraints,
        ),
        attempt = { cancelled: false, ruleIds: [] as number[] };
      this.attaching.set(tabId, attempt);
      const checkCancelled = () => {
        if (attempt.cancelled)
          throw new Error(
            "Browser Use network policy attachment was cancelled",
          );
      };
      try {
        await host.enforceActivePage(
          tabId,
          await this.run(async () => {
            const dnr = host.chrome.declarativeNetRequest;
            if (!dnr?.getSessionRules || !dnr.updateSessionRules)
              throw new Error(
                "Chromium network policy enforcement is unavailable",
              );
            if (
              !(await host.chrome.permissions.contains({
                origins: ["<all_urls>"],
              }))
            )
              throw new Error(
                "Browser Use network policy requires access to all sites. In Chrome extension settings, set this extension's site access to On all sites. If your administrator controls this setting, ask them to grant access.",
              );
            await host.chrome.tabs.get(tabId);
            await this.removeClosedTabs();
            const current = await dnr.getSessionRules();
            if (
              current.some(
                (rule) => owned(rule) && rule.condition.tabIds?.includes(tabId),
              )
            )
              throw new Error(
                "Browser Use network policy is already attached; detach it first",
              );
            const resourceTypes = Object.values(dnr.ResourceType);
            if (
              ![
                "main_frame",
                "sub_frame",
                "stylesheet",
                "script",
                "image",
                "font",
                "object",
                "xmlhttprequest",
                "ping",
                "csp_report",
                "media",
                "websocket",
                "webtransport",
                "webbundle",
                "other",
              ].every((type) => resourceTypes.some((value) => value === type))
            )
              throw new Error(
                "Chromium does not expose all required network resource types",
              );
            const used = new Set([
              ...current.map((rule) => rule.id),
              ...[...this.attaching.values()].flatMap(({ ruleIds }) => ruleIds),
            ]);
            const rules: chrome.declarativeNetRequest.Rule[] = [];
            let next = firstRuleId;
            for (const [index, rule] of [
              { action: policy.defaultAction, regex: "^(?:https?|wss?)://" },
              ...policy.rules,
            ].entries()) {
              while (used.has(next) && next <= lastRuleId) next++;
              if (next > lastRuleId)
                throw new Error(
                  "Browser Use network policy rule IDs are exhausted",
                );
              rules.push({
                id: next++,
                priority: index === 0 ? 1 : rule.action === "allow" ? 2 : 3,
                action: {
                  type:
                    rule.action === "allow"
                      ? dnr.RuleActionType.ALLOW
                      : dnr.RuleActionType.BLOCK,
                },
                condition: {
                  tabIds: [tabId],
                  regexFilter: rule.regex,
                  isUrlFilterCaseSensitive: true,
                  resourceTypes,
                },
              });
            }
            attempt.ruleIds = rules.map(({ id }) => id);
            checkCancelled();
            await dnr.updateSessionRules({ addRules: rules });
            const deadline = host.now() + (request.timeoutMs ?? 5000),
              acknowledged = await dnr.getSessionRules();
            for (const rule of rules) {
              const actual = acknowledged.find(({ id }) => id === rule.id);
              if (!actual || !rulesMatch(actual, rule))
                throw new Error(
                  "Browser Use network policy installation was not acknowledged",
                );
            }
            checkCancelled();
            return deadline;
          }),
          allowed,
        );
        checkCancelled();
        this.attachedPolicies.set(tabId, policy);
      } catch (error) {
        try {
          if (attempt.ruleIds.length > 0)
            await this.run(() => this.removeRules(attempt.ruleIds));
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Browser Use network policy attachment failed and rollback could not be verified; detach must be retried",
            { cause: rollbackError },
          );
        }
        throw error;
      } finally {
        this.attaching.delete(tabId);
      }
    }
    async detach(tabId: number) {
      requireTabId(tabId);
      this.attachedPolicies.delete(tabId);
      const attempt = this.attaching.get(tabId);
      if (attempt) attempt.cancelled = true;
      await this.run(async () => {
        const rules = await host.chrome.declarativeNetRequest.getSessionRules();
        await this.removeRules(
          rules
            .filter(
              (rule) => owned(rule) && rule.condition.tabIds?.includes(tabId),
            )
            .map(({ id }) => id),
        );
      });
    }
    async detachAll() {
      this.attachedPolicies.clear();
      for (const attempt of this.attaching.values()) attempt.cancelled = true;
      await this.run(async () => {
        const rules = await host.chrome.declarativeNetRequest.getSessionRules();
        await this.removeRules(rules.filter(owned).map(({ id }) => id));
      });
    }
    async removeClosedTabs() {
      const tabs = new Set(
        (await host.chrome.tabs.query({})).map(({ id }) => id),
      );
      const rules = await host.chrome.declarativeNetRequest.getSessionRules();
      await this.removeRules(
        rules
          .filter(
            (rule) =>
              owned(rule) &&
              rule.condition.tabIds?.length === 1 &&
              !tabs.has(rule.condition.tabIds[0]),
          )
          .map(({ id }) => id),
      );
    }
    async removeRules(ids: number[]) {
      if (ids.length === 0) return;
      await host.chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: ids,
      });
      if (
        (await host.chrome.declarativeNetRequest.getSessionRules()).some(
          ({ id }) => ids.includes(id),
        )
      )
        throw new Error(
          "Browser Use network policy removal was not acknowledged",
        );
    }
    async run<T>(operation: () => Promise<T>) {
      const pending = this.queue.then(operation, operation);
      this.queue = pending.then(
        () => {},
        () => {},
      );
      return await pending;
    }
  }
  return NetworkPolicyManager;
}
