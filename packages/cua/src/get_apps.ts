import { UnreachableCaseError } from "@core/core/UnreachableCaseError";
import type { Computer } from "./types";
export async function get_apps(computer: Computer) {
  const target = computer.target;
  switch (target) {
    case "windows":
    case "mac":
      return computer.list_apps();
    case "linux":
      return (await computer.list_apps()).map(
        (app: { id: string; name: string; windows: unknown[] }) => {
          const id = app.id,
            displayName = app.name,
            windows = app.windows;
          return { id, displayName, isRunning: windows.length > 0, windows };
        },
      );
    default:
      throw new UnreachableCaseError(target as never);
  }
}
