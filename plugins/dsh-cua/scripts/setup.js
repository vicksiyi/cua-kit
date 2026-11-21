import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(process.env.CUA_KIT_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url)));
const directory = join(repository, 'artifacts');
await mkdir(directory, { recursive: true });
const destination = join(directory, 'dsh-cua.patch.yml');
await writeFile(destination, [
  '- insert:',
  '    - id: cua-kit',
  `      name: ${JSON.stringify(join(repository, 'plugins/dsh-cua/index.js'))}`,
  '      config:',
  `        repositoryPath: ${JSON.stringify(repository)}`,
  '        surfaces: browser,computer',
  '        nativeAppPolicyMode: ask',
  '        runtimeEnvironment: {}',
  '',
].join('\n'), { mode: 0o600, flag: 'wx' }).catch(error => {
  if (error.code === 'EEXIST') throw new Error(`Patch already exists: ${destination}. Edit it directly; setup will not overwrite your configuration.`);
  throw error;
});
console.log(`Created ${destination}`);
console.log(`Start: npx @deepseek-ai/dsh@0.2.2-rc.3 web --patch ${JSON.stringify(destination)} --no-open`);
