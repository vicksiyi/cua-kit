import {
  createCredentialRequestMatcher,
  createUnsafeOrdinaryRequest,
} from "./request_matching";
export interface CredentialLease {
  start(): Promise<void>;
  close(): Promise<void>;
  navigateToBrowserBlank(): Promise<unknown>;
}
export interface CredentialLeaseInput<Cdp> {
  cdp: Cdp;
  requests: object;
  tabId: number;
  frameId: string;
  target: { origin: string; url: string };
  credentialFields: { name: string; value?: string }[];
  ordinary?: { origin: string; password?: string };
}
/** Original Tf/VD/$D/GD. The original Z_ constructor is required; no substitute lease is installed. */
export function createCredentialLeaseRegistry<
  Cdp,
  Lease extends CredentialLease,
>(
  LeaseClass: new (
    cdp: Cdp,
    requests: object,
    tabId: number,
    frameId: string,
    target: { origin: string; url: string },
    matches:
      Awaited<ReturnType<typeof createCredentialRequestMatcher>> | undefined,
    unsafe: Awaited<ReturnType<typeof createUnsafeOrdinaryRequest>> | undefined,
    active: Map<number, Lease>,
  ) => Lease,
) {
  const owners = new WeakMap<object, Map<number, Lease>>();
  return {
    async close(requests: object, tabId: number) {
      await owners.get(requests)?.get(tabId)?.close();
    },
    async resetBeforeNavigation(requests: object, tabId: number) {
      const lease = owners.get(requests)?.get(tabId);
      if (lease != null) {
        await lease.navigateToBrowserBlank();
        await lease.close();
      }
    },
    async start(input: CredentialLeaseInput<Cdp>) {
      const { cdp, requests, tabId, frameId } = input;
      const active = owners.get(requests) ?? new Map<number, Lease>();
      owners.set(requests, active);
      const previous = active.get(tabId);
      const matches =
        input.ordinary == null
          ? await createCredentialRequestMatcher(input.credentialFields)
          : undefined;
      const unsafe =
        input.ordinary == null
          ? undefined
          : await createUnsafeOrdinaryRequest(input.ordinary.password);
      const lease = new LeaseClass(
        cdp,
        requests,
        tabId,
        frameId,
        input.ordinary == null
          ? input.target
          : { origin: input.ordinary.origin, url: "" },
        matches,
        unsafe,
        active,
      );
      active.set(tabId, lease);
      try {
        await lease.start();
        await previous?.close();
        return lease;
      } catch (error) {
        try {
          await lease.close();
          if (!active.has(tabId) && previous != null)
            active.set(tabId, previous);
        } catch {}
        throw error;
      }
    },
  };
}
