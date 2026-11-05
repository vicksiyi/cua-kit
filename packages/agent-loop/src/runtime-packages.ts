/** Demo deployment helper; not code recovered from the CUA bundle. */
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Manifest = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};
async function manifest(directory: string): Promise<Manifest> {
  return JSON.parse(
    await readFile(path.join(directory, "package.json"), "utf8"),
  );
}

/** Resolve installed packages without depending on public package.json exports. */
async function dependencyRoot(source: string, name: string) {
  const require = createRequire(path.join(source, "package.json"));
  for (const base of require.resolve.paths("__cua_package_lookup__") ?? []) {
    const candidate = path.join(base, name);
    try {
      if ((await manifest(candidate)).name === name)
        return await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(`Missing installed dependency ${name} from ${source}`);
}

/**
 * Copy each resolved package once into a private node_modules store. Links point
 * only within that store, never back to the workspace. This preserves distinct
 * installed versions and dependency cycles while satisfying worker realpath checks.
 * No install scripts or network requests are run.
 */
export async function stageRuntimePackages(
  sources: string[],
  parent = tmpdir(),
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const root = await realpath(await mkdtemp(path.join(parent, "cua-runtime-")));
  const staged = new Map<string, string>();
  const packages: Array<{
    name: string;
    version: string;
    source: string;
    directory: string;
  }> = [];
  async function stage(input: string): Promise<string> {
    signal?.throwIfAborted();
    const source = await realpath(input);
    const existing = staged.get(source);
    if (existing) return existing;
    const pkg = await manifest(source);
    if (!/^(@[^/]+\/)?[^/]+$/.test(pkg.name) || pkg.name.includes(".."))
      throw new Error(`Invalid package name: ${pkg.name}`);
    const destination = path.join(
      root,
      "node_modules",
      ".store",
      String(staged.size),
      "node_modules",
      pkg.name,
    );
    staged.set(source, destination);
    packages.push({
      name: pkg.name,
      version: pkg.version,
      source,
      directory: destination,
    });
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      filter: (entry) => {
        signal?.throwIfAborted();
        return !path
          .relative(source, entry)
          .split(path.sep)
          .some((part) => part === "node_modules" || part === ".git");
      },
    });
    const required = new Set(Object.keys(pkg.dependencies ?? {}));
    const names = new Set([
      ...required,
      ...Object.keys(pkg.optionalDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]);
    for (const name of names) {
      signal?.throwIfAborted();
      const optional =
        name in (pkg.optionalDependencies ?? {}) ||
        (!required.has(name) && pkg.peerDependenciesMeta?.[name]?.optional);
      let dependency: string;
      try {
        dependency = await dependencyRoot(source, name);
      } catch (error) {
        if (
          optional &&
          error instanceof Error &&
          error.message.startsWith("Missing installed dependency ")
        )
          continue;
        throw error;
      }
      const target = await stage(dependency);
      const link = path.join(destination, "node_modules", name);
      await mkdir(path.dirname(link), { recursive: true });
      await symlink(path.relative(path.dirname(link), target), link, "dir");
    }
    return destination;
  }
  try {
    const names = new Set<string>();
    for (const source of sources) {
      signal?.throwIfAborted();
      const pkg = await manifest(source);
      if (names.has(pkg.name))
        throw new Error(`Duplicate runtime root: ${pkg.name}`);
      names.add(pkg.name);
      const destination = await stage(source);
      const link = path.join(root, "node_modules", pkg.name);
      await mkdir(path.dirname(link), { recursive: true });
      await symlink(
        path.relative(path.dirname(link), destination),
        link,
        "dir",
      );
    }
    signal?.throwIfAborted();
    return {
      root,
      packages,
      dispose: () => rm(root, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export function restoredPackageSources() {
  return ["cua", "browser-desktop", "sky", "native-host"].map((name) =>
    fileURLToPath(new URL(`../../${name}/`, import.meta.url)),
  );
}
