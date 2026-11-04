import { browserCapabilityDefinitions } from "../../capabilities/browser";
import { tabCapabilityDefinitions } from "../../capabilities/tab";
export interface ApiDeclaration {
  text: string;
  references: string[];
  documented?: boolean;
  unsupportedByDefaultIn?: string[];
}
export interface DocumentationApiManifest {
  root: string;
  interfaces: Record<
    string,
    Record<
      string,
      {
        documented?: boolean;
        unsupportedByDefaultIn?: string[];
        declarations: ApiDeclaration[];
      }
    >
  >;
  types: Record<string, { text: string; references: string[] }>;
}
export interface DocumentEntry {
  name: string;
  mode: string;
  description?: string;
  requiredFor?: string[];
  when?: {
    browserTypes?: string[];
    requiredApiMembers?: string[];
    requiredBrowserCapabilities?: string[];
    excludedTabCapabilities?: string[];
    requiredTabCapabilities?: string[];
  };
}
export interface DocumentationBrowser {
  id: string;
  name: string;
  type: string;
  apiSupportOverrides?: Record<string, boolean>;
  capabilities: { browser?: { id: string }[]; tab?: { id: string }[] };
}
export interface DocumentationControllerOptions {
  apiManifest: DocumentationApiManifest;
  disabledMemberIds: Iterable<string>;
  documentManifest: DocumentEntry[];
  undocumentedApiMembers?: Iterable<string>;
  excludedDocumentation?: string[];
  addendum?: string;
  readDocumentation(name: string, ...args: any[]): Promise<string>;
}
/** Original z3: explicit enabled overrides cannot re-enable a globally disabled member. */
export function unavailableApiMembers({
  apiManifest,
  browserInfo,
  disabledMemberIds,
}: {
  apiManifest: DocumentationApiManifest;
  browserInfo: DocumentationBrowser;
  disabledMemberIds: Iterable<string>;
}) {
  const disabled = new Set(disabledMemberIds);
  for (const [name, members] of Object.entries(apiManifest.interfaces))
    for (const [member, info] of Object.entries(members)) {
      const id = `${name}.${member}`;
      if (!(
        browserInfo.apiSupportOverrides?.[id] ??
        info.unsupportedByDefaultIn?.includes(browserInfo.type) !== true
      ))
        disabled.add(id);
    }
  return disabled;
}
/** Original K3. Exclusion of guidance is applied by the caller, not to lookup entries. */
export function selectDocumentation(
  entries: DocumentEntry[],
  {
    browserType,
    capabilities,
    disabledApiMembers,
  }: {
    browserType: string;
    capabilities?: DocumentationBrowser["capabilities"];
    disabledApiMembers: Set<string>;
  },
) {
  const browser = new Set(capabilities?.browser?.map(({ id }) => id) ?? []),
    tab = new Set(capabilities?.tab?.map(({ id }) => id) ?? []);
  const selected = entries.filter(({ when }) =>
    when?.browserTypes?.includes(browserType) === false ||
    when?.requiredApiMembers?.some((id) => disabledApiMembers.has(id)) ===
      true ||
    when?.requiredBrowserCapabilities?.some((id) => !browser.has(id)) ===
      true ||
    when?.excludedTabCapabilities?.some((id) => tab.has(id)) === true
      ? false
      : when?.requiredTabCapabilities?.some((id) => !tab.has(id)) !== true,
  );
  return {
    guidanceNames: selected.flatMap((entry) =>
      entry.mode === "included" ? [entry.name] : [],
    ),
    lookup: selected.flatMap((entry) =>
      entry.mode === "lookup"
        ? [{ description: entry.description, name: entry.name }]
        : [],
    ),
  };
}
function declarations(
  name: string,
  members: DocumentationApiManifest["interfaces"][string],
  browserType: string,
  disabled: Set<string>,
) {
  return Object.entries(members).flatMap(([member, info]) =>
    disabled.has(`${name}.${member}`) || info.documented === false
      ? []
      : info.declarations.filter(
          ({ documented, unsupportedByDefaultIn }) =>
            documented !== false &&
            unsupportedByDefaultIn?.includes(browserType) !== true,
        ),
  );
}
/** Original X3/Due/Y3: traverse only visible declaration references, preserving manifest order. */
export function renderApiReference(
  manifest: DocumentationApiManifest,
  browserType: string,
  disabled = new Set<string>(),
) {
  const reachable = new Set<string>(),
    queue = [manifest.root];
  for (const name of queue) {
    if (reachable.has(name)) continue;
    const members = manifest.interfaces[name],
      type = manifest.types[name];
    let references: string[];
    if (members != null)
      references = declarations(name, members, browserType, disabled).flatMap(
        ({ references }) => references,
      );
    else if (type != null) references = type.references;
    else continue;
    reachable.add(name);
    for (const reference of references)
      if (!reachable.has(reference)) queue.push(reference);
  }
  const lines = [
    "# API Reference",
    "",
    "Use this as the supported `agent.browsers.*` surface.",
    "",
    "```ts",
    "// Returned by setupBrowserRuntime().",
    "// browser was selected during bootstrap.",
  ];
  for (const [name, members] of Object.entries(manifest.interfaces))
    if (reachable.has(name))
      lines.push(
        `interface ${name} {`,
        ...declarations(name, members, browserType, disabled).map(
          ({ text }) => `  ${text}`,
        ),
        "}",
        "",
      );
  for (const [name, type] of Object.entries(manifest.types))
    if (reachable.has(name)) lines.push(type.text, "");
  lines[lines.length - 1] = "```";
  return `${lines.join("\n").trim()}\n`;
}
/** Original J3. Unknown advertised capabilities are omitted; descriptions come from local definitions. */
export function renderCapabilityDocumentation(
  scope: string,
  capabilities?: { id: string }[],
) {
  const definitions =
    scope === "browser"
      ? browserCapabilityDefinitions
      : tabCapabilityDefinitions;
  const registry = new Map(definitions.map(({ id, info }) => [id, info]));
  const lines = (capabilities ?? []).flatMap(({ id }) => {
    const info = registry.get(id);
    return info == null
      ? []
      : [
          `- \`${id}\`: ${info.description}\n  Read with \`await (await ${scope}.capabilities.get("${id}")).documentation()\`.`,
        ];
  });
  return [
    `## ${scope === "browser" ? "Browser" : "Tab"} Capabilities`,
    ...(lines.length === 0 ? ["- None"] : lines),
  ].join("\n");
}
/** Full original ib. Required-read state belongs to this controller, across browser selections. */
export class DocumentationController {
  readNames = new Set<string>();
  constructor(public options: DocumentationControllerOptions) {}
  async read(name: string) {
    if (!this.options.documentManifest.some((entry) => entry.name === name))
      throw new Error(`Documentation is not available: ${name}`);
    const content = await this.options.readDocumentation(name);
    this.readNames.add(name);
    return content;
  }
  async readBrowser(browser: DocumentationBrowser) {
    const { apiManifest, disabledMemberIds, documentManifest } = this.options;
    const disabled = new Set(
      unavailableApiMembers({
        apiManifest,
        browserInfo: browser,
        disabledMemberIds,
      }),
    );
    for (const member of this.options.undocumentedApiMembers ?? [])
      disabled.add(member);
    const selected = selectDocumentation(documentManifest, {
      browserType: browser.type,
      capabilities: browser.capabilities,
      disabledApiMembers: disabled,
    });
    const guidance = await Promise.all(
      selected.guidanceNames
        .filter((name) => !this.options.excludedDocumentation?.includes(name))
        .map(this.options.readDocumentation),
    );
    const identity = [
      "# Selected Browser",
      `- Name: ${browser.name}`,
      `- Type: ${browser.type}`,
      `- ID: ${browser.id}`,
      "Reuse this browser binding across later turns. A new user turn or tab error does not invalidate it; select another browser only when the browser-selection policy requires it.",
      "If a tab is stale or missing later, obtain or create a fresh tab from this browser; never reselect a browser to recover a tab. Empty tab lists are normal after cleanup and do not invalidate this browser binding.",
    ].join("\n");
    const capabilities = [
      "# Additional Capabilities",
      renderCapabilityDocumentation("browser", browser.capabilities.browser),
      renderCapabilityDocumentation("tab", browser.capabilities.tab),
    ].join("\n");
    const content = [
      identity,
      ...guidance,
      selected.lookup.length === 0
        ? undefined
        : [
            "# Additional Documentation",
            'Use `await agent.documentation.get("<name>")` when you need one of these topics:',
            ...selected.lookup.map(
              ({ description, name }) => `- \`${name}\`: ${description}`,
            ),
          ].join("\n"),
      capabilities,
      renderApiReference(apiManifest, browser.type, disabled),
      this.options.addendum,
    ]
      .filter((value) => value != null)
      .join("\n\n");
    for (const name of selected.guidanceNames) this.readNames.add(name);
    return content;
  }
  assertRequiredDocumentationRead(command: string) {
    const missing = this.options.documentManifest
      .filter(
        ({ name, requiredFor }) =>
          requiredFor?.includes(command) === true && !this.readNames.has(name),
      )
      .map(({ name }) => name);
    if (missing.length !== 0)
      throw new Error(
        `Required documentation has not been read: ${missing.map((name) => JSON.stringify(name)).join(", ")}. Read the instructions with ${missing.map((name) => `await agent.documentation.get(${JSON.stringify(name)})`).join("; ")}.`,
      );
  }
}
