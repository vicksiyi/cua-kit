/** Chrome native messaging entry. stdout is reserved exclusively for framed RPC. */
import { startNativeHost } from "./server";
const host = await startNativeHost(process.stdin, process.stdout);
console.error(`@core native host endpoint: ${host.endpointFile}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void host.close().then(() => process.exit(0));
  });
