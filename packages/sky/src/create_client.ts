import { UnreachableCaseError } from "@core/core/UnreachableCaseError";
import { create_client as createLinuxClient } from "./targets/linux/create_client";
import { create_client as createMacClient } from "./targets/mac/create_client";
import { create_client as createWindowsClient } from "./targets/windows/create_client";
import type * as T from "./types/index";
export function create_client(options: T.Window.Options): T.Window.Client;
export function create_client(options: T.Window2.Options): T.Window2.Client;
export function create_client(
  options: T.FullDesktop.Options,
): T.FullDesktop.Client;
export function create_client(options: T.Options): T.SkyClient;
export function create_client(options: T.Options): T.SkyClient {
  if ("api" in options && options.api === "desktop")
    throw new Error("The configured desktop API requires create_client({ api: 'desktop' })");
  const target = options.target;
  switch (target) {
    case "linux":
      return createLinuxClient(options);
    case "mac":
      return createMacClient();
    // The installed dispatcher calls the Windows factory without passing options.
    case "windows":
      return createWindowsClient(undefined as unknown as T.Window2.Options);
    default:
      throw new UnreachableCaseError(target);
  }
}
