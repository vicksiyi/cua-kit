/** Original Nc. */
export function rawParamsObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
/** Original Xv/iF/sne. Preserve absent fields versus explicit non-string values. */
export function optionalRawUrl(
  method: string,
  params: Record<string, unknown> | undefined,
  key: string,
  label = key,
): string[] {
  if (params == null || !Object.hasOwn(params, key)) return [];
  const value = params[key];
  if (typeof value !== "string")
    throw new Error(`${method} ${label} must be a string when set.`);
  return [value];
}
export function requiredRawUrl(
  method: string,
  params: Record<string, unknown> | undefined,
  key: string,
  label = key,
) {
  const urls = optionalRawUrl(method, params, key, label);
  if (urls.length === 0)
    throw new Error(
      `${method} ${label} is required so Browser Use can authorize the affected origin.`,
    );
  return urls;
}
export function rawUrlArray(
  method: string,
  params: Record<string, unknown> | undefined,
  key: string,
) {
  if (params == null || !Object.hasOwn(params, key)) return [];
  const values = params[key];
  if (!Array.isArray(values))
    throw new Error(`${method} ${key} must be an array when set.`);
  const urls: string[] = [];
  for (const [index, value] of values.entries()) {
    if (typeof value !== "string")
      throw new Error(`${method} ${key}[${index}] must be a string.`);
    urls.push(value);
  }
  return urls;
}
/** Original nne/one/tF. */
export function rawRequestUrls(
  method: string,
  params?: Record<string, unknown>,
) {
  return optionalRawUrl(method, params, "url");
}
export function rawCookieReadUrls(
  method: string,
  params?: Record<string, unknown>,
) {
  const urls = rawUrlArray(method, params, "urls");
  if (urls.length === 0)
    throw new Error(
      `${method} urls must include at least one URL so Browser Use can authorize every affected origin.`,
    );
  return urls;
}
export function rawResponseUrls(
  method: string,
  params?: Record<string, unknown>,
) {
  const headers = params?.responseHeaders;
  if (headers == null) return [];
  if (!Array.isArray(headers))
    throw new Error(`${method} responseHeaders must be an array when set.`);
  const urls: string[] = [];
  for (const header of headers) {
    if (
      !rawParamsObject(header) ||
      typeof header.name !== "string" ||
      typeof header.value !== "string"
    )
      throw new Error(
        `${method} responseHeaders entries must include string name and value fields.`,
      );
    if (header.name.trim().toLowerCase() === "location")
      urls.push(header.value);
  }
  return urls;
}
/** Original Kv/ine: URL-based cookie authority, including partition top-level site. */
export function rawCookieUrls(
  method: string,
  params?: Record<string, unknown>,
  prefix = "",
) {
  if (params != null && Object.hasOwn(params, "domain"))
    throw new Error(
      `${method} ${prefix}domain is not supported; use ${prefix}url so Browser Use can authorize the affected origin.`,
    );
  for (const name of ["sourcePort", "sourceScheme"])
    if (params != null && Object.hasOwn(params, name))
      throw new Error(
        `${method} ${prefix}${name} is not supported; omit it so the browser derives it from ${prefix}url.`,
      );
  const urls = requiredRawUrl(method, params, "url", `${prefix}url`),
    partition = params?.partitionKey;
  if (partition == null) return urls;
  if (!rawParamsObject(partition))
    throw new Error(
      `${method} ${prefix}partitionKey must be an object when set.`,
    );
  urls.push(
    ...optionalRawUrl(
      method,
      partition,
      "topLevelSite",
      `${prefix}partitionKey.topLevelSite`,
    ),
  );
  return urls;
}
export function rawCookiesUrls(
  method: string,
  params?: Record<string, unknown>,
) {
  const cookies = params?.cookies;
  if (cookies == null) return [];
  if (!Array.isArray(cookies))
    throw new Error(`${method} cookies must be an array when set.`);
  const urls: string[] = [];
  for (const [index, cookie] of cookies.entries()) {
    if (!rawParamsObject(cookie))
      throw new Error(`${method} cookies[${index}] must be an object.`);
    urls.push(...rawCookieUrls(method, cookie, `cookies[${index}].`));
  }
  return urls;
}
/** Original ane/rne: parameter-sensitive capability exclusions. */
export function rawSystemTracing(params?: Record<string, unknown>) {
  const config = params?.traceConfig;
  return (
    params?.perfettoConfig != null ||
    params?.tracingBackend === "system" ||
    (typeof params?.options === "string" &&
      params.options
        .split(",")
        .some((option) => option.trim() === "enable-systrace")) ||
    (rawParamsObject(config) &&
      (config.enableSystrace === true || config.memoryDumpConfig != null))
  );
}
export function rawParametersBlocked(
  method: string,
  params?: Record<string, unknown>,
) {
  switch (method) {
    case "Fetch.continueResponse":
    case "Fetch.fulfillRequest":
      return params?.binaryResponseHeaders != null;
    case "Network.configureDurableMessages":
      return params?.maxTotalBufferSize != null;
    case "Network.enable":
      return params?.enableDurableMessages === true;
    case "Page.createIsolatedWorld":
      return params?.grantUniveralAccess === true;
    case "Page.reload":
      return params?.scriptToEvaluateOnLoad != null;
    case "Tracing.start":
      return rawSystemTracing(params);
    default:
      return false;
  }
}
