import type * as T from "../../types/window/ListApps";
import {
  setComputerUseResponseMeta,
  withComputerUseToolTelemetry,
} from "./computer-use-policy";
import { getClient } from "./lazy-client";
export async function list_apps(): T.Return {
  setComputerUseResponseMeta(null);
  return (
    await withComputerUseToolTelemetry("list_apps", undefined, async () =>
      (await getClient()).listApps(),
    )
  ).map((app) => ({
    id: app.bundleIdentifier ?? app.displayName ?? "unknown",
    displayName: app.displayName,
    isRunning: app.isRunning,
    lastUsedDate: app.lastUsedDate ?? undefined,
    useCount: app.useCount ?? undefined,
  }));
}
