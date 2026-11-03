// Record exact lexical source locations for service reconstruction, without executing the vendor module.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse } from "acorn";
const manifest = JSON.parse(
  await readFile("reconstruction/source-map.json", "utf8"),
);
const root = process.env.CUA_VENDOR_ROOT ?? manifest.sourceRoot;
const relative =
  "cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-service.mjs";
const source = await readFile(`${root}/${relative}`, "utf8");
const wanted = new Set([
  "UC", "s5", "hS", "Qt", "zr", "dl", "Zt", "aC", "Oe",
  "lu",
  "gS", "Yoe", "CL", "AL", "aL", "TL", "ga", "go", "PX",
  "fr", "BB", "R_", "DB", "RX",
  "Me", "xt", "Vc", "eie", "tie", "Gt", "zc", "lie", "cie", "Joe", "Zoe", "sie", "aie", "uie",
  "lp", "IC", "Cy", "K8", "dn", "Qoe", "wg", "rie", "PL", "nie", "bS", "yS", "vg", "oie", "wL", "RL", "iie", "EL", "wS", "_L", "die", "pie", "vL", "_g", "mie", "fie", "hie", "ts",
  "LC", "up", "Es", "cL", "uL", "lL", "es", "Gc", "pL", "mL", "QC", "l5",
  "rl", "sp", "nl", "ap", "tl", "Y8", "ip", "FC", "J8", "Z8", "MC", "Py", "Q8", "NC", "e5", "Ry", "t5", "Cs", "r5", "n5", "o5", "i5", "Iy",
  "fS", "Doe", "Ooe", "Moe", "Noe", "Foe", "fL", "$c", "yg", "Loe", "hL", "dL", "gL", "Uoe",
  "KF", "XF", "YF", "moe", "foe", "hoe", "goe", "Lo", "$F", "boe", "GF", "yoe", "JF", "VF", "fg", "zF", "ZF", "Hc", "woe", "QF", "_oe", "voe", "mS", "Wc", "hg", "Soe", "xoe", "tL", "Poe", "Roe", "rL", "nL", "Ioe", "koe", "Boe",
  "Eoe", "Toe", "Coe", "eL", "Aoe", "oL",
  "pg", "Lt", "qe", "UB", "IX", "Es", "qB", "jF", "HF", "loe", "dS", "coe", "pS", "doe", "poe",
  "Mc", "su", "Yre", "Xh",
  "Uh",
  "HN",
  "GN",
  "VN",
  "Ite",
  "kte",
  "qN",
  "Bte",
  "Dte",
  "Rte",
  "xte",
  "Ete",
  "Ste",
  "Za",
  "Ote",
  "Wn",
  "Mte",
  "Pte",
  "Ate",
  "Hn",
  "Rv",
  "wte",
  "gg",
  "Tg",
  "bg",
  "dg",
  "noe",
  "ooe",
  "ioe",
  "soe",
  "aoe",
  "qF",
  "uoe",
  "jc",
  "Qi",
  "Eg",
  "yie",
  "wie",
  "_ie",
  "vie",
  "xg",
  "DL",
  "OL",
  "kL",
  "BL",
  "bie",
  "IL",
  "gie",
  "LF",
  "FF",
  "Jne",
  "Yne",
  "Kne",
  "Fc",
  "Yv",
  "Zh",
  "Qh",
  "ui",
  "SA",
  "lS",
  "NF",
  "lg",
  "mg",
  "WF",
  "Cv",
  "eu",
  "Lh",
  "$t",
  "tu",
  "Av",
  "jN",
  "Pv",
  "At",
  "WN",
  "Tte",
  "Cte",
  "zN",
  "qh",
  "$N",
  "Io",
  "jh",
  "_te",
  "vte",
  "dl",
  "jy",
  "CA",
  "AA",
  "yp",
  "wp",
  "hC",
  "gC",
  "fC",
  "Hy",
  "Sx",
  "Go",
  "Z1",
  "xx",
  "Ex",
  "Tx",
  "Cx",
  "Ax",
  "Px",
  "c6",
  "F",
  "W",
  "KD",
  "XD",
  "Ui",
  "pJ",
  "Q_",
  "mJ",
  "fJ",
  "hJ",
  "gJ",
  "bJ",
  "an",
  "lJ",
  "cJ",
  "dJ",
  "iy",
  "hH",
  "Gut",
  "Vut",
  "Qa",
  "rp",
  "St",
  "JT",
  "j8",
  "el",
  "F8",
  "U8",
  "L8",
  "q8",
  "xs",
  "V8",
  "Fr",
  "mH",
  "nhe",
  "ohe",
  "W6",
  "p6",
  "mn",
  "c6",
  "l6",
  "ob",
  "yb",
  "TA",
  "q3",
]);
const segments = {};
function visit(node) {
  if (!node || typeof node !== "object") return;
  let name, expression;
  if (node.type === "FunctionDeclaration") {
    name = node.id.name;
    expression = node;
  }
  if (node.type === "VariableDeclarator" && node.id.type === "Identifier") {
    name = node.id.name;
    expression = node.init;
  }
  if (node.type === "AssignmentExpression" && node.left.type === "Identifier") {
    name = node.left.name;
    expression = node.right;
  }
  if ((name === "qh" || name === "lu") && expression?.type === "ClassExpression") {
    for (const method of expression.body.body) {
      if (
        method.type === "MethodDefinition" &&
        method.key.type === "Identifier"
      )
        segments[`${name}.${method.key.name}`] = {
          start: method.start,
          end: method.end,
          kind: "MethodDefinition",
        };
    }
  }
  if (wanted.has(name) && expression)
    segments[name] = {
      start: expression.start,
      end: expression.end,
      kind: expression.type,
    };
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") visit(value);
  }
}
visit(parse(source, { ecmaVersion: "latest", sourceType: "module" }));
await writeFile(
  "reconstruction/browser-service-segments.json",
  JSON.stringify(
    {
      source: relative,
      sha256: createHash("sha256").update(source).digest("hex"),
      offsetUnit: "UTF-16 code units (Acorn offsets)",
      purpose:
        "Provenance and navigation only; no runtime dependency on installed vendor source",
      segments,
    },
    null,
    2,
  ) + "\n",
);
