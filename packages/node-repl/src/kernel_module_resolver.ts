import fs from "node:fs";
import path from "node:path";
import { builtinModules, createRequire, findPackageJSON } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
export type KernelModuleContext = { kind: string; isPackage: boolean };
export type ResolvedModule =
  | { kind: "builtin"; specifier: string }
  | { kind: "file"; path: string }
  | { kind: "package" | "esm-package"; path: string; specifier: string };
export function createKernelModuleResolver({
  cwd = process.cwd(),
  moduleDirs = process.env.NODE_REPL_NODE_MODULE_DIRS,
  withErrorKind,
}: {
  cwd?: string;
  moduleDirs?: string;
  withErrorKind: <T>(error: T, kind: string) => T;
}) {
  const builtinModuleSet = new Set([
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
  ]);
  // The kernel transport itself writes JSONL over stdout/stderr below, so exposing
  // raw `process` would make it easy for user code to corrupt the stdio protocol.
  // Keep this denylist narrow for now; if node_repl moves off stdio transport in
  // the future, we can revisit whether `process` still needs to stay blocked.
  const deniedBuiltinModules = new Set(["process", "node:process"]);

  function toNodeBuiltinSpecifier(specifier: string) {
    return specifier.startsWith("node:") ? specifier : `node:${specifier}`;
  }

  function isDeniedBuiltin(specifier: string) {
    const normalized = specifier.startsWith("node:")
      ? specifier.slice(5)
      : specifier;
    return (
      deniedBuiltinModules.has(specifier) ||
      deniedBuiltinModules.has(normalized)
    );
  }

  const moduleSearchBases: string[] = [];
  const moduleSearchBaseSet = new Set<string>();
  function normalizeModuleSearchBase(entry: string) {
    const trimmed = entry.trim();
    if (!trimmed) {
      return null;
    }
    const resolved = path.isAbsolute(trimmed)
      ? trimmed
      : path.resolve(process.cwd(), trimmed);
    return path.basename(resolved) === "node_modules"
      ? path.dirname(resolved)
      : resolved;
  }

  function addModuleSearchBase(entry: string) {
    const base = normalizeModuleSearchBase(entry);
    if (!base || moduleSearchBaseSet.has(base)) {
      return;
    }
    moduleSearchBaseSet.add(base);
    const cwdIndex = moduleSearchBases.indexOf(cwd);
    if (cwdIndex === -1) {
      moduleSearchBases.push(base);
    } else {
      moduleSearchBases.splice(cwdIndex, 0, base);
    }
  }

  for (const entry of (moduleDirs ?? "").split(path.delimiter)) {
    addModuleSearchBase(entry);
  }
  if (!moduleSearchBaseSet.has(cwd)) {
    moduleSearchBaseSet.add(cwd);
    moduleSearchBases.push(cwd);
  }

  const importResolveConditions = new Set(["node", "import"]);
  const requireByBase = new Map<string, NodeRequire>();
  function moduleCacheKey(moduleContext: KernelModuleContext, value: string) {
    return `${moduleContext.kind}:${value}`;
  }

  function canonicalizePath(value: string) {
    try {
      return fs.realpathSync.native(value);
    } catch {
      return value;
    }
  }

  function resolveResultToUrl(resolved: ResolvedModule) {
    if (resolved.kind === "builtin") {
      return resolved.specifier;
    }
    if (resolved.kind === "file") {
      return pathToFileURL(resolved.path).href;
    }
    if (resolved.kind === "package" || resolved.kind === "esm-package") {
      return resolved.specifier;
    }
    throw new Error(
      `Unsupported module resolution kind: ${(resolved as { kind: unknown }).kind}`,
    );
  }

  function setImportMeta(
    meta: ImportMeta,
    mod: { identifier: string },
    moduleContext: KernelModuleContext,
    isMain = false,
  ) {
    meta.url = pathToFileURL(mod.identifier).href;
    meta.filename = mod.identifier;
    meta.dirname = path.dirname(mod.identifier);
    meta.main = isMain;
    meta.resolve = (specifier) =>
      resolveResultToUrl(
        resolveSpecifier(specifier, mod.identifier, moduleContext),
      );
  }

  function getRequireForBase(base: string) {
    let req = requireByBase.get(base);
    if (!req) {
      req = createRequire(path.join(base, "__node_repl__.cjs"));
      requireByBase.set(base, req);
    }
    return req;
  }

  function isModuleNotFoundError(err: any) {
    return (
      err?.code === "MODULE_NOT_FOUND" || err?.code === "ERR_MODULE_NOT_FOUND"
    );
  }

  function isEsmPackageFile(modulePath: string) {
    const extension = path.extname(modulePath).toLowerCase();
    if (extension === ".mjs") {
      return true;
    }
    if (extension !== ".js") {
      return false;
    }

    const packageJsonPath = findPackageJSON(pathToFileURL(modulePath).href);
    return (
      packageJsonPath !== undefined &&
      JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).type === "module"
    );
  }

  function isWithinBaseNodeModules(base: string, resolvedPath: string) {
    const canonicalBase = canonicalizePath(base);
    const canonicalResolved = canonicalizePath(resolvedPath);
    const nodeModulesRoot = path.resolve(canonicalBase, "node_modules");
    const relative = path.relative(nodeModulesRoot, canonicalResolved);
    return (
      relative !== "" &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative)
    );
  }

  function isWithinModuleSearchBases(resolvedPath: string) {
    return moduleSearchBases.some((base) =>
      isWithinBaseNodeModules(base, resolvedPath),
    );
  }

  function isExplicitRelativePathSpecifier(specifier: string) {
    return (
      specifier.startsWith("./") ||
      specifier.startsWith("../") ||
      specifier.startsWith(".\\") ||
      specifier.startsWith("..\\")
    );
  }

  function isFileUrlSpecifier(specifier: unknown) {
    if (typeof specifier !== "string" || !specifier.startsWith("file:")) {
      return false;
    }
    try {
      return new URL(specifier).protocol === "file:";
    } catch {
      return false;
    }
  }

  function isPathSpecifier(specifier: unknown) {
    if (
      typeof specifier !== "string" ||
      !specifier ||
      specifier.trim() !== specifier
    ) {
      return false;
    }
    return (
      isExplicitRelativePathSpecifier(specifier) ||
      path.isAbsolute(specifier) ||
      isFileUrlSpecifier(specifier)
    );
  }

  function isBarePackageSpecifier(specifier: unknown) {
    if (
      typeof specifier !== "string" ||
      !specifier ||
      specifier.trim() !== specifier
    ) {
      return false;
    }
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      return false;
    }
    if (specifier.startsWith("/") || specifier.startsWith("\\")) {
      return false;
    }
    if (path.isAbsolute(specifier)) {
      return false;
    }
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(specifier)) {
      return false;
    }
    if (specifier.includes("\\")) {
      return false;
    }
    return true;
  }

  function resolveBareSpecifier(
    specifier: string,
    referrerIdentifier: string | undefined,
    moduleContext: KernelModuleContext,
  ): ResolvedModule | null {
    let firstResolutionError = null;
    const searchBases =
      moduleContext.isPackage &&
      referrerIdentifier &&
      path.isAbsolute(referrerIdentifier)
        ? [path.dirname(referrerIdentifier)]
        : moduleSearchBases;

    for (const base of searchBases) {
      try {
        const resolved = (
          getRequireForBase(base).resolve as unknown as (
            specifier: string,
            options: { conditions: Set<string> },
          ) => string
        )(specifier, {
          conditions: importResolveConditions,
        });
        if (isWithinModuleSearchBases(resolved)) {
          if (isEsmPackageFile(resolved)) {
            return { kind: "esm-package", path: resolved, specifier };
          }
          return { kind: "package", path: resolved, specifier };
        }
        // Ignore resolutions that escape this base via parent node_modules lookup.
      } catch (err: any) {
        if (isModuleNotFoundError(err)) {
          continue;
        }
        if (!firstResolutionError) {
          firstResolutionError = err;
        }
      }
    }

    if (firstResolutionError) {
      throw firstResolutionError;
    }
    return null;
  }

  function resolvePathSpecifier(
    specifier: string,
    referrerIdentifier: string | undefined,
    moduleContext: KernelModuleContext,
  ): ResolvedModule {
    let candidate;
    if (isFileUrlSpecifier(specifier)) {
      try {
        candidate = fileURLToPath(new URL(specifier));
      } catch (err: any) {
        throw new Error(
          `Failed to resolve module "${specifier}": ${err.message}`,
        );
      }
    } else {
      const baseDir =
        referrerIdentifier && path.isAbsolute(referrerIdentifier)
          ? path.dirname(referrerIdentifier)
          : process.cwd();
      candidate = path.isAbsolute(specifier)
        ? specifier
        : path.resolve(baseDir, specifier);
    }

    let resolvedPath;
    try {
      resolvedPath = fs.realpathSync.native(candidate);
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        throw new Error(`Module not found: ${specifier}`);
      }
      throw new Error(
        `Failed to resolve module "${specifier}": ${err.message}`,
      );
    }

    let stats;
    try {
      stats = fs.statSync(resolvedPath);
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        throw new Error(`Module not found: ${specifier}`);
      }
      throw new Error(
        `Failed to inspect module "${specifier}": ${err.message}`,
      );
    }

    if (!stats.isFile()) {
      throw new Error(
        `Unsupported import specifier "${specifier}" in node_repl. Directory imports are not supported.`,
      );
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    if (extension !== ".js" && extension !== ".mjs") {
      throw new Error(
        `Unsupported import specifier "${specifier}" in node_repl. Only .js and .mjs files are supported.`,
      );
    }
    if (moduleContext.isPackage && !isWithinModuleSearchBases(resolvedPath)) {
      throw new Error(
        `Unsupported import specifier "${specifier}" in node_repl. Packages may only import files within configured node_modules roots.`,
      );
    }

    return { kind: "file", path: resolvedPath };
  }

  function resolveSpecifier(
    specifier: string,
    referrerIdentifier: string | undefined,
    moduleContext: KernelModuleContext,
  ): ResolvedModule {
    try {
      if (specifier.startsWith("node:") || builtinModuleSet.has(specifier)) {
        if (isDeniedBuiltin(specifier)) {
          throw new Error(
            `Importing module "${specifier}" is not allowed in node_repl`,
          );
        }
        return {
          kind: "builtin",
          specifier: toNodeBuiltinSpecifier(specifier),
        };
      }

      if (isPathSpecifier(specifier)) {
        return resolvePathSpecifier(
          specifier,
          referrerIdentifier,
          moduleContext,
        );
      }

      if (!isBarePackageSpecifier(specifier)) {
        throw new Error(
          `Unsupported import specifier "${specifier}" in node_repl. Use a package name like "lodash" or "@scope/pkg", or a relative/absolute/file:// .js/.mjs path.`,
        );
      }

      const resolvedBare = resolveBareSpecifier(
        specifier,
        referrerIdentifier,
        moduleContext,
      );
      if (!resolvedBare) {
        throw new Error(`Module not found: ${specifier}`);
      }

      return resolvedBare;
    } catch (error) {
      throw withErrorKind(error, "import_error");
    }
  }

  return {
    resolveSpecifier,
    resolveBareSpecifier,
    resolvePathSpecifier,
    resolveResultToUrl,
    setImportMeta,
    moduleCacheKey,
    canonicalizePath,
    isEsmPackageFile,
    isWithinModuleSearchBases,
    isPathSpecifier,
    isBarePackageSpecifier,
    addModuleSearchBase,
  };
}
