import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {desktopDocumentation} from "../packages/browser-desktop/src/documentation_bundle";
import {createBrowserDocumentation} from "../packages/browser/src/service/context/documentation";
import {DocumentationController} from "../packages/browser/src/service/runtime/documentation_controller";
const root=process.env.CUA_VENDOR_ROOT??"/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
test("current packaged SIWC documentation is available and authentication requires its read",async()=>{
  const source=await readFile(`${root}/browser-desktop/scripts/browser-service.mjs`);
  assert.equal(createHash("sha256").update(source).digest("hex"),"ff48f49dae194da13d03427af5130fd67c183cf76f007309afc9f3e60179cb0f");
  const assets=createBrowserDocumentation(import.meta.url,desktopDocumentation);
  const filesystem={readFile:async()=>{throw Error("must use packaged documentation");}};
  for(const environment of [undefined,"codex-app","cloud","orbit","training"]){
    const options={environment};
    const manifest=await assets.documentManifest(filesystem,options);
    const api=await assets.apiManifest(filesystem,options);
    const controller=new DocumentationController({apiManifest:api,documentManifest:manifest,disabledMemberIds:[],readDocumentation:(name:string)=>assets.readDocumentation(name,filesystem,options)});
    assert.doesNotThrow(()=>controller.assertRequiredDocumentationRead("tab_siwc_detect"));
    assert.throws(()=>controller.assertRequiredDocumentationRead("tab_siwc_authenticate"),/capabilities\/tab\/siwc/);
    const text=await controller.read("capabilities/tab/siwc");
    assert.match(text,/authenticate/);assert.match(text,/Credentials and grants are private/);
    if(environment){
      const reference=await readFile(`${root}/browser-desktop/environment-docs/${environment}/capabilities/tab/siwc.md`,"utf8");
      assert.equal(text,reference.replaceAll("@oai/","@core/"));
    }
    assert.doesNotThrow(()=>controller.assertRequiredDocumentationRead("tab_siwc_authenticate"));
  }
});
