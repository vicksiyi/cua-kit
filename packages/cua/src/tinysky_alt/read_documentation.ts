import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
const documentationRoot = (() => {
  let directory = new URL(".", import.meta.url);
  while (!existsSync(new URL("package.json", directory))) {
    const parent = new URL("..", directory);
    if (parent.href === directory.href)
      throw new Error("Could not find package.json for CUA documentation.");
    directory = parent;
  }
  return new URL("docs/", directory);
})();
export function read_documentation(source: string): Promise<string> {
  return readFile(
    new URL(`tinysky-alt-${source}.md`, documentationRoot),
    "utf8",
  );
}
