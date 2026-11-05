import test from "node:test";
import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {access} from "node:fs/promises";
import {resolve} from "node:path";
const exec = promisify(execFile);
const installed = "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/globals.js";

test("original and restored global entry preserve surface parsing, initialization alias and failure behavior", async () => {
  await access(installed);
  const script = `
    import vm from 'node:vm';
    import {readFile} from 'node:fs/promises';
    const paths=process.argv.slice(1);
    const cases=[{}, {surfaces:''}, {surfaces:'browser'}, {surfaces:'computer'}, {surfaces:' browser, computer, browser, , '}, {surfaces:'browser,unknown'}, {surfaces:'BROWSER'}, {surfaces:'computer',fail:true}];
    const outputs=[];
    for(const path of paths){
      const source=await readFile(path,'utf8');const results=[];
      for(const input of cases){
        const calls=[];const context=vm.createContext({nodeRepl:{env:input.surfaces===undefined?{}:{CUA_REPL_ENABLED_SURFACES:input.surfaces}}});
        const dependency=new vm.SyntheticModule(['create_tinysky_alt'],function(){this.setExport('create_tinysky_alt',async options=>{
          calls.push({browser:options.browser,computer:options.computer});
          if(input.fail)throw Error('fixture setup failure');
          return {getState:()=>42};
        });},{context});
        const module=new vm.SourceTextModule(source,{context});let error;
        try {await module.link(specifier=>{if(specifier!=='./create_tinysky_alt.js')throw Error('Unexpected dependency '+specifier);return dependency;});await module.evaluate();}
        catch(e){error={name:e.name,message:e.message};}
        results.push({calls,hasGlobal:!!context.cua,initializeAliasesGetState:!!context.cua && context.cua.initialize===context.cua.getState,...(error?{error}:{})});
      }
      outputs.push(results);
    }
    process.stdout.write(JSON.stringify(outputs));
  `;
  const {stdout} = await exec(process.execPath,["--experimental-vm-modules","--input-type=module","-e",script,installed,resolve("packages/cua/dist/tinysky_alt/globals.js")],{maxBuffer:1024*1024});
  const [original,restored] = JSON.parse(stdout);
  assert.deepEqual(restored,original);
  assert.match(original[0].error.message,/CUA_REPL_ENABLED_SURFACES is required/);
  assert.deepEqual(original[1].calls,[{browser:false,computer:false}]);
  assert.deepEqual(original[4].calls,[{browser:true,computer:true}]);
  assert.equal(original[4].initializeAliasesGetState,true);
  assert.equal(original[5].calls.length,0);
  assert.equal(original[5].hasGlobal,false);
  assert.equal(original[7].hasGlobal,false);
  assert.equal(original[7].error.message,'fixture setup failure');
});
