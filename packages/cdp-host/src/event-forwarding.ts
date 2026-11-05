import { filterCdpEvent } from "@core/browser-extension/cdpSecurity";
import type { CdpEvent } from "./connection";

/** Leave room for the RPC envelope inside the native host's 1 MiB frame. */
const CONSOLE_EVENT_BUDGET = 256 * 1024;
export function prepareCdpEvent(event: CdpEvent): CdpEvent | null {
  const filtered = filterCdpEvent({ ...event });
  if (!filtered || filtered.method !== "Runtime.consoleAPICalled")
    return filtered;
  const bytes = Buffer.byteLength(JSON.stringify(filtered));
  if (bytes <= CONSOLE_EVENT_BUDGET) return filtered;
  // Console output is diagnostic, not a lifecycle or network-policy event.
  // Explicitly report omission instead of allowing arbitrary page logging to
  // tear down all CDP sessions. Do not enlarge the shared transport limit.
  return {
    method: filtered.method,
    sessionId: filtered.sessionId,
    params: {
      type: "warning",
      executionContextId: filtered.params.executionContextId,
      timestamp: filtered.params.timestamp,
      args: [
        {
          type: "string",
          value: `[Core CDP: oversized console event omitted (${bytes} UTF-8 bytes; limit ${CONSOLE_EVENT_BUDGET}).]`,
        },
      ],
    },
  };
}
