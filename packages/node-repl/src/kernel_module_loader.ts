import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  SourceTextModule,
  SyntheticModule,
  type Context,
  type Module,
} from "node:vm";
import {
  type KernelModuleContext,
  type ResolvedModule,
  type createKernelModuleResolver,
} from "./kernel_module_resolver";
export type LinkedModuleContext = KernelModuleContext & { context: Context };
export function createKernelModuleLoader({
  resolver,
  packageModuleContext,
}: {
  resolver: ReturnType<typeof createKernelModuleResolver>;
  packageModuleContext: LinkedModuleContext;
}) {
  const { moduleCacheKey, resolveSpecifier, setImportMeta } = resolver;
  const linkedFileModules = new Map<string, SourceTextModule>();
  const linkedFileModuleContexts = new WeakMap<Module, LinkedModuleContext>();
  const linkedNativeModules = new Map<string, Promise<SyntheticModule>>();
  const linkedModuleLinkTails = new Map<Context, Promise<unknown>>();
  const linkedModuleEvaluations = new Map<string, Promise<unknown>>();
  function clearLocalFileModuleCaches() {
    const persistentPrefix = `${packageModuleContext.kind}:`;
    for (const cache of [linkedFileModules, linkedModuleEvaluations]) {
      for (const key of cache.keys()) {
        if (!key.startsWith(persistentPrefix)) {
          cache.delete(key);
        }
      }
    }
  }

  function importNativeResolved(resolved: ResolvedModule) {
    if (resolved.kind === "builtin") {
      return import(resolved.specifier);
    }
    if (resolved.kind === "package") {
      return import(pathToFileURL(resolved.path).href);
    }
    throw new Error(
      `Unsupported module resolution kind: ${(resolved as { kind: unknown }).kind}`,
    );
  }

  async function loadLinkedNativeModule(
    resolved: ResolvedModule,
    moduleContext: LinkedModuleContext,
  ) {
    const key =
      resolved.kind === "builtin"
        ? moduleCacheKey(moduleContext, `builtin:${resolved.specifier}`)
        : moduleCacheKey(moduleContext, `package:${resolved.path}`);
    let modulePromise = linkedNativeModules.get(key);
    if (!modulePromise) {
      modulePromise = (async () => {
        const namespace = await importNativeResolved(resolved);
        const exportNames = Object.getOwnPropertyNames(namespace);
        return new SyntheticModule(
          exportNames,
          function initSyntheticModule() {
            for (const name of exportNames) {
              this.setExport(name, namespace[name]);
            }
          },
          { context: moduleContext.context },
        );
      })();
      linkedNativeModules.set(key, modulePromise);
    }
    return modulePromise;
  }

  function getOrCreateLinkedFileModule(
    modulePath: string,
    moduleContext: LinkedModuleContext,
    createdFileModules: Map<string, SourceTextModule>,
  ) {
    const key = moduleCacheKey(moduleContext, modulePath);
    let module = linkedFileModules.get(key);
    if (!module) {
      const sourceBytes = fs.readFileSync(modulePath);
      const source = sourceBytes.toString("utf8");
      module = new SourceTextModule(source, {
        context: moduleContext.context,
        identifier: modulePath,
        initializeImportMeta(meta, mod) {
          setImportMeta(meta, mod, moduleContext, false);
        },
        importModuleDynamically(specifier, referrer) {
          return importResolved(
            resolveSpecifier(specifier, referrer?.identifier, moduleContext),
            moduleContext,
          ) as unknown as Promise<Module>; // Node also accepts a module namespace.
        },
      });
      linkedFileModules.set(key, module);
      linkedFileModuleContexts.set(module, moduleContext);
      createdFileModules.set(key, module);
    }

    return module;
  }

  async function loadLinkedFileModule(
    modulePath: string,
    moduleContext: LinkedModuleContext,
  ) {
    const previousLinking =
      linkedModuleLinkTails.get(moduleContext.context) ?? Promise.resolve();
    const linking = previousLinking.then(async () => {
      const createdFileModules = new Map<string, SourceTextModule>();
      const module = getOrCreateLinkedFileModule(
        modulePath,
        moduleContext,
        createdFileModules,
      );
      try {
        if (module.status === "unlinked") {
          await module.link(async (specifier, referencingModule) => {
            const referencingModuleContext =
              linkedFileModuleContexts.get(referencingModule) ?? moduleContext;
            const resolved = resolveSpecifier(
              specifier,
              referencingModule?.identifier,
              referencingModuleContext,
            );
            return loadLinkedModule(
              resolved,
              referencingModuleContext,
              createdFileModules,
            );
          });
        }
        return module;
      } catch (error) {
        for (const [failedKey, failedModule] of createdFileModules) {
          if (linkedFileModules.get(failedKey) === failedModule) {
            linkedFileModules.delete(failedKey);
          }
        }
        throw error;
      }
    });
    linkedModuleLinkTails.set(
      moduleContext.context,
      linking.catch(() => undefined),
    );
    return linking;
  }

  async function loadLinkedModule(
    resolved: ResolvedModule,
    moduleContext: LinkedModuleContext,
    createdFileModules: Map<string, SourceTextModule>,
  ) {
    if (resolved.kind === "file" || resolved.kind === "esm-package") {
      const childModuleContext =
        resolved.kind === "esm-package" ? packageModuleContext : moduleContext;
      return getOrCreateLinkedFileModule(
        resolved.path,
        childModuleContext,
        createdFileModules,
      );
    }
    if (resolved.kind === "builtin" || resolved.kind === "package") {
      return loadLinkedNativeModule(resolved, moduleContext);
    }
    throw new Error(
      `Unsupported module resolution kind: ${(resolved as { kind: unknown }).kind}`,
    );
  }

  async function importResolved(
    resolved: ResolvedModule,
    referrerModuleContext: LinkedModuleContext,
  ): Promise<Record<string, unknown>> {
    if (resolved.kind === "file" || resolved.kind === "esm-package") {
      const resolvedModuleContext =
        resolved.kind === "esm-package"
          ? packageModuleContext
          : referrerModuleContext;
      const module = await loadLinkedFileModule(
        resolved.path,
        resolvedModuleContext,
      );
      const key = moduleCacheKey(resolvedModuleContext, resolved.path);
      let evaluation = linkedModuleEvaluations.get(key);
      if (!evaluation) {
        evaluation = module.evaluate();
        linkedModuleEvaluations.set(key, evaluation);
      }
      await evaluation;
      return module.namespace as Record<string, unknown>;
    }
    return importNativeResolved(resolved);
  }

  return {
    clearLocalFileModuleCaches,
    importResolved,
    loadLinkedFileModule,
    loadLinkedNativeModule,
  };
}
