import { ExtensionStatsigDiagnostics as Diagnostics } from "./statsig_diagnostics";
/** NetworkCore delta derived from bundled Bc and public Statsig 3.33.4 (ISC).
 * Reuses upstream construction, encoding, compression, rate limits and fallback support.
 * Only request dispatch/URL tracking and their unexported diagnostic helpers are restored here.
 */
import {
  NetworkCore,
  RETRYABLE_CODES,
} from "@statsig/client-core/src/NetworkCore";
import {
  Log,
  Endpoint,
  NetworkParam,
  SDKType,
  SDK_VERSION,
  SessionID,
} from "@statsig/client-core";
import { ErrorTag } from "@statsig/client-core/src/StatsigClientEventEmitter";
import { _getWindowSafe } from "@statsig/client-core/src/SafeJs";
import { _isUnloading } from "@statsig/client-core/src/VisibilityObserving";
// The pinned upstream JS exposes these internals at runtime despite private declarations.
const NetworkBase = NetworkCore as unknown as new (
  ...args: ConstructorParameters<typeof NetworkCore>
) => Pick<NetworkCore, keyof NetworkCore> & Record<string, any>;
export class ExtensionStatsigNetworkCore extends NetworkBase {
  async _sendRequest(args: any, failureInfo?: any): Promise<any> {
    if (!_ensureValidSdkKey(args)) {
      if (failureInfo) {
        failureInfo.path = "network_invalid_sdk_key";
      }
      return null;
    }
    if (this._netConfig.preventAllNetworkTraffic) {
      if (failureInfo) {
        failureInfo.path = "network_prevent_all_network_traffic";
      }
      return null;
    }
    const { method, body, retries, attempt } = args;
    const endpoint = args.urlConfig.endpoint;
    if (this._isRateLimited(endpoint)) {
      Log.warn(
        `Request to ${endpoint} was blocked because you are making requests too frequently.`,
      );
      if (failureInfo) {
        failureInfo.path = "network_rate_limited";
      }
      return null;
    }
    const currentAttempt = attempt ?? 1;
    let reqTimedOut = false;
    const populatedUrl = this._getPopulatedURL(args);
    const startTime = Date.now();
    let response: Response | null = null;
    const keepalive = _isUnloading();
    try {
      const config: RequestInit = {
        method,
        body,
        headers: Object.assign({}, args.headers),
        priority: args.priority,
        keepalive,
      };
      _tryMarkInitStart(args, currentAttempt);
      const bucket = this._leakyBucket[endpoint];
      if (bucket) {
        bucket.lastRequestTime = Date.now();
        this._leakyBucket[endpoint] = bucket;
      }
      const func: typeof fetch = this._netConfig.networkOverrideFunc ?? fetch;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      response = await Promise.race([
        func(populatedUrl, config).finally(() => clearTimeout(timeoutId)),
        new Promise<Response>((_, reject) => {
          timeoutId = setTimeout(() => {
            reqTimedOut = true;
            reject(new Error(`Timeout of ${this._timeout}ms expired.`));
          }, this._timeout);
        }),
      ]);
      if (!response.ok) {
        const text = await response.text().catch(() => "No Text");
        const err = new Error(`NetworkError: ${populatedUrl} ${text}`);
        err.name = "NetworkError";
        throw err;
      }
      const text = await response.text();
      _tryMarkInitEnd(args, response, currentAttempt, text);
      this._fallbackResolver.tryBumpExpiryTime(args.sdkKey, args.urlConfig);
      return {
        body: text,
        code: response.status,
        headers: response.headers,
      };
    } catch (error) {
      const errorMessage = _getErrorMessage(error);
      const timedOut = _didTimeout(errorMessage ?? "", reqTimedOut);
      _tryMarkInitEnd(args, response, currentAttempt, "", error);
      const fallbackUpdated =
        args.skipInitTracking !== true &&
        (await this._fallbackResolver.tryFetchUpdatedFallbackInfo(
          args.sdkKey,
          args.urlConfig,
          errorMessage,
          timedOut,
        ));
      if (fallbackUpdated) {
        args.fallbackUrl = this._fallbackResolver.getActiveFallbackUrl(
          args.sdkKey,
          args.urlConfig,
        );
      }
      if (
        !retries ||
        currentAttempt > retries ||
        !RETRYABLE_CODES.has(response?.status ?? 500)
      ) {
        const formattedErrorMsg = `A networking error occurred during ${method} request to ${populatedUrl}.`;
        Log.error(formattedErrorMsg, errorMessage, error);
        if (args.skipInitTracking !== true) {
          this._emitter?.({
            name: "error",
            error,
            tag: ErrorTag.NetworkError,
            requestArgs: args,
          });
          this._errorBoundary?.attachErrorIfNoneExists(formattedErrorMsg);
        }
        if (args.preserveFailedStatusCode && response != null) {
          return {
            body: null,
            code: response.status,
          };
        }
        if (response == null) {
          if (failureInfo) {
            failureInfo.path = timedOut
              ? "network_request_timed_out_no_response"
              : "network_request_exception_no_response";
            if (errorMessage) {
              failureInfo.errorMessage = errorMessage;
            }
            try {
              const diagnostics = _getNoResponseDiagnostics(
                args,
                populatedUrl,
                timedOut,
                Date.now() - startTime,
              );
              failureInfo.diagnosticBucket = diagnostics.bucket;
              failureInfo.diagnosticMetadata = diagnostics.metadata;
            } catch (_e) {
              // Diagnostics should not affect request failure handling.
            }
          }
        }
        return null;
      }
      await _exponentialBackoff(currentAttempt);
      return this._sendRequest(
        Object.assign(Object.assign({}, args), {
          retries,
          attempt: currentAttempt + 1,
        }),
        failureInfo,
      );
    }
  }
  _getPopulatedURL(args: any) {
    const url = args.fallbackUrl ?? args.urlConfig.getUrl();
    if (
      args.skipInitTracking !== true &&
      (args.urlConfig.endpoint === Endpoint._initialize ||
        args.urlConfig.endpoint === Endpoint._download_config_specs)
    ) {
      this._lastUsedInitUrl = url;
    }
    const params: Record<string, string> = Object.assign(
      {
        [NetworkParam.SdkKey]: args.sdkKey,
        [NetworkParam.SdkType]: SDKType._get(args.sdkKey),
        [NetworkParam.SdkVersion]: SDK_VERSION,
        [NetworkParam.Time]: String(Date.now()),
        [NetworkParam.SessionID]: SessionID.get(args.sdkKey),
      },
      args.params,
    );
    const query = Object.keys(params)
      .map((key) => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
      })
      .join("&");
    return `${url}${query ? `?${query}` : ""}`;
  }
}
function _getErrorMessage(error: any) {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return "Unknown Error";
}
function _didTimeout(errorMsg: any, abortedByTimeout: any) {
  const timeout = errorMsg.includes("Timeout"); // probably not needed but just in case
  return timeout || abortedByTimeout;
}
function _getNoResponseDiagnostics(
  args: any,
  populatedUrl: any,
  timedOut: any,
  elapsedMs: any,
) {
  const win = _getWindowSafe();
  const doc = win?.document;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const isUnloading = _isUnloading();
  const online =
    nav && typeof nav.onLine === "boolean" ? String(nav.onLine) : "unknown";
  const visibilityState = doc?.visibilityState ?? "unknown";
  const hasCustomHeaders = Object.keys(args.headers ?? {}).length > 0;
  const crossOrigin = _isCrossOrigin(populatedUrl, win?.location?.origin);
  const hasCustomUrl = args.urlConfig.customUrl != null;
  const hasFallbackUrl = args.fallbackUrl != null;
  const elapsedMsBucket = _bucketNumber(elapsedMs, [250, 1000, 5000, 10000]);
  const bodySizeBucket = _bucketNumber(
    _getBodySize(args.body),
    [16384, 65536, 262144, 1048576],
  );
  let bucket = "unknown_no_response";
  if (timedOut) {
    bucket = "timeout";
  } else if (online === "false") {
    bucket = "browser_offline";
  } else if (isUnloading) {
    bucket = "page_unloading";
  } else if (visibilityState === "hidden") {
    bucket = "page_hidden";
  } else if (crossOrigin && hasCustomHeaders) {
    bucket = "cross_origin_custom_headers_preflight_risk";
  } else if (hasCustomUrl || hasFallbackUrl) {
    bucket = "custom_url_no_response";
  } else if (elapsedMs < 250) {
    bucket = "immediate_network_rejection";
  }
  return {
    bucket,
    metadata: {
      elapsedMsBucket,
      bodySizeBucket,
      online,
      visibilityState,
      isUnloading: String(isUnloading),
      crossOrigin: String(crossOrigin),
      hasCustomUrl: String(hasCustomUrl),
    },
  };
}
function _isCrossOrigin(url: any, currentOrigin: any) {
  if (!currentOrigin) {
    return true;
  }
  return (
    !url.startsWith(`${currentOrigin}/`) &&
    !url.startsWith(`${currentOrigin}?`) &&
    url !== currentOrigin
  );
}
function _getBodySize(body: any) {
  if (body == null) {
    return 0;
  }
  if (typeof body === "string") {
    return body.length;
  }
  if (body instanceof Uint8Array) {
    return body.byteLength;
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return body.size;
  }
  return -1;
}
function _bucketNumber(value: any, thresholds: any) {
  if (value < 0) {
    return "unknown";
  }
  for (const threshold of thresholds) {
    if (value < threshold) {
      return `<${threshold}`;
    }
  }
  return `>=${thresholds[thresholds.length - 1]}`;
}
function _tryMarkInitStart(args: any, attempt: any) {
  if (
    args.skipInitTracking === true ||
    args.urlConfig.endpoint !== Endpoint._initialize
  ) {
    return;
  }
  Diagnostics._markInitNetworkReqStart(args.sdkKey, {
    attempt,
  });
}
function _tryMarkInitEnd(
  args: any,
  response: any,
  attempt: any,
  body: any,
  err?: any,
) {
  if (
    args.skipInitTracking === true ||
    args.urlConfig.endpoint !== Endpoint._initialize
  ) {
    return;
  }
  Diagnostics._markInitNetworkReqEnd(
    args.sdkKey,
    Diagnostics._getDiagnosticsData(response, attempt, body, err),
  );
}
async function _exponentialBackoff(attempt: number) {
  await new Promise((resolve) =>
    setTimeout(resolve, Math.min(500 * attempt * attempt, 30000)),
  );
}

function _ensureValidSdkKey(args: { sdkKey?: string }) {
  if (args.sdkKey) return true;
  Log.warn("Unable to make request without an SDK key");
  return false;
}
