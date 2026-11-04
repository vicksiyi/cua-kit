import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "acorn";
const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const source = await readFile(
  `${root}/chunks/codex-work-sidepanel-Cy6MdlEo.js`,
  "utf8",
);
export const sidePanelSourceHash = createHash("sha256")
  .update(source)
  .digest("hex");
if (
  sidePanelSourceHash !==
  "3c34166181949c77a2123425bb7dc95d913af693b319c5559cc02416e965ad7b"
)
  throw Error("Installed sidepanel source changed");
const body: any = (
  parse(source, { ecmaVersion: "latest", sourceType: "module" }) as any
).body;
export function sidePanelBinding(
  name: string,
  external: Record<string, unknown> = {},
) {
  const node = body.find(
    (n: any) => n.type === "FunctionDeclaration" && n.id.name === name,
  );
  if (!node) throw Error(`Missing sidepanel function ${name}`);
  return new Function(
    ...Object.keys(external),
    `return (${source.slice(node.start, node.end)})`,
  )(...Object.values(external));
}
