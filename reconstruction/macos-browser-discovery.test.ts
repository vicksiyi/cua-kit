import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {homedir} from 'node:os';
import * as path from 'node:path';
import {createContext, runInContext} from 'node:vm';
import {findMacosBrowserAppPath, chromeMacosDescription, type MacosBrowserDiscoveryHost} from '../packages/native-host/src/macos_browser_app';
import {chromeProfileLaunchCommand} from '../packages/native-host/src/chrome_profile';
const original=path.join(homedir(),'.codex/plugins/cache/openai-bundled/browser/26.1027.30824/scripts/open-chrome-window.js');
const config=path.join(path.dirname(original),'extension-ids.json');
const bundle='com.google.Chrome';
type Fixture={name:string;apps:Record<string,string|null>;spotlight?:string;extract?:string;expected?:string;directories?:Record<string,string[]>};
const cases:Fixture[]=[
 {name:'standard directory wins',apps:{'/Applications/Google Chrome.app':JSON.stringify({CFBundleIdentifier:bundle})},expected:'/Applications/Google Chrome.app'},
 {name:'named fallback without plist',apps:{'/Applications/Google Chrome.app':null},expected:'/Applications/Google Chrome.app'},
 {name:'original named fallback also accepts mismatched bundle',apps:{'/Applications/Google Chrome.app':'{"CFBundleIdentifier":"fixture.other"}'},expected:'/Applications/Google Chrome.app'},
 {name:'user Applications candidate',apps:{'/fixture/home/Applications/Google Chrome.app':null},expected:'/fixture/home/Applications/Google Chrome.app'},
 {name:'Spotlight validates bundle and skips other entries',apps:{'/moved/Other.app':'{"CFBundleIdentifier":"fixture.other"}','/moved/Renamed.app':JSON.stringify({CFBundleIdentifier:bundle})},spotlight:'/moved/not-an-app\n/moved/Other.app\n/moved/Renamed.app',expected:'/moved/Renamed.app'},
 {name:'scan fallback and plist key extraction',apps:{'/Applications/Renamed.app':'broken-json'},directories:{'/Applications':['file.txt','Renamed.app']},extract:bundle,expected:'/Applications/Renamed.app'},
 {name:'empty plist falls back to key extraction',apps:{'/moved/Renamed.app':'{}'},spotlight:'/moved/Renamed.app',extract:bundle,expected:'/moved/Renamed.app'},
 {name:'missing app fails instead of opening a generic name',apps:{},expected:undefined},
];
function fixtureHost(fixture:Fixture):MacosBrowserDiscoveryHost {
 return {
  home:'/fixture/home',
  exists(file){return file in fixture.apps || file in (fixture.directories??{}) || Object.entries(fixture.apps).some(([app,info])=>info!==null&&file===path.join(app,'Contents/Info.plist'));},
  directories:directory=>fixture.directories?.[directory]??[],
  run(args){
   if(args[0]==='mdfind')return fixture.spotlight??null;
   assert.equal(args[0],'plutil');
   if(args[1]==='-extract')return fixture.extract??null;
   return fixture.apps[path.dirname(path.dirname(args.at(-1)!))]??null;
  },
 };
}
function observe(fn:()=>string){try{return {value:fn()};}catch(error){return {error:(error as Error).message};}}
for(const fixture of cases)test(`original JS macOS discovery: ${fixture.name}`,{skip:!existsSync(original)},()=>{
 const source=readFileSync(original,'utf8');
 const end=source.indexOf('\nvoid loadNodeModules()');
 assert.ok(end>0,'Original entry changed: review before evaluating fixture');
 const host=fixtureHost(fixture);
 const reference=createContext({fixtureHost:host,fixturePath:path,fixtureBrowser:chromeMacosDescription});
 runInContext(source.slice(0,end),reference);
 runInContext(`fs={existsSync:fixtureHost.exists,readdirSync:(directory)=>fixtureHost.directories(directory).map(name=>({name,isDirectory:()=>true}))};os={homedir:()=>fixtureHost.home};path=fixturePath;execFileSync=(command,args)=>{const output=fixtureHost.run([command,...args]);if(output===null)throw Error('fixture command unavailable');return output;};`,reference);
 const expected=observe(()=>runInContext('findMacosChromeAppPath(fixtureBrowser)',reference));
 const actual=observe(()=>findMacosBrowserAppPath(chromeMacosDescription,host));
 assert.deepEqual(actual,expected);
 if(fixture.expected) {
  assert.equal(actual.value,fixture.expected);
  assert.deepEqual(chromeProfileLaunchCommand('Profile 2',host),{command:'/usr/bin/open',args:['-n','-a',fixture.expected,'--args','--profile-directory=Profile 2','--new-window','about:blank']});
 } else assert.match(actual.error!,/Could not find the Google Chrome app/);
});
test('Chrome discovery description matches the installed diagnostics data',{skip:!existsSync(config)},()=>{
 const chrome=JSON.parse(readFileSync(config,'utf8')).browserDiagnostics.find((entry:any)=>entry.browserFamily==='chrome');
 assert.deepEqual(chromeMacosDescription,{displayName:chrome.displayName,macos:{applicationNames:chrome.macos.applicationNames,bundleId:chrome.macos.bundleId}});
});
