/** Readable TS of macOS discovery in bundled browser/26.1027.30824
 * scripts/open-chrome-window.js. This responsibility is evidenced in JS,
 * not inferred from the native-host package name. No browser is launched here.
 */
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';

export interface MacosBrowserDescription {
  displayName: string;
  macos: { applicationNames: readonly string[]; bundleId: string };
}
export interface MacosBrowserDiscoveryHost {
  exists(path: string): boolean;
  directories(path: string): string[];
  home: string;
  run(args: string[]): string | null;
}
const defaultHost: MacosBrowserDiscoveryHost = {
  exists: fs.existsSync,
  directories: path => fs.readdirSync(path, {withFileTypes:true})
    .filter(entry => entry.isDirectory()).map(entry => entry.name),
  home: homedir(),
  run(args) {
    try {
      return execFileSync(args[0], args.slice(1), {
        encoding:'utf8', stdio:['ignore','pipe','ignore'],
      }).trim();
    } catch { return null; }
  },
};
export const chromeMacosDescription: MacosBrowserDescription = {
  displayName:'Google Chrome',
  macos:{applicationNames:['Google Chrome.app'],bundleId:'com.google.Chrome'},
};

export function findMacosBrowserAppPath(
  browser: MacosBrowserDescription = chromeMacosDescription,
  host: MacosBrowserDiscoveryHost = defaultHost,
): string {
  const searchDirs = ['/Applications','/System/Applications',join(host.home,'Applications')];
  function readBundleInfo(appPath: string): Record<string, unknown> {
    const infoPath = join(appPath,'Contents','Info.plist');
    if (!host.exists(infoPath)) return {};
    const output = host.run(['plutil','-convert','json','-o','-',infoPath]);
    let info: Record<string, unknown> = {};
    if (output) {
      try { info = JSON.parse(output); } catch { /* Original falls back to key extraction. */ }
    }
    if (Object.keys(info).length > 0) return info;
    return {CFBundleIdentifier:host.run(['plutil','-extract','CFBundleIdentifier','raw','-o','-',infoPath])};
  }
  function matches(appPath: string, allowNamedFallback = false): boolean {
    if (!host.exists(appPath)) return false;
    if (readBundleInfo(appPath).CFBundleIdentifier === browser.macos.bundleId) return true;
    return allowNamedFallback && browser.macos.applicationNames.includes(basename(appPath));
  }
  for (const base of searchDirs) {
    for (const name of browser.macos.applicationNames) {
      const candidate = join(base,name);
      if (matches(candidate,true)) return candidate;
    }
  }
  const found = host.run(['mdfind',`kMDItemCFBundleIdentifier == '${browser.macos.bundleId}'`]);
  for (const candidate of found?.split(/\r?\n/).filter(line => line.endsWith('.app')) ?? []) {
    if (matches(candidate)) return candidate;
  }
  for (const base of searchDirs) {
    if (!host.exists(base)) continue;
    for (const name of host.directories(base)) {
      if (!name.endsWith('.app')) continue;
      const candidate = join(base,name);
      if (matches(candidate)) return candidate;
    }
  }
  throw Error(`Could not find the ${browser.displayName} app.`);
}
