/** Demo deployment only. AgentLoop and CUA/MCP remain independent of the host. */
import { startCdpHost } from "@core/cdp-host";
const configured: unknown = JSON.parse(process.env.CUA_MCP_ENV ?? "{}");
if (
  !configured ||
  typeof configured !== "object" ||
  Array.isArray(configured) ||
  !Object.values(configured).every((value) => typeof value === "string")
)
  throw Error("CUA_MCP_ENV must be a string map");
const env = configured as Record<string, string>;
if (!env.CUA_REPL_ENABLED_SURFACES?.split(",").includes("browser"))
  throw Error("CDP demo requires the browser surface");
const endpoint = process.env.CUA_CDP_ENDPOINT;
const host = await startCdpHost({ endpoint });
try {
  process.env.CUA_DEMO_MANAGED_BROWSER = endpoint ? "0" : "1";
  process.env.CUA_DEMO_ATTACHED_BROWSER = endpoint ? "1" : "0";
  process.env.CORE_CUA_ENDPOINT_FILES = JSON.stringify([host.endpointFile]);
  delete process.env.CORE_CUA_HOST_DIRECTORY;
  env.CORE_CUA_ENDPOINT_FILES = process.env.CORE_CUA_ENDPOINT_FILES;
  delete env.CORE_CUA_HOST_DIRECTORY;
  env.BROWSER_USE_AVAILABLE_BACKENDS = "cdp";
  process.env.CUA_MCP_ENV = JSON.stringify(env);
  console.error(
    endpoint
      ? "CDP attached to the explicitly configured existing browser. Exit disconnects this client without closing that browser."
      : "Extension-free CDP connected to a visible temporary Chromium. This is not your daily Chrome profile; it closes on exit.",
  );
  const stop = () => {
    void host.close().finally(() => {
      process.exitCode = 130;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await import("./restored-demo");
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
} finally {
  await host.close();
}
