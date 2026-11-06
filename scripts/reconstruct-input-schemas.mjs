// Extract original schema expressions, expand lexical symbols, and add inferred TS payload types.
// This is not a replacement validator; runtime semantics remain those of the bundled Zod.
import { createHash } from "node:crypto";
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
const expectedHash =
  "04d63754bb1134eae351c164e750c7a9b798de2757a734e7a62e14b63edf8de4";
if (createHash("sha256").update(source).digest("hex") !== expectedHash)
  throw new Error(
    "Installed browser client changed; audit schema bindings before regenerating",
  );
const checkOnly = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check"))
  throw new Error("Usage: reconstruct-input-schemas.mjs [--check]");
const outputs = new Map();
async function stage(path, contents) {
  outputs.set(path, contents);
}
const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
const tables = new Map(
  ast.body
    .filter(
      (node) =>
        node.type === "ExpressionStatement" &&
        node.expression.type === "CallExpression" &&
        node.expression.arguments[0]?.type === "Identifier" &&
        node.expression.arguments[1]?.type === "ObjectExpression",
    )
    .map((node) => [
      node.expression.arguments[0].name,
      Object.fromEntries(
        node.expression.arguments[1].properties.map((property) => {
          if (
            property.value.type !== "ArrowFunctionExpression" ||
            property.value.body.type !== "Identifier"
          )
            throw new Error("Unexpected export getter");
          return [property.key.name, property.value.body.name];
        }),
      ),
    ]),
);
const exports = tables.get("d");
function currentJob([name, fields]) {
  const publicName =
    {
      LocatorDoubleClick: "PlaywrightLocatorDblclick",
      WaitForUrl: "PlaywrightWaitForURL",
    }[name] ?? (exports[name] ? name : `Playwright${name}`);
  const original = exports[publicName],
    entry = tables.get(original);
  if (!entry?.PayloadSchema || !entry.ResultSchema || !entry.commandType)
    throw new Error(`Missing command ${publicName}`);
  return [
    name,
    original,
    entry.PayloadSchema,
    entry.ResultSchema,
    entry.commandType,
    fields,
  ];
}

const declarations = ast.body
  .filter((n) => n.type === "VariableDeclaration")
  .flatMap((n) => n.declarations);
const schemaNames = {
  b: "z",
  Hs: "domNodeIdSchema",
  Dr: "markTabStatusSchema",
  Wr: "handoffReasonSchema",
  Bi: "jsDialogTypeSchema",
  Fi: "resultDialogSchema",
  Qr: "SiwcDetectionSchema",
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
    if (
      n.type === "UnaryExpression" &&
      n.operator === "!" &&
      n.argument.type === "Literal" &&
      typeof n.argument.value === "number"
    )
      edits.push({
        start: n.start - node.start,
        end: n.end - node.start,
        text: String(!n.argument.value),
      });
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
  ["CuaClick", "x:number;y:number;button?:number;keys?:string[]"],
  ["CuaDownloadMedia", "x:number;y:number;timeout_ms?:number"],
  ["CuaDoubleClick", "x:number;y:number;keys?:string[]"],
  ["CuaKeypress", "keys:string[];duration?:number"],
  ["CuaDrag", "path:Array<{x:number;y:number}>;keys?:string[]"],
  ["CuaMove", "x:number;y:number;keys?:string[]"],
  [
    "CuaScroll",
    "x:number;y:number;scroll_x:number;scroll_y:number;keys?:string[]",
  ],
  ["CuaType", "text:string"],
  ["DomCuaClick", "node_id:string"],
  ["DomCuaDownloadMedia", "node_id:string;timeout_ms?:number"],
  ["DomCuaDoubleClick", "node_id:string"],
  ["DomCuaGetVisibleDom", ""],
  ["DomCuaKeypress", "keys:string[]"],
  ["DomCuaScroll", "scroll_x:number;scroll_y:number;node_id?:string"],
  ["DomCuaType", "text:string"],
];
let output = `// Generated from original AST schema expressions; identifiers expanded and payload types inferred.\n// Regenerate with node scripts/reconstruct-input-schemas.mjs.\nimport {z} from "../vendor/bundled_zod";\nimport {Command} from "./command";\ntype InputTarget={browser_id:string;tab_id:string};\nconst domNodeIdSchema=${expression("Hs")};\n`;
for (const [name, original, payload, result, type, fields] of jobs.map(
  currentJob,
)) {
  output += `\n/** Original ${original} (${payload}/${result}). */\nexport namespace ${name} {\n`;
  if (name === "DomCuaClick")
    output += "export const DomNodeIdSchema=domNodeIdSchema;\n";
  output += `export const commandType=${expression(type)};\nexport const PayloadSchema=${expression(payload)};\nexport const ResultSchema=${expression(result)};\nexport function create(payload:InputTarget & {${fields}}){return new Command(commandType,PayloadSchema,payload);}\n}\n`;
}
await stage(
  "packages/browser/src/commands/cua_input.ts",
  await format(output, { parser: "typescript" }),
);

