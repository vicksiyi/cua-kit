/** Independent demo deployment of the tested sandbox supervisor, not vendor source. */
import {mkdtemp,mkdir,writeFile,rm,realpath,access} from 'node:fs/promises';
import {dirname,join,delimiter} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import type {SandboxedRuntimeOptions} from '@core/runtime-supervisor/sandbox-runtime';

export async function prepareIndependentRuntime(env: Record<string,string>, stagedRoot: string, sessionId: string, implementation: "typescript" | "rust" = "typescript") {
  if (process.platform !== 'darwin') throw Error('Independent sandbox demo currently requires macOS');
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sessionId)) throw Error('Invalid independent runtime session ID');
  const surfaces=(env.CUA_REPL_ENABLED_SURFACES??'').split(',').map(value=>value.trim());
  if(!surfaces.length||surfaces.some(value=>!['browser','computer'].includes(value))) throw Error('Independent runtime supports explicit browser/computer surfaces');
  const browser=surfaces.includes('browser'),computer=surfaces.includes('computer');
  if(computer&&(implementation!=='rust'||env.CORE_CUA_NATIVE_BACKEND!=='swift')) throw Error('Computer surface requires Rust runtime and CORE_CUA_NATIVE_BACKEND=swift');
  const files: unknown = browser ? JSON.parse(env.CORE_CUA_ENDPOINT_FILES ?? '[]') : [];
  if (browser&&(!Array.isArray(files)||!files.length||!files.every(file=>typeof file==='string'))) throw Error('Independent runtime requires explicit browser endpoints');
  const endpoints = browser ? await Promise.all((files as string[]).map(file=>realpath(file))) : [];
  const pipes = browser ? (env.BROWSER_USE_BACKEND_PATHS ?? '').split(delimiter).filter(Boolean) : [];
  if (browser&&!pipes.length) throw Error('Independent runtime requires explicit native pipes');
  const services={...(browser?{browser:'@core/native-host/browserService'}:{}),...(computer?{sky:'@core/sky/service'}:{})};
  const enabled=[...new Set(surfaces)].join(',');
  const appPolicy:unknown=computer?JSON.parse(env.CORE_CUA_APP_POLICY??'{}'):{};
  if(computer&&(!appPolicy||typeof appPolicy!=='object'||Array.isArray(appPolicy))) throw Error('CORE_CUA_APP_POLICY must be a native app rule map');
  const project = fileURLToPath(new URL('../../../',import.meta.url));
  const supervisor = join(project,'packages/runtime-supervisor/dist');
  const addon = join(project,'native/macos-sandbox/dist/sandbox.node');
  await access(addon).catch(()=>{throw Error('Build the independent sandbox first: npm run build:sandbox');});
  const helper=computer?await realpath(env.CORE_CUA_NATIVE_HELPER_PATH??join(project,'native/macos/.build/debug/cua-helper')).catch(()=>{throw Error('Build the Swift helper first: npm run build:native');}):undefined;
  const root = await realpath(await mkdtemp('/tmp/core-demo-runtime-'));
  try {
    const kernelDir=join(root,'kernel'),trustedDir=join(root,'trusted'),codeDir=join(root,'code'),nativeDir=join(root,'native');
    await Promise.all([mkdir(kernelDir),mkdir(trustedDir),mkdir(codeDir),...(computer?[mkdir(nativeDir,{mode:0o700})]:[])]);
    const configFile=join(root,'config.toml'),requirementsFile=join(root,'requirements.toml');
    const browserFile=join(root,'browser.toml'),sessionFile=join(root,'session.toml');
    await Promise.all([
      writeFile(configFile,'[browser_use]\nallow_history_access = false\n',{mode:0o600}),
      writeFile(requirementsFile,'[featureRequirements]\nbrowser_use_full_cdp_access = false\n',{mode:0o600}),
      writeFile(browserFile,'full_cdp_access_enabled = false\n',{mode:0o600}),
      writeFile(sessionFile,'',{mode:0o600}),
    ]);
    const workers=await realpath(join(project,'packages/node-repl'));
    const dependencies=await realpath(join(project,'node_modules'));
    const worker=(trusted:boolean)=>({
      node:process.execPath,bootstrap:join(supervisor,'sandbox-bootstrap.js'),addon,
      entry:join(workers,trusted?'dist/trusted_worker.js':'dist/kernel.js'),
      args:trusted?[trustedDir]:['--session-id',sessionId,'--working-dir',kernelDir],
      directory:trusted?trustedDir:kernelDir,
      readDirectories:[workers,dependencies,codeDir,stagedRoot,...(trusted&&computer?[nativeDir]:[]),...(trusted?[...new Set(endpoints.map(dirname))]:[])],
      workerEnvironment:{
        NODE_REPL_TRUSTED_RPC_ENABLED:'1',
        NODE_REPL_TRUSTED_SERVICES:JSON.stringify(services),
        NODE_REPL_TRUSTED_CODE_PATHS:stagedRoot,NODE_REPL_NODE_MODULE_DIRS:stagedRoot,
        NODE_REPL_UNTRUSTED_ENV_ALLOWLIST:'CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV',
        CUA_REPL_ENABLED_SURFACES:enabled,...(browser?{CUA_REPL_BROWSER_ENV:'codex-app'}:{}),
        ...(!trusted&&env.NODE_REPL_JS_BANNER!==undefined?{NODE_REPL_JS_BANNER:env.NODE_REPL_JS_BANNER}:{}),
        ...(!trusted&&env.NODE_REPL_ENABLE_AUDIO==='1'?{NODE_REPL_ENABLE_AUDIO:'1'}:{}),
        ...(trusted&&computer&&env.SKY_ENABLE_AUDIO==='1'?{SKY_ENABLE_AUDIO:'1',...(env.SKY_AUDIO_MODEL_ALLOWLIST!==undefined?{SKY_AUDIO_MODEL_ALLOWLIST:env.SKY_AUDIO_MODEL_ALLOWLIST}:{})}:{}),
        ...(trusted&&browser?{CORE_CUA_ENDPOINT_FILES:JSON.stringify(endpoints),BROWSER_USE_BACKEND_PATHS:pipes.join(delimiter),
          BROWSER_USE_AVAILABLE_BACKENDS:env.BROWSER_USE_AVAILABLE_BACKENDS ?? 'chrome',BROWSER_USE_DISABLE_AMBIENT_NETWORK:'1'}:{}),
      },terminateGraceMs:100,
    });
    const sessionPreference=`browser/sessions/${sessionId}.toml`;
    const options:SandboxedRuntimeOptions={kernel:worker(false),trusted:worker(true),services:Object.keys(services),pipePaths:pipes,
      writablePreferencePaths:['browser/config.toml',sessionPreference],
      config:{configFile,requirementsFile,workingDirectories:[trustedDir],tomlFiles:{'browser/config.toml':browserFile,[sessionPreference]:sessionFile}}};
    if (implementation === 'rust') {
      const command=join(project,'native/runtime-supervisor/dist/core-runtime-supervisor');
      await access(command).catch(()=>{throw Error('Build the Rust runtime first: npm run build:rust-runtime');});
      const rustWorker=(value:ReturnType<typeof worker>)=>({sandbox:{node:value.node,bootstrap:value.bootstrap,addon:value.addon,entry:value.entry,args:value.args,directory:value.directory,read_directories:value.readDirectories,worker_environment:value.workerEnvironment}});
      const spec=join(root,'rust-runtime.json');
      await writeFile(spec,JSON.stringify({kernel:rustWorker(worker(false)),trusted:rustWorker(worker(true)),services:options.services,pipe_paths:pipes,...(computer?{native_service:{helper,directory:nativeDir,app_policy:appPolicy}}:{}),writable_paths:options.writablePreferencePaths,config:{config:configFile,requirements:requirementsFile,working_directories:[trustedDir],toml_files:options.config.tomlFiles}}),{mode:0o600});
      return {command,args:[spec],environment:{HOME:root,TMPDIR:root,CUA_REPL_ENABLED_SURFACES:enabled,...(browser?{BROWSER_USE_AVAILABLE_BACKENDS:env.BROWSER_USE_AVAILABLE_BACKENDS??'chrome'}:{})},dispose:()=>rm(root,{recursive:true,force:true})};
    }
    const entry=join(codeDir,'stdio.mjs');
    await writeFile(entry,`import {serveSandboxedStdio} from ${JSON.stringify(pathToFileURL(join(supervisor,'sandbox-runtime.js')).href)};const server=await serveSandboxedStdio(${JSON.stringify(options)});await server.closed;`,{mode:0o600});
    return {command:process.execPath,args:[entry],environment:{HOME:root,TMPDIR:root,CUA_REPL_ENABLED_SURFACES:enabled,...(browser?{BROWSER_USE_AVAILABLE_BACKENDS:env.BROWSER_USE_AVAILABLE_BACKENDS??'chrome'}:{})},dispose:()=>rm(root,{recursive:true,force:true})};
  } catch(error) {await rm(root,{recursive:true,force:true});throw error;}
}

/** Compatibility export for existing browser-only callers. */
export const prepareIndependentBrowserRuntime = prepareIndependentRuntime;
