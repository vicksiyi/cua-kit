// Extract original schema expressions, expand lexical symbols, and add inferred TS payload types.
// This is not a replacement validator; runtime semantics remain those of the bundled Zod.
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "acorn";
import { format } from "prettier";
const manifest = JSON.parse(
  await readFile("reconstruction/source-map.json", "utf8"),
);
const root = process.env.CUA_VENDOR_ROOT ?? manifest.sourceRoot;
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
const declarations = ast.body
  .filter((n) => n.type === "VariableDeclaration")
  .flatMap((n) => n.declarations);
const schemaNames = {
  v: "z",
  Fn: "domNodeIdSchema",
  Vr: "markTabStatusSchema",
  Xr: "handoffReasonSchema",
  Mi: "jsDialogTypeSchema",
  Oi: "resultDialogSchema",
};
function expression(name) {
  const node = declarations.find((n) => n.id.name === name)?.init;
  if (!node)
    throw new Error(
      `Missing source schema ${name}; review installed bundle version`,
    );
  const edits = [];
  function visit(n) {
    if (!n || typeof n !== "object") return;
    if (n.type === "Identifier" && Object.hasOwn(schemaNames, n.name))
      edits.push({
        start: n.start - node.start,
        end: n.end - node.start,
        text: schemaNames[n.name],
      });
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(node);
  let text = source.slice(node.start, node.end);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}
const jobs = [
  [
    "CuaClick",
    "en",
    "tn",
    "rn",
    "an",
    "x:number;y:number;button?:number;keys?:string[]",
  ],
  [
    "CuaDownloadMedia",
    "nn",
    "on",
    "cn",
    "dn",
    "x:number;y:number;timeout_ms?:number",
  ],
  [
    "CuaDoubleClick",
    "un",
    "hn",
    "mn",
    "pn",
    "x:number;y:number;keys?:string[]",
  ],
  ["CuaKeypress", "_n", "yn", "fn", "gn", "keys:string[]"],
  [
    "CuaDrag",
    "vn",
    "xn",
    "kn",
    "Sn",
    "path:Array<{x:number;y:number}>;keys?:string[]",
  ],
  ["CuaMove", "jn", "In", "Cn", "Rn", "x:number;y:number;keys?:string[]"],
  [
    "CuaScroll",
    "En",
    "An",
    "Mn",
    "On",
    "x:number;y:number;scroll_x:number;scroll_y:number;keys?:string[]",
  ],
  ["CuaType", "Zn", "Nn", "qn", "Dn", "text:string"],
  ["DomCuaClick", "Bn", "Un", "zn", "Vn", "node_id:string"],
  [
    "DomCuaDownloadMedia",
    "Kn",
    "Jn",
    "Gn",
    "Hn",
    "node_id:string;timeout_ms?:number",
  ],
  ["DomCuaDoubleClick", "Xn", "Qn", "eo", "to", "node_id:string"],
  ["DomCuaGetVisibleDom", "ao", "io", "so", "no", ""],
  ["DomCuaKeypress", "co", "lo", "uo", "ho", "keys:string[]"],
  [
    "DomCuaScroll",
    "po",
    "bo",
    "_o",
    "yo",
    "scroll_x:number;scroll_y:number;node_id?:string",
  ],
  ["DomCuaType", "go", "wo", "vo", "xo", "text:string"],
];
let output = `// Generated from original AST schema expressions; identifiers expanded and payload types inferred.\n// Regenerate with node scripts/reconstruct-input-schemas.mjs.\nimport {z} from "../vendor/bundled_zod";\nimport {Command} from "./command";\ntype InputTarget={browser_id:string;tab_id:string};\nconst domNodeIdSchema=${expression("Fn")};\n`;
for (const [name, original, payload, result, type, fields] of jobs) {
  output += `\n/** Original ${original} (${payload}/${result}). */\nexport namespace ${name} {\n`;
  if (name === "DomCuaClick")
    output += "export const DomNodeIdSchema=domNodeIdSchema;\n";
  output += `export const commandType=${expression(type)};\nexport const PayloadSchema=${expression(payload)};\nexport const ResultSchema=${expression(result)};\nexport function create(payload:InputTarget & {${fields}}){return new Command(commandType,PayloadSchema,payload);}\n}\n`;
}
await writeFile(
  "packages/browser/src/commands/cua_input.ts",
  await format(output, { parser: "typescript" }),
);

const controls = [
  ["CloseTab", "Dr", "Lr", "Br", "Fr", ""],
  ["MarkTab", "zr", "Wr", "Kr", "Jr", 'status:"handoff"|"deliverable"'],
  [
    "ManualHandoff",
    "Hr",
    "Qr",
    "ea",
    "Yr",
    'reason?:"authentication"|"captcha"|"user_requested"|"other"',
  ],
  ["NavigateTab", "La", "Ba", "Fa", "Ua", "url:string"],
  ["NavigateTabBack", "Va", "Wa", "Ka", "Ja", ""],
  ["NavigateTabForward", "Ha", "Ya", "Xa", "Qa", ""],
  ["NavigateTabReload", "ti", "ri", "ai", "ii", ""],
  [
    "TabScreenshot",
    "Ps",
    "Es",
    "As",
    "Ms",
    "fullPage?:boolean;cropX?:number;cropY?:number;cropWidth?:number;cropHeight?:number",
  ],
  ["TabGetJsDialog", "Ai", "$i", "Zi", "Ni", ""],
  [
    "TabHandleJsDialog",
    "Di",
    "Li",
    "Bi",
    "Fi",
    'action:"accept"|"dismiss";dialog_id:string;prompt_text?:string',
  ],
];
let controlOutput = `// Generated from original AST schema expressions; identifiers expanded and payload types inferred.
// Regenerate with node scripts/reconstruct-input-schemas.mjs.
import {z} from "../vendor/bundled_zod";
import {Command} from "./command";
type TabTarget={browser_id:string;tab_id:string};
`;
for (const original of ["Vr", "Xr", "Mi", "Oi"])
  controlOutput += `const ${schemaNames[original]}=${expression(original)};
`;
for (const [name, original, payload, result, type, fields] of controls) {
  controlOutput += `
/** Original ${original} (${payload}/${result}). */
export namespace ${name} {
`;
  if (name === "MarkTab")
    controlOutput += `export const MarkTabStatusSchema=markTabStatusSchema;
`;
  if (name === "ManualHandoff")
    controlOutput += `export const ReasonSchema=handoffReasonSchema;
`;
  if (name === "TabGetJsDialog")
    controlOutput += `export const JsDialogTypeSchema=jsDialogTypeSchema;export const ResultDialogSchema=resultDialogSchema;
`;
  controlOutput += `export const commandType=${expression(type)};
export const PayloadSchema=${expression(payload)};
export const ResultSchema=${expression(result)};
export function create(payload:TabTarget & {${fields}}){return new Command(commandType,PayloadSchema,payload);}
}
`;
}
await writeFile(
  "packages/browser/src/commands/tab_control.ts",
  await format(controlOutput, { parser: "typescript" }),
);
