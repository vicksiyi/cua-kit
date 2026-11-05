/** Demo host networking: inherit explicit proxy variables or the user's enabled macOS HTTP proxy. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const keys = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"];
export function parseMacSystemProxy(text: string): Record<string, string> {
  const fields = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^\s*(HTTPEnable|HTTPProxy|HTTPPort|HTTPSEnable|HTTPSProxy|HTTPSPort|ProxyAutoConfigEnable)\s*:\s*(.*?)\s*$/.exec(line);
    if (match) fields.set(match[1], match[2]);
  }
  // PAC requires URL-specific evaluation and cannot be approximated with one proxy.
  if (fields.get("ProxyAutoConfigEnable") === "1") return {};
  const result: Record<string, string> = {};
  for (const scheme of ["HTTP", "HTTPS"]) {
    if (fields.get(`${scheme}Enable`) !== "1") continue;
    const host = fields.get(`${scheme}Proxy`) ?? "", port = Number(fields.get(`${scheme}Port`));
    if (!/^[A-Za-z0-9.-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) continue;
    result[`${scheme}_PROXY`] = `http://${host}:${port}`;
  }
  return result;
}
export async function withHostProxy(environment: Record<string, string>, parent: NodeJS.ProcessEnv = process.env) {
  const result = { ...environment };
  for (const key of keys) if (result[key] === undefined && parent[key] !== undefined) result[key] = parent[key]!;
  const explicit = keys.filter(key => !/no_proxy/i.test(key)).some(key => result[key] !== undefined);
  if (!explicit && process.platform === "darwin") {
    const { stdout } = await exec("/usr/sbin/scutil", ["--proxy"], { timeout: 3000, maxBuffer: 65536 });
    Object.assign(result, parseMacSystemProxy(stdout));
  }
  return result;
}
