import { init, type BrowserOptions } from "@sentry/browser";

export type ExtensionBuildChannel = "dev" | "internal" | "prod";

/** Installed oc: build-channel normalization is shared by page telemetry. */
export function normalizeExtensionBuildChannel(
  value: unknown,
): ExtensionBuildChannel {
  if (typeof value !== "string") return "prod";
  switch (value) {
    case "dev":
    case "internal":
    case "prod":
      return value;
    default:
      throw new Error(
        `Unsupported extension build channel "${value}". Use "dev", "internal", or "prod".`,
      );
  }
}

export interface PageTelemetryHost {
  runtime: {
    getManifest?: () => { version: string };
    getURL(path: string): string;
  };
  fetch(url: string): Promise<{ json(): Promise<{ version: string }> }>;
}

export interface PageTelemetryConfiguration {
  /** Deployment-owned destination. Never default to the original vendor's DSN. */
  dsn: string;
  channel?: ExtensionBuildChannel;
}

/** Installed ic, using the original third-party SDK version instead of copying
 * its bundled implementation. The destination is deployment configuration;
 * initialization order, release/tags and swallowed errors follow the source. */
export function createPageTelemetryInitializer(
  host: PageTelemetryHost,
  configuration: PageTelemetryConfiguration,
  initialize: (options: BrowserOptions) => unknown = init,
): (context: string) => Promise<void> {
  return async (context) => {
    try {
      const manifest =
        typeof host.runtime.getManifest === "function"
          ? host.runtime.getManifest()
          : await (
              await host.fetch(host.runtime.getURL("manifest.json"))
            ).json();
      initialize({
        dsn: configuration.dsn,
        skipBrowserExtensionCheck: true,
        release: `chrome-extension@${manifest.version}`,
        environment: normalizeExtensionBuildChannel(
          configuration.channel ?? "prod",
        ),
        initialScope: {
          tags: {
            component: "chrome-extension",
            context,
            build_flavor: "release",
          },
        },
      });
    } catch {
      // Page startup must survive an unavailable manifest or telemetry SDK.
    }
  };
}
