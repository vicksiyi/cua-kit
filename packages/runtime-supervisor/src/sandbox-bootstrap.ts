/** Trusted bootstrap: load the sandbox bridge, apply policy, then import worker code. */
import { createRequire } from "node:module";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
const profile = process.env.CORE_CUA_SANDBOX_PROFILE;
const addon = process.env.CORE_CUA_SANDBOX_ADDON;
const [entry, ...args] = process.argv.slice(2);
if (
  process.platform !== "darwin" ||
  !profile ||
  !addon ||
  !isAbsolute(addon) ||
  !entry ||
  !isAbsolute(entry)
)
  throw Error(
    "macOS worker bootstrap requires explicit profile, absolute addon and worker entry",
  );
const bridge = createRequire(import.meta.url)(addon) as {
  apply(profile: string): void;
};
delete process.env.CORE_CUA_SANDBOX_PROFILE;
delete process.env.CORE_CUA_SANDBOX_ADDON;
process.argv = [process.execPath, entry, ...args];
bridge.apply(profile); // Failure exits before loading worker code; there is no fallback.
await import(pathToFileURL(entry).href);
