import { errorReporterUserId } from "./telemetry_identity";
export { errorReporterUserId } from "./telemetry_identity";
import * as sentry from "@sentry/node-core/light";
import { createTransport } from "@sentry/core";

export interface ErrorReporterRuntime {
  env: Record<string, unknown>;
  gaas?: { browserConfig: { user_id?: string } };
  fetch(
    url: string,
    options: Omit<RequestInit, "body"> & { body: string | Uint8Array },
  ): Promise<Pick<Response, "status" | "headers">>;
}
export interface ErrorReporterSdk {
  init: typeof sentry.init;
  captureException: typeof sentry.captureException;
  setUser: typeof sentry.setUser;
  setTag: typeof sentry.setTag;
  createTransport: typeof createTransport;
}
/** Original cH/dH. The vendor SDK stays upstream; only CUA's host adapter is restored.
 * The original destination is retained for source fidelity. A standalone deployment
 * must choose its telemetry policy/host fetch before enabling ambient networking.
 */
export function createErrorReporterFactory(
  sdk: ErrorReporterSdk = { ...sentry, createTransport },
) {
  let initialized = false;
  return function createErrorReporter(runtime: ErrorReporterRuntime) {
    if (
      !initialized &&
      runtime.env.BROWSER_USE_DISABLE_AMBIENT_NETWORK !== "1"
    ) {
      sdk.init({
        dsn: "https://946e373d0393408ec734c0156b0aeec6@o33249.ingest.us.sentry.io/4511236780326912",
        sendDefaultPii: false,
        environment: "production",
        release: "0.1.1",
        transport: (options) =>
          sdk.createTransport(options, (request) =>
            runtime
              .fetch(options.url, {
                body: request.body,
                method: "POST",
                referrerPolicy: "origin",
                headers: options.headers,
                keepalive: options.keepAlive,
              })
              .then((response) => ({
                statusCode: response.status,
                headers: {
                  "x-sentry-rate-limits": response.headers.get(
                    "X-Sentry-Rate-Limits",
                  ),
                  "retry-after": response.headers.get("Retry-After"),
                },
              })),
          ),
      });
      const userId = errorReporterUserId(runtime);
      if (userId != null) sdk.setUser({ id: userId });
      initialized = true;
    }
    return {
      captureException(
        exception: Parameters<typeof sentry.captureException>[0],
        hint?: Parameters<typeof sentry.captureException>[1],
      ) {
        sdk.captureException(exception, hint);
      },
      setUser(user: Parameters<typeof sentry.setUser>[0]) {
        sdk.setUser(user);
      },
      setTag(...args: Parameters<typeof sentry.setTag>) {
        sdk.setTag(...args);
      },
    };
  };
}
/** One initialization flag for the service module lifetime, as in the source. */
export const browserErrorReporter = createErrorReporterFactory();
