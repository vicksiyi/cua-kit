/** Independent demo deployment of the tested sandbox supervisor, not vendor source. */
import {mkdtemp,mkdir,writeFile,rm,realpath,access} from 'node:fs/promises';
import {dirname,join,delimiter} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import type {SandboxedRuntimeOptions} from '@core/runtime-supervisor/sandbox-runtime';

export async function prepareIndependentBrowserRuntime(env: Record<string,string>, stagedRoot: string, sessionId: string, implementation: "typescript" | "rust" = "typescript") {
  if (process.platform !== 'darwin') throw Error('Independent sandbox demo currently requires macOS');
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sessionId)) throw Error('Invalid independent runtime session ID');
  if (env.CUA_REPL_ENABLED_SURFACES !== 'browser') throw Error('Independent demo currently supports the browser surface only');
  const files: unknown = JSON.parse(env.CORE_CUA_ENDPOINT_FILES ?? 'null');
  if (!Array.isArray(files) || !files.length || !files.every(file=>typeof file==='string')) throw Error('Independent runtime requires explicit browser endpoints');
  const endpoints = await Promise.all(files.map(file=>realpath(file)));
  const pipes = (env.BROWSER_USE_BACKEND_PATHS ?? '').split(delimiter).filter(Boolean);
  if (!pipes.length) throw Error('Independent runtime requires explicit native pipes');
  const project = fileURLToPath(new URL('../../../',import.meta.url));
  const supervisor = join(project,'packages/runtime-supervisor/dist');
  const addon = join(project,'native/macos-sandbox/dist/sandbox.node');
  await access(addon).catch(()=>{throw Error('Build the independent sandbox first: npm run build:sandbox');});
  const root = await realpath(await mkdtemp('/tmp/core-demo-runtime-'));
  try {
    const kernelDir=join(root,'kernel'),trustedDir=join(root,'trusted'),codeDir=join(root,'code');
    await Promise.all([mkdir(kernelDir),mkdir(trustedDir),mkdir(codeDir)]);
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
      readDirectories:[workers,dependencies,codeDir,stagedRoot,...(trusted?[...new Set(endpoints.map(dirname))]:[])],
      workerEnvironment:{
        NODE_REPL_TRUSTED_RPC_ENABLED:'1',
        NODE_REPL_TRUSTED_SERVICES:JSON.stringify({browser:'@core/native-host/browserService'}),
        NODE_REPL_TRUSTED_CODE_PATHS:stagedRoot,NODE_REPL_NODE_MODULE_DIRS:stagedRoot,
        NODE_REPL_UNTRUSTED_ENV_ALLOWLIST:'CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV',
        CUA_REPL_ENABLED_SURFACES:'browser',CUA_REPL_BROWSER_ENV:'codex-app',
        ...(trusted?{CORE_CUA_ENDPOINT_FILES:JSON.stringify(endpoints),BROWSER_USE_BACKEND_PATHS:pipes.join(delimiter),
          BROWSER_USE_AVAILABLE_BACKENDS:env.BROWSER_USE_AVAILABLE_BACKENDS ?? 'chrome',BROWSER_USE_DISABLE_AMBIENT_NETWORK:'1'}:{}),
      },terminateGraceMs:100,
    });
    const sessionPreference=`browser/sessions/${sessionId}.toml`;
    const options:SandboxedRuntimeOptions={kernel:worker(false),trusted:worker(true),services:['browser'],pipePaths:pipes,
      writablePreferencePaths:['browser/config.toml',sessionPreference],
      config:{configFile,requirementsFile,workingDirectories:[trustedDir],tomlFiles:{'browser/config.toml':browserFile,[sessionPreference]:sessionFile}}};
    if (implementation === 'rust') {
      const command=join(project,'native/runtime-supervisor/dist/core-runtime-supervisor');
      await access(command).catch(()=>{throw Error('Build the Rust runtime first: npm run build:rust-runtime');});
      const rustWorker=(value:ReturnType<typeof worker>)=>({sandbox:{node:value.node,bootstrap:value.bootstrap,addon:value.addon,entry:value.entry,args:value.args,directory:value.directory,read_directories:value.readDirectories,worker_environment:value.workerEnvironment}});
      const spec=join(root,'rust-runtime.json');
      await writeFile(spec,JSON.stringify({kernel:rustWorker(worker(false)),trusted:rustWorker(worker(true)),services:options.services,pipe_paths:pipes,writable_paths:options.writablePreferencePaths,config:{config:configFile,requirements:requirementsFile,working_directories:[trustedDir],toml_files:options.config.tomlFiles}}),{mode:0o600});
      return {command,args:[spec],environment:{HOME:root,TMPDIR:root,CUA_REPL_ENABLED_SURFACES:'browser',BROWSER_USE_AVAILABLE_BACKENDS:env.BROWSER_USE_AVAILABLE_BACKENDS??'chrome'},dispose:()=>rm(root,{recursive:true,force:true})};
    }
    const entry=join(codeDir,'stdio.mjs');
    await writeFile(entry,`import {serveSandboxedStdio} from ${JSON.stringify(pathToFileURL(join(supervisor,'sandbox-runtime.js')).href)};const server=await serveSandboxedStdio(${JSON.stringify(options)});await server.closed;`,{mode:0o600});
    return {command:process.execPath,args:[entry],environment:{HOME:root,TMPDIR:root,CUA_REPL_ENABLED_SURFACES:'browser',BROWSER_USE_AVAILABLE_BACKENDS:env.BROWSER_USE_AVAILABLE_BACKENDS??'chrome'},dispose:()=>rm(root,{recursive:true,force:true})};
  } catch(error) {await rm(root,{recursive:true,force:true});throw error;}
}
