import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
let cargo = process.env.CUA_CARGO || 'cargo';
if (!process.env.CUA_CARGO) {
  const candidate = join(homedir(), '.cargo/bin/cargo');
  try { await access(candidate); cargo = candidate; } catch {}
}
const manifest = join(root, 'native/browser-extension-host/Cargo.toml');
execFileSync(cargo, ['test', '--locked', '--manifest-path', manifest], { cwd: root, stdio: 'inherit' });
execFileSync(cargo, ['build', '--locked', '--manifest-path', manifest, '--bins', '--examples'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['--import', 'tsx', '--test', 'reconstruction/native-host-rust-router.test.ts', 'reconstruction/native-host-rust-transport.test.ts', 'reconstruction/native-host-rust-endpoint.test.ts', 'reconstruction/native-host-rust-runtime.test.ts'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, CUA_TEST_RUST_HOST_ROUTER: '1' },
});
