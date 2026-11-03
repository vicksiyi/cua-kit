import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parse } from "acorn";
import { format } from "prettier";
const manifest = JSON.parse(
  await readFile("reconstruction/source-map.json", "utf8"),
);
const root = process.env.CUA_VENDOR_ROOT ?? manifest.sourceRoot;
const path = `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`;
const source = await readFile(path, "utf8");
const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
const variables = ast.body
  .filter((node) => node.type === "VariableDeclaration")
  .flatMap((statement) =>
    statement.declarations.map((declaration) => ({ statement, declaration })),
  );
const find = (name) => {
  const result = variables.find((item) => item.declaration.id.name === name);
  if (!result)
    throw new Error(`Bundle symbol missing: ${name}; re-review version`);
  return result;
};
const start = find("v").statement.start,
  end = find("Kt").declaration.end;
const helper = ["e", "t"]
  .map((name) => {
    const { declaration } = find(name);
    return source.slice(declaration.start, declaration.end);
  })
  .join(",");
const code =
  "// @ts-nocheck\n// Exact bundled third-party dependency, formatted only; NOT counted as reconstructed application code.\nvar " +
  helper +
  ";\n" +
  source.slice(start, end) +
  ";\nconst bundledZodNamespace: any = v;\nexport {bundledZodNamespace as z};\n";
await mkdir("packages/browser/src/vendor", { recursive: true });
await writeFile(
  "packages/browser/src/vendor/bundled_zod.ts",
  await format(code, { parser: "typescript" }),
);
const selected = [
  "jm",
  "c",
  "d",
  "r",
  "a",
  "i",
  "s",
  "n",
  "o",
  "Fl",
  "_",
  "Zs",
  "Ns",
  "Bs",
  "Fs",
  "Us",
  "zs",
  "Vs",
  "Ws",
  "dl",
  "xm",
  "km",
  "Sm",
  "Tm",
  "u",
  "h",
  "il",
  "sl",
  "nl",
  "ol",
  "Jt",
  "Gt",
  "Ht",
  "Yt",
  "Xt",
  "Qt",
  "y",
  "ir",
  "dr",
  "pr",
  "Sr",
  "Rr",
  "Or",
  "ha",
  "ya",
  "xa",
];
const segments = Object.fromEntries(
  selected.map((name) => {
    const { declaration } = find(name);
    return [name, { start: declaration.start, end: declaration.end }];
  }),
);
for (const name of [
  "pl",
  "l",
  "Im",
  "m",
  "ar",
  "cr",
  "mr",
  "fr",
  "Cr",
  "Mr",
  "qr",
  "_a",
  "va",
  "Ia",
]) {
  const declaration = ast.body.find(
    (node) => node.type === "FunctionDeclaration" && node.id.name === name,
  );
  if (!declaration)
    throw new Error(`Bundle function missing: ${name}; re-review version`);
  segments[name] = { start: declaration.start, end: declaration.end };
}
await writeFile(
  "reconstruction/browser-bundle-segments.json",
  JSON.stringify(
    {
      source: path,
      offsetUnit: "UTF-16 code units (Acorn start/end)",
      segments: { bundledZod: { start, end }, ...segments },
    },
    null,
    2,
  ) + "\n",
);
