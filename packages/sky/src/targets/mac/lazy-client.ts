import type { MacComputerUseClient } from "./client";
let pending: Promise<MacComputerUseClient> | null = null;
export function getClient() {
  return (pending ??= import("./client").then(({ client }) => client));
}
