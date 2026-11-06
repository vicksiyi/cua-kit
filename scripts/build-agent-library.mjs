/** Build the agent-neutral public library without pulling in demo entry points. */
import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
process.chdir(projectRoot);
execFileSync("node_modules/.bin/tsc", ["-p", "packages/agent-loop/tsconfig.library.json"], { stdio: "inherit" });
// Source imports stay extensionless; generated declarations must also resolve in NodeNext projects.
for (const file of await readdir("packages/agent-loop/dist")) {
  if (!file.endsWith(".d.ts")) continue;
  const path = join("packages/agent-loop/dist", file);
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replace(/(\bfrom\s*["']|\bimport\s*\(\s*["'])(\.[^"']+)(["'])/g,
    (match, prefix, specifier, suffix) => extname(specifier) ? match : `${prefix}${specifier}.js${suffix}`));
}
await build({absWorkingDir:projectRoot,entryPoints:["packages/agent-loop/src/index.ts"],outfile:"packages/agent-loop/dist/index.js",bundle:true,packages:"external",platform:"node",format:"esm",target:"node22"});
