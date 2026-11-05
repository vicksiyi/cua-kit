import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createNativeHostInstallation} from '../packages/native-host/src/installation';
import {checkNativeHostInstallation} from '../packages/native-host/src/installation_check';

test('installation check validates registration, launcher, origin and endpoint configuration without starting a process',async t=>{
 const root=await mkdtemp('/tmp/cua-install-check-');t.after(()=>rm(root,{recursive:true,force:true}));
 const id='a'.repeat(32),endpoints=join(root,'endpoints');
 const installation=await createNativeHostInstallation({parentDirectory:root,nodePath:process.execPath,entryPath:resolve('packages/native-host/dist/main.mjs'),extensionIds:[id],endpointParentDirectory:endpoints});
 const options={manifestPath:installation.manifestPath,extensionId:id,endpointDirectory:endpoints};
 await checkNativeHostInstallation(options);
 await assert.rejects(checkNativeHostInstallation({...options,extensionId:'b'.repeat(32)}),/registration/);
 await assert.rejects(checkNativeHostInstallation({...options,endpointDirectory:join(root,'wrong')}),/directory/);
 await chmod(installation.launcherPath,0o600);
 await assert.rejects(checkNativeHostInstallation(options),{code:'EACCES'});
 await chmod(installation.launcherPath,0o700);
 await writeFile(installation.configPath,JSON.stringify({version:1,extensionIds:['b'.repeat(32)],endpointParentDirectory:endpoints}));
 await assert.rejects(checkNativeHostInstallation(options),/not registered/);
 await rm(installation.manifestPath);
 await assert.rejects(checkNativeHostInstallation(options),{code:'ENOENT'});
});
