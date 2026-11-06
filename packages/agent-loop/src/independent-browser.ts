/** Demo deployment selection, independent of the model/provider and AgentLoop. */
import {
  createBrowserServiceConnector,
  parseEndpointFiles,
  discoverLiveEndpointFiles,
  IndependentBrowserUnavailableError,
} from "@core/native-host/browserConnector";
import { discoverOrStartChrome } from "./browser-startup";

export async function configureIndependentBrowser(env: Record<string, string>) {
  if (
    env.CORE_CUA_ENDPOINT_FILES === undefined &&
    env.CORE_CUA_HOST_DIRECTORY === undefined
  )
    return env;
  if (
    !env.CUA_REPL_ENABLED_SURFACES?.split(",")
      .map((value) => value.trim())
      .includes("browser")
  )
    throw Error("CORE_CUA_ENDPOINT_FILES requires the browser surface");
  const combined = env.CUA_REPL_ENABLED_SURFACES?.split(",").some(value => value.trim() === "computer");
  let endpointFiles: string[];
  try {
    endpointFiles =
      env.CORE_CUA_ENDPOINT_FILES === undefined
        ? await (process.env.CUA_DEMO_START_CHROME === "1"
            ? discoverOrStartChrome(env.CORE_CUA_HOST_DIRECTORY!)
            : discoverLiveEndpointFiles(env.CORE_CUA_HOST_DIRECTORY!))
        : parseEndpointFiles(env.CORE_CUA_ENDPOINT_FILES, { allowEmpty: true });
  } catch (error) {
    // CUA permits independent browser/app inventories. Never suppress invalid
    // permissions, malformed descriptors, authentication failures or launch errors.
    if (!combined || !(error instanceof IndependentBrowserUnavailableError)) throw error;
    endpointFiles = [];
  }
  const connector = await createBrowserServiceConnector(endpointFiles);
  const services: unknown = JSON.parse(env.NODE_REPL_TRUSTED_SERVICES ?? "{}");
  if (
    !services ||
    typeof services !== "object" ||
    Array.isArray(services) ||
    !Object.values(services).every((value) => typeof value === "string")
  )
    throw Error("NODE_REPL_TRUSTED_SERVICES must be a string map");
  const configured = services as Record<string, string>;
  if (
    configured.browser &&
    ![
      "@core/browser-desktop/service",
      "@core/native-host/browserService",
    ].includes(configured.browser)
  )
    throw Error(
      "Independent browser conflicts with a custom trusted browser service",
    );
  return {
    ...env,
    CORE_CUA_ENDPOINT_FILES: JSON.stringify(endpointFiles),
    ...connector.environment,
    NODE_REPL_TRUSTED_SERVICES: JSON.stringify({
      ...configured,
      browser: "@core/native-host/browserService",
    }),
  };
}
