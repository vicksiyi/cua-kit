import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {inspectChromeExtension,chromeProfileLaunchCommand} from '../packages/native-host/src/chrome_profile';
const id='hehggadaopoacecdllhhajmbjkdcmajg';
const original=join(homedir(),'.codex/plugins/cache/openai-bundled/browser/26.1027.30824/scripts/check-extension-installed.js');
const cases=[
  {name:'last used missing despite another enabled profile',local:{last_used:'Default'},secure:{path:'UNPACKED'},expected:[false,false,'Default']},
  {name:'registered unpacked without numeric state is enabled',local:{last_used:'Profile 2'},secure:{path:'UNPACKED'},expected:[true,true,'Profile 2']},
  {name:'state zero disabled',local:{last_used:'Profile 2'},secure:{path:'UNPACKED',state:0},expected:[true,false,'Profile 2']},
  {name:'numeric disable reason disabled',local:{last_used:'Profile 2'},secure:{path:'UNPACKED',disable_reasons:4},expected:[true,false,'Profile 2']},
  {name:'array disable reasons disabled',local:{last_used:'Profile 2'},secure:{path:'UNPACKED',disable_reasons:[1]},expected:[true,false,'Profile 2']},
  {name:'last active profile fallback',local:{last_used:'gone',last_active_profiles:['Default','Profile 2']},secure:{path:'UNPACKED'},expected:[true,true,'Profile 2']},
  {name:'numeric profile fallback',local:{},secure:{path:'UNPACKED'},expected:[true,true,'Profile 2']},
];
for(const scenario of cases)test(scenario.name,async t=>{
  const root=await mkdtemp('/tmp/cua-profile-');t.after(()=>rm(root,{recursive:true,force:true}));
  const unpacked=join(root,'unpacked');await mkdir(unpacked);
  for(const profile of ['Default','Profile 2']){
    await mkdir(join(root,profile));await writeFile(join(root,profile,'Preferences'),JSON.stringify({extensions:{settings:{}}}));
  }
  await writeFile(join(root,'Local State'),JSON.stringify({profile:scenario.local}));
  await writeFile(join(root,'Profile 2','Secure Preferences'),JSON.stringify({extensions:{settings:{[id]:{...scenario.secure,path:unpacked}}}}));
  const actual=inspectChromeExtension({userDataDirectory:root,extensionId:id});
  assert.deepEqual([actual.installed,actual.enabled,actual.selectedProfileDirectory],scenario.expected);
  if(existsSync(original)){
    const env={...process.env,CODEX_CHROMIUM_USER_DATA_DIR:root};
    for(const key of ['CODEX_CHROMIUM_PREFERENCES_PATH','CODEX_CHROME_PREFERENCES_PATH','CODEX_CHROME_USER_DATA_DIR']) delete env[key];
    const result=spawnSync(process.execPath,[original,'--browser','chrome','--json'],{encoding:'utf8',env,timeout:5000});
    assert.equal(result.error,undefined);assert.equal(result.status,actual.exitCode);
    const reference=JSON.parse(result.stdout);
    assert.deepEqual([actual.installed,actual.enabled,actual.selectedProfileDirectory],[reference.installed,reference.enabled,reference.selectedProfileDirectory]);
  }
});
test('launch command selects existing profile without temporary user-data directory or CDP flags',()=>{
  assert.deepEqual(chromeProfileLaunchCommand('Profile 2', {exists:path=>path==='/Applications/Google Chrome.app',directories:()=>[],home:'/fixture',run:()=>null}),{command:'/usr/bin/open',args:['-n','-a','/Applications/Google Chrome.app','--args','--profile-directory=Profile 2','--new-window','about:blank']});
});
