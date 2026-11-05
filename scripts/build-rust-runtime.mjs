import { mkdir, copyFile, access, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
if(process.platform!=='darwin') throw Error('Rust browser runtime currently requires macOS');
const root=fileURLToPath(new URL('../',import.meta.url));
const crate=resolve(root,'native/runtime-supervisor');
let cargo=process.env.CUA_CARGO??'cargo';
if(!process.env.CUA_CARGO){const local=join(homedir(),'.cargo/bin/cargo');try{await access(local);cargo=local;}catch{}}
const build=spawnSync(cargo,['build','--locked','--release','--manifest-path',join(crate,'Cargo.toml'),'--example','mcp_stdio'],{stdio:'inherit',env:{...process.env,CARGO_TARGET_DIR:join(crate,'target')}});
if(build.error)throw build.error;if(build.status!==0)throw Error(`Rust runtime build failed: ${build.status}`);
await mkdir(join(crate,'dist'),{recursive:true});
const destination=join(crate,'dist/core-runtime-supervisor');
await copyFile(join(crate,'target/release/examples/mcp_stdio'),destination);await chmod(destination,0o755);
