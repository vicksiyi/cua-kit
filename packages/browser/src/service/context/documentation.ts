export interface DocumentationFilesystem {
  readFile(url: URL): Promise<string>;
}
export interface PackagedDocumentation {
  documentation: Record<string, string>;
  apiManifest: any;
  documentManifest: any;
}
export interface DocumentationBundle {
  default?: PackagedDocumentation;
  environments?: Record<string, PackagedDocumentation>;
}
export interface DocumentationOptions {
  root?: URL | Promise<URL> | null;
  environment?: string;
}
/** Original ZX. Only ENOENT allows directory probing to continue. */
export function missingDocumentationFile(error: unknown) {
  return (
    error != null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
/** Original YX/wf/oD/iD/M_/JX/N_, with module-relative roots supplied by host assembly. */
export function createBrowserDocumentation(
  moduleUrl: string,
  bundle?: DocumentationBundle,
) {
  let discoveredRoot: Promise<URL> | undefined;
  const namePattern = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/u;
  async function findRoot(
    filesystem: DocumentationFilesystem,
    roots = [
      new URL("../docs/", moduleUrl),
      new URL("../references/", moduleUrl),
      new URL("../../../plugin/static/docs/", moduleUrl),
    ],
  ) {
    for (const root of roots)
      for (const name of ["api.json", "browserAuthSafetyPrecheck.md"]) {
        try {
          await filesystem.readFile(new URL(name, root));
          return root;
        } catch (error) {
          if (!missingDocumentationFile(error)) throw error;
        }
      }
    throw new Error("Packaged browser documentation directory is missing.");
  }
  function packaged(environment?: string) {
    if (environment == null || bundle?.environments == null)
      return bundle?.default;
    const selected = bundle.environments[environment];
    if (selected == null)
      throw new Error(
        `Browser documentation is not packaged for environment: ${environment}`,
      );
    return selected;
  }
  function root(filesystem: DocumentationFilesystem) {
    return (discoveredRoot ??= findRoot(filesystem));
  }
  async function readFile(
    name: string,
    filesystem: DocumentationFilesystem,
    explicit?: URL | Promise<URL> | null,
  ) {
    return await filesystem.readFile(
      new URL(name, await (explicit ?? root(filesystem))),
    );
  }
  async function readDocumentation(
    name: string,
    filesystem: DocumentationFilesystem,
    { root: explicit, environment }: DocumentationOptions = {},
  ) {
    if (typeof name !== "string" || !namePattern.test(name))
      throw new Error(
        "Documentation name must be a relative path without an extension.",
      );
    const selected = explicit == null ? packaged(environment) : undefined;
    if (selected != null) {
      const text = selected.documentation[name];
      if (typeof text !== "string")
        throw new Error(`Documentation is not available: ${name}`);
      return text;
    }
    return await readFile(`${name}.md`, filesystem, explicit);
  }
  async function apiManifest(
    filesystem: DocumentationFilesystem,
    { root: explicit, environment }: DocumentationOptions = {},
  ) {
    const selected = explicit == null ? packaged(environment) : undefined;
    if (selected != null) return selected.apiManifest;
    return JSON.parse(await readFile("api.json", filesystem, explicit));
  }
  async function documentManifest(
    filesystem: DocumentationFilesystem,
    { root: explicit, environment }: DocumentationOptions = {},
  ) {
    const selected = explicit == null ? packaged(environment) : undefined;
    if (selected != null) return selected.documentManifest;
    return JSON.parse(await readFile("documents.json", filesystem, explicit));
  }
  return {
    findRoot,
    packaged,
    root,
    readFile,
    readDocumentation,
    apiManifest,
    documentManifest,
  };
}
