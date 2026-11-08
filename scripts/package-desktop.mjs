import { cpSync, mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIcon } from './build-icon.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
buildIcon(join(root,'desktop','icon.ico'));
const dist=join(dirname(require.resolve('electron/package.json')),'dist');
const out=join(root,'win-app');
mkdirSync(out,{recursive:true});
if(!existsSync(join(out,'AI Hub.exe'))){
 cpSync(dist,out,{recursive:true});
 if(existsSync(join(out,'electron.exe')))renameSync(join(out,'electron.exe'),join(out,'AI Hub.exe'));
}
cpSync(join(root,'desktop'),join(out,'resources/app'),{recursive:true});
// The installed desktop bundle lives next to the application and local database.
writeFileSync(join(out,'resources/app/main.cjs'),`require(${JSON.stringify('../../../desktop/main.cjs')});\n`);
writeFileSync(join(out,'resources/app/package.json'),JSON.stringify({name:'ai-hub-desktop',productName:'AI Hub',version:'1.0.0',main:'main.cjs'})+'\n');
if(!existsSync(join(out,'node.exe')))cpSync(process.execPath,join(out,'node.exe'));
console.log('Packaged desktop app: '+join(out,'AI Hub.exe'));
