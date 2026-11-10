/** Provenance inventory only. A TS implementation at a declaration path is not type parity. */
import { readdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const root = process.env.CUA_VENDOR_ROOT ?? "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const packages = {
  cua: "cua/dist/lib/js/oai_js_cua/src",
  sky: "sky/dist/project/cua/sky_js/src",
  "cua-repl": "cua-repl/dist/lib/js/oai_js_cua_repl/src",
};
const exists = (file: string) => access(file).then(()=>true,()=>false);
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function files(directory: string): Promise<string[]> {
  return (await Promise.all((await readdir(directory,{withFileTypes:true})).map(entry =>
    entry.isDirectory() ? files(path.join(directory,entry.name)) : [path.join(directory,entry.name)]))).flat().sort();
}
const entries = [];
for (const [name,subpath] of Object.entries(packages)) {
  const directory = path.join(root,subpath);
  for (const file of (await files(directory)).filter(file=>file.endsWith(".d.ts"))) {
    const relative = path.relative(directory,file), target = path.join("packages",name,"src",relative);
    const implementation = target.replace(/\.d\.ts$/,".ts");
    const source = await readFile(file,"utf8");
    const standalone = await exists(target), implemented = await exists(implementation);
    const local = standalone ? await readFile(target,"utf8") : undefined;
    entries.push({ package:name, source:path.relative(root,file), sourceSha256:hash(source), target,
      implementation:implemented ? implementation : null,
      status:local !== undefined ? source === local ? "declaration-byte-equal"
        : "declaration-diff-requires-review"
        : implemented ? "ts-implementation-present-contract-unverified" : "declaration-only-path-missing",
    });
  }
}
const counts: Record<string,number> = {};
for (const entry of entries) counts[entry.status]=(counts[entry.status]??0)+1;
const report = { scope:"Installed cua/sky/cua-repl declaration paths; excludes embedded browser/native and inferred TS contract comparison",
  limitation:"Equal declarations prove type text only. TS presence and missing declaration-only paths do not establish runtime behavior or overall completion.",
  comparison:"Byte equality only; formatting/import remaps remain explicit review differences",counts,entries };
const output = process.argv[2] ?? "artifacts/audit/declaration-inventory-current.json";
await writeFile(output,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({output,counts},null,2));