const controls = [
  ["CloseTab", ""],
  ["MarkTab", 'status:"handoff"|"deliverable"'],
  [
    "ManualHandoff",
    'reason?:"authentication"|"captcha"|"user_requested"|"other"',
  ],
  ["NavigateTab", "url:string;prepare_accessibility?:true"],
  ["NavigateTabBack", ""],
  ["NavigateTabForward", ""],
  ["NavigateTabReload", ""],
  [
    "TabScreenshot",
    "fullPage?:boolean;cropX?:number;cropY?:number;cropWidth?:number;cropHeight?:number",
  ],
  ["TabGetJsDialog", ""],
  [
    "TabHandleJsDialog",
    'action:"accept"|"dismiss";dialog_id:string;prompt_text?:string',
  ],
];
let controlOutput = `// Generated from original AST schema expressions; identifiers expanded and payload types inferred.
// Regenerate with node scripts/reconstruct-input-schemas.mjs.
import {z} from "../vendor/bundled_zod";
import {Command} from "./command";
type TabTarget={browser_id:string;tab_id:string};
`;
for (const original of ["Dr", "Wr", "Bi", "Fi"])
  controlOutput += `const ${schemaNames[original]}=${expression(original)};
`;
for (const [name, original, payload, result, type, fields] of controls.map(
  currentJob,
)) {
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
await stage(
  "packages/browser/src/commands/tab_control.ts",
  await format(controlOutput, { parser: "typescript" }),
);

// Locator commands: retain source schema expressions and their separate instances.
schemaNames.gc = "selectOptionSchema";
const locatorCommands = [
  [
    "LocatorClick",
    "modifiers?:string[];button?:string;force?:boolean;timeout_ms?:number",
  ],
  [
    "LocatorDoubleClick",
    "modifiers?:string[];button?:string;force?:boolean;timeout_ms?:number",
  ],
  ["LocatorDownloadMedia", "timeout_ms?:number"],
  ["LocatorFill", "value:string;replace:boolean;timeout_ms?:number"],
  ["LocatorPress", "value:string;timeout_ms?:number"],
  ["LocatorPressSequentially", "value:string;timeout_ms?:number"],
  ["LocatorWaitFor", "state:string;timeout_ms?:number"],
  ["LocatorCount", ""],
  [
    "LocatorSelectOption",
    "selections:Array<{value?:string;label?:string;index?:number}>;timeout_ms?:number",
  ],
  ["LocatorSetChecked", "checked:boolean;force?:boolean;timeout_ms?:number"],
  ["LocatorIsVisible", ""],
  ["LocatorIsEnabled", ""],
  ["LocatorAllTextContents", "timeout_ms?:number"],
  ["LocatorTextContent", "timeout_ms?:number"],
  ["LocatorInnerText", "timeout_ms?:number"],
  ["LocatorGetAttribute", "name:string;timeout_ms?:number"],
];
let locatorOutput = `// Generated from original AST schema expressions; identifiers expanded and payload types inferred.
// Regenerate with node scripts/reconstruct-input-schemas.mjs.
import {z} from "../vendor/bundled_zod";
import {Command} from "./command";
type LocatorTarget={browser_id:string;tab_id:string;selector:string};
const selectOptionSchema=${expression("gc")
  .replace(/\be\./g, "selection.")
  .replace(/\bt\./g, "context.")
  .replace(
    /\(e,t\)=>/,
    "(selection: {value?:string;label?:string;index?:number},context: {addIssue(issue:unknown):void})=>",
  )};
`;
for (const [
  name,
  original,
  payload,
  result,
  type,
  fields,
] of locatorCommands.map(currentJob)) {
  locatorOutput += `/** Original ${original} (${payload}/${result}). */
export namespace ${name} {
export const commandType=${expression(type)};
export const PayloadSchema=${expression(payload)};
export const ResultSchema=${expression(result)};
${name === "LocatorSelectOption" ? "export const SelectOptionSchema=selectOptionSchema;" : ""}
export function create(payload:LocatorTarget & {${fields}}){return new Command(commandType,PayloadSchema,payload);}
}
`;
}
const [, evaluateNamespace, evaluatePayload, evaluateResult, evaluateType] =
  currentJob(["PlaywrightEvaluate", ""]);
locatorOutput += `/** Original ${evaluateNamespace}/${evaluatePayload}/${evaluateResult}/${evaluateType}. Shared by page and locator evaluation. */
export namespace PlaywrightEvaluate {
export const commandType=${expression(evaluateType)};
export const PayloadSchema=${expression(evaluatePayload)};
export const ResultSchema=${expression(evaluateResult)};
export function create(payload:{browser_id:string;tab_id:string;script:string;selector?:string;selector_mode?:"all";timeout_ms?:number}){return new Command(commandType,PayloadSchema,payload);}
}
`;
await stage(
  "packages/browser/src/commands/playwright_locator.ts",
  await format(locatorOutput, { parser: "typescript" }),
);

Object.assign(schemaNames, {
  hd: "waitUntilSchema",
  yd: "loadStateSchema",
  Od: "boundingBoxSchema",
  Zd: "selectorInfoSchema",
  Nd: "elementInfoSchema",
});
let pageOutput = `// Generated from original AST schema expressions; identifiers expanded and payload types inferred.
// Regenerate with node scripts/reconstruct-input-schemas.mjs.
import {z} from "../vendor/bundled_zod";
import {Command} from "./command";
import {SiwcDetectionSchema} from "./siwc";
type PageTarget={browser_id:string;tab_id:string};
`;
for (const original of ["hd", "yd", "Od", "Zd", "Nd"])
  pageOutput += `const ${schemaNames[original]}=${expression(original)};\n`;
const pageCommands = [
  ["WaitForUrl", "url:string;wait_until?:string;timeout_ms?:number"],
  ["WaitForLoadState", "state?:string;timeout_ms?:number"],
  ["WaitForTimeout", "timeout_ms:number"],
  ["DomSnapshot", ""],
  ["ElementInfo", "x:number;y:number;include_non_interactable?:boolean"],
  ["ElementScreenshot", "x:number;y:number;include_non_interactable?:boolean"],
  ["WaitForDownload", "timeout_ms?:number"],
  ["DownloadPath", "download_id:string;timeout_ms?:number"],
  ["WaitForFileChooser", "timeout_ms?:number"],
  [
    "FileChooserSetFiles",
    "file_chooser_id:string;files:string[];timeout_ms?:number",
  ],
];
for (const [name, original, payload, result, type, fields] of pageCommands.map(
  currentJob,
)) {
  pageOutput += `/** Original ${original} (${payload}/${result}). */
export namespace ${name} {
${name === "WaitForLoadState" ? "export const LoadStateSchema=loadStateSchema;" : ""}
export const commandType=${expression(type)};
export const PayloadSchema=${expression(payload)};
export const ResultSchema=${expression(result)};
export function create(payload:PageTarget & {${fields}}){return new Command(commandType,PayloadSchema,payload);}
}
`;
}
await stage(
  "packages/browser/src/commands/playwright_page.ts",
  await format(pageOutput, { parser: "typescript" }),
);

// All expressions and formatting are validated before touching any output.
for (const [path, contents] of outputs) {
  if (checkOnly) {
    if ((await readFile(path, "utf8")) !== contents)
      throw new Error(`Generated schema differs: ${path}`);
  } else await writeFile(path, contents);
}
console.log(
  `${checkOnly ? "Checked" : "Generated"} ${outputs.size} schema files from ${expectedHash}`,
);
