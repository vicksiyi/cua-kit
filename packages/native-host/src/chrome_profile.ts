/** Profile/status rules reconstructed from bundled browser/26.1027.30824
 * scripts/check-extension-installed.js and open-chrome-window.js.
 * Independent composition supplies the Core extension ID and macOS app name.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

function readJson(file: string): any {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}
const rank = (name: string) => name === 'Default' ? 0 : Number(name.match(/^Profile (\d+)$/)?.[1] ?? -1);
const compare = (a: string, b: string) => rank(a) - rank(b);
const usable = (root: string, name: unknown): name is string =>
  typeof name === 'string' && name.length > 0 && existsSync(join(root, name, 'Preferences'));

export interface ChromeProfileStatus {
  profileDirectory: string;
  installed: boolean;
  registered: boolean;
  enabled: boolean;
  disabled: boolean;
  state: number | null;
  disableReasons: unknown[];
  selected: boolean;
}
export function inspectChromeExtension(options: {
  userDataDirectory: string;
  extensionId: string;
  preferencesPath?: string;
}) {
  const override = options.preferencesPath ? resolve(options.preferencesPath) : undefined;
  const root = override ? dirname(dirname(override)) : options.userDataDirectory;
  const profiles = override ? [basename(dirname(override))] : readdirSync(root, {withFileTypes:true})
    .filter(entry => entry.isDirectory() && /^(Default|Profile \d+)$/.test(entry.name) && usable(root, entry.name))
    .map(entry => entry.name).sort(compare);
  if (!profiles.length) throw Error('No usable Chrome profile with Preferences was found');
  const local = override ? null : readJson(join(root, 'Local State'))?.profile;
  const active = Array.isArray(local?.last_active_profiles)
    ? local.last_active_profiles.filter((name: unknown) => usable(root, name)).sort(compare).at(-1) : undefined;
  const selected = override ? profiles[0] : usable(root, local?.last_used) ? local.last_used : active ?? profiles.at(-1)!;
  const statuses: ChromeProfileStatus[] = profiles.map(profileDirectory => {
    const profilePath = join(root, profileDirectory);
    let settings: any;
    for (const file of ['Secure Preferences','Preferences']) {
      const entry = readJson(join(profilePath, file))?.extensions?.settings?.[options.extensionId];
      if (entry && typeof entry === 'object') { settings = entry; break; }
    }
    const state = typeof settings?.state === 'number' ? settings.state : null;
    const reasons = settings?.disable_reasons;
    const disableReasons = Array.isArray(reasons) ? reasons : typeof reasons === 'number' && reasons !== 0 ? [reasons] : [];
    const extensionPath = join(profilePath, 'Extensions', options.extensionId);
    const versions = existsSync(extensionPath) && statSync(extensionPath).isDirectory()
      ? readdirSync(extensionPath, {withFileTypes:true}).filter(entry => entry.isDirectory()) : [];
    const unpacked = typeof settings?.path === 'string' && existsSync(settings.path) && statSync(settings.path).isDirectory();
    const installed = versions.length > 0 || unpacked;
    const registered = !!settings;
    const disabled = state === 0 || disableReasons.length > 0;
    return {profileDirectory, installed, registered, disabled, state, disableReasons,
      enabled: installed && registered && !disabled, selected: profileDirectory === selected};
  });
  const chosen = statuses.find(profile => profile.selected) ?? statuses[0];
  return {userDataDirectory:root, selectedProfileDirectory:selected, installed:chosen.installed,
    enabled:chosen.enabled, profiles:statuses, exitCode:chosen.enabled ? 0 : chosen.installed ? 1 : 2};
}

export function chromeProfileLaunchCommand(profileDirectory: string) {
  // Profile comes from local inspection, not model-generated command text.
  return {command:'/usr/bin/open', args:['-n','-a','Google Chrome','--args',
    `--profile-directory=${profileDirectory}`, '--new-window', 'about:blank']};
}
