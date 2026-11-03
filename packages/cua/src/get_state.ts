import { get_apps } from "./get_apps";
import { get_browsers } from "./get_browsers";
import type { Computer } from "./types";
import type { Browsers } from "./tinysky_alt/types";
export async function get_state(options: {
  browsers?: Browsers;
  computer?: Computer;
}) {
  let apps: ReturnType<typeof get_apps> = Promise.resolve([]);
  if (options.computer) apps = get_apps(options.computer);
  let browsers: ReturnType<typeof get_browsers> = Promise.resolve({
    browsers: [],
    errors: [],
  });
  if (options.browsers !== undefined) browsers = get_browsers(options.browsers);
  const [appResult, browserResult] = await Promise.allSettled([apps, browsers]);
  const errors: string[] = [];
  for (const [name, result] of Object.entries({
    "Native apps": appResult,
    Browsers: browserResult,
  }))
    if (result.status === "rejected")
      errors.push(`${name}: ${String(result.reason)}`);
  const appList = appResult.status === "fulfilled" ? appResult.value : [];
  const browserList =
    browserResult.status === "fulfilled" ? browserResult.value.browsers : [];
  if (browserResult.status === "fulfilled")
    errors.push(...browserResult.value.errors);
  return {
    apps: appList,
    browsers: browserList,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
