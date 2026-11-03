import { execFileSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','extensions/chrome/tsconfig.json'],{stdio:'inherit'});
copyFileSync('extensions/chrome/manifest.json','dist/chrome-extension/manifest.json');
