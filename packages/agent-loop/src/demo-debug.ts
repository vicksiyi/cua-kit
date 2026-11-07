/** One local trace shared by runtime bootstrap and the model/tool demo. */
import { fileURLToPath } from "node:url";
import { createDebugLog } from "./debug-log";

let initialized = false;
let debug: ReturnType<typeof createDebugLog> | undefined;
export function getDemoDebugLog() {
  if (initialized) return debug;
  initialized = true;
  if (process.env.CUA_DEBUG === "0") return;
  debug = createDebugLog(
    fileURLToPath(new URL("../../../artifacts/debug/", import.meta.url)),
    Object.entries(process.env)
      .filter(([key]) => /(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(key))
      .map(([, value]) => value ?? "")
      .filter((value) => value.length >= 8),
  );
  console.error(`Local debug log: ${debug.file}`);
  return debug;
}
