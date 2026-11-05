/** Chrome native messaging entry. stdout is reserved exclusively for framed RPC. */
import { startNativeHost } from "./server";
import { loadHostConfig, validateExtensionOrigin } from "./installation";
import { dirname, join } from "node:path";
import { createLifecycleLog } from "./lifecycle_log";
async function main() {
  const [flag, configPath, origin, ...extra] = process.argv.slice(2);
  if (flag !== "--config" || !configPath || extra.length)
    throw Error("Expected --config <file> <chrome-extension origin>");
  const config = await loadHostConfig(configPath);
  validateExtensionOrigin(config, origin);
  const log = createLifecycleLog(join(dirname(configPath), "lifecycle.jsonl"));
  log.record("starting");
  process.once("exit", () => log.close());
  let host;
  try {
    host = await startNativeHost(process.stdin, process.stdout, {
      parentDirectory: config.endpointParentDirectory,
      onLifecycle: event => log.record(event),
    });
  } catch (error) {
    log.record("startup-error");
    throw error;
  }
  console.error(`@core native host endpoint: ${host.endpointFile}`);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void host.close(`signal-${signal}`).then(() => process.exit(0));
    });
}
await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
