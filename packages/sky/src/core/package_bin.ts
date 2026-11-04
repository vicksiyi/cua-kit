import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function package_bin(args: {
  relative_path: string[];
  check_exists?: boolean;
  env_var_override?: string;
}) {
  const check = args.check_exists ?? true;
  if (args.env_var_override) {
    const configured = process.env[args.env_var_override]?.trim();
    if (configured) return configured;
  }
  const relative = path.join(...args.relative_path),
    start = path.dirname(fileURLToPath(import.meta.url));
  let directory = start;
  for (;;) {
    if (existsSync(path.join(directory, "package.json"))) break;
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error(`find_package_dir start_dir=${start}`);
    directory = parent;
  }
  const binary = path.join(directory, relative);
  if (check && !existsSync(binary))
    throw new Error(`${relative} bin=${binary}`);
  return binary;
}
