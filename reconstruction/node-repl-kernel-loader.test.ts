import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { extractNodeReplSources } from "../scripts/extract-node-repl-sources.mjs";
const exec = promisify(execFile);
const { files } = await extractNodeReplSources(
  process.env.CUA_NODE_REPL_BINARY,
);
const source = files["kernel.js"];
const resolverSource =
  source.slice(
    source.indexOf("const builtinModuleSet"),
    source.indexOf("let trustedServiceRequestCounter"),
  ) +
  "const moduleSearchBases=[];const moduleSearchBaseSet=new Set();" +
  source.slice(
    source.indexOf("function normalizeModuleSearchBase"),
    source.indexOf("const importResolveConditions"),
  ) +
  'const importResolveConditions=new Set(["node","import"]);const requireByBase=new Map();' +
  source.slice(
    source.indexOf("function moduleCacheKey"),
    source.indexOf("function importNativeResolved"),
  );
const loaderSource =
  source.slice(
    source.indexOf("const linkedFileModules"),
    source.indexOf("function moduleCacheKey"),
  ) +
  source.slice(
    source.indexOf("function importNativeResolved"),
    source.indexOf("function collectPatternNames"),
  );
async function compare(scenario: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cua-loader-test-"));
  try {
    const sourceFile = path.join(dir, "sources.json");
    await writeFile(
      sourceFile,
      JSON.stringify({ resolverSource, loaderSource }),
    );
    const script = `
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {builtinModules,createRequire,findPackageJSON} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';import vm from 'node:vm';
const {SourceTextModule,SyntheticModule}=vm;
const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'cua-loader-fixture-')));
const write=(name,code)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,code);};
try{
write('package.json','{"type":"module"}');
const context=vm.createContext({setTimeout});const local={kind:'module',context};const packageModuleContext={kind:'package',isPackage:true,context};
let resolver,loader;
if(process.env.VARIANT==='original'){
 const {resolverSource,loaderSource}=JSON.parse(fs.readFileSync(process.env.SOURCE_FILE,'utf8'));
 resolver=new Function('fs','path','builtinModules','createRequire','findPackageJSON','fileURLToPath','pathToFileURL','process','cwd','withErrorKind',resolverSource+';return {resolveSpecifier,setImportMeta,moduleCacheKey};')(fs,path,builtinModules,createRequire,findPackageJSON,fileURLToPath,pathToFileURL,{cwd:()=>root,env:{NODE_REPL_NODE_MODULE_DIRS:root}},root,e=>e);
 loader=new Function('fs','pathToFileURL','SourceTextModule','SyntheticModule','packageModuleContext','resolveSpecifier','setImportMeta','moduleCacheKey',loaderSource+';return {importResolved,clearLocalFileModuleCaches,loadLinkedFileModule,loadLinkedNativeModule};')(fs,pathToFileURL,SourceTextModule,SyntheticModule,packageModuleContext,resolver.resolveSpecifier,resolver.setImportMeta,resolver.moduleCacheKey);
}else{
 const {createKernelModuleResolver}=await import(${JSON.stringify(pathToFileURL(path.resolve("packages/node-repl/dist/kernel_module_resolver.js")).href)});
 const {createKernelModuleLoader}=await import(${JSON.stringify(pathToFileURL(path.resolve("packages/node-repl/dist/kernel_module_loader.js")).href)});
 resolver=createKernelModuleResolver({cwd:root,moduleDirs:root,withErrorKind:e=>e});loader=createKernelModuleLoader({resolver,packageModuleContext});
}
const load=(specifier)=>loader.importResolved(resolver.resolveSpecifier(specifier,path.join(root,'cell.mjs'),local),local);
${scenario}
}finally{fs.rmSync(root,{recursive:true,force:true});}
`;
    const results = [];
    for (const variant of ["original", "restored"]) {
      const { stdout } = await exec(
        process.execPath,
        ["--experimental-vm-modules", "--input-type=module", "-e", script],
        { env: { VARIANT: variant, SOURCE_FILE: sourceFile }, timeout: 15000 },
      );
      results.push(JSON.parse(stdout));
    }
    assert.deepEqual(results[1], results[0]);
    return results[1];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("kernel loader links cycles, shares concurrent evaluations and supports dynamic/native imports", async () => {
  const out = await compare(`
write('a.mjs',"import {b} from './b.mjs'; export function a(){return 'a'}; export const value=b();");
write('b.mjs',"import {a} from './a.mjs'; export function b(){return a()+'b'};");
write('slow.mjs',"globalThis.count=(globalThis.count??0)+1;await new Promise(r=>setTimeout(r,5));export const count=globalThis.count;");
write('dynamic.mjs',"export const value=(await import('./a.mjs')).value;");
write('native.mjs',"import path from 'node:path';export const value=path.basename('/fixture/file');");
const cycle=await load('./a.mjs');const [one,two]=await Promise.all([load('./slow.mjs'),load('./slow.mjs')]);const dynamic=await load('./dynamic.mjs');const native=await load('./native.mjs');
console.log(JSON.stringify({cycle:cycle.value,count:one.count,same:one===two,dynamic:dynamic.value,native:native.value}));
`);
  assert.deepEqual(out, {
    cycle: "ab",
    count: 1,
    same: true,
    dynamic: "ab",
    native: "file",
  });
});
test("kernel loader clears local modules while preserving package modules and native namespaces", async () => {
  const out = await compare(`
write('local.mjs',"export const value=1;");write('node_modules/fixture/package.json','{"type":"module","main":"index.js"}');write('node_modules/fixture/index.js',"export const value=10;");
write('node_modules/common/package.json','{"main":"index.cjs"}');write('node_modules/common/index.cjs',"module.exports={value:7};");
const first=await load('./local.mjs');const pkg=await load('fixture');const common=await load('common');
write('local.mjs',"export const value=2;");write('node_modules/fixture/index.js',"export const value=20;");
const cached=await load('./local.mjs');loader.clearLocalFileModuleCaches();const next=await load('./local.mjs');const nextPkg=await load('fixture');
console.log(JSON.stringify({before:first.value,cached:cached.value,after:next.value,package:nextPkg.value,packageSame:pkg===nextPkg,common:common.default.value}));
`);
  assert.deepEqual(out, {
    before: 1,
    cached: 1,
    after: 2,
    package: 10,
    packageSame: true,
    common: 7,
  });
});
test("kernel loader retries failed links but retains failed evaluation until local cache clear", async () => {
  const out = await compare(`
write('retry.mjs',"import {value} from './missing.mjs';export {value};");
let linkFailed=false;try{await load('./retry.mjs');}catch{linkFailed=true;}
write('missing.mjs',"export const value=9;");const recovered=await load('./retry.mjs');
write('throws.mjs',"throw new Error('fixture failure');export const value=1;");
const errors=[];for(let i=0;i<2;i++){try{await load('./throws.mjs');}catch(e){errors.push(e.message);}write('throws.mjs',"export const value=2;");}
loader.clearLocalFileModuleCaches();const next=await load('./throws.mjs');
console.log(JSON.stringify({linkFailed,recovered:recovered.value,errors,next:next.value}));
`);
  assert.deepEqual(out, {
    linkFailed: true,
    recovered: 9,
    errors: ["fixture failure", "fixture failure"],
    next: 2,
  });
});
