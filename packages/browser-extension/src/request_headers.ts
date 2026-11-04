export {
  validateRequestHeaders as parseRequestHeaders,
  resolveRequestHeaders,
} from "@core/core/requestHeaders";
const enabledStorageKey = "AGENT_REQUEST_HEADER_ENABLED";
/** Original uS: persisted opt-in is monotonic, including the in-memory fast path. */
export function createRequestHeaderPolicyClass(
  chromeApi: Pick<typeof chrome, "storage">,
) {
  return class RequestHeaderPolicy {
    enabled = false;
    async isEnabled(): Promise<boolean> {
      if (this.enabled) return true;
      const values = await chromeApi.storage.local.get(enabledStorageKey);
      this.enabled ||= values[enabledStorageKey] === true;
      return this.enabled;
    }
    async applyDecision(enable: boolean): Promise<boolean> {
      if ((await this.isEnabled()) || !enable) return this.enabled;
      await chromeApi.storage.local.set({ [enabledStorageKey]: true });
      this.enabled = true;
      return true;
    }
  };
}
